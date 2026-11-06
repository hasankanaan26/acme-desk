# ============================================================
# Worker — the sync job as its own process
# ============================================================
# Part 1 ran the sync on a thread inside the API, guarded by a lock
# that only worked inside that one process, and kept its status in
# memory. Three things change here:
#
#   1. Its own process (python worker.py) and its own database role
#      (acme_sync): it can write chunks, and cannot read users,
#      sessions or groups. The API can read chunks, and cannot write
#      them. Neither can do the other's job.
#   2. A Postgres ADVISORY LOCK per tenant instead of a thread lock.
#      Start three workers: each tenant is still synced by one at a
#      time, because the lock lives in the database they share.
#   3. State in tables, not memory: every run is a sync_runs row,
#      "Run now" is a sync_requests row plus a NOTIFY, and the worker
#      writes a heartbeat to `workers`. The API only reads them.
#
# Each sync runs in ONE transaction: plan, embed, delete, insert,
# flip the live index. It commits as a whole or not at all.
# ============================================================

import logging
import os
import socket
import threading
import time
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.types.json import Jsonb

from app import db
from app.config import DATABASE_SYNC_URL, SYNC_INTERVAL_SECONDS
from app.ingest.connector import make_connector
from app.ingest.sync import run_sync

log = logging.getLogger("acme.worker")

WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"
NOTIFY_CHANNEL = "acme_sync_now"
ALIVE_SECONDS = 30   # a worker that has not checked in for this long is shown as offline


def tenants() -> list[dict]:
    with db.tx("sync") as conn:
        return conn.execute("SELECT * FROM tenants ORDER BY slug").fetchall()


def tenant_by_slug(slug: str) -> dict:
    with db.tx("sync") as conn:
        row = conn.execute("SELECT * FROM tenants WHERE slug = %s", (slug,)).fetchone()
    if not row:
        raise SystemExit(f"No tenant {slug!r}. Run: python db.py seed")
    return row


# Purpose:
# One writer per tenant, across every process that shares the
# database: workers, sync.py, --wipe, --rollback. Non-blocking: False
# means someone else holds it. Released when the transaction ends, so
# a crashed process can never leave it stuck.
def try_lock_tenant(conn: psycopg.Connection, tid: str) -> bool:
    return conn.execute("SELECT pg_try_advisory_xact_lock(hashtextextended(%s, 0)) AS ok",
                        (f"acme.sync:{tid}",)).fetchone()["ok"]


# Purpose:
# One sync of one tenant, recorded in sync_runs. Never raises for a
# failed sync: the error is recorded, the index was not touched (the
# transaction rolled back), and the next tick gets another chance.
def run_tenant(tenant: dict, trigger: str = "tick", apply: bool = True, rebuild: bool = False,
               requested_by: str | None = None) -> dict:
    tid = str(tenant["id"])
    run_id = None
    if apply:
        with db.tx("sync", tid) as conn:
            run_id = conn.execute(
                "INSERT INTO sync_runs (tenant_id, trigger, requested_by, worker) VALUES (app_tenant(), %s, %s, %s) "
                "RETURNING id", (trigger, requested_by, WORKER_ID)).fetchone()["id"]

    started = time.perf_counter()
    report, error, skipped = None, None, None
    try:
        with db.tx("sync", tid) as conn:
            # One sync per tenant at a time, across every worker process.
            if not try_lock_tenant(conn, tid):
                skipped = "another sync of this tenant is running"
            else:
                report = run_sync(apply=apply, rebuild=rebuild, connector=make_connector(tenant))
    except Exception as exc:  # noqa: BLE001 - a worker must outlive one bad run
        error = f"{type(exc).__name__}: {exc}"
        if not apply:
            raise

    if run_id is not None:
        seconds = round(time.perf_counter() - started, 2)
        ok = None if skipped else (error is None and report.get("activated", True) is not False)
        with db.tx("sync", tid) as conn:
            conn.execute("""
                UPDATE sync_runs SET finished_at = now(), seconds = %s, ok = %s, skipped_reason = %s,
                                     counts = %s, chunks_in_index = %s, error = %s, report = %s
                WHERE id = %s""",
                (seconds, ok, skipped, Jsonb(report["counts"]) if report else None,
                 report.get("chunks_in_index") if report else None, error,
                 Jsonb(report) if report else None, run_id))
            # Audit what matters: a run that changed the index, failed, or was
            # asked for by a person. A quiet tick every minute is in sync_runs,
            # not in the audit log (4,000 "nothing happened" rows a day hide
            # the one that matters).
            changed = bool(report and set(report["counts"]) & {"add", "change", "relabel", "touch", "remove"})
            if changed or error or trigger != "tick":
                conn.execute("INSERT INTO audit_log (tenant_id, actor, action, target, detail) "
                             "VALUES (app_tenant(), %s, 'sync.run', %s, %s)",
                             (f"worker:{WORKER_ID}", str(run_id),
                              Jsonb({"trigger": trigger, "ok": ok, "counts": report["counts"] if report else None,
                                     "error": error, "skipped": skipped})))
        if error:
            log.warning("%s: sync #%s failed, index untouched: %s", tenant["slug"], run_id, error)
        elif skipped:
            log.info("%s: sync #%s skipped: %s", tenant["slug"], run_id, skipped)
        else:
            log.info("%s: sync #%s %s | %s chunks", tenant["slug"], run_id,
                     ", ".join(f"{k} {v}" for k, v in report["counts"].items()) or "nothing",
                     report.get("chunks_in_index"))
    return {"run_id": run_id, "report": report, "error": error, "skipped": skipped}


