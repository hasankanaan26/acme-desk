# ============================================================
# Vector Store — Checkpoint 5
# ============================================================
# The rest of the app imports from this module and never touches the
# database directly. VECTOR_STORE in .env picks the backend:
#
#   chroma    ChromaDB files in CHROMA_PATH (the class default)
#   postgres  Postgres + pgvector (store_pg.py), the docker compose db
#
# Both offer the same functions: filters, per-document deletes and
# in-place metadata updates, which the sync job needs.
# ============================================================

from app.config import VECTOR_STORE

if VECTOR_STORE == "postgres":
    from app.rag.store_pg import (  # noqa: F401  (re-exported)
        add_chunks,
        collection_exists,
        count,
        delete_doc,
        drop_collection,
        get_all_chunks,
        get_all_embeddings,
        get_collection,
        index_state,
        list_collections,
        location,
        search,
        update_doc_labels,
    )
else:
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
        list_collections,
        location,
        search,
        update_doc_labels,
    )

LABEL = {"chroma": "ChromaDB", "postgres": "Postgres + pgvector"}[VECTOR_STORE]
