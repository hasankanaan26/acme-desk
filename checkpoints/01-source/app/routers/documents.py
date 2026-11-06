# ============================================================
# Router: /documents — the register, next to the index
# ============================================================
# One row per document the source system knows about: who owns it,
# its status and dates, who may read it, and how many chunks the
# live index holds for it. "readable_by_you" is computed for the
# user you pass, so you can see the same library as an intern and
# as an HR partner.
#
# The quickest way to spot a sync problem: a current document with
# 0 chunks (quarantined or failed), or a withdrawn one with chunks.
# ============================================================

from fastapi import APIRouter, HTTPException, Query

from app.ingest.connector import make_connector
from app.ingest.register import can_read, load_register
from app.models import DocumentInfo, DocumentsResponse
from app.rag import catalog
from app.rag.retriever import resolve_user
from app.rag.store import collection_exists, index_state

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.get("", response_model=DocumentsResponse)
def list_documents(user: str | None = Query(default=None, description="Compute readable_by_you for this user.")):
    try:
        user, groups = resolve_user(user)
        entries = load_register(make_connector().fetch_register())
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    active = catalog.active_name()
    state = index_state(active) if active and collection_exists(active) else {}
    docs = [
        DocumentInfo(
            doc_id=e.doc_id,
            path=e.path,
            title=e.title,
            owner=e.owner,
            status=e.status,
            version=e.version,
            effective_from=e.effective_from,
            effective_to=e.effective_to,
            allowed_groups=e.allowed_groups,
            readable_by_you=can_read(e.allowed_groups, groups),
            in_index=e.doc_id in state,
            chunks_in_index=state.get(e.doc_id, {}).get("chunks", 0),
        )
        for e in sorted(entries.values(), key=lambda e: e.doc_id)
    ]
    return DocumentsResponse(user=user, groups=groups, documents=docs)
