# ============================================================
# Vector Store (ChromaDB) — Checkpoint 5
# ============================================================
# Checkpoint 4 had ONE collection and two operations that matter:
# upsert and delete-everything. A sync job needs finer tools:
#
#   add_chunks(...)        store new chunks with ALL their metadata
#   delete_doc(doc_id)     remove every chunk of one document
#   update_doc_labels(...) change metadata (permissions, status) in
#                          place, without re-embedding a single word
#   index_state()          what the index holds, per document: the
#                          content hash, eTag and labels the sync job
#                          compares with the source
#   search(..., where=...) similarity search INSIDE a metadata filter
#
# Every function takes an optional collection name. None means the
# active one (see catalog.py).
#
# ACL FLAGS:
#   ChromaDB 0.6 metadata values are scalars, not lists, so a chunk
#   readable by ["hr", "managers"] stores acl_hr=True, acl_managers=True
#   and False for every other known group. The query filter is then
#   {"$or": [{"acl_engineering": True}, {"acl_employees": True}]}.
# ============================================================

import logging
import os

os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
logging.getLogger("chromadb.telemetry.product.posthog").setLevel(logging.CRITICAL)

import chromadb  # noqa: E402

from app.config import CHROMA_PATH  # noqa: E402
from app.rag import catalog  # noqa: E402

_client = None


def get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        from chromadb.config import Settings
        _client = chromadb.PersistentClient(path=str(CHROMA_PATH),
                                            settings=Settings(anonymized_telemetry=False))
    return _client


def get_collection(name: str | None = None):
    """Get (or create) a collection. None = the active collection."""
    name = name or catalog.active_name()
    if not name:
        raise RuntimeError("No index yet. Run: python sync.py --apply")
    return get_client().get_or_create_collection(
        name=name, metadata={"description": "Acme Desk knowledge base"}
    )


def collection_exists(name: str) -> bool:
    return name in [c if isinstance(c, str) else c.name for c in get_client().list_collections()]


def list_collections() -> list[str]:
    return sorted(c if isinstance(c, str) else c.name for c in get_client().list_collections())


def location() -> str:
    """Where the vectors are: the ChromaDB folder."""
    return str(CHROMA_PATH)


def drop_collection(name: str) -> None:
    try:
        get_client().delete_collection(name=name)
    except Exception:
        pass


# Purpose:
# Store chunks. Each chunk is {"id", "text", "metadata"}. IDs are
# "<doc_id>::<n>", so all chunks of a document can be found and deleted.
def add_chunks(chunks: list[dict], embeddings: list[list[float]], collection: str | None = None) -> int:
    if not chunks:
        return 0
    col = get_collection(collection)
    col.upsert(
        ids=[c["id"] for c in chunks],
        documents=[c["text"] for c in chunks],
        embeddings=embeddings,
        metadatas=[c["metadata"] for c in chunks],
    )
    return len(chunks)


def delete_doc(doc_id: str, collection: str | None = None) -> int:
    col = get_collection(collection)
    found = col.get(where={"doc_id": doc_id}, include=[])
    if found["ids"]:
        col.delete(ids=found["ids"])
    return len(found["ids"])


# Purpose:
# Change who may read a document, or its status, without touching the
# text or the vectors. Costs nothing, takes milliseconds.
def update_doc_labels(doc_id: str, labels: dict, collection: str | None = None) -> int:
    col = get_collection(collection)
    found = col.get(where={"doc_id": doc_id}, include=["metadatas"])
    if not found["ids"]:
        return 0
    metadatas = [{**meta, **labels} for meta in found["metadatas"]]
    col.update(ids=found["ids"], metadatas=metadatas)
    return len(found["ids"])


# Purpose:
# Summarize the index per document, for the sync job's diff.
def index_state(collection: str | None = None) -> dict[str, dict]:
    col = get_collection(collection)
    data = col.get(include=["metadatas"])
    state: dict[str, dict] = {}
    for meta in data["metadatas"]:
        doc = state.setdefault(meta["doc_id"], {**meta, "chunks": 0})
        doc["chunks"] += 1
    return state


# Purpose:
# Similarity search, restricted to chunks that match `where`.
# The filter runs INSIDE the vector search, so forbidden chunks never
# compete for the top-k slots and never leave the database.
def search(query_embedding: list[float], top_k: int = 3, where: dict | None = None,
           collection: str | None = None) -> list[dict]:
    col = get_collection(collection)
    if col.count() == 0:
        return []
    kwargs = {"query_embeddings": [query_embedding], "n_results": min(top_k, col.count())}
    if where:
        kwargs["where"] = where
    results = col.query(**kwargs)
    items = []
    for i in range(len(results["ids"][0])):
        meta = results["metadatas"][0][i]
        items.append({
            **meta,
            "id": results["ids"][0][i],
            "text": results["documents"][0][i],
            "source": meta.get("source", ""),
            "chunk_index": meta.get("chunk_index", 0),
            "doc_type": meta.get("doc_type", ""),
            "distance": results["distances"][0][i],
        })
    return items


def count(collection: str | None = None) -> int:
    try:
        return get_collection(collection).count()
    except RuntimeError:
        return 0


def get_all_chunks(source: str | None = None, limit: int = 50, include_embeddings: bool = False,
                   collection: str | None = None) -> list[dict]:
    col = get_collection(collection)
    if col.count() == 0:
        return []
    includes = ["documents", "metadatas"] + (["embeddings"] if include_embeddings else [])
    kwargs = {"limit": limit, "include": includes}
    if source:
        kwargs["where"] = {"source": source}
    data = col.get(**kwargs)
    items = []
    for i in range(len(data["ids"])):
        meta = data["metadatas"][i]
        item = {
            "id": data["ids"][i],
            "text": data["documents"][i],
            "source": meta.get("source", ""),
            "chunk_index": meta.get("chunk_index", 0),
            "doc_type": meta.get("doc_type", ""),
            "metadata": meta,
        }
        if include_embeddings and data.get("embeddings") is not None:
            emb = list(data["embeddings"][i])
            item["embedding_preview"] = emb[:5]
            item["embedding_dimensions"] = len(emb)
        items.append(item)
    return items


def get_all_embeddings(collection: str | None = None) -> tuple[list[list[float]], list[str]]:
    col = get_collection(collection)
    if col.count() == 0:
        return [], []
    data = col.get(include=["embeddings", "metadatas"], limit=col.count())
    return [list(e) for e in data["embeddings"]], [m.get("source", "") for m in data["metadatas"]]
