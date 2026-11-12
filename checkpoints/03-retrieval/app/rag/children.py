# ============================================================
# Small chunks — the second cut of every document (Part 3)
# ============================================================
# Lifted from the RAG weeks' checkpoint 6 (app/rag/children.py), with
# one change that matters: the lab built these at QUERY time from the
# live index; here the SYNC builds them, in the same transaction that
# writes the sections (app/ingest/sync.py, 006_small_chunks.sql).
#
# Parent-document retrieval: "match small, return big".
#
#   A small chunk matches a question precisely: its vector is about
#   one or two sentences, not an average of a whole section where one
#   line about billing reviews is drowned by four about deployments.
#   But a small chunk carries little context: "Each shift lasts one
#   week" does not say it is about on-call.
#
#   A section carries context, but its vector is an average.
#
# So we store both. Each section becomes sentence-sized pieces (up to
# CHILD_MAX_CHARS), each embedded on its own, each remembering its
# section (parent_id). Two strategies read them (app/rag/retriever.py):
#   small    the small chunks themselves
#   parent   the small chunks find the sections; the model gets those
#
# A small chunk starts with "<document title>: ", the cheapest context
# there is (Wednesday's "contextual retrieval" slide). It does NOT get
# the section heading: that is the difference between the two cuts,
# and the scoreboard shows what it costs.
# ============================================================

import re

SENTENCE_RE = re.compile(r"(?<=[.!?])\s+|\n+")


# Purpose:
# Split a section's text into pieces of whole sentences (or lines),
# each at most max_chars, unless one sentence alone is longer.
def split_sentences(text: str, max_chars: int) -> list[str]:
    pieces, current = [], ""
    for part in (p.strip(" -") for p in SENTENCE_RE.split(text)):
        if not part:
            continue
        if current and len(current) + 1 + len(part) > max_chars:
            pieces.append(current)
            current = part
        else:
            current = f"{current} {part}".strip()
    if current:
        pieces.append(current)
    return pieces


# Purpose:
# The small chunks of one document, from its section chunks (the dicts
# the sync builds: {"id", "text", "metadata"}). Each small chunk carries
# its section's labels, plus parent_id, so the access filter, the dates
# and a relabel treat it exactly like its section.
def small_chunks(sections: list[dict], title: str, max_chars: int) -> list[dict]:
    small = []
    for section in sections:
        header, _, body = section["text"].partition("\n")
        for n, sentence in enumerate(split_sentences(body or header, max_chars)):
            small.append({
                "id": f"{section['id']}#{n:02d}",
                "text": f"{title}: {sentence}",
                "metadata": {**section["metadata"], "parent_id": section["id"], "piece": n},
            })
    return small


def body_of(chunk: dict) -> str:
    """The document text in a chunk, without the header a section or a small chunk starts with."""
    text = chunk.get("text", "")
    if chunk.get("parent_id"):
        prefix = f"{chunk.get('title', '')}: "
        return text[len(prefix):] if text.startswith(prefix) else text
    return text.split("\n", 1)[-1]
