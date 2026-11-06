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

import logging
import threading
import time
from datetime import datetime, timedelta

from app.config import SYNC_INTERVAL_SECONDS
from app.ingest.sync import run_sync

log = logging.getLogger("acme.scheduler")

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
}


def _stamp(when: datetime | None = None) -> str:
    return (when or datetime.now()).isoformat(timespec="seconds")


# Purpose:
# Run one sync of any kind (a tick, the UI button, the CLI) while
# holding the lock, so two syncs never write to the index at once.
def run_locked(fn):
    with _lock:
        _state["running"] = True
        try:
            return fn()
        finally:
            _state["running"] = False


# Purpose:
# One scheduled run. Failures are counted and shown, never raised:
# the next tick gets another chance and the index was not touched
# (apply_plan embeds first and writes last).
def tick() -> dict:
    started = time.perf_counter()
    # TODO (Lab exercise): fingerprint the listing (sha256 of sorted
    # "path|etag" lines) and, when it equals the last tick's, count a
    # "skipped" instead of running the whole sync.
    try:
        report = run_locked(lambda: run_sync(apply=True))
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
