# ============================================================
# Router: /source-events — replay the weekend from the UI (local mode)
# ============================================================
# When SOURCE=local, the folder workspace/local-drive plays Google
# Drive and these buttons play the people who edit it over the
# weekend. The same thing as `python fake_drive.py ...`. They only
# change the fake source, never the index: run a sync (or wait for
# the scheduler's next tick) to see what the change does.
#
#   GET  /source-events/events      -> the five events, which are applied,
#                                      and every doc_id you can explain
#   POST /source-events/events/5    -> replay event 5 (the wiki footer)
#   POST /source-events/reset       -> back to Friday
#
# Not mounted when SOURCE=drive: a real source changes because
# people edit files, and you do that in the Drive UI.
# ============================================================

import json

from fastapi import APIRouter, HTTPException

import fake_drive  # the demo script at the checkpoint root
from app.config import REGISTER_FILENAME, SOURCE_DIR
from app.rag import catalog, store

router = APIRouter(prefix="/source-events", tags=["Demo: the weekend (local mode)"])


# Purpose:
# The doc_ids an event touches, in order, so the UI can preselect the
# first one. Ops name a doc_id, a register entry, or only a file path.
def _docs_of(event: dict, doc_id_of_path: dict[str, str]) -> list[str]:
    found = []
    for op in event["ops"]:
        doc_id = op.get("doc_id") or op.get("entry", {}).get("doc_id") or doc_id_of_path.get(op.get("path", ""))
        if doc_id and doc_id not in found:
            found.append(doc_id)
    return found


def _register() -> list[dict]:
    path = SOURCE_DIR / REGISTER_FILENAME
    return json.loads(path.read_text(encoding="utf-8"))["documents"] if path.exists() else []


@router.get("/events")
def list_events():
    """The weekend's events, and every doc_id in the register or the live index."""
    register = _register()
    done = fake_drive.applied() if SOURCE_DIR.exists() else []
    doc_id_of_path = {d["path"]: d["doc_id"] for d in register}
    events = [{"id": e["id"], "title": e["title"], "story": e["story"], "applied": e["id"] in done,
               "docs": _docs_of(e, doc_id_of_path)} for e in fake_drive.load_events()]
    live = catalog.active_name()
    indexed = store.index_state(live) if live and store.collection_exists(live) else {}
    return {"events": events, "documents": sorted({d["doc_id"] for d in register} | set(indexed))}


@router.post("/events/{event_id}")
def apply_event(event_id: int):
    """Replay one event on the local folder. The index is not touched."""
    event = next((e for e in fake_drive.load_events() if e["id"] == event_id), None)
    if event is None:
        raise HTTPException(status_code=404, detail=f"No event {event_id}")
    if event_id in fake_drive.applied():
        # Replaying twice would add the same register entry twice.
        raise HTTPException(status_code=409, detail=f"Event {event_id} is already applied. Reset to Friday first.")
    fake_drive.apply_event(event)
    return list_events()


@router.post("/reset")
def reset():
    """Back to Friday. The index is not touched: sync afterwards to catch up."""
    fake_drive.reset()
    return list_events()
