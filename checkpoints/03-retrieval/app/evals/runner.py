# ============================================================
# Runner — one question, one technique, as one real person
# ============================================================
# scoreboard.py and answers.py both ask questions the way the API
# does: as the person's own account (their tenant and groups, read from
# Postgres), with the API's role (acme_app), through retrieve(). So a
# technique is measured inside the same access filter it runs in for
# real, and a leak would show up here before it showed up in class.
# ============================================================

import time
from dataclasses import dataclass, field

from app import db
from app.db.impersonate import Person, as_person
from app.llm import STATS
from app.rag.retriever import retrieve

LLM_STRATEGIES = {"hyde", "multi_query"}   # one model call before every search


@dataclass
class Run:
    chunks: list[dict]
    trace: list[str] = field(default_factory=list)
    llm_calls: int = 0
    ms: float = 0.0


class People:
    """as_person() once per persona, not once per question (each call writes an audit row)."""

    def __init__(self, tool: str):
        self.tool, self.known = tool, {}

    def __call__(self, who: str) -> Person:
        if who not in self.known:
            self.known[who] = as_person(who, self.tool)
        return self.known[who]


# Purpose:
# Search once and say what it cost: the time, and how many model calls
# the technique made (a cached call counts, with its original time:
# the cache saves money on re-runs, it doesn't change the technique).
def ask(person: Person, question: str, strategy: str, top_k: int = 5, as_of: str | None = None) -> Run:
    trace: list[str] = []
    calls_before = STATS["calls"] + STATS["cache_hits"]
    replayed_before = STATS["replayed_ms"]
    start = time.perf_counter()
    with db.tx("app", person.tenant_id, person.user_id):
        chunks = retrieve(question, person.group_ids, top_k=top_k, as_of=as_of, strategy=strategy, trace=trace)
    ms = (time.perf_counter() - start) * 1000 + (STATS["replayed_ms"] - replayed_before)
    return Run(chunks, trace, STATS["calls"] + STATS["cache_hits"] - calls_before, ms)
