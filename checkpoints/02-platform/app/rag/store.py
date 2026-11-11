# ============================================================
# Vector Store — Part 2: Postgres + pgvector
# ============================================================
# Part 1 re-exported ChromaDB from here. Part 2 re-exports Postgres
# (store_pg.py). The sync job, the retriever and the routers import
# from this module and never know which store is underneath, which is
# why swapping ChromaDB for Postgres changed no line of sync.py's
# decision ladder.
# ============================================================

from app.rag.store_pg import (  # noqa: F401  (re-exported)
    Access,
    add_chunks,
    collection_exists,
    count,
    delete_doc,
    drop_collection,
    index_state,
    keyword_search,
    records,
    search,
    update_doc_labels,
)
