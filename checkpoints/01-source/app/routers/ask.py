# ============================================================
# Router: /ask — Plain Q&A and Grounded (retrieved context)
# ============================================================
# /ask           the model alone, from its training data
# /ask/grounded  the same model, with the chunks RAG retrieves from
#                the live index pasted into the prompt. It used to
#                paste a hardcoded leave-policy snippet, which went
#                stale the moment the policy changed in the source.
# ============================================================

from fastapi import APIRouter, HTTPException, Query

from app.llm import call_llm, get_model_name
from app.models import Answer, Question
from app.prompts.grounded_answer import GROUNDED_SYSTEM_PROMPT, NO_CONTEXT_ANSWER
from app.prompts.plain_answer import PLAIN_SYSTEM_PROMPT
from app.rag.retriever import is_no_result, retrieve
from app.routers.query import build_context

router = APIRouter(prefix="/ask", tags=["Q&A"])


# Purpose:
# Answers a question using only the LLM's training data (no grounding).
@router.post("", response_model=Answer)
def ask_plain(request: Question):
    """Ask a question — answered by the LLM's general knowledge only."""
    response_text = call_llm(
        user_prompt=request.question,
        system_prompt=PLAIN_SYSTEM_PROMPT,
    )
    return Answer(answer=response_text, model=get_model_name(), grounded=False)


# Purpose:
# Answers a question from the chunks retrieved from the live index,
# inside what this user may read. Same retrieval as /query and /compare.
@router.post("/grounded", response_model=Answer)
def ask_grounded(
    request: Question,
    user: str | None = Query(default=None, description="Who is asking: intern, eng-manager, hr-partner, finance-lead, sales-rep."),
    as_of: str | None = Query(default=None, description="YYYY-MM-DD: answer from the documents in force that day."),
    top_k: int = Query(default=3, description="Number of chunks to retrieve."),
):
    """Ask a question — answered from context retrieved from the index."""
    try:
        chunks = retrieve(query=request.question, user=user, top_k=top_k, as_of=as_of)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if is_no_result(chunks):
        return Answer(answer=NO_CONTEXT_ANSWER, model=get_model_name(), grounded=True)

    response_text = call_llm(
        user_prompt=request.question,
        system_prompt=GROUNDED_SYSTEM_PROMPT.format(context=build_context(chunks)),
    )
    sources = list(dict.fromkeys(f"{c.get('title') or c.get('source')} > {c.get('section', '')}" for c in chunks))
    return Answer(answer=response_text, model=get_model_name(), grounded=True, sources=sources)
