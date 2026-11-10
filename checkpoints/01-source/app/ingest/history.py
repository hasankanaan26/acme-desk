# ============================================================
# Sync history — every applied run, read from the reports in runs/
# ============================================================
# Every applied sync (a tick, Run now, the button, sync.py --apply)
# writes one report to runs/. This module reads them back and answers
# "which files changed, when, what did the sync do, and who changed
# them in the source?".
#
# A report never changes once written, so each file is parsed once and
# kept as a small summary. 700 reports cost one slow read, then nothing.
#
# The timeline it builds, newest first:
#   change   a run that changed the index: one row per file it touched
#   quiet    the runs in between that found nothing new, as one line
# ============================================================

import json
import re
from datetime import datetime
from pathlib import Path

from app.config import RUNS_DIR
from app.ingest.scheduler import _changed_docs

REPORT_NAME = re.compile(r"^sync-\d{8}-\d{6}\.json$")

_cache: dict[str, dict | None] = {}  # file name -> summary (None = unreadable)


def _related_warnings(report: dict, docs: list[dict]) -> list[str]:
    """The warnings that name a document this run changed (the rest show up on every run)."""
    names = [re.compile(r"(^|[^\w-])" + re.escape(d["doc_id"]) + r"(?![\w-])") for d in docs]
    return [w for w in report.get("warnings", []) if any(n.search(w) for n in names)]


def _summary(path: Path) -> dict | None:
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
        written = datetime.strptime(path.stem, "sync-%Y%m%d-%H%M%S").isoformat(timespec="seconds")
    except (OSError, ValueError):
        return None
    docs = _changed_docs(report) if report.get("activated") is not False else []
    return {
        "id": path.name,
        "at": report.get("finished_at") or written,
        "started_at": report.get("started_at"),
        "trigger": report.get("trigger"),
        "seconds": report.get("seconds"),
        "counts": report.get("counts", {}),
        "chunks_embedded": report.get("chunks_to_embed", 0),
        "chunks_in_index": report.get("chunks_in_index"),
        "full_build": report.get("full_build", False),
        "build_reason": report.get("build_reason"),
        "embedding_model": report.get("embedding_model"),
        "vector_store": report.get("vector_store"),
        "collection": report.get("collection"),
        "activated": report.get("activated"),
        "changed": bool(docs),
        "documents": docs,
        "warnings": [] if report.get("full_build") else _related_warnings(report, docs),
    }


def all_runs(runs_dir: Path = RUNS_DIR) -> list[dict]:
    """Every readable report, oldest first."""
    runs = []
    for path in sorted(Path(runs_dir).glob("sync-*.json")):  # the names sort by time
        if path.name not in _cache:
            _cache[path.name] = _summary(path)
        if _cache[path.name]:
            runs.append(_cache[path.name])
    return runs


# Purpose:
# The timeline for the Sync tab. `path` narrows it to one file: then
# "quiet" means the runs that did not touch that file.
def history(limit: int = 50, path: str | None = None, runs_dir: Path = RUNS_DIR) -> dict:
    runs = all_runs(runs_dir)

    def touches(run: dict) -> bool:
        return run["changed"] and (path is None or any(d["path"] == path for d in run["documents"]))

    entries: list[dict] = []
    quiet: list[dict] = []

    def close_quiet():
        if quiet:
            entries.append({"kind": "quiet", "runs": len(quiet), "from": quiet[-1]["at"], "to": quiet[0]["at"]})
            quiet.clear()

    shown = 0
    for run in reversed(runs):  # newest first
        if touches(run):
            if shown >= limit:
                break
            close_quiet()
            docs = [d for d in run["documents"] if path is None or d["path"] == path]
            entries.append({"kind": "change", **run, "documents": docs})
            shown += 1
        else:
            quiet.append(run)
    close_quiet()

    changed_files = sorted({d["path"] for r in runs if r["changed"] for d in r["documents"]})
    return {
        "total_runs": len(runs),
        "runs_that_changed": sum(1 for r in runs if r["changed"]),
        "first_run": runs[0]["at"] if runs else None,
        "last_run": runs[-1]["at"] if runs else None,
        "files": changed_files,
        "path": path,
        "entries": entries,
    }


def report(run_id: str, runs_dir: Path = RUNS_DIR) -> dict:
    """One run's full report: every document, unchanged ones included."""
    if not REPORT_NAME.match(run_id):
        raise KeyError(run_id)
    file = Path(runs_dir) / run_id
    if not file.exists():
        raise KeyError(run_id)
    return json.loads(file.read_text(encoding="utf-8"))