# Purpose:
# Claim this tenant's pending "Run now" requests. SKIP LOCKED: two
# workers never claim the same request.
def claim_requests(tid: str) -> dict | None:
    with db.tx("sync", tid) as conn:
        rows = conn.execute("""
            UPDATE sync_requests SET picked_at = now()
            WHERE id IN (SELECT id FROM sync_requests WHERE picked_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED)
            RETURNING requested_by""").fetchall()
    return {"requested_by": rows[0]["requested_by"]} if rows else None


def heartbeat(interval: float) -> None:
    with db.tx("sync") as conn:
        conn.execute("""INSERT INTO workers (id, interval_seconds) VALUES (%s, %s)
                        ON CONFLICT (id) DO UPDATE SET last_seen_at = now(),
                                                       interval_seconds = EXCLUDED.interval_seconds""",
                     (WORKER_ID, interval))


# Purpose:
# The loop: every second, for every tenant, run a sync if one was
# requested, or if the interval has passed and the tenant is not
# paused. Between rounds, sleep until a NOTIFY or one second passes.
# interval <= 0: no scheduled ticks, only "Run now" (Part 1's "off").
# once=True: one sync of every tenant, then return (cron-style).
def loop(interval: float = SYNC_INTERVAL_SECONDS, stop: threading.Event | None = None, once: bool = False) -> None:
    stop = stop or threading.Event()
    last_tick: dict[str, float] = {}
    listener = psycopg.connect(DATABASE_SYNC_URL, autocommit=True)
    listener.execute(f"LISTEN {NOTIFY_CHANNEL}")
    if interval > 0:
        log.info("worker %s: a sync every %ss per tenant, and on Run now", WORKER_ID, interval)
    else:
        log.info("worker %s: no timer (SYNC_INTERVAL_SECONDS=0); syncs only on Run now", WORKER_ID)
    try:
        while not stop.is_set():
            heartbeat(interval)
            for t in tenants():
                tid = str(t["id"])
                request = claim_requests(tid)
                due = once or (interval > 0 and not t["sync_paused"]
                               and time.monotonic() - last_tick.get(tid, float("-inf")) >= interval)
                if request or due:
                    run_tenant(t, trigger="manual" if request else "tick",
                               requested_by=request["requested_by"] if request else None)
                    last_tick[tid] = time.monotonic()
            if once:
                break
            for _ in listener.notifies(timeout=1.0, stop_after=1):
                pass
    finally:
        listener.close()
        with db.tx("sync") as conn:  # a worker that stopped is not "alive"
            conn.execute("DELETE FROM workers WHERE id = %s", (WORKER_ID,))


# ---- What the API shows (read with the API's own role) ----

# Purpose:
# The Sync tab's status card, from the tables the worker writes. Same
# fields as Part 1's in-memory scheduler status.
def status() -> dict:
    conn = db.current()
    worker = conn.execute("SELECT * FROM workers WHERE last_seen_at > now() - make_interval(secs => %s) "
                          "ORDER BY last_seen_at DESC LIMIT 1", (ALIVE_SECONDS,)).fetchone()
    tenant = conn.execute("SELECT sync_paused FROM tenants WHERE id = app_tenant()").fetchone()
    stats = conn.execute("""SELECT count(*) AS runs, count(*) FILTER (WHERE ok = false) AS errors,
                                   count(*) FILTER (WHERE skipped_reason IS NOT NULL) AS skipped
                            FROM sync_runs""").fetchone()
    last = conn.execute("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1").fetchone()
    last_done = conn.execute("SELECT * FROM sync_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1").fetchone()
    pending = conn.execute("SELECT count(*) AS n FROM sync_requests WHERE picked_at IS NULL").fetchone()["n"]

    interval = float(worker["interval_seconds"]) if worker else 0.0
    paused = bool(tenant and tenant["sync_paused"])
    next_run = seconds_to_next = None
    if worker and not paused and last_done:
        nxt = last_done["finished_at"] + timedelta(seconds=interval)
        next_run = nxt.astimezone().isoformat(timespec="seconds")
        seconds_to_next = max(0, round((nxt - datetime.now(timezone.utc)).total_seconds()))
    summary = None
    if last_done and last_done["report"]:
        summary = {"counts": last_done["counts"], "chunks_in_index": last_done["chunks_in_index"],
                   "warnings": len(last_done["report"].get("warnings", [])),
                   "report_file": f"sync run #{last_done['id']}"}
    return {
        "enabled": worker is not None,
        "paused": paused,
        "running": bool(last and last["finished_at"] is None),
        "interval": interval,
        "runs": stats["runs"],
        "errors": stats["errors"],
        "skipped": stats["skipped"],
        "last_run": last_done["finished_at"].astimezone().isoformat(timespec="seconds") if last_done else None,
        "last_seconds": float(last_done["seconds"]) if last_done and last_done["seconds"] is not None else None,
        "last_summary": summary,
        "last_error": last_done["error"] if last_done else None,
        "next_run": next_run,
        "seconds_to_next_run": seconds_to_next,
        "worker": worker["id"] if worker else None,
        "pending_requests": pending,
    }


def request_run(user_id: str) -> None:
    """Run now, from the API: a row for the worker, and a NOTIFY to wake it (sent at commit)."""
    conn = db.current()
    conn.execute("INSERT INTO sync_requests (tenant_id, requested_by) VALUES (app_tenant(), %s)", (user_id,))
    conn.execute("SELECT pg_notify(%s, app_tenant()::text)", (NOTIFY_CHANNEL,))
