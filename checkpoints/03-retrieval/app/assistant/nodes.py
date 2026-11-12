# ============================================================
# The chat's four steps — plain functions, read top to bottom
# ============================================================
#   identify  who is asking: from the session, never from the message
#   retrieve  rewrite a follow-up, search inside this person's access,
#             write the audit row
#   answer    the model writes the reply from the context it was given
#   finalize  "nothing found" when there was nothing; bookkeeping
#
# Each node takes the state (what the conversation remembers) and
# the runtime context (who is asking, this request only), and returns
# the part of the state it changes. LangGraph saves the state after
# every node.
#
# ACCESS IS LIVE, EVEN IN MEMORY. Every saved answer records which
# documents it used. On each turn, retrieve asks the database which of
# those this person may STILL read. An earlier answer built on a
# document they lost access to is hidden from the model's prompt, and
# from the conversation they see. A conversation is a copy too.
# ============================================================

import logging

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langgraph.runtime import Runtime

from app import db
from app.assistant import model, threads
from app.assistant.state import DeskContext, DeskState
from app.auth.service import Principal, audit
from app.config import CHAT_TOP_K, HISTORY_TURNS
from app.prompts.chat_answer import CHAT_SYSTEM_PROMPT
from app.prompts.standalone_question import STANDALONE_QUESTION_PROMPT
from app.rag.retriever import is_no_result, retrieve as search_documents, score_confidence
from app.routers.query import LLM_UNAVAILABLE_ANSWER, NO_RESULT_ANSWER, build_context, to_source

logger = logging.getLogger("acme.chat")

HIDDEN = "(An earlier answer is hidden here: it used a document you can no longer read.)"


# ---------- the four nodes ----------

def identify(state: DeskState, runtime: Runtime[DeskContext]) -> dict:
    p = runtime.context.principal
    return {"user": {"email": p.email, "name": p.display_name, "tenant": p.tenant_slug, "groups": p.group_names}}


def retrieve(state: DeskState, runtime: Runtime[DeskContext]) -> dict:
    ctx = runtime.context
    p = ctx.principal
    history = state["messages"][:-1]                     # everything before this turn's question
    unreadable = unreadable_docs(history, p)
    query = standalone_question(state["question"], visible_history(history, unreadable))
    with db.tx("app", p.tenant_id, p.user_id):
        chunks = search_documents(query, p.group_ids, top_k=CHAT_TOP_K)
        audit("chat", p.email, user_id=p.user_id, target=ctx.thread_id, ip=ctx.ip,
              detail={"doc_ids": sorted({c["doc_id"] for c in chunks}), "search_query": query,
                      "request_id": ctx.request_id})
    if is_no_result(chunks):
        chunks = []
    return {"search_query": query, "chunks": chunks, "confidence": score_confidence(chunks),
            "unreadable_docs": unreadable}


def after_retrieve(state: DeskState) -> str:
    """The one branch: nothing this person may read answers it -> skip the model."""
    return "answer" if state.get("chunks") else "finalize"


def answer(state: DeskState, runtime: Runtime[DeskContext]) -> dict:
    p = runtime.context.principal
    chunks = state["chunks"]
    history = visible_history(state["messages"][:-1], state.get("unreadable_docs", []))[-2 * HISTORY_TURNS:]
    prompt = [SystemMessage(CHAT_SYSTEM_PROMPT.format(name=p.display_name, context=build_context(chunks))),
              *history, HumanMessage(state["question"])]
    try:
        text, outcome = str(model.chat_model().invoke(prompt).content), "answered"
    except Exception as exc:  # noqa: BLE001 - no key, quota, outage: sources and a clear message, never a 500
        logger.warning("chat %s | model unavailable: %s: %s", runtime.context.request_id, type(exc).__name__, exc)
        text, outcome = LLM_UNAVAILABLE_ANSWER, "model_unavailable"
    return {"messages": [reply(text, chunks, outcome, state.get("confidence", "none"))], "outcome": outcome}


def finalize(state: DeskState, runtime: Runtime[DeskContext]) -> dict:
    ctx = runtime.context
    first_turn = sum(isinstance(m, HumanMessage) for m in state["messages"]) == 1
    threads.touch(ctx.principal, ctx.thread_id, state["question"] if first_turn else None)
    if not state.get("chunks"):
        return {"messages": [reply(NO_RESULT_ANSWER, [], "no_result", "none")], "outcome": "no_result"}
    return {}


# ---------- helpers ----------

# Purpose:
# The assistant's reply, with what it was built from. The sources ride
# along in the saved message, so a reopened thread shows them, and the
# doc ids are what makes "hide it if they lost access" possible.
def reply(text: str, chunks: list[dict], outcome: str, confidence: str) -> AIMessage:
    sources = [{**to_source(c).model_dump(), "found_by": c.get("found_by", [])} for c in chunks]
    return AIMessage(text, additional_kwargs={"acme": {
        "outcome": outcome, "confidence": confidence,
        "doc_ids": sorted({c["doc_id"] for c in chunks}), "sources": sources}})


def cited_docs(message: AnyMessage) -> list[str]:
    if not isinstance(message, AIMessage):
        return []
    return (message.additional_kwargs.get("acme") or {}).get("doc_ids", [])


# Purpose:
# Of the documents earlier answers used, which may this person NOT
# read any more? Asked of the database on every turn.
def unreadable_docs(messages: list[AnyMessage], principal: Principal) -> list[str]:
    cited = {d for m in messages for d in cited_docs(m)}
    if not cited:
        return []
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        readable = {r["doc_id"] for r in conn.execute(
            "SELECT DISTINCT doc_id FROM document_acl WHERE doc_id = ANY(%s) AND group_id = ANY(%s::uuid[])",
            (sorted(cited), principal.group_ids))}
    return sorted(cited - readable)


# Purpose:
# The conversation as the model may see it: plain question and answer
# messages (no metadata), with an answer that used a document this
# person can no longer read replaced by a short note.
def visible_history(messages: list[AnyMessage], unreadable: list[str]) -> list[AnyMessage]:
    gone = set(unreadable)
    out: list[AnyMessage] = []
    for m in messages:
        if isinstance(m, HumanMessage):
            out.append(HumanMessage(str(m.content)))
        elif isinstance(m, AIMessage):
            out.append(AIMessage(HIDDEN if gone & set(cited_docs(m)) else str(m.content)))
    return out


# Purpose:
# A follow-up ("and for managers?") means nothing to a search engine.
# With earlier turns, the model rewrites it into a standalone question.
# No model, or it fails: search with the question as typed.
def standalone_question(question: str, history: list[AnyMessage]) -> str:
    if not history:
        return question
    try:
        rewritten = model.chat_model(temperature=0).invoke(
            [SystemMessage(STANDALONE_QUESTION_PROMPT), *history[-4:], HumanMessage(question)]).content
    except Exception:  # noqa: BLE001
        return question
    rewritten = str(rewritten).strip()
    return rewritten[:500] if rewritten else question
