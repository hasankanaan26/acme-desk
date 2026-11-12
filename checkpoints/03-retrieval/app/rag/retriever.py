# ============================================================
# Retriever — Part 2: who is asking comes from the session
# ============================================================
# Part 1 took ?user=intern from the request and looked the groups up
# in identities.json, so anyone could claim to be anyone. Part 2 takes
# the group ids of the SIGNED-IN user (app/auth/), resolved from the
# session cookie on the server. Nothing in a request body or query
# string can change them.
#
# The filter still runs INSIDE the search (store.search):
#
#   who:  the document has an ACL row for one of the user's groups
#   when: status = current, or in force on the as_of date
#   which tenant: Row-Level Security, from the same session
#
# Two tempting shortcuts that are both wrong:
#   - filter AFTER the search: forbidden chunks take the top-k slots,
#     so the user gets fewer (or zero) allowed results, and the
#     forbidden text has already left the database.
#   - tell the LLM "don't reveal salaries": the text is in its
#     context window. A prompt is not an access control.
#
# With the chat block, the search can rank by meaning, by words, or
# both (RETRIEVAL_STRATEGY, default hybrid). Both searches run inside
# the same filter, so fusing them can never let a forbidden chunk in.
#
# Part 3 adds the second cut of the documents (small chunks, written by
# the sync next to the sections) and two strategies that read it:
#   small    the small chunks themselves: precise, little context
#   parent   the small chunks pick the sections: match small, return big
# scoreboard.py measures which strategy wins which kind of question.
# ============================================================

from datetime import date

from app.config import (
    CONFIDENCE_HIGH_THRESHOLD,
    CONFIDENCE_LOW_THRESHOLD,
    HYBRID_CANDIDATES,
    NO_RESULT_DISTANCE,
    RETRIEVAL_STRATEGIES,
    RETRIEVAL_STRATEGY,
    RRF_K,
)
from app.ingest.register import date_int
from app.llm import cached_call_llm
from app.prompts.query_rewrite import HYDE_PROMPT, MULTI_QUERY_PROMPT
from app.rag import reranker, router
from app.rag.classifier import classify_question
from app.rag.embedder import embed_text, embed_texts
from app.rag.store import Access, by_ids, count, keyword_search, records, search


# Purpose:
# Build the filter for one request from the signed-in user's groups.
# No groups -> an empty filter -> no results. Fail closed.
def access_filter(group_ids, as_of: str | None = None, doc_type: str | None = None) -> Access:
    return Access(group_ids=tuple(str(g) for g in group_ids),
                  as_of=date_int(as_of) if as_of else None, doc_type=doc_type)


def check_date(as_of: str | None) -> str | None:
    """Accept YYYY-MM-DD or nothing."""
    if as_of:
        date.fromisoformat(as_of)
    return as_of


# Purpose:
# Embed the question and search, inside the user's filter.
def retrieve(query: str, group_ids, top_k: int = 3, as_of: str | None = None,
             doc_type: str | None = None, strategy: str | None = None,
             trace: list[str] | None = None) -> list[dict]:
    if count() == 0:
        return []
    access = access_filter(group_ids, check_date(as_of), doc_type)
    return find(query, embed_text(query), top_k, access, strategy, trace)


