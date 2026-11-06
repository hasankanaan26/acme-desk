# ============================================================
# Router: /query — RAG endpoint, as the signed-in user, as of a date
# ============================================================
# Checkpoint 4: confidence, no-result detection, doc-type routing.
# Checkpoint 5 and Part 1:
#   - retrieval only sees what this user may read
#   - as_of: answer from the documents in force on that date
#   - every context block carries its provenance (title, version,
#     effective date, status) so the LLM can tell an old rule from
#     a new one, and so citations come from metadata, not the LLM
#
# DEMO QUESTIONS (after the weekend's events and a sync):
#   "How much can I spend on a team dinner per person?"   -> $90 (2026 policy)
#     same, as_of=2024-06-01                              -> $75 (2024 update)
#   "What are the salary bands for a senior developer?"
#     signed in as intern -> no result;   as hr-partner -> the 2026 bands
#
# Part 2: the user is the session's, never a parameter. Retrieval runs
# in a database transaction as that user's tenant; the LLM is called
# AFTER the transaction closed, so no connection waits on a model.
#   "How many days of unpaid leave can I take?"           -> no longer in the policy
# ============================================================

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app import db
from app.auth.deps import client_ip, csrf_guard, get_principal
from app.auth.service import Principal, audit
from app.llm import call_llm, get_model_name
from app.models import DocFilterInfo, QueryRequest, QueryResponse, SourceInfo
from app.prompts.rag_answer import RAG_SYSTEM_PROMPT
from app.prompts.rag_answer_minimal import RAG_MINIMAL_PROMPT
from app.rag.doc_types import DOC_TYPES
from app.rag.retriever import is_no_result, retrieve_with_doc_filter, score_confidence
from app.routers.search import to_result

logger = logging.getLogger("rag.query")
router = APIRouter(prefix="/query", tags=["RAG Q&A"], dependencies=[Depends(csrf_guard)])

DOC_FILTER_PATTERN = "^(auto|off|" + "|".join(DOC_TYPES) + ")$"

NO_RESULT_ANSWER = (
    "I don't have information about that in the documents you can access. "
    "Try asking about Acme Corp policies like leave, expenses, "
    "coding standards, or remote work."
)


# Purpose:
# Label every chunk with where it came from before the LLM sees it.
def build_context(chunks: list[dict]) -> str:
    parts = []
    for c in chunks:
        r = to_result(c)
        parts.append(
            f"[{r.title} | v{r.version} | effective {r.effective_from} | {r.status} | "
            f"section: {r.section}]\n{c['text']}"
        )
    return "\n\n".join(parts)


def to_source(c: dict) -> SourceInfo:
    r = to_result(c)
    return SourceInfo(**r.model_dump(exclude={"chunk_index"}), doc_type=c.get("doc_type", ""))


@router.post("", response_model=QueryResponse)
def query_rag(
    request: QueryRequest,
    http: Request,
    as_of: str | None = Query(default=None, description="YYYY-MM-DD: answer from the documents in force that day."),
    top_k: int = Query(default=3, ge=1, le=20, description="Number of chunks to retrieve."),
    prompt_style: str = Query(default="default", description="'default' (strict) or 'minimal' (loose)."),
    high_threshold: float | None = Query(default=None, description="Override high-confidence distance threshold."),
    low_threshold: float | None = Query(default=None, description="Override low-confidence distance threshold."),
    no_result_threshold: float | None = Query(default=None, description="Override no-result distance threshold."),
    doc_filter: str = Query(default="off", pattern=DOC_FILTER_PATTERN,
                            description="'auto' (LLM picks a doc type), 'off', or a doc type: " + ", ".join(DOC_TYPES)),
    principal: Principal = Depends(get_principal),
):
    """Answer a question with RAG, as one user, optionally as of a past date."""
    request_id = uuid.uuid4().hex[:8]
    user, groups = principal.email, principal.group_names
    with db.tx("app", principal.tenant_id, principal.user_id):
        try:
            retrieval = retrieve_with_doc_filter(
                query=request.question, group_ids=principal.group_ids, top_k=top_k, filter_mode=doc_filter,
                no_result_threshold=no_result_threshold, as_of=as_of,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        audit("query", user, user_id=principal.user_id, ip=client_ip(http),
              detail={"doc_ids": sorted({c["doc_id"] for c in retrieval["chunks"]}), "as_of": as_of,
                      "request_id": request_id})

    chunks = retrieval["chunks"]
    logger.info("req_%s | user=%s groups=%s as_of=%s | %d chunks | docs=%s", request_id, user, groups,
                as_of, len(chunks), [c.get("doc_id") for c in chunks])
    filter_info = DocFilterInfo(
        mode=doc_filter,
        doc_type=retrieval["doc_type"],
        picked_by=retrieval["picked_by"],
        classifier_reply=retrieval["classifier_reply"],
        fallback_used=retrieval["fallback_used"],
        filtered_best_distance=retrieval["filtered_best_distance"],
    )

    if is_no_result(chunks, no_result_threshold=no_result_threshold):
        return QueryResponse(
            question=request.question, answer=NO_RESULT_ANSWER, model=get_model_name(),
            user=user, as_of=as_of, sources=[], chunks_used=0, confidence="none",
            no_result=True, request_id=request_id, doc_filter=filter_info,
        )

    confidence = score_confidence(chunks, high_threshold=high_threshold, low_threshold=low_threshold)
    context = build_context(chunks)
    template = RAG_MINIMAL_PROMPT if prompt_style == "minimal" else RAG_SYSTEM_PROMPT
    answer_text = call_llm(user_prompt=request.question, system_prompt=template.format(context=context))

    return QueryResponse(
        question=request.question,
        answer=answer_text,
        model=get_model_name(),
        user=user,
        as_of=as_of,
        sources=[to_source(c) for c in chunks],
        chunks_used=len(chunks),
        confidence=confidence,
        no_result=False,
        request_id=request_id,
        doc_filter=filter_info,
    )
