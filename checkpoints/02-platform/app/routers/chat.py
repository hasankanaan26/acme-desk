# ============================================================
# Router: /chat — a conversation, streamed as it is written
# ============================================================
#   GET    /chat/threads                 your conversations, newest first
#   POST   /chat/threads                 start one
#   GET    /chat/threads/{id}            its messages (hidden ones marked)
#   POST   /chat/threads/{id}/messages   ask; the reply streams back (SSE)
#   DELETE /chat/threads/{id}            forget it  (tonight's exercise)
#
# Who is asking: the session cookie, as everywhere (get_principal).
# Whose thread: chat_threads only shows a person their own, so someone
# else's thread id gets the same 404 as a made-up one.
#
# SERVER-SENT EVENTS: the reply is a stream of small text messages,
#   event: step    a node finished: identify, retrieve, answer, finalize
#   event: token   a few characters of the answer, as the model writes
#   event: done    the final answer, its sources, the outcome
#   event: error   something broke; the turn is over
# each written as "event: <name>\ndata: <json>\n\n". The browser reads
# them with fetch() and a stream reader (static/app.js).
# ============================================================

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage
from pydantic import BaseModel, Field

from app.assistant import memory, threads, workflow
from app.assistant.nodes import HIDDEN, cited_docs, unreadable_docs
from app.assistant.state import DeskContext
from app.auth.deps import client_ip, csrf_guard, get_principal
from app.auth.service import Principal

logger = logging.getLogger("acme.chat")
router = APIRouter(prefix="/chat", tags=["Chat"], dependencies=[Depends(csrf_guard)])


class ChatMessage(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


def _thread_or_404(principal: Principal, thread_id: uuid.UUID) -> dict:
    thread = threads.get(principal, thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="No such conversation.")
    return thread


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


@router.get("/threads")
def list_threads(principal: Principal = Depends(get_principal)):
    """Your conversations, newest first. Nobody else's: not even an admin's view."""
    return threads.mine(principal)


@router.post("/threads", status_code=201)
def start_thread(principal: Principal = Depends(get_principal)):
    return threads.create(principal)


@router.get("/threads/{thread_id}")
def read_thread(thread_id: uuid.UUID, principal: Principal = Depends(get_principal)):
    """The conversation so far. An answer built on a document you can no longer read is hidden."""
    thread = _thread_or_404(principal, thread_id)
    with memory.checkpointer(principal) as saver:
        state = workflow.compile(saver).get_state(_config(thread["id"])).values
    messages = state.get("messages", [])
    gone = set(unreadable_docs(messages, principal))
    out = []
    for m in messages:
        if isinstance(m, HumanMessage):
            out.append({"role": "user", "text": str(m.content)})
        elif isinstance(m, AIMessage):
            meta = m.additional_kwargs.get("acme") or {}
            hidden = bool(gone & set(cited_docs(m)))
            out.append({"role": "assistant", "text": HIDDEN if hidden else str(m.content), "hidden": hidden,
                        "outcome": meta.get("outcome"), "confidence": meta.get("confidence"),
                        "sources": [] if hidden else meta.get("sources", [])})
    return {**thread, "messages": out}


# TODO (Lab exercise): "forget this conversation".
#   Delete the thread's checkpoints (PostgresSaver.delete_thread, inside
#   memory.checkpointer(principal)) and then its chat_threads row, and
#   write an audit row "chat.forget". Someone else's thread must still
#   get a 404, and nothing of it may be deleted.
#   The test is waiting in tests/test_chat.py: remove its skip mark.
@router.delete("/threads/{thread_id}", status_code=204)
def forget_thread(thread_id: uuid.UUID, principal: Principal = Depends(get_principal)):
    _thread_or_404(principal, thread_id)
    raise HTTPException(status_code=501, detail="Not built yet: tonight's exercise (app/routers/chat.py).")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


# Purpose:
# What each step tells the browser when it finishes: enough to draw
# the trace (identify, retrieve 5 chunks, answer, finalize), no text.
def _step(node: str, update: dict) -> dict:
    update = update or {}
    if node == "identify":
        return {"node": node, "user": update["user"]["email"], "groups": update["user"]["groups"]}
    if node == "retrieve":
        chunks = update.get("chunks", [])
        return {"node": node, "search_query": update.get("search_query"), "chunks": len(chunks),
                "documents": sorted({c.get("title") or c["doc_id"] for c in chunks}),
                "confidence": update.get("confidence"), "hidden_documents": len(update.get("unreadable_docs", []))}
    return {"node": node, "outcome": update.get("outcome")}


@router.post("/threads/{thread_id}/messages")
def ask(thread_id: uuid.UUID, body: ChatMessage, request: Request, principal: Principal = Depends(get_principal)):
    """Ask in this conversation. The reply streams back as Server-Sent Events."""
    thread = _thread_or_404(principal, thread_id)          # checked BEFORE the stream starts: a real 404
    request_id = uuid.uuid4().hex[:8]
    context = DeskContext(principal=principal, thread_id=thread["id"], request_id=request_id, ip=client_ip(request))
    question = body.message.strip()

    def events():
        try:
            with memory.checkpointer(principal) as saver:
                graph = workflow.compile(saver)
                turn = {"question": question, "messages": [HumanMessage(question)]}
                for mode, chunk in graph.stream(turn, _config(thread["id"]), context=context,
                                                stream_mode=["updates", "messages"]):
                    if mode == "messages":
                        # the model's pieces as they arrive (chunks), from the answer
                        # node only; the finished message the node returns comes
                        # through here too, whole, and is skipped: "done" carries it
                        token, meta = chunk
                        if (isinstance(token, AIMessageChunk) and meta.get("langgraph_node") == "answer"
                                and token.content):
                            yield _sse("token", {"text": token.content})
                    else:
                        for node, update in chunk.items():
                            yield _sse("step", _step(node, update))
                state = graph.get_state(_config(thread["id"])).values
            final = state["messages"][-1]
            meta = final.additional_kwargs.get("acme") or {}
            logger.info("chat %s | %s | %s | %s", request_id, principal.email, meta.get("outcome"), meta.get("doc_ids"))
            yield _sse("done", {"thread_id": thread["id"], "request_id": request_id, "answer": str(final.content),
                                "outcome": meta.get("outcome"), "confidence": meta.get("confidence"),
                                "search_query": state.get("search_query"), "sources": meta.get("sources", [])})
        except Exception as exc:  # noqa: BLE001 - the stream has started: report it in-band
            logger.exception("chat %s | failed", request_id)
            yield _sse("error", {"request_id": request_id, "message": f"{type(exc).__name__}: the turn failed"})

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
