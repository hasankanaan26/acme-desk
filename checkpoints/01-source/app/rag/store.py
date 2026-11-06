# ============================================================
# Vector Store — Checkpoint 5
# ============================================================
# Checkpoint 4 picked ChromaDB or Postgres here. Checkpoint 5 uses
# ChromaDB only: the sync job needs metadata filters, per-document
# deletes and in-place metadata updates, and each store spells those
# differently (pgvector: a WHERE clause on a jsonb column). The rest
# of the app imports from this module and never touches ChromaDB.
# ============================================================

from app.rag.store_chroma import (  # noqa: F401  (re-exported)
    add_chunks,
    collection_exists,
    count,
    delete_doc,
    drop_collection,
    get_all_chunks,
    get_all_embeddings,
    get_collection,
    index_state,
    search,
    update_doc_labels,
)
