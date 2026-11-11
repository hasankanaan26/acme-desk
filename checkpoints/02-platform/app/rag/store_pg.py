# ============================================================
# Vector store — Postgres + pgvector
# ============================================================
# The same functions as Part 1's store_chroma.py, so the sync job did
# not change:
#
#   add_chunks(...)        store new chunks with ALL their metadata
#   delete_doc(doc_id)     remove every chunk of one document
#   update_doc_labels(...) change metadata (status, dates) in place,
#                          without re-embedding a single word
#   index_state()          per document: content hash, eTag, labels
#   search(...)            similarity search INSIDE the access filter
#   keyword_search(...)    full-text search, inside the same filter
#                          (new with the chat block: hybrid retrieval)
#
# "collection" is now an index name in search_indexes; None means the
# tenant's live index. Every call runs in the caller's transaction
# (db.current()), as the caller's role, for the caller's tenant.
#
# WHAT CHANGED, AND WHY IT MATTERS:
#   - Access is a JOIN, not a label. Part 1 copied acl_<group> flags
#     onto every chunk, so an access change meant a sync. Here the
#     search joins document_acl live: change it, and the next question
#     already obeys it.
#   - Tenants are invisible to each other. No query below says
#     "tenant_id = ...": Row-Level Security adds it to every one.
#   - One transaction. The sync's deletes and inserts commit together,
#     so a failure halfway leaves the index exactly as it was.
#
# DISTANCE: 2 x cosine distance. For unit vectors that equals the
# squared L2 distance ChromaDB reported, so Part 1's confidence
# thresholds still mean the same thing.
# ============================================================

from dataclasses import dataclass

from psycopg import sql
from psycopg.types.json import Jsonb

from app import db
from app.rag import catalog


@dataclass(frozen=True)
class Access:
    """Who is asking, and about when. Built by retriever.access_filter()."""
    group_ids: tuple[str, ...]
    as_of: int | None = None        # YYYYMMDD; None = documents in force today
    doc_type: str | None = None


def _index(collection: str | None) -> str | None:
    return collection or catalog.active_name()


def collection_exists(name: str) -> bool:
    return db.current().execute("SELECT 1 FROM search_indexes WHERE name = %s", (name,)).fetchone() is not None


def drop_collection(name: str) -> None:
    db.current().execute("DELETE FROM search_indexes WHERE name = %s", (name,))


# Purpose:
# Store chunks. Each chunk is {"id", "text", "metadata"}; ids are
# "<doc_id>::<n>". Upsert, like ChromaDB's: the same id replaces.
def add_chunks(chunks: list[dict], embeddings: list[list[float]], collection: str | None = None) -> int:
    if not chunks:
        return 0
    name = _index(collection)
    if not name:
        raise RuntimeError("No index yet. Run: python sync.py --apply")
    catalog.ensure_index(name)
    with db.current().cursor() as cur:
        cur.executemany("""
            INSERT INTO chunks (tenant_id, index_name, id, doc_id, chunk_index, text, metadata, embedding)
            VALUES (app_tenant(), %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (tenant_id, index_name, id) DO UPDATE SET
                doc_id = EXCLUDED.doc_id, chunk_index = EXCLUDED.chunk_index, text = EXCLUDED.text,
                metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding""",
            [(name, c["id"], c["metadata"]["doc_id"], c["metadata"]["chunk_index"], c["text"],
              Jsonb(c["metadata"]), _vector(v)) for c, v in zip(chunks, embeddings)])
    return len(chunks)


def delete_doc(doc_id: str, collection: str | None = None) -> int:
    return db.current().execute("DELETE FROM chunks WHERE index_name = %s AND doc_id = %s",
                                (_index(collection), doc_id)).rowcount


# Purpose:
# Change a document's status or dates without touching text or
# vectors: jsonb || merges the new labels into every chunk's metadata.
def update_doc_labels(doc_id: str, labels: dict, collection: str | None = None) -> int:
    return db.current().execute(
        "UPDATE chunks SET metadata = metadata || %s WHERE index_name = %s AND doc_id = %s",
        (Jsonb(labels), _index(collection), doc_id)).rowcount


