# ============================================================
# Scheduler — the sync job on a timer
# ============================================================
# Checkpoint 5's sync ran when someone typed `python sync.py --apply`.
# A production index is kept true by a job nobody types. This module
# runs run_sync(apply=True) every SYNC_INTERVAL_SECONDS on a thread
# inside the API process, and one lock guarantees two syncs never
# overlap (the button in the UI takes the same lock).
#
# THE REAL THING, three ways:
#   cron / a scheduler      "*/5 * * * * python sync.py --apply"
#                           the simplest; fine for one box
#   a queue worker          the tick is a message; retries, scaling,
#                           one job at a time by construction
#   a webhook from source   Drive push notifications, Graph change
#                           subscriptions: no polling, but every team
#                           still polls as a backstop, because
#                           notifications get lost
#
# TEACHING POINT:
#   The thread is the least interesting part. What matters is that
#   every tick is the SAME decision ladder as the manual run, writes
#   a report, and leaves the index untouched when anything fails.
# ============================================================

import json
import logging
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from app.config import RUNS_DIR, SYNC_INTERVAL_SECONDS
from app.ingest.sync import run_sync

log = logging.getLogger("acme.scheduler")

# Actions that change what the index holds. "unchanged" and "skip" do
# not; "quarantine" only does when the document was indexed before
# (its old chunks are deleted).
CHANGE_ACTIONS = ("add", "change", "relabel", "touch", "remove")
MAX_CHANGES = 10

_lock = threading.Lock()
_stop = threading.Event()
_thread: threading.Thread | None = None
_state = {
    "enabled": False,      # a thread is running
    "paused": False,       # the thread is running but ticks do nothing
    "running": False,      # a sync is executing right now
    "interval": 0,
    "runs": 0,
    "errors": 0,
    "skipped": 0,          # see the TODO in tick()
    "last_run": None,
    "last_seconds": None,
    "last_summary": None,
    "last_error": None,
    "next_run": None,
    # The runs that CHANGED the index, newest first. A tick a minute
    # overwrites last_summary with "unchanged 18" almost every time, so
    # the one run that mattered would be gone within a minute.
    "last_change": None,
    "changes": [],
}


def _stamp(when: datetime | None = None) -> str:
    return (when or datetime.now()).isoformat(timespec="seconds")


def _changed_docs(report: dict) -> list[dict]:
    return [
        {k: d.get(k) for k in ("doc_id", "path", "action", "reason", "chunks", "signals", "source")}
        for d in report.get("documents", [])
        if d.get("action") in CHANGE_ACTIONS
        or (d.get("action") == "quarantine" and (d.get("signals") or {}).get("etag_index"))
    ]


# Purpose:
# What one applied run did to the index, in the shape the UI shows:
# when, who started it, and only the documents it changed.
# None when the run changed nothing (or never went live).
def _change_record(report: dict, trigger: str | None, at: str) -> dict | None:
    if not isinstance(report, dict) or report.get("applied") is False or report.get("activated") is False:
        return None
    docs = _changed_docs(report)
    if not docs:
        return None
    report_file = report.get("report_file")
    return {
        "id": Path(report_file).name if report_file else at,
        "at": at,
        "trigger": trigger,                       # tick | run now | manual | None (read back from runs/)
        "counts": report.get("counts", {}),
        "documents": docs,
        "chunks_embedded": report.get("chunks_to_embed", 0),
        "chunks_in_index": report.get("chunks_in_index"),
        "seconds": report.get("seconds"),
        "warnings": report.get("warnings", []),
        "report_file": report_file,
        "full_build": report.get("full_build", False),
        "build_reason": report.get("build_reason"),
        "vector_store": report.get("vector_store"),
    }


def _remember(change: dict | None) -> None:
    if not change:
        return
    _state["changes"] = [change, *[c for c in _state["changes"] if c["id"] != change["id"]]][:MAX_CHANGES]
    _state["last_change"] = _state["changes"][0]


