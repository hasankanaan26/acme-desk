# ============================================================
# Router: /sync — the worker's dashboard (tenant admins only)
# ============================================================
# Part 1's API RAN the sync (a thread, POST /sync, POST /sync/now).
# Part 2's API cannot: its database role has no write grant on chunks,
# and it holds no Drive key. It can only
#
#   GET  /sync/status       read what the worker wrote
#   GET  /sync/runs         the last runs, one row each
#   GET  /sync/runs/{id}    one run's full plan (the per-document table)
#   POST /sync/now          ask the worker: a sync_requests row + NOTIFY
#   POST /sync/pause|resume flip tenants.sync_paused
#
# Admin-only because a sync report names every document, including
# ones the admin's members may not know exist.
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app import db
from app.auth.deps import client_ip, csrf_guard, require_admin
from app.auth.service import Principal, audit
from app.ingest import worker
from app.models import SchedulerStatus, SyncRunInfo

router = APIRouter(prefix="/sync", tags=["Sync (the worker)"], dependencies=[Depends(csrf_guard)])


@router.get("/status", response_model=SchedulerStatus)
def sync_status(principal: Principal = Depends(require_admin)):
    with db.tx("app", principal.tenant_id, principal.user_id):
        return worker.status()


@router.get("/runs", response_model=list[SyncRunInfo])
def sync_runs(limit: int = Query(default=20, ge=1, le=200), principal: Principal = Depends(require_admin)):
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        rows = conn.execute("""
            SELECT r.*, u.email AS requested_by_email FROM sync_runs r LEFT JOIN users u ON u.id = r.requested_by
            ORDER BY r.id DESC LIMIT %s""", (limit,)).fetchall()
    return [SyncRunInfo(**{**r, "requested_by": r["requested_by_email"],
                           "seconds": float(r["seconds"]) if r["seconds"] is not None else None}) for r in rows]


@router.get("/runs/{run_id}")
def sync_run(run_id: int, principal: Principal = Depends(require_admin)):
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        row = conn.execute("SELECT id, report FROM sync_runs WHERE id = %s", (run_id,)).fetchone()
    if not row or not row["report"]:
        raise HTTPException(status_code=404, detail=f"No report for sync run #{run_id}")
    return {"id": row["id"], **row["report"]}


@router.post("/now", response_model=SchedulerStatus)
def sync_now(request: Request, principal: Principal = Depends(require_admin)):
    """Ask the worker for a sync of this tenant, now."""
    with db.tx("app", principal.tenant_id, principal.user_id):
        worker.request_run(principal.user_id)
        audit("sync.request", principal.email, user_id=principal.user_id, ip=client_ip(request))
    with db.tx("app", principal.tenant_id, principal.user_id):
        return worker.status()


def _set_paused(paused: bool, request: Request, principal: Principal) -> dict:
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        conn.execute("UPDATE tenants SET sync_paused = %s WHERE id = app_tenant()", (paused,))
        audit("sync.pause" if paused else "sync.resume", principal.email, user_id=principal.user_id,
              ip=client_ip(request))
        return worker.status()


@router.post("/pause", response_model=SchedulerStatus)
def sync_pause(request: Request, principal: Principal = Depends(require_admin)):
    """Scheduled ticks skip this tenant. Run now still works."""
    return _set_paused(True, request, principal)


@router.post("/resume", response_model=SchedulerStatus)
def sync_resume(request: Request, principal: Principal = Depends(require_admin)):
    return _set_paused(False, request, principal)
