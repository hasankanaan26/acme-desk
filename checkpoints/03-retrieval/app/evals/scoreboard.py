# ============================================================
# Scoreboard metrics — which technique wins which kind of question
# ============================================================
# Part 2's judge asked "is the right DOCUMENT in the top 5?". That is
# too kind for comparing techniques: a small chunk from the right
# document that holds two of the six steps "hits", and a section that
# holds all six "hits" too. So Part 3 asks what the model needs:
#
#   need     one document + the words the answer cannot do without
#            ({"doc": "ENG-HANDBOOK", "evidence": ["two reviewers"]}).
#            A chunk MEETS a need when it comes from that document and
#            holds every one of those words (case, spaces and
#            punctuation ignored).
#   ready@n  the position at which the results so far meet EVERY
#            need of the question (a two-document question has two).
#
#   Hit@1    ready at 1: the first result alone is enough
#   Hit@5    ready within the top 5
#   MRR      1 / ready position (1.0, 0.5, 0.33 ... 0 when never)
#   doc@5    the right document is somewhere in the top 5, whether or
#            not the words are: Part 2's Hit@5. doc@5 high and Hit@5
#            low means "found the document, handed over the wrong piece"
#
# A question the documents cannot answer has no needs. Retrieval can't
# "hit" it; what it can do is not look sure of itself:
#   calm     the best result is NOT high confidence (distance above
#            CONFIDENCE_HIGH_THRESHOLD), so the answer step is warned.
#            HyDE searches with a made-up answer, and a made-up answer
#            looks very like a real document: watch its calm column.
#
# Cost and safety, per question:
#   LLM      model calls the technique made before the search
#   ms       wall time of the search (a cached LLM call counts its
#            original time, so the cache can't make HyDE look free)
#   leaks    questions where ANY result is from a document this person
#            may not read (app/evals/judge.py). It must be 0 for every
#            technique: better search never means more access.
#
# No LLM is needed to score. The evidence words were written by hand
# from the documents, and tests/test_scoreboard.py checks every one of
# them is really in its document, so the set can't quietly rot.
# ============================================================

import re
import statistics

from app.config import CONFIDENCE_HIGH_THRESHOLD

SCENARIOS = ["casual", "identifier", "buried", "whole-section", "lost-context", "two-docs", "unanswerable"]

ABOUT = {
    "casual": "everyday words, not the document's words",
    "identifier": "an exact id, code or name",
    "buried": "one sentence inside a section about something else",
    "whole-section": "the answer is a whole list or section",
    "lost-context": "the words that place the answer are in the heading, not next to it",
    "two-docs": "the answer needs two documents",
    "unanswerable": "nothing this person may read answers it",
}


def words(text: str) -> str:
    """Lower case, letters, digits, $ and % only: '$1,500 one-time' -> '$1 500 one time'."""
    return " ".join(re.findall(r"[a-z0-9$%]+", text.lower()))


def need_docs(need: dict) -> list[str]:
    """A need names one document, or a list of documents that are each good enough."""
    return need["doc"] if isinstance(need["doc"], list) else [need["doc"]]


def meets(chunk: dict, need: dict) -> bool:
    if chunk.get("doc_id") not in need_docs(need):
        return False
    have = f" {words(chunk.get('text', ''))} "
    return all(f" {words(e)} " in have for e in need["evidence"])


# Purpose:
# Score one question's results. `chunks` in rank order.
def score(question: dict, chunks: list[dict], k: int = 5) -> dict:
    needs = question.get("needs", [])
    top = chunks[:k]
    docs = [c.get("doc_id") for c in top]
    if not needs:
        best = min((c["distance"] for c in chunks), default=None)
        return {"answerable": False, "ready": None, "hit@1": None, "hit@5": None, "rr": None, "doc@5": None,
                "calm": best is None or best > CONFIDENCE_HIGH_THRESHOLD, "best_distance": best, "docs": docs}
    ranks = []
    for need in needs:
        rank = next((i + 1 for i, c in enumerate(top) if meets(c, need)), None)
        ranks.append(rank)
    ready = max(ranks) if all(ranks) else None
    found_docs = all(any(d in docs for d in need_docs(n)) for n in needs)
    return {"answerable": True, "ready": ready, "hit@1": ready == 1, "hit@5": ready is not None,
            "rr": 1 / ready if ready else 0.0, "doc@5": found_docs, "calm": None,
            "best_distance": min((c["distance"] for c in chunks), default=None), "docs": docs}


def _mean(values) -> float | None:
    values = [float(v) for v in values if v is not None]
    return round(sum(values) / len(values), 2) if values else None


# Purpose:
# One row of a scenario table: a technique's numbers on that scenario.
def summarize(rows: list[dict]) -> dict:
    return {
        "questions": len(rows),
        "hit@1": _mean(r["hit@1"] for r in rows),
        "hit@5": _mean(r["hit@5"] for r in rows),
        "mrr": _mean(r["rr"] for r in rows),
        "doc@5": _mean(r["doc@5"] for r in rows),
        "calm": _mean(r["calm"] for r in rows),
        "llm": _mean(r["llm_calls"] for r in rows),
        "ms": round(statistics.median(r["ms"] for r in rows), 0) if rows else None,
        "leaks": sum(1 for r in rows if "leak" in r["flags"]),
    }


# Purpose:
# Which technique wins a scenario. Quality first (Hit@1, then MRR, or
# calm for the unanswerable ones), then cost: fewer LLM calls, then
# faster. A leak disqualifies: a technique that leaks wins nothing.
def winner(table: dict[str, dict]) -> str | None:
    def key(item):
        name, s = item
        quality = (s["calm"] or 0, 0) if s["hit@1"] is None else (s["hit@1"] or 0, s["mrr"] or 0)
        return (-quality[0], -quality[1], s["llm"] or 0, s["ms"] or 0, name)
    clean = [(n, s) for n, s in table.items() if s["leaks"] == 0]
    return min(clean, key=key)[0] if clean else None


# TODO (Lab exercise): the price nobody prints. `parent` hands the model
# whole sections, `small` hands it sentences. Write context_tokens():
# about how many tokens the results put in front of the model (a token
# is about 4 characters of text). Then add a "tokens" column to
# summarize() (the median per question) and to scoreboard.py's table.
# The test is waiting in tests/test_scoreboard.py: remove its skip line.
def context_tokens(chunks: list[dict]) -> int:
    raise NotImplementedError("Lab exercise: count the context the model would read")
