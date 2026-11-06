# ============================================================
# Router: /search — retrieval only, as a given user
# ============================================================
# Checkpoint 5 adds two parameters:
#   user   who is asking (intern, eng-manager, hr-partner,
#          finance-lead, sales-rep). Least privilege by default.
#   as_of  a date (YYYY-MM-DD): search the documents that were in
#          force that day instead of today's.
#
# DEMO (after the weekend's events and a sync):
#   q="engineering salary bands"  user=intern        -> nothing about bands
#   q="engineering salary bands"  user=hr-partner    -> the 2026 bands
#   q="meal per diem"                                -> 2026 policy ($85)
#   q="meal per diem"  as_of=2024-03-15              -> 2024 update ($75)
#   q="meal per diem"  as_of=2023-06-01              -> 2023 policy ($60)
#
# In production the user comes from the login token, never from a
# query parameter. Here it is a parameter so you can switch in class.
# ============================================================

from fastapi import APIRouter, HTTPException, Query

from app.models import SearchResponse, SearchResult
from app.rag.retriever import resolve_user, retrieve

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
    )


@router.get("", response_model=SearchResponse)
def search_chunks(
    q: str = Query(description="The search query text."),
    top_k: int = Query(default=5, description="Number of results to return."),
    user: str | None = Query(default=None, description="Who is asking: intern, eng-manager, hr-partner, finance-lead, sales-rep."),
    as_of: str | None = Query(default=None, description="YYYY-MM-DD: search what was in force on that date."),
):
    """Search the vector store as one user. No LLM involved."""
    try:
        user, groups = resolve_user(user)
        chunks = retrieve(q, user=user, top_k=top_k, as_of=as_of)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    results = [to_result(c) for c in chunks]
    return SearchResponse(query=q, user=user, groups=groups, as_of=as_of, results=results,
                          total_results=len(results))