# Purpose:
# One search, many ways to rank, the same access filter for all:
#   dense          by meaning (pgvector)
#   keyword        by words (Postgres full-text)
#   hybrid         both lists, fused by rank
#   rerank         dense top 20 -> cross-encoder -> top k
#   hybrid_rerank  hybrid top 20 -> cross-encoder -> top k
#   hyde           search with an LLM-written hypothetical answer
#   multi_query    the question + 3 LLM rewrites, each dense, fused
#   small          dense over the small chunks (Part 3)
#   parent         dense over the small chunks -> their sections (Part 3)
#   routed         a "who / list / how many ... in <office>" question
#                  -> every matching directory row; else hybrid_rerank
# The last five come from the RAG weeks' checkpoint 6 (the lab). Every
# first stage is search() or keyword_search(), so nothing a strategy
# returns ever got past the access filter; a reranker or a rewrite only
# re-orders or re-asks inside it.
#
# `trace`, if given, collects one line per step ("dense top 20 ->
# cross-encoder (412 ms) -> top 5"), for /search to show.
def find(query: str, embedding: list[float], top_k: int, access: Access, strategy: str | None = None,
         trace: list[str] | None = None) -> list[dict]:
    strategy = STRATEGY_ALIASES.get(strategy, strategy) if strategy else RETRIEVAL_STRATEGY
    if strategy not in RETRIEVAL_STRATEGIES:
        raise ValueError(f"strategy must be one of {', '.join(RETRIEVAL_STRATEGIES)}")
    steps = trace if trace is not None else []
    depth = max(top_k, HYBRID_CANDIDATES)

    if strategy == "dense":
        steps.append(f"dense top {top_k}")
        return _dense(embedding, top_k, access)
    if strategy == "keyword":
        steps.append(f"keyword (full-text) top {top_k}")
        return [{**c, "found_by": ["words"]} for c in keyword_search(query, embedding, top_k=top_k, access=access)]
    if strategy == "hybrid":
        steps.append(f"dense top {depth} + keyword top {depth} -> RRF -> top {top_k}")
        return _hybrid(query, embedding, depth, access)[:top_k]
    if strategy == "rerank":
        return _rerank(query, _dense(embedding, depth, access), top_k, f"dense top {depth}", steps)
    if strategy == "hybrid_rerank":
        return _rerank(query, _hybrid(query, embedding, depth, access), top_k, f"hybrid top {depth}", steps)
    if strategy == "small":
        steps.append(f"small chunks: dense top {top_k}")
        return _dense(embedding, top_k, access, level="small")
    if strategy == "parent":
        return _parent(embedding, top_k, depth, access, steps)
    if strategy == "hyde":
        return _hyde(query, embedding, top_k, access, steps)
    if strategy == "multi_query":
        return _multi_query(query, embedding, top_k, depth, access, steps)
    return _routed(query, embedding, top_k, depth, access, steps)


STRATEGY_ALIASES = {"bm25": "keyword"}  # the lab's name for keyword search


def _dense(embedding: list[float], k: int, access: Access, level: str = "sections") -> list[dict]:
    return [{**c, "found_by": ["meaning"]} for c in search(embedding, top_k=k, access=access, level=level)]


# Parent-document: search the small chunks (20 deep), keep the first
# k DISTINCT sections they point to, in the order their best small
# chunk ranked, and fetch those sections, through the access filter
# again (store.by_ids). Each section keeps the distance of its best
# small chunk, so the confidence label means "how close was the
# sentence that matched", and `matched` says which sentence it was.
def _parent(embedding: list[float], top_k: int, depth: int, access: Access, steps: list[str]) -> list[dict]:
    best: dict[str, dict] = {}
    for small in search(embedding, top_k=depth, access=access, level="small"):
        best.setdefault(small["parent_id"], small)
    wanted = list(best)[:top_k]
    sections = by_ids(wanted, access)
    steps.append(f"small chunks: dense top {depth} -> {len(best)} distinct section(s) -> top {top_k}")
    return [{**s, "distance": best[s["id"]]["distance"], "found_by": ["meaning"],
             "matched": best[s["id"]]["text"]} for s in sections]


def _hybrid(query: str, embedding: list[float], depth: int, access: Access) -> list[dict]:
    by_meaning = search(embedding, top_k=depth, access=access)
    by_words = keyword_search(query, embedding, top_k=depth, access=access)
    return fuse({"meaning": by_meaning, "words": by_words}, depth)


