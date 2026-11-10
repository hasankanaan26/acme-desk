# ============================================================
# Router: /search — retrieval only, as the signed-in user
# ============================================================
# Part 2: there is no ?user= any more. Who is asking comes from the
# session cookie (app/auth/), and with it the tenant and the groups.
#   as_of  a date (YYYY-MM-DD): search the documents that were in
#          force that day instead of today's.
#
# DEMO (after the weekend's events and a sync):
#   q="engineering salary bands"  signed in as intern      -> nothing about bands
#   q="engineering salary bands"  signed in as hr-partner  -> the 2026 bands
#   q="meal per diem"                                -> 2026 policy ($85)
#   q="meal per diem"  as_of=2024-03-15              -> 2024 update ($75)
#   q="meal per diem"  as_of=2023-06-01              -> 2023 policy ($60)
#   strategy=dense | keyword | hybrid                -> by meaning, by
#          words, or both fused (each result says which found it)
#
# Every search is written to the audit log: who, and which documents
# came back (not the text).
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app import db
from app.auth.deps import client_ip, get_principal
from app.auth.service import Principal, audit
from app.config import RETRIEVAL_STRATEGY
from app.models import SearchResponse, SearchResult
from app.rag.retriever import retrieve

router = APIRouter(prefix="/search", tags=["Search"])


def to_result(c: dict) -> SearchResult:
    eff = str(c.get("effective_from", ""))
    return SearchResult(
        text=c["text"],
        source=c["source"],
        chunk_index=c["chunk_index"],
        distance=c["distance"],
        doc_id=c.get("doc_id", ""),
        title=c.get("title", ""),
        version=c.get("version", 0),
        status=c.get("status", ""),
        effective_from=f"{eff[:4]}-{eff[4:6]}-{eff[6:]}" if len(eff) == 8 else eff,
        section=c.get("section", ""),
        source_url=c.get("source_url", ""),
        found_by=c.get("found_by", []),
    )


@router.get("", response_model=SearchResponse)
def search_chunks(
    request: Request,
    q: str = Query(max_length=1000, description="The search query text."),
    top_k: int = Query(default=5, ge=1, le=20, description="Number of results to return."),
    as_of: str | None = Query(default=None, description="YYYY-MM-DD: search what was in force on that date."),
    strategy: str | None = Query(default=None, pattern="^(dense|keyword|hybrid)$",
                                 description="dense (meaning), keyword (words) or hybrid (both). Default: .env"),
    principal: Principal = Depends(get_principal),
):
    """Search the vector store as the signed-in user. No LLM involved."""
    strategy = strategy or RETRIEVAL_STRATEGY
    with db.tx("app", principal.tenant_id, principal.user_id):
        try:
            chunks = retrieve(q, principal.group_ids, top_k=top_k, as_of=as_of, strategy=strategy)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        audit("search", principal.email, user_id=principal.user_id, ip=client_ip(request),
              detail={"doc_ids": sorted({c["doc_id"] for c in chunks}), "as_of": as_of, "strategy": strategy})
    return SearchResponse(query=q, user=principal.email, groups=principal.group_names, as_of=as_of, strategy=strategy,
                          results=[to_result(c) for c in chunks], total_results=len(chunks))
