# ============================================================
# Explain one document's change: eTag vs content hash
# ============================================================
# The sync keeps two fingerprints per document. They answer two
# different questions:
#
#   eTag          "Did the FILE change?"
#                 Any byte counts: a footer, a timestamp, a re-save.
#                 Free: the source hands it out with the file listing.
#
#   content hash  "Did the TEXT WE EMBED change?"
#                 Computed after parsing, PII redaction and chunking.
#                 Costs a download and a parse.
#
# So the eTag is cheap but over-sensitive, and the hash is exact but
# costs work. The sync checks the eTag first (same eTag: stop, don't
# even download) and the hash next (same hash: don't re-embed).
#
# This module shows both for ONE document, with the diff behind each:
#   bytes  the file the index was built from vs the file now
#   text   the chunks in the index vs the chunks the sync would store now
#
# Teaching tool for the Sync tab. A real sync never needs the old
# bytes: it only compares fingerprints. Here we find the old file in
# the demo's seed folder by its eTag, so you can SEE what changed.
# ============================================================

import difflib
from pathlib import Path

from app.config import SECTION_MAX_CHARS, SEED_DIR
from app.ingest.connector import etag_of, make_connector
from app.ingest.parsers import parse
from app.ingest.register import load_register
from app.ingest.sync import build_plan, content_hash, redact_sections
from app.rag import catalog, store
from app.rag.chunker import chunk_sections

# Formats whose bytes are readable text, so a byte diff means something.
TEXT_SUFFIXES = {".md", ".html", ".csv", ".eml", ".txt"}


# Purpose:
# Find the file the index was built from: the seed file whose eTag
# matches the one stored on the chunks. None if no seed file matches.
def _indexed_bytes(path: str, etag: str | None) -> bytes | None:
    if not etag:
        return None
    candidates = [SEED_DIR / "sites" / path, *sorted((SEED_DIR / "events" / "files").glob("*"))]
    for candidate in candidates:
        if candidate.is_file() and etag_of(candidate.read_bytes()) == etag:
            return candidate.read_bytes()
    return None


# Purpose:
# Changed lines with two lines of context around each change.
# Returns [{"op": "+" | "-" | " " | "@", "text": "..."}]; "@" marks a gap.
def line_diff(old: str, new: str) -> list[dict]:
    lines = list(difflib.unified_diff(old.splitlines(), new.splitlines(), lineterm="", n=2))[2:]
    return [{"op": "@", "text": "…"} if line.startswith("@@") else {"op": line[:1], "text": line[1:]}
            for line in lines]


def _decode(data: bytes | None) -> str:
    return data.decode("utf-8", errors="replace") if data is not None else ""


# Purpose:
# The chunks the sync WOULD store for this file now, and their hash.
# The sync itself skips this when the eTag matches; we always do it,
# so you can see the hash would have matched too.
def _chunks_now(entry, data: bytes) -> tuple[list[str], str | None]:
    parsed = parse(entry.path, data)
    if parsed.needs_ocr or not parsed.sections:
        return [], None
    sections, _ = redact_sections(parsed.sections)
    pieces = chunk_sections(sections, entry.title, SECTION_MAX_CHARS)
    return [p["text"] for p in pieces], content_hash(pieces)


def _chunks_in_index(path: str, collection: str | None) -> list[str]:
    if not collection or not store.collection_exists(collection):
        return []
    chunks = store.get_all_chunks(source=path, limit=500, collection=collection)
    return [c["text"] for c in sorted(chunks, key=lambda c: c["chunk_index"])]


# Purpose:
# Everything the Sync tab needs to show one document's eTag and
# content hash side by side, with the diff behind each.
def explain_doc(doc_id: str) -> dict:
    connector = make_connector()
    collection = catalog.active_name()
    if collection and not store.collection_exists(collection):
        collection = None
    plan = build_plan(connector, collection)
    decision = next((d for d in plan.docs if d.doc_id == doc_id), None)
    if decision is None:
        raise KeyError(doc_id)

    path = decision.path
    entry = next((e for e in load_register(connector.fetch_register()).values() if e.doc_id == doc_id), None)
    in_index = store.index_state(collection).get(doc_id, {}) if collection else {}
    file_now = connector.fetch(path) if path in {item.path for item in connector.list_items()} else None
    file_then = _indexed_bytes(path, in_index.get("etag"))

    texts_now, hash_now = _chunks_now(entry, file_now) if (entry and file_now is not None) else ([], None)
    texts_then = _chunks_in_index(path, collection)
    is_text = Path(path).suffix.lower() in TEXT_SUFFIXES

    if not is_text:
        bytes_note = "Binary file: the eTag still changes with every byte, but there is nothing readable to diff."
    elif in_index.get("etag") and file_then is None:
        bytes_note = "The indexed version is not in the demo's seed files, so there is nothing to diff against."
    else:
        bytes_note = ""

    return {
        "doc_id": doc_id,
        "path": path,
        "action": decision.action,
        "reason": decision.reason,
        "etag": {"index": in_index.get("etag"), "source": etag_of(file_now) if file_now is not None else None},
        "hash": {"index": in_index.get("content_hash"), "source": hash_now,
                 # The sync only parses when the eTag differs.
                 "computed_by_sync": decision.signals.get("hash_source") is not None},
        "bytes": {
            "size_index": len(file_then) if file_then is not None else None,
            "size_source": len(file_now) if file_now is not None else None,
            "diff": line_diff(_decode(file_then), _decode(file_now)) if (is_text and not bytes_note) else [],
            "note": bytes_note,
        },
        "text": {
            "chunks_index": len(texts_then),
            "chunks_source": len(texts_now),
            "diff": line_diff("\n\n".join(texts_then), "\n\n".join(texts_now)),
        },
    }