# Purpose:
# Re-order a first stage's candidates with the cross-encoder. If the
# model can't load (offline, first run without a download), keep the
# first stage's order and say so: a slower search, never a failed one.
def _rerank(query: str, candidates: list[dict], top_k: int, first: str, steps: list[str]) -> list[dict]:
    try:
        chunks, ms = reranker.rerank(query, candidates, top_k)
    except Exception as exc:  # noqa: BLE001
        steps.append(f"{first} -> reranker unavailable ({type(exc).__name__}): first-stage order -> top {top_k}")
        return candidates[:top_k]
    steps.append(f"{first} -> cross-encoder ({ms:.0f} ms) -> top {top_k}")
    return chunks


def _rewrite(prompt: str, steps: list[str]) -> str | None:
    """One cached LLM call; None (and a trace line) when there is no model."""
    try:
        return cached_call_llm(prompt)
    except Exception as exc:  # noqa: BLE001 - no key, quota, outage
        steps.append(f"model unavailable ({type(exc).__name__}): searched with the question as asked")
        return None


# HyDE: a question doesn't look like its answer, so search with an
# answer-shaped passage the model wrote. Distances are to that passage,
# not to the question, so a confidence label reads a little high.
def _hyde(query: str, embedding: list[float], top_k: int, access: Access, steps: list[str]) -> list[dict]:
    hypothetical = _rewrite(HYDE_PROMPT.format(question=query), steps)
    if not hypothetical:
        steps.append(f"dense top {top_k}")
        return _dense(embedding, top_k, access)
    steps += [f"LLM wrote: {hypothetical[:90]}...", f"dense top {top_k} on the hypothetical answer"]
    return _dense(embed_text(hypothetical), top_k, access)


# Multi-query: one phrasing is one shot. The question plus three
# rewrites, each searched by meaning, the rankings fused. The question
# goes first, so a chunk it found keeps its distance to the question.
def _multi_query(query: str, embedding: list[float], top_k: int, depth: int, access: Access,
                 steps: list[str]) -> list[dict]:
    reply = _rewrite(MULTI_QUERY_PROMPT.format(question=query), steps)
    rewrites = [q.strip(" -•\t") for q in (reply or "").splitlines() if q.strip()][:3]
    vectors = [embedding] + (embed_texts(rewrites) if rewrites else [])
    ranked = {f"q{n}": search(v, top_k=depth, access=access) for n, v in enumerate(vectors)}
    steps += [f"queries: {[query] + rewrites}", f"{len(vectors)} x dense top {depth} -> RRF -> top {top_k}"]
    return [{**c, "found_by": ["meaning"]} for c in fuse(ranked, top_k)]


# Routed: top k is a budget, and "who works remotely?" has as many right
# answers as the directory has remote rows. Aggregation questions get a
# lookup over EVERY directory row this user may read; the rest go to
# hybrid_rerank. Someone who may not read the directory gets no rows.
def _routed(query: str, embedding: list[float], top_k: int, depth: int, access: Access,
            steps: list[str]) -> list[dict]:
    rows = records(embedding, "people", access) if access.doc_type in (None, "people") else []
    shape, wanted = router.classify(query, rows) if rows else ("pointwise", {})
    if shape == "aggregation":
        hits = [{**c, "found_by": ["records"]} for c in router.lookup(rows, wanted)]
        steps.append(f"route: aggregation on {wanted} -> {len(hits)} matching record(s), all of them")
        return hits
    steps.append("route: pointwise")
    return _rerank(query, _hybrid(query, embedding, depth, access), top_k, f"hybrid top {depth}", steps)


