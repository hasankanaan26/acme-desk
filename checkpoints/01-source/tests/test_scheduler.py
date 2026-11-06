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
    scheduler._state.update(FRESH)
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
    monkeypatch.setattr(scheduler, "run_sync", lambda apply=False, **kw: calls.append(apply) or fake_report(change=1, unchanged=17))
    status = scheduler.tick()
    assert calls == [True]
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
