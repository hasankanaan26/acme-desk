# ============================================================
# Retriever — Checkpoint 5: who is asking, and as of when
# ============================================================
# Checkpoint 4 searched every chunk for every user. Checkpoint 5
# adds a WHERE clause to every search:
#
#   who:  only chunks the user's groups may read   (acl_<group>)
#   when: only documents in force                  (status = current)
#         or, with as_of, the ones in force on that date
#         (effective_from <= as_of < effective_to)
#
# The filter runs INSIDE the vector search. Two tempting shortcuts
# that are both wrong:
#   - filter AFTER the search: forbidden chunks take the top-k slots,
#     so the user gets fewer (or zero) allowed results, and the
#     forbidden text has already left the database.
#   - tell the LLM "don't reveal salaries": the text is in its
#     context window. A prompt is not an access control.
#
# Kept from Checkpoint 4: doc-type routing with a fallback,
# confidence scoring, and no-result detection.
# ============================================================

from datetime import date

from app.config import (
    CONFIDENCE_HIGH_THRESHOLD,
    CONFIDENCE_LOW_THRESHOLD,
    DEFAULT_USER,
    IDENTITIES_FILE,
    NO_RESULT_DISTANCE,
)
from app.ingest.register import date_int, groups_for, load_identities
from app.rag.classifier import classify_question
from app.rag.embedder import embed_text
from app.rag.store import count, search


# Purpose:
# Look the user up in the identity provider (here: identities.json).
def resolve_user(user: str | None) -> tuple[str, list[str]]:
    user = user or DEFAULT_USER
    return user, groups_for(user, load_identities(IDENTITIES_FILE))


# Purpose:
# Build the metadata filter for one request.
def access_filter(groups: list[str], as_of: str | None = None, doc_type: str | None = None) -> dict:
    who = [{f"acl_{g}": True} for g in groups]
    clauses = [who[0] if len(who) == 1 else {"$or": who}]
    if as_of:
        day = date_int(as_of)
        clauses.append({"effective_from": {"$lte": day}})
        clauses.append({"effective_to": {"$gt": day}})
    else:
        clauses.append({"status": "current"})
    if doc_type:
        clauses.append({"doc_type": doc_type})
    return {"$and": clauses}


def check_date(as_of: str | None) -> str | None:
    """Accept YYYY-MM-DD or nothing."""
    if as_of:
        date.fromisoformat(as_of)
    return as_of


# Purpose:
# Embed the question and search, inside the user's filter.
def retrieve(query: str, user: str | None = None, top_k: int = 3, as_of: str | None = None,
             doc_type: str | None = None) -> list[dict]:
    if count() == 0:
        return []
    _, groups = resolve_user(user)
    return search(embed_text(query), top_k=top_k, where=access_filter(groups, check_date(as_of), doc_type))


def choose_doc_type(query: str, filter_mode: str) -> dict:
    """Resolve the filter mode into a doc type to search (Checkpoint 4)."""
    if filter_mode == "off":
        return {"doc_type": None, "picked_by": None, "raw_reply": None}
    if filter_mode == "auto":
        classified = classify_question(query)
        return {"doc_type": classified["doc_type"], "picked_by": "llm", "raw_reply": classified["raw_reply"]}
    return {"doc_type": filter_mode, "picked_by": "manual", "raw_reply": None}


# Purpose:
# Checkpoint 4's doc-type routing, now inside the user's filter.
def retrieve_with_doc_filter(
    query: str,
    user: str | None = None,
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

    _, groups = resolve_user(user)
    as_of = check_date(as_of)
    choice = choose_doc_type(query, filter_mode)
    doc_type = choice["doc_type"]
    result.update(doc_type=doc_type, picked_by=choice["picked_by"], classifier_reply=choice["raw_reply"])

    query_embedding = embed_text(query)
    if doc_type is None:
        result["chunks"] = search(query_embedding, top_k=top_k, where=access_filter(groups, as_of))
        return result

    filtered = search(query_embedding, top_k=top_k, where=access_filter(groups, as_of, doc_type))
    if filtered:
        result["filtered_best_distance"] = min(c["distance"] for c in filtered)
    if is_no_result(filtered, no_result_threshold=no_result_threshold):
        result["chunks"] = search(query_embedding, top_k=top_k, where=access_filter(groups, as_of))
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