# Purpose:
# Summarize the index per document, for the sync job's diff.
def index_state(collection: str | None = None) -> dict[str, dict]:
    name = _index(collection)
    if not name:
        return {}
    rows = db.current().execute("""
        SELECT DISTINCT ON (doc_id) doc_id, metadata, count(*) OVER (PARTITION BY doc_id) AS n
        FROM chunks WHERE index_name = %s
        ORDER BY doc_id, chunk_index""", (name,)).fetchall()
    return {r["doc_id"]: {**r["metadata"], "chunks": r["n"]} for r in rows}


def count(collection: str | None = None) -> int:
    name = _index(collection)
    if not name:
        return 0
    return db.current().execute("SELECT count(*) AS n FROM chunks WHERE index_name = %s", (name,)).fetchone()["n"]


# Purpose:
# Similarity search, restricted to what this user may read. Every
# filter runs INSIDE the query, so forbidden chunks never compete for
# the top-k slots and never leave the database.
#
#   who:   EXISTS a document_acl row for one of the user's groups
#   when:  status = 'current', or effective_from <= as_of < effective_to
#   which: the tenant (Row-Level Security, invisible here)
#
# The vector index (HNSW) is approximate and walks the graph first,
# filters second. With a strict filter it can come back with fewer
# than k rows. pgvector 0.8's iterative scan keeps walking until k rows
# pass the filter. relaxed_order may return them slightly out of
# order, so they are sorted again below.
def search(query_embedding: list[float], top_k: int = 3, access: Access | None = None,
           collection: str | None = None) -> list[dict]:
    name = _index(collection)
    if not name or access is None or not access.group_ids:
        return []  # no index, or nobody: fail closed
    dims = len(query_embedding)
    conn = db.current()
    conn.execute("SET LOCAL hnsw.iterative_scan = relaxed_order")
    when = (sql.SQL("c.effective_from <= %(day)s AND c.effective_to > %(day)s") if access.as_of
            else sql.SQL("c.status = 'current'"))
    query = sql.SQL("""
        SELECT c.id, c.text, c.metadata,
               2 * (c.embedding::vector({d}) <=> %(q)s::vector({d})) AS distance
        FROM chunks c
        WHERE c.index_name = %(index)s
          AND c.dims = {d}
          AND {when}
          AND (%(doc_type)s::text IS NULL OR c.doc_type = %(doc_type)s)
          AND EXISTS (SELECT 1 FROM document_acl a
                      WHERE a.tenant_id = c.tenant_id AND a.doc_id = c.doc_id
                        AND a.group_id = ANY(%(groups)s::uuid[]))
        ORDER BY c.embedding::vector({d}) <=> %(q)s::vector({d})
        LIMIT %(k)s""").format(d=sql.Literal(dims), when=when)
    rows = conn.execute(query, {"q": _vector(query_embedding), "index": name, "day": access.as_of,
                                "doc_type": access.doc_type, "groups": list(access.group_ids),
                                "k": top_k}).fetchall()
    return [_item(r) for r in sorted(rows, key=lambda r: r["distance"])]


