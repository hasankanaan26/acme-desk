# ============================================================
# Router: /compare — RAG vs plain LLM side-by-side
# ============================================================
# Updated from Checkpoint 3 to include confidence scoring and
# no-result detection in the RAG path.
#
# DEMO QUESTIONS:
#   "How many vacation days do I get?"
#       -> Plain: invents a number | RAG: cites leave policy (high confidence)
#   "What is the capital of France?"
#       -> Plain: correct | RAG: no_result (not in docs)
#   "What about time off?"
#       -> Plain: generic | RAG: finds policy (medium confidence)
#
# TRICKY QUESTIONS (failure modes):
#   "Is the leave policy generous?"    -> Subjective
#   "What changed in the latest policy update?" -> Temporal
#   "Compare our benefits to Google's" -> Cross-domain
# ============================================================

import logging
import uuid
from fastapi import APIRouter, Query
from app.models import (
    CompareRequest,
    CompareResponse,
    PlainResult,
    RAGResult,
    SourceInfo,
)
from app.llm import call_llm, get_model_name
from app.rag.retriever import retrieve, score_confidence, is_no_result
from app.prompts.plain_answer import PLAIN_SYSTEM_PROMPT
from app.prompts.rag_answer import RAG_SYSTEM_PROMPT
# Checkpoint 5: the provenance-labelled context and sources from /query
from app.routers.query import build_context, to_source

logger = logging.getLogger("rag.compare")
router = APIRouter(prefix="/compare", tags=["Comparison"])

NO_RESULT_ANSWER = (
    "I don't have information about that in the knowledge base."
)


# Purpose:
# Runs the same question through both plain LLM and RAG with confidence
# scoring, returning both answers for side-by-side comparison.
@router.post("", response_model=CompareResponse)
def compare_answers(
    request: CompareRequest,
    top_k: int = Query(default=3, description="Number of chunks to retrieve for RAG."),
    user: str | None = Query(default=None, description="Who is asking (Checkpoint 5)."),
):
    """Run the same question through plain LLM and RAG, return both answers."""
    question = request.question
    request_id = uuid.uuid4().hex[:8]
    logger.info("req_%s | Compare request | question=%r", request_id, question)

    # --- Plain LLM path ---
    logger.info("req_%s | Running plain LLM (no retrieval)", request_id)
    plain_answer = call_llm(
        user_prompt=question,
        system_prompt=PLAIN_SYSTEM_PROMPT,
    )
    logger.info("req_%s | Plain LLM responded | answer_length=%d chars", request_id, len(plain_answer))

    plain_result = PlainResult(answer=plain_answer, model=get_model_name())

    # --- RAG path ---
    logger.info("req_%s | Running RAG pipeline", request_id)
    chunks = retrieve(query=question, user=user, top_k=top_k)

    if chunks:
        distances = [c["distance"] for c in chunks]
        logger.info(
            "req_%s | RAG retrieved %d chunks | best_distance=%.3f | sources=%s",
            request_id, len(chunks), min(distances),
            [c["source"] for c in chunks],
        )

    no_result = is_no_result(chunks)
    confidence = "none" if no_result else score_confidence(chunks)

    if no_result:
        logger.info("req_%s | RAG result: NO_RESULT", request_id)
        rag_answer = NO_RESULT_ANSWER
    else:
        context = build_context(chunks)
        system_prompt = RAG_SYSTEM_PROMPT.format(context=context)
        rag_answer = call_llm(user_prompt=question, system_prompt=system_prompt)
        logger.info(
            "req_%s | RAG LLM responded | confidence=%s | answer_length=%d chars",
            request_id, confidence, len(rag_answer),
        )

    sources = [
        to_source(c)
        for c in chunks
    ] if not no_result else []

    rag_result = RAGResult(
        answer=rag_answer,
        model=get_model_name(),
        sources=sources,
        chunks_used=len(chunks) if not no_result else 0,
        confidence=confidence,
        no_result=no_result,
    )

    # --- Build comparison note ---
    if no_result:
        note = (
            "The RAG system found no relevant documents for this question. "
            "The plain LLM answer is based purely on training data and may "
            "not be accurate for Acme Corp."
        )
    elif confidence == "high":
        note = (
            "The RAG answer is grounded in company documents. "
            "The plain LLM answer uses general training data. "
            "Compare them — the RAG answer should be more specific and accurate."
        )
    else:
        note = (
            "The RAG system found some matches but with limited confidence. "
            "The answer may be partially grounded. Compare both and decide "
            "which is more useful."
        )

    logger.info("req_%s | Compare complete | confidence=%s | no_result=%s", request_id, confidence, no_result)

    return CompareResponse(
        question=question,
        rag=rag_result,
        plain=plain_result,
        note=note,
        request_id=request_id,
    )
