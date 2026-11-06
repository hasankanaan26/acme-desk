# ============================================================
# Router: /store/inspect — See what's inside the vector store
# ============================================================
# This endpoint makes the "invisible" visible. Students can
# see exactly what ChromaDB is holding:
#   - The chunk text
#   - The metadata. In Checkpoint 5 that is a lot more: doc_id,
#     version, status, effective dates, the acl_<group> flags,
#     the content hash and eTag the sync job compares
#   - The embedding vector (first few dimensions + total size)
#
# This is a teaching tool — in production you wouldn't expose
# raw vector store contents via an API. (It ignores permissions!)
#
# DEMO:
#   GET /store/inspect                                   → all chunks
#   GET /store/inspect?source=hr/salary-bands-2026.md    → one document
#   GET /store/inspect?collection=acme_naive             → the one-shot /ingest index (python sync.py --naive)
#   GET /store/inspect?show_embeddings=true              → include vectors
# ============================================================

from fastapi import APIRouter, Query

from app.models import StoreInspectResponse, StoredChunkInfo
from app.rag import catalog
from app.rag.store import count, get_all_chunks

router = APIRouter(prefix="/store", tags=["Store Inspector"])


@router.get("/inspect", response_model=StoreInspectResponse)
def inspect_store(
    source: str | None = Query(default=None, description="Filter by source path, e.g. 'hr/leave-policy.md'."),
    collection: str | None = Query(default=None, description="Collection name. Empty = the live index."),
    show_embeddings: bool = Query(default=False, description="Include the first 5 dimensions of each vector."),
    limit: int = Query(default=50, description="Max chunks to return.", le=500),
):
    """Inspect the contents of the vector store (no permission filter: admin view)."""
    name = collection or catalog.active_name() or ""
    if not name:  # no live index yet (before the first sync, or after --wipe)
        return StoreInspectResponse(collection="", total_stored=0, sources=[], chunks=[])
    raw = get_all_chunks(source=source, limit=limit, include_embeddings=show_embeddings, collection=name)
    chunks = [
        StoredChunkInfo(
            id=item["id"],
            text=item["text"],
            source=item["source"],
            chunk_index=item["chunk_index"],
            doc_type=item.get("doc_type", ""),
            metadata=item.get("metadata", {}),
            embedding_preview=item.get("embedding_preview"),
            embedding_dimensions=item.get("embedding_dimensions"),
        )
        for item in raw
    ]
    return StoreInspectResponse(
        collection=name,
        total_stored=count(name),
        sources=sorted(set(c.source for c in chunks)),
        chunks=chunks,
    )