# Purpose:
# Search by WORDS: Postgres full-text search on the same chunks, inside
# the same access filter as search(). Meaning-search can rank a passage
# low when the question names an exact thing (a product, a code, an
# acronym); this finds every chunk that shares words with the question.
#
# The question becomes an OR of its words, stemmed and without stop
# words ("How many vacation days can I roll over?" -> vacat | day |
# roll). ts_rank_cd ranks chunks that match more of them, closer
# together, higher. `tsv` is a generated column with a GIN index
# (001_schema.sql), so this is an index lookup, not a scan.
#
# Each row also carries its vector distance to the question, so a
# chunk found only by its words still has a confidence.
def keyword_search(query_text: str, query_embedding: list[float], top_k: int = 3, access: Access | None = None,
                   collection: str | None = None) -> list[dict]:
    name = _index(collection)
    if not name or access is None or not access.group_ids:
        return []  # no index, or nobody: fail closed
    dims = len(query_embedding)
    when = (sql.SQL("c.effective_from <= %(day)s AND c.effective_to > %(day)s") if access.as_of
            else sql.SQL("c.status = 'current'"))
    query = sql.SQL("""
        WITH words AS (
            SELECT to_tsquery('simple', string_agg(quote_literal(w), ' | ')) AS q
            FROM unnest(tsvector_to_array(to_tsvector('english', %(text)s))) AS w)
        SELECT c.id, c.text, c.metadata,
               2 * (c.embedding::vector({d}) <=> %(q)s::vector({d})) AS distance,
               ts_rank_cd(c.tsv, words.q, 1) AS keyword_rank
        FROM chunks c, words
        WHERE words.q IS NOT NULL
          AND c.tsv @@ words.q
          AND c.index_name = %(index)s
          AND c.dims = {d}
          AND {when}
          AND (%(doc_type)s::text IS NULL OR c.doc_type = %(doc_type)s)
          AND EXISTS (SELECT 1 FROM document_acl a
                      WHERE a.tenant_id = c.tenant_id AND a.doc_id = c.doc_id
                        AND a.group_id = ANY(%(groups)s::uuid[]))
        ORDER BY keyword_rank DESC, c.id
        LIMIT %(k)s""").format(d=sql.Literal(dims), when=when)
    rows = db.current().execute(query, {"text": query_text, "q": _vector(query_embedding), "index": name,
                                        "day": access.as_of, "doc_type": access.doc_type,
                                        "groups": list(access.group_ids), "k": top_k}).fetchall()
    return [_item(r) for r in rows]


# Purpose:
# EVERY chunk of one doc type this user may read, not a top k: what a
# structured lookup needs ("who works remotely?" has as many answers as
# the directory has matching rows). Same access filter as search(); each
# row still carries its distance to the question, for the confidence.
def records(query_embedding: list[float], doc_type: str, access: Access | None = None,
            collection: str | None = None, limit: int = 1000) -> list[dict]:
    name = _index(collection)
    if not name or access is None or not access.group_ids:
        return []  # no index, or nobody: fail closed
    dims = len(query_embedding)
    when = (sql.SQL("c.effective_from <= %(day)s AND c.effective_to > %(day)s") if access.as_of
            else sql.SQL("c.status = 'current'"))
    query = sql.SQL("""
        SELECT c.id, c.text, c.metadata,
               2 * (c.embedding::vector({d}) <=> %(q)s::vector({d})) AS distance
        FROM chunks c
        WHERE c.index_name = %(index)s
          AND c.dims = {d}
          AND {when}
          AND c.doc_type = %(doc_type)s
          AND EXISTS (SELECT 1 FROM document_acl a
                      WHERE a.tenant_id = c.tenant_id AND a.doc_id = c.doc_id
                        AND a.group_id = ANY(%(groups)s::uuid[]))
        ORDER BY c.doc_id, c.chunk_index
        LIMIT %(k)s""").format(d=sql.Literal(dims), when=when)
    rows = db.current().execute(query, {"q": _vector(query_embedding), "index": name, "day": access.as_of,
                                        "doc_type": doc_type, "groups": list(access.group_ids),
                                        "k": limit}).fetchall()
    return [_item(r) for r in rows]


def _item(r) -> dict:
    meta = r["metadata"]
    return {
        **meta,
        "id": r["id"],
        "text": r["text"],
        "source": meta.get("source", ""),
        "chunk_index": meta.get("chunk_index", 0),
        "doc_type": meta.get("doc_type", ""),
        "distance": float(r["distance"]),
    }


def _vector(values):
    import numpy as np

    return np.asarray(values, dtype=np.float32)
