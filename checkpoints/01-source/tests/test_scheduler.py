# ============================================================
# The scheduler: ticks, failures, pause, the lock
# ============================================================
# run_sync is replaced by a fake here: these tests are about the
# timer and the bookkeeping around a run, not about the sync itself.
# ============================================================

import threading
import time

import pytest

from app.ingest import scheduler

FRESH = dict(enabled=False, paused=False, running=False, interval=0, runs=0, errors=0, skipped=0,
             last_run=None, last_seconds=None, last_summary=None, last_error=None, next_run=None)


@pytest.fixture(autouse=True)
def fresh_scheduler():
    scheduler.stop()
    scheduler._state.update(FRESH, last_change=None, changes=[])
    yield
    scheduler.stop()


def fake_report(**counts) -> dict:
    return {"counts": counts, "chunks_in_index": 88, "warnings": [], "report_file": "runs/sync-test.json"}


def wait_until(predicate, seconds=3.0) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return predicate()


def test_a_tick_runs_one_sync_with_apply_and_records_it(monkeypatch):
    calls = []
    monkeypatch.setattr(scheduler, "run_sync", lambda apply=False, **kw: calls.append((apply, kw.get("trigger"))) or fake_report(change=1, unchanged=17))
    status = scheduler.tick()
    assert calls == [(True, "tick")]
    assert status["runs"] == 1 and status["errors"] == 0 and status["last_error"] is None
    assert status["last_summary"]["counts"] == {"change": 1, "unchanged": 17}
    assert status["last_summary"]["chunks_in_index"] == 88
    assert status["last_run"] and status["last_seconds"] is not None


def test_a_failing_tick_is_counted_and_shown_not_raised(monkeypatch):
    def drive_is_down(**kw):
        raise RuntimeError("Drive is down")

    monkeypatch.setattr(scheduler, "run_sync", drive_is_down)
    status = scheduler.tick()
    assert status["runs"] == 1 and status["errors"] == 1
    assert "Drive is down" in status["last_error"]


def test_interval_zero_means_off():
    assert scheduler.start(0) is None
    assert scheduler.status()["enabled"] is False


def test_the_loop_ticks_until_stopped_and_pause_holds_it(monkeypatch):
    monkeypatch.setattr(scheduler, "run_sync", lambda **kw: fake_report(unchanged=18))
    thread = scheduler.start(0.02)
    assert thread is not None and scheduler.status()["enabled"]
    assert wait_until(lambda: scheduler.status()["runs"] >= 2)

    scheduler.pause()
    time.sleep(0.1)                       # let a tick that was in flight finish
    held = scheduler.status()["runs"]
    time.sleep(0.1)
    assert scheduler.status()["runs"] == held
    assert scheduler.status()["seconds_to_next_run"] is None

    scheduler.resume()
    assert wait_until(lambda: scheduler.status()["runs"] > held)

    scheduler.stop()
    assert scheduler.status()["enabled"] is False
    assert not thread.is_alive()


def test_run_locked_never_lets_two_syncs_overlap():
    active, overlaps = [0], [0]

    def work():
        active[0] += 1
        if active[0] > 1:
            overlaps[0] += 1
        time.sleep(0.02)
        active[0] -= 1
        return "done"

    threads = [threading.Thread(target=lambda: scheduler.run_locked(work)) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert overlaps[0] == 0
    assert scheduler.status()["running"] is False


# ---- The runs that changed the index ----

def doc(doc_id, action, **extra) -> dict:
    return {"doc_id": doc_id, "path": doc_id.lower() + ".md", "action": action, "reason": "test", "chunks": 6,
            "signals": {"etag_index": "old" if action != "add" else None, "etag_source": "new"}, **extra}


def changed_report(report_file="runs/sync-20261109-172843.json") -> dict:
    return {"applied": True, "counts": {"change": 1, "unchanged": 17}, "chunks_to_embed": 6, "chunks_in_index": 88,
            "seconds": 1.19, "report_file": report_file,
            "warnings": ["COMPANY-FAQ quotes HR-LEAVE, which changed in this sync. Ask People Operations to review it."],
            "documents": [doc("HR-LEAVE", "change"), doc("HR-REMOTE", "unchanged"),
                          doc("ENG-INCIDENT-REPORT", "quarantine", signals={"etag_index": None})]}


def quiet_report() -> dict:
    return {"applied": True, "counts": {"unchanged": 18}, "report_file": "runs/sync-quiet.json",
            "documents": [doc("HR-LEAVE", "unchanged")], "warnings": []}


def test_a_change_outlives_the_quiet_ticks_after_it(monkeypatch):
    reports = iter([changed_report(), quiet_report(), quiet_report()])
    monkeypatch.setattr(scheduler, "run_sync", lambda **kw: next(reports))
    for _ in range(3):
        status = scheduler.tick()
    assert status["last_summary"]["counts"] == {"unchanged": 18}     # the last tick: nothing
    change = status["last_change"]                                   # but the change is still there
    assert change["trigger"] == "tick" and change["id"] == "sync-20261109-172843.json"
    assert [d["doc_id"] for d in change["documents"]] == ["HR-LEAVE"]  # only what changed
    assert change["chunks_embedded"] == 6 and change["warnings"]
    assert len(status["changes"]) == 1


def test_run_now_and_the_button_say_who_started_it(monkeypatch):
    monkeypatch.setattr(scheduler, "run_sync", lambda **kw: changed_report("runs/sync-a.json"))
    assert scheduler.tick(trigger="run now")["last_change"]["trigger"] == "run now"
    scheduler.run_locked(lambda: changed_report("runs/sync-b.json"))
    status = scheduler.status()
    assert status["last_change"]["trigger"] == "manual"
    assert [c["id"] for c in status["changes"]] == ["sync-b.json", "sync-a.json"]


def test_a_dry_run_or_a_failed_switch_is_not_a_change():
    scheduler.run_locked(lambda: {**changed_report(), "applied": False})
    scheduler.run_locked(lambda: {**changed_report(), "activated": False})
    assert scheduler.status()["last_change"] is None


def test_quarantining_an_indexed_document_is_a_change():
    report = {**changed_report(), "documents": [doc("ENG-HANDBOOK", "quarantine")]}
    scheduler.run_locked(lambda: report)
    assert scheduler.status()["last_change"]["documents"][0]["action"] == "quarantine"


def test_after_a_restart_the_changes_are_read_back_from_runs(tmp_path):
    import json
    (tmp_path / "sync-20261109-172843.json").write_text(json.dumps({**changed_report(), "report_file": None, "trigger": "tick"}))
    (tmp_path / "sync-20261109-160000.json").write_text(json.dumps({**changed_report(), "report_file": None}))  # older: no trigger
    (tmp_path / "sync-20261109-172947.json").write_text(json.dumps(quiet_report()))
    (tmp_path / "sync-20261109-090000.json").write_text("{not json")
    scheduler.load_changes_from_reports(tmp_path)
    change = scheduler.status()["last_change"]
    assert change["at"] == "2026-11-09T17:28:43" and change["trigger"] == "tick"
    assert change["report_file"].endswith("sync-20261109-172843.json")
    assert [c["trigger"] for c in scheduler.status()["changes"]] == ["tick", None]
