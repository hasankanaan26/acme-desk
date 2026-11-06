# ============================================================
# Router: /sync — the ingestion job, from Swagger or the UI
# ============================================================
# Same job as `python sync.py`.
#
#   POST /sync                  -> dry run: the plan and its cost, nothing written
#   POST /sync?apply=true       -> do it, write a report to runs/
#   POST /sync?rebuild=true&apply=true
#                               -> build a fresh index next to the live one,
#                                  switch over if the smoke check passes
#   GET  /sync/explain?doc_id=HR-LEAVE
#                               -> one document's eTag and content hash,
#                                  index vs source, with the diff behind each
#
# NEW in Part 1: the scheduler (app/ingest/scheduler.py). When
# SYNC_INTERVAL_SECONDS > 0 the job also runs on its own, inside
# the API process.
#   GET  /sync/status           -> on or off, last run, next run, last plan
#   POST /sync/now              -> one tick right now (so a demo never waits 60 s)
#   POST /sync/pause, /sync/resume
#
# The manual run and the scheduled run share one lock, so they never
# write to the index at the same time.
# ============================================================

from fastapi import APIRouter, HTTPException, Query

from app.ingest import scheduler
from app.ingest.explain import explain_doc
from app.ingest.sync import ModelMismatch, run_sync
from app.models import SchedulerStatus, SyncDocAction, SyncResponse

router = APIRouter(prefix="/sync", tags=["Sync (ingestion job)"])


@router.post("", response_model=SyncResponse)
def sync(
    apply: bool = Query(default=False, description="False = dry run (plan only). True = write to the index."),
    rebuild: bool = Query(default=False, description="Build a new index next to the live one (blue/green)."),
):
    """Compare the source with the index; plan or apply the changes."""
    try:
        report = scheduler.run_locked(lambda: run_sync(apply=apply, rebuild=rebuild))
    except ModelMismatch as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return SyncResponse(
        applied=report["applied"],
        collection=report["collection"],
        embedding_model=report["embedding_model"],
        counts=report["counts"],
        chunks_to_embed=report["chunks_to_embed"],
        estimated_tokens=report["estimated_tokens"],
        estimated_cost_usd=report["estimated_cost_usd"],
        warnings=report["warnings"],
        documents=[SyncDocAction(**{k: d[k] for k in ("doc_id", "path", "action", "reason", "chunks", "signals")})
                   for d in report["documents"]],
        report_file=report.get("report_file"),
    )


@router.get("/status", response_model=SchedulerStatus)
def sync_status():
    """Is the scheduler on, when did it last run, what did it decide, when is the next tick."""
    return scheduler.status()


@router.post("/now", response_model=SchedulerStatus)
def sync_now():
    """One scheduled tick, right now: the same run_sync(apply=True) the timer calls."""
    return scheduler.tick()


@router.post("/pause", response_model=SchedulerStatus)
def sync_pause():
    """Keep the timer running but make its ticks do nothing."""
    return scheduler.pause()


@router.post("/resume", response_model=SchedulerStatus)
def sync_resume():
    return scheduler.resume()


@router.get("/explain")
def explain(doc_id: str = Query(description="A doc_id from the register, e.g. HR-LEAVE.")):
    """eTag vs content hash for one document: what changed in the file, and in the text we embed."""
    try:
        return explain_doc(doc_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"No document {doc_id} in the register or the index")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