# Purpose:
# After a restart, read the last changes back from the reports in
# runs/ (every applied run writes one), so the UI can still say what
# the sync did before the API came back up.
def load_changes_from_reports(runs_dir: Path = RUNS_DIR, scan: int = 500) -> None:
    files = sorted(Path(runs_dir).glob("sync-*.json"), reverse=True)[:scan]  # names sort by time
    found = []
    for path in files:
        try:
            report = json.loads(path.read_text(encoding="utf-8"))
            at = datetime.strptime(path.stem, "sync-%Y%m%d-%H%M%S")
        except (OSError, ValueError):
            continue
        change = _change_record({**report, "report_file": report.get("report_file") or str(path)},
                                report.get("trigger"), _stamp(at))
        if change:
            found.append(change)
            if len(found) >= MAX_CHANGES:
                break
    for change in reversed(found):  # oldest first, so the newest ends up on top
        _remember(change)


# Purpose:
# Run one sync of any kind (a tick, the UI button, the CLI) while
# holding the lock, so two syncs never write to the index at once.
# An applied run that changed something is remembered for the UI.
def run_locked(fn, trigger: str = "manual"):
    with _lock:
        _state["running"] = True
        try:
            report = fn()
        finally:
            _state["running"] = False
    if isinstance(report, dict):
        _remember(_change_record(report, trigger, _stamp()))
    return report


# Purpose:
# One scheduled run. Failures are counted and shown, never raised:
# the next tick gets another chance and the index was not touched
# (apply_plan embeds first and writes last).
def tick(trigger: str = "tick") -> dict:
    started = time.perf_counter()
    # TODO (Lab exercise): fingerprint the listing (sha256 of sorted
    # "path|etag" lines) and, when it equals the last tick's, count a
    # "skipped" instead of running the whole sync.
    try:
        report = run_locked(lambda: run_sync(apply=True, trigger=trigger), trigger)
        _state["last_summary"] = {
            "counts": report["counts"],
            "chunks_in_index": report.get("chunks_in_index"),
            "warnings": len(report.get("warnings", [])),
            "report_file": report.get("report_file"),
        }
        _state["last_error"] = None
        log.info("tick: %s | %s chunks in index",
                 ", ".join(f"{k} {v}" for k, v in report["counts"].items()) or "nothing",
                 report.get("chunks_in_index"))
    except Exception as exc:  # noqa: BLE001 - a scheduler must outlive one bad run
        _state["errors"] += 1
        _state["last_error"] = f"{type(exc).__name__}: {exc}"
        log.warning("tick failed, index untouched: %s", _state["last_error"])
    _state["runs"] += 1
    _state["last_run"] = _stamp()
    _state["last_seconds"] = round(time.perf_counter() - started, 2)
    return status()


def _loop(interval: float) -> None:
    _state["next_run"] = _stamp(datetime.now() + timedelta(seconds=interval))
    while not _stop.wait(interval):
        if not _state["paused"]:
            tick()
        _state["next_run"] = _stamp(datetime.now() + timedelta(seconds=interval))


# Purpose:
# Start the timer thread. interval <= 0 means "off": the API then
# behaves exactly like checkpoint 5 (sync only when asked).
def start(interval: float | None = None) -> threading.Thread | None:
    global _thread
    interval = SYNC_INTERVAL_SECONDS if interval is None else interval
    if not _state["changes"]:
        try:
            load_changes_from_reports()
        except OSError as exc:  # no runs/ yet, or unreadable: start with no history
            log.info("no earlier changes read from %s: %s", RUNS_DIR, exc)
    if interval <= 0:
        log.info("scheduler off (SYNC_INTERVAL_SECONDS=0); sync runs only when asked")
        return None
    if _thread and _thread.is_alive():
        return _thread
    _stop.clear()
    _state.update(enabled=True, paused=False, interval=interval)
    _thread = threading.Thread(target=_loop, args=(interval,), name="sync-scheduler", daemon=True)
    _thread.start()
    log.info("scheduler on: a sync every %ss", interval)
    return _thread


def stop() -> None:
    _stop.set()
    if _thread and _thread.is_alive():
        _thread.join(timeout=5)
    _state.update(enabled=False, next_run=None)


def pause() -> dict:
    _state["paused"] = True
    return status()


def resume() -> dict:
    _state["paused"] = False
    return status()


def status() -> dict:
    seconds_to_next = None
    if _state["enabled"] and not _state["paused"] and _state["next_run"]:
        seconds_to_next = max(0, round((datetime.fromisoformat(_state["next_run"]) - datetime.now()).total_seconds()))
    return {**_state, "seconds_to_next_run": seconds_to_next}
