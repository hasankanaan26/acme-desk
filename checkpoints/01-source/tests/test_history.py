# ============================================================
# Sync history: the timeline read back from the reports in runs/
# ============================================================

import json

import pytest

from app.ingest import history
from app.ingest.connector_drive import _who


def doc(doc_id, path, action):
    return {"doc_id": doc_id, "path": path, "action": action, "reason": "test", "chunks": 6,
            "signals": {"etag_index": "old", "etag_source": "new"},
            "source": {"modified": "2026-11-09T17:28:01", "modified_by": "Hasan <h@example.com>", "size": 1200}}


def write(tmp_path, stamp, docs, **extra):
    report = {"applied": True, "counts": {}, "chunks_to_embed": 6, "seconds": 1.2, "trigger": "tick",
              "warnings": ["COMPANY-FAQ quotes HR-LEAVE, which changed in this sync.", "two documents on topic 'onboarding'"],
              "documents": docs, **extra}
    (tmp_path / f"sync-{stamp}.json").write_text(json.dumps(report))


@pytest.fixture
def runs(tmp_path):
    history._cache.clear()
    leave, remote = ("HR-LEAVE", "hr/leave-policy.md"), ("HR-REMOTE", "hr/remote-work.md")
    write(tmp_path, "20261109-170000", [doc(*leave, "unchanged")])
    write(tmp_path, "20261109-172843", [doc(*leave, "change"), doc(*remote, "unchanged")],
          started_at="2026-11-09T17:28:42", finished_at="2026-11-09T17:28:43")
    write(tmp_path, "20261109-172947", [doc(*leave, "unchanged")])
    write(tmp_path, "20261109-173050", [doc(*leave, "unchanged")])
    write(tmp_path, "20261109-182925", [doc(*remote, "change")])
    write(tmp_path, "20261109-183000", [doc(*remote, "relabel")], activated=False)  # never went live
    (tmp_path / "sync-20261109-190000.json").write_text("{broken")
    yield tmp_path
    history._cache.clear()


def test_the_timeline_folds_quiet_runs_between_the_changes(runs):
    h = history.history(runs_dir=runs)
    assert h["total_runs"] == 6 and h["runs_that_changed"] == 2
    kinds = [(e["kind"], e.get("runs")) for e in h["entries"]]
    assert kinds == [("quiet", 1), ("change", None), ("quiet", 2), ("change", None), ("quiet", 1)]
    newest, older = h["entries"][1], h["entries"][3]
    assert newest["documents"][0]["path"] == "hr/remote-work.md"
    assert older["at"] == "2026-11-09T17:28:43" and older["started_at"] == "2026-11-09T17:28:42"
    assert [d["action"] for d in older["documents"]] == ["change"]            # only what changed
    assert older["documents"][0]["source"]["modified_by"] == "Hasan <h@example.com>"
    assert older["warnings"] == ["COMPANY-FAQ quotes HR-LEAVE, which changed in this sync."]  # only the related one
    assert h["files"] == ["hr/leave-policy.md", "hr/remote-work.md"]


def test_one_file_at_a_time(runs):
    h = history.history(path="hr/leave-policy.md", runs_dir=runs)
    changes = [e for e in h["entries"] if e["kind"] == "change"]
    assert [e["at"] for e in changes] == ["2026-11-09T17:28:43"]
    assert h["entries"][0] == {"kind": "quiet", "runs": 4, "from": "2026-11-09T17:29:47", "to": "2026-11-09T18:30:00"}


def test_limit_counts_the_runs_that_changed(runs):
    h = history.history(limit=1, runs_dir=runs)
    assert [e["kind"] for e in h["entries"]] == ["quiet", "change", "quiet"]


def test_a_full_report_by_name_and_nothing_else(runs):
    assert history.report("sync-20261109-172843.json", runs_dir=runs)["trigger"] == "tick"
    for bad in ("../.env", "sync-20261109-172843.json/..", "missing.json", "sync-20991231-000000.json"):
        with pytest.raises(KeyError):
            history.report(bad, runs_dir=runs)


def test_who_changed_it_in_drive():
    assert _who({"displayName": "Hasan", "emailAddress": "h@example.com"}) == "Hasan <h@example.com>"
    assert _who({"displayName": "Hasan"}) == "Hasan"
    assert _who(None) == ""


def test_a_full_build_raises_no_warnings_as_news(tmp_path):
    history._cache.clear()
    write(tmp_path, "20261109-185524", [doc("HR-LEAVE", "hr/leave-policy.md", "add")], full_build=True,
          build_reason="there was no live index in Postgres + pgvector yet", vector_store="Postgres + pgvector")
    entry = history.history(runs_dir=tmp_path)["entries"][0]
    assert entry["full_build"] and entry["warnings"] == []
    assert entry["build_reason"].startswith("there was no live index") and entry["vector_store"] == "Postgres + pgvector"
    history._cache.clear()
