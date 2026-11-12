# ============================================================
# Router: /documents — the register, next to the index
# ============================================================
# One row per document: owner, status and dates, who may read it, and
# how many chunks the live index holds for it.
#
# Part 1 listed every document to everyone, with a "readable_by_you"
# flag. That leaks titles: "Engineering Salary Bands (2026)" is
# information. Part 2 shows a member only the documents they may
# read; an admin sees the whole register.
#
# The quickest way to spot a sync problem: a current document with
# 0 chunks (quarantined or failed), or a withdrawn one with chunks.
# ============================================================

from fastapi import APIRouter, Depends

from app import db
from app.auth.deps import get_principal
from app.auth.service import Principal
from app.ingest.register import can_read, load_register
from app.ingest.registry import fetch_register
from app.models import DocumentInfo, DocumentsResponse
from app.rag.store import index_state

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.get("", response_model=DocumentsResponse)
def list_documents(principal: Principal = Depends(get_principal)):
    with db.tx("app", principal.tenant_id, principal.user_id):
        entries = load_register(fetch_register(with_acl=True))
        state = index_state()
    docs = []
    for e in sorted(entries.values(), key=lambda e: e.doc_id):
        readable = can_read(e.allowed_groups, principal.group_names)
        if not readable and not principal.is_admin:
            continue
        docs.append(DocumentInfo(
            doc_id=e.doc_id, path=e.path, title=e.title, owner=e.owner, status=e.status, version=e.version,
            effective_from=e.effective_from, effective_to=e.effective_to, allowed_groups=e.allowed_groups,
            readable_by_you=readable, in_index=e.doc_id in state,
            chunks_in_index=state.get(e.doc_id, {}).get("chunks", 0),
        ))
    return DocumentsResponse(user=principal.email, groups=principal.group_names, documents=docs)
