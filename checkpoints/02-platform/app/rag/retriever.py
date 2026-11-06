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
# ============================================================

from datetime import date

from app.config import (
    CONFIDENCE_HIGH_THRESHOLD,
    CONFIDENCE_LOW_THRESHOLD,
    NO_RESULT_DISTANCE,
)
from app.ingest.register import date_int
from app.rag.classifier import classify_question
from app.rag.embedder import embed_text
from app.rag.store import Access, count, search


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
             doc_type: str | None = None) -> list[dict]:
    if count() == 0:
        return []
    return search(embed_text(query), top_k=top_k, access=access_filter(group_ids, check_date(as_of), doc_type))


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
) -> dict:
    result = {
        "chunks": [],
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
        result["chunks"] = search(query_embedding, top_k=top_k, access=access_filter(group_ids, as_of))
        return result

    filtered = search(query_embedding, top_k=top_k, access=access_filter(group_ids, as_of, doc_type))
    if filtered:
        result["filtered_best_distance"] = min(c["distance"] for c in filtered)
    if is_no_result(filtered, no_result_threshold=no_result_threshold):
        result["chunks"] = search(query_embedding, top_k=top_k, access=access_filter(group_ids, as_of))
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