# Purpose:
# Reciprocal Rank Fusion: merge ranked lists without comparing their
# scores. A vector distance and a text rank are on different scales;
# a rank is a rank. Each list gives a chunk 1 / (RRF_K + its rank), the
# scores add up, and a chunk both lists agree on rises to the top.
def fuse(ranked: dict[str, list[dict]], top_k: int) -> list[dict]:
    scores: dict[str, float] = {}
    chunks: dict[str, dict] = {}
    for name, results in ranked.items():
        for rank, chunk in enumerate(results, start=1):
            scores[chunk["id"]] = scores.get(chunk["id"], 0.0) + 1.0 / (RRF_K + rank)
            chunks.setdefault(chunk["id"], {**chunk, "found_by": []})["found_by"].append(name)
    best = sorted(chunks.values(), key=lambda c: (-scores[c["id"]], c["distance"]))
    return [{**c, "rrf": round(scores[c["id"]], 5)} for c in best[:top_k]]


def choose_doc_type(query: str, filter_mode: str) -> dict:
    """Resolve the filter mode into a doc type to search (Checkpoint 4)."""
    if filter_mode == "off":
        return {"doc_type": None, "picked_by": None, "raw_reply": None}
    if filter_mode == "auto":
        try:
            classified = classify_question(query)
        except Exception as exc:  # noqa: BLE001 - no model: search everything, as filter "off" would
            return {"doc_type": None, "picked_by": None, "raw_reply": f"(model unavailable: {type(exc).__name__})"}
        return {"doc_type": classified["doc_type"], "picked_by": "llm", "raw_reply": classified["raw_reply"]}
    return {"doc_type": filter_mode, "picked_by": "manual", "raw_reply": None}


# Purpose:
# Checkpoint 4's doc-type routing, now inside the user's filter.
def retrieve_with_doc_filter(
    query: str,
    group_ids,
    top_k: int = 3,
    filter_mode: str = "auto",
    no_result_threshold: float | None = None,
    as_of: str | None = None,
    strategy: str | None = None,
) -> dict:
    result = {
        "chunks": [],
        "trace": [],
        "doc_type": None,
        "picked_by": None,
        "classifier_reply": None,
        "fallback_used": False,
        "filtered_best_distance": None,
    }
    if count() == 0:
        return result

    as_of = check_date(as_of)
    choice = choose_doc_type(query, filter_mode)
    doc_type = choice["doc_type"]
    result.update(doc_type=doc_type, picked_by=choice["picked_by"], classifier_reply=choice["raw_reply"])

    query_embedding = embed_text(query)
    if doc_type is None:
        result["chunks"] = find(query, query_embedding, top_k, access_filter(group_ids, as_of), strategy,
                                result["trace"])
        return result

    filtered = find(query, query_embedding, top_k, access_filter(group_ids, as_of, doc_type), strategy,
                    result["trace"])
    if filtered:
        result["filtered_best_distance"] = min(c["distance"] for c in filtered)
    if is_no_result(filtered, no_result_threshold=no_result_threshold):
        result["trace"].append(f"nothing close enough in {doc_type}: searched every type")
        result["chunks"] = find(query, query_embedding, top_k, access_filter(group_ids, as_of), strategy,
                                result["trace"])
        result["fallback_used"] = True
    else:
        result["chunks"] = filtered
    return result


def score_confidence(chunks: list[dict], high_threshold: float | None = None,
                     low_threshold: float | None = None) -> str:
    """Checkpoint 4: classify the best (lowest) distance."""
    if not chunks:
        return "none"
    high = high_threshold if high_threshold is not None else CONFIDENCE_HIGH_THRESHOLD
    low = low_threshold if low_threshold is not None else CONFIDENCE_LOW_THRESHOLD
    best = min(c["distance"] for c in chunks)
    if best <= high:
        return "high"
    if best <= low:
        return "medium"
    return "low"


def is_no_result(chunks: list[dict], no_result_threshold: float | None = None) -> bool:
    """Checkpoint 4: nothing came back, or even the best chunk is too far."""
    if not chunks:
        return True
    threshold = no_result_threshold if no_result_threshold is not None else NO_RESULT_DISTANCE
    return min(c["distance"] for c in chunks) > threshold
