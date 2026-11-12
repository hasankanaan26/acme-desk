# ============================================================
# The chat's state, and what each turn is given from outside
# ============================================================
# DeskState is what the graph remembers. LangGraph saves it after
# every step (app/assistant/memory.py), so `messages` IS the
# conversation: load the thread and it is all there.
#
# DeskContext is what each turn is GIVEN and never saved: who is
# asking. The API builds it from the session cookie on every request
# and hands it to the graph next to the state. It is not in the state
# on purpose:
#   - nothing the browser sends can put an identity into the graph
#   - a saved conversation cannot carry yesterday's groups into
#     today's question: the Principal is re-read on every request
# ============================================================

from dataclasses import dataclass
from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

from app.auth.service import Principal


class DeskState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]  # the conversation; add_messages appends
    question: str                # this turn's question, as typed
    user: dict                   # who asked this turn (identify): for the trace and the prompt
    search_query: str            # the question as the search sees it (follow-ups rewritten)
    chunks: list[dict]           # what the search found this turn, inside this person's access
    confidence: str              # high | medium | low | none
    unreadable_docs: list[str]   # documents earlier answers used that this person can no longer read
    outcome: str                 # answered | no_result | model_unavailable


@dataclass(frozen=True)
class DeskContext:
    principal: Principal          # from the session cookie, re-read on every request
    thread_id: str
    request_id: str
    ip: str | None = None
