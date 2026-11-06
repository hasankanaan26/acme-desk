# ============================================================
# Naive ingest — Checkpoint 4's POST /ingest, kept for comparison
# ============================================================
# This is Checkpoint 4's code, copied as faithfully as possible, so we
# can run it against the same SharePoint and MEASURE what it gets
# wrong (evaluate.py). Do not use it for anything else.
#
# Faithful to Checkpoint 4:
#   - only .md .txt .csv .pdf .json; everything else silently skipped
#   - the whole file flattened to one string (no sections, no titles)
#   - fixed 500-character chunks with 50 characters of overlap
#   - ids "<filename>_<n>", upserted: re-running overwrites 0..n but
#     never deletes anything
#   - no register: no permissions, no status, no dates
#
# Three differences, all so the evaluation can run:
#   - it walks sub-folders (Checkpoint 4 read one flat folder)
#   - it also stores the relative path, so evaluate.py can look the
#     chunk up in the register and check what it SHOULD have been
#   - an empty chunk is embedded as " " (Azure rejects ""; with Azure,
#     Checkpoint 4's own /ingest would fail on the scan)
# ============================================================

import csv
import io
import json

from app.config import DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE, NAIVE_COLLECTION, SOURCE_DIR
from app.ingest.connector import LocalFolderConnector
from app.rag import store
from app.rag.chunker import chunk_document
from app.rag.embedder import embed_texts

SUPPORTED_EXTENSIONS = [".md", ".txt", ".csv", ".pdf", ".json"]


def _load_file(name: str, data: bytes) -> str:
    """Checkpoint 4's loader.py, for the formats it knew."""
    ext = name[name.rfind("."):].lower()
    if ext in (".md", ".txt"):
        return data.decode("utf-8")
    if ext == ".csv":
        reader = csv.DictReader(io.StringIO(data.decode("utf-8")))
        return "\n\n".join("\n".join(f"{c}: {v}" for c, v in row.items()) for row in reader)
    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join(p.extract_text().strip() for p in reader.pages if p.extract_text())
    if ext == ".json":
        return json.dumps(json.loads(data), indent=1)
    raise ValueError(ext)


def run_naive_ingest(connector: LocalFolderConnector | None = None) -> dict:
    connector = connector or LocalFolderConnector(SOURCE_DIR)
    chunks, skipped, empty = [], [], []
    for item in connector.list_items():
        name = item.path.rsplit("/", 1)[-1]
        if name[name.rfind("."):].lower() not in SUPPORTED_EXTENSIONS:
            skipped.append(item.path)
            continue
        text = _load_file(name, connector.fetch(item.path))
        if not text.strip():
            empty.append(item.path)
        for c in chunk_document(text=text, source=name, chunk_size=DEFAULT_CHUNK_SIZE, overlap=DEFAULT_CHUNK_OVERLAP):
            chunks.append({
                "id": f"{name}_{c['chunk_index']}",
                "text": c["text"],
                "metadata": {"source": name, "path": item.path, "chunk_index": c["chunk_index"],
                             "doc_type": "other", "doc_id": name},
            })
    # The empty chunk (the scan) is stored as "", as Checkpoint 4 did.
    # Azure rejects "" with a 400, so it is sent to the embedder as " ".
    vectors = embed_texts([c["text"] or " " for c in chunks])
    store.get_collection(NAIVE_COLLECTION)  # create if missing
    store.add_chunks(chunks, vectors, NAIVE_COLLECTION)
    return {
        "collection": NAIVE_COLLECTION,
        "chunks_upserted": len(chunks),
        "chunks_in_index": store.count(NAIVE_COLLECTION),
        "silently_skipped": skipped,
        "embedded_empty_text": empty,
    }
