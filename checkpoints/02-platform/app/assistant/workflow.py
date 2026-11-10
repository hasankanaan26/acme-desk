# ============================================================
# The chat as a LangGraph workflow
# ============================================================
#
#   START -> identify -> retrieve --(found something)--> answer -> finalize -> END
#                                 \--(nothing found)----------> finalize
#
# A WORKFLOW, not an agent: our code decides every step and the one
# branch. The model is called in exactly one place (answer), plus once
# to rewrite a follow-up. Part 3 adds tools and lets a model choose;
# this graph is what it will be measured against.
#
# Why a graph for four steps in a row? Two things come with it:
#   - a checkpointer: the state is saved after every step, per thread,
#     in Postgres (memory.py). That is the conversation's memory.
#   - streaming: graph.stream() reports each step as it finishes and
#     the model's tokens as they arrive (routers/chat.py).
# ============================================================

from langgraph.graph import END, START, StateGraph

from app.assistant import nodes
from app.assistant.state import DeskContext, DeskState


def build() -> StateGraph:
    graph = StateGraph(DeskState, context_schema=DeskContext)
    graph.add_node("identify", nodes.identify)
    graph.add_node("retrieve", nodes.retrieve)
    graph.add_node("answer", nodes.answer)
    graph.add_node("finalize", nodes.finalize)
    graph.add_edge(START, "identify")
    graph.add_edge("identify", "retrieve")
    graph.add_conditional_edges("retrieve", nodes.after_retrieve, ["answer", "finalize"])
    graph.add_edge("answer", "finalize")
    graph.add_edge("finalize", END)
    return graph


def compile(checkpointer):
    """The runnable graph, saving into this checkpointer (one per request: it acts as one person)."""
    return build().compile(checkpointer=checkpointer)
