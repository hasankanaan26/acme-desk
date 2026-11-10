# ============================================================
# Vector Store (Postgres + pgvector) — VECTOR_STORE=postgres
# ============================================================
# The same functions as store_chroma.py, so the sync job, the
# retriever and the UI do not change. What lives where:
#
#   vector_indexes   one row per index ("collection" in Chroma words):
#                    acme_kb_20261109_183642, acme_naive, ...
#   chunks           one row per chunk: text, metadata (jsonb) and
#                    the vector, keyed by (index_name, id)
#   catalog          one row: which index is live (see catalog.py).
#                    With Chroma it is a JSON file next to the data;
#                    here it sits in the same database as the index
#                    it points at.
#
# It uses its own database (acme_part1 by default) in the docker
# compose `db` service, so it never touches Part 2's tables. The
# database and the tables are created on first use.
#
# FILTERS: the retriever builds Chroma-style filters
#   {"$and": [{"acl_hr": True}, {"effective_from": {"$lte": 20261109}}]}
# and where_sql() turns them into a WHERE clause on the jsonb column.
#
# DISTANCE: squared L2, the number ChromaDB reports, so the confidence
# thresholds in config.py mean the same with either store. There is no
# approximate-nearest-neighbour index: a few hundred chunks are
# compared exactly in well under a millisecond each.
# ============================================================

import threading

import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from app.config import VECTOR_DB_URL
from app.rag import catalog

SCHEMA = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS vector_indexes (
    name       text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chunks (
    index_name text   NOT NULL REFERENCES vector_indexes (name) ON DELETE CASCADE,
    id         text   NOT NULL,
    doc_id     text   GENERATED ALWAYS AS (metadata ->> 'doc_id') STORED,
    text       text   NOT NULL,
    metadata   jsonb  NOT NULL,
    embedding  vector NOT NULL,
    PRIMARY KEY (index_name, id)
);
CREATE INDEX IF NOT EXISTS chunks_by_doc ON chunks (index_name, doc_id);
CREATE TABLE IF NOT EXISTS catalog (
    id   integer PRIMARY KEY CHECK (id = 1),
    data jsonb   NOT NULL
);
"""

_pool: ConnectionPool | None = None
_lock = threading.Lock()


def location() -> str:
    """Where the vectors are, without the password: postgres://localhost:5433/acme_part1."""
    p = conninfo_to_dict(VECTOR_DB_URL)
    return f"postgres://{p.get('host', 'localhost')}:{p.get('port', 5432)}/{p.get('dbname', 'postgres')}"


def _create_database_and_tables() -> None:
    dbname = conninfo_to_dict(VECTOR_DB_URL).get("dbname", "postgres")
    with psycopg.connect(make_conninfo(VECTOR_DB_URL, dbname="postgres"), autocommit=True, connect_timeout=5) as conn:
        if not conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,)).fetchone():
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(dbname)))
    with psycopg.connect(VECTOR_DB_URL, autocommit=True, connect_timeout=5) as conn:
        conn.execute(SCHEMA)


def pool() -> ConnectionPool:
    global _pool
    with _lock:
        if _pool is None:
            try:
                _create_database_and_tables()
            except psycopg.OperationalError as exc:
                raise RuntimeError(f"Postgres at {location()} is not reachable. Start it: docker compose up -d db "
                                   f"({str(exc).strip().splitlines()[0]})") from exc
            _pool = ConnectionPool(VECTOR_DB_URL, min_size=1, max_size=4, open=True,
                                   kwargs={"row_factory": dict_row}, configure=register_vector)
    return _pool


def _vec(values) -> np.ndarray:
    return np.asarray(values, dtype=np.float32)


# ---- Chroma-style filters -> SQL ----

_COMPARE = {"$gt": ">", "$gte": ">=", "$lt": "<", "$lte": "<="}


def _condition(field: str, op: str, value) -> tuple[sql.Composable, list]:
    if op == "$eq":
        return sql.SQL("(metadata -> %s) = %s"), [field, Jsonb(value)]
    if op == "$ne":
        return sql.SQL("(metadata -> %s) IS DISTINCT FROM %s"), [field, Jsonb(value)]
    if op in ("$in", "$nin"):
        test = sql.SQL("coalesce((metadata -> %s) = ANY(%s::jsonb[]), false)")
        return (test if op == "$in" else sql.SQL("NOT ") + test), [field, [Jsonb(v) for v in value]]
    if op in _COMPARE:
        cmp = sql.SQL(_COMPARE[op])
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            # Only numbers compare as numbers; a string in that field simply does not match.
            return (sql.SQL("CASE WHEN jsonb_typeof(metadata -> %s) = 'number' THEN (metadata ->> %s)::numeric ")
                    + cmp + sql.SQL(" %s END"), [field, field, value])
        return sql.SQL("(metadata ->> %s) ") + cmp + sql.SQL(" %s"), [field, str(value)]
    raise ValueError(f"Unsupported filter operator {op!r}")


def where_sql(where: dict | None) -> tuple[sql.Composable, list]:
    """A Chroma `where` dict as (SQL, params). None or {} matches everything."""
    if not where:
        return sql.SQL("TRUE"), []
    parts, params = [], []
    for key, value in where.items():
        if key in ("$and", "$or"):
            subs = [where_sql(w) for w in value]
            joiner = sql.SQL(" AND " if key == "$and" else " OR ")
            parts.append(sql.SQL("(") + joiner.join(s for s, _ in subs) + sql.SQL(")"))
            for _, p in subs:
                params.extend(p)
        else:
            for op, operand in (value.items() if isinstance(value, dict) else [("$eq", value)]):
                s, p = _condition(key, op, operand)
                parts.append(s)
                params.extend(p)
    return sql.SQL("(") + sql.SQL(" AND ").join(parts) + sql.SQL(")"), params


# ---- Indexes ----

def _name(collection: str | None) -> str:
    name = collection or catalog.active_name()
    if not name:
        raise RuntimeError("No index yet. Run: python sync.py --apply")
    return name


def _ensure_index(conn, name: str) -> None:
    conn.execute("INSERT INTO vector_indexes (name) VALUES (%s) ON CONFLICT DO NOTHING", (name,))


def get_collection(name: str | None = None) -> str:
    """Get (or create) an index. None = the live one. Returns its name."""
    name = _name(name)
    with pool().connection() as conn:
        _ensure_index(conn, name)
    return name


def collection_exists(name: str) -> bool:
    with pool().connection() as conn:
        return conn.execute("SELECT 1 FROM vector_indexes WHERE name = %s", (name,)).fetchone() is not None


def list_collections() -> list[str]:
    with pool().connection() as conn:
        return [r["name"] for r in conn.execute("SELECT name FROM vector_indexes ORDER BY name")]


def drop_collection(name: str) -> None:
    with pool().connection() as conn:
        conn.execute("DELETE FROM vector_indexes WHERE name = %s", (name,))  # its chunks go with it


# ---- Chunks ----

def add_chunks(chunks: list[dict], embeddings: list[list[float]], collection: str | None = None) -> int:
    if not chunks:
        return 0
    name = _name(collection)
    with pool().connection() as conn:
        _ensure_index(conn, name)
        with conn.cursor() as cur:
            cur.executemany("""
                INSERT INTO chunks (index_name, id, text, metadata, embedding) VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (index_name, id) DO UPDATE
                SET text = EXCLUDED.text, metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding""",
                [(name, c["id"], c["text"], Jsonb(c["metadata"]), _vec(e)) for c, e in zip(chunks, embeddings)])
    return len(chunks)


def delete_doc(doc_id: str, collection: str | None = None) -> int:
    with pool().connection() as conn:
        return conn.execute("DELETE FROM chunks WHERE index_name = %s AND doc_id = %s",
                            (_name(collection), doc_id)).rowcount


# Purpose:
# Change who may read a document, or its status, without touching the
# text or the vectors: one UPDATE that merges the new labels in.
def update_doc_labels(doc_id: str, labels: dict, collection: str | None = None) -> int:
    with pool().connection() as conn:
        return conn.execute("UPDATE chunks SET metadata = metadata || %s WHERE index_name = %s AND doc_id = %s",
                            (Jsonb(labels), _name(collection), doc_id)).rowcount


def index_state(collection: str | None = None) -> dict[str, dict]:
    with pool().connection() as conn:
        rows = conn.execute("SELECT metadata FROM chunks WHERE index_name = %s ORDER BY id",
                            (_name(collection),)).fetchall()
    state: dict[str, dict] = {}
    for row in rows:
        meta = row["metadata"]
        doc = state.setdefault(meta["doc_id"], {**meta, "chunks": 0})
        doc["chunks"] += 1
    return state


# Purpose:
# Similarity search INSIDE the filter: forbidden chunks never compete
# for the top-k slots and never leave the database.
def search(query_embedding: list[float], top_k: int = 3, where: dict | None = None,
           collection: str | None = None) -> list[dict]:
    cond, params = where_sql(where)
    q = _vec(query_embedding)
    query = sql.SQL("""
        SELECT id, text, metadata, (embedding <-> %s) ^ 2 AS distance
        FROM chunks WHERE index_name = %s AND {cond}
        ORDER BY embedding <-> %s LIMIT %s""").format(cond=cond)
    with pool().connection() as conn:
        rows = conn.execute(query, [q, _name(collection), *params, q, top_k]).fetchall()
    return [{
        **r["metadata"],
        "id": r["id"],
        "text": r["text"],
        "source": r["metadata"].get("source", ""),
        "chunk_index": r["metadata"].get("chunk_index", 0),
        "doc_type": r["metadata"].get("doc_type", ""),
        "distance": float(r["distance"]),
    } for r in rows]


def count(collection: str | None = None) -> int:
    name = collection or catalog.active_name()
    if not name:
        return 0
    with pool().connection() as conn:
        return conn.execute("SELECT count(*) AS n FROM chunks WHERE index_name = %s", (name,)).fetchone()["n"]


def get_all_chunks(source: str | None = None, limit: int = 50, include_embeddings: bool = False,
                   collection: str | None = None) -> list[dict]:
    cond, params = where_sql({"source": source} if source else None)
    query = sql.SQL("SELECT id, text, metadata{emb} FROM chunks WHERE index_name = %s AND {cond} "
                    "ORDER BY id LIMIT %s").format(emb=sql.SQL(", embedding") if include_embeddings else sql.SQL(""),
                                                    cond=cond)
    with pool().connection() as conn:
        rows = conn.execute(query, [_name(collection), *params, limit]).fetchall()
    items = []
    for r in rows:
        meta = r["metadata"]
        item = {"id": r["id"], "text": r["text"], "source": meta.get("source", ""),
                "chunk_index": meta.get("chunk_index", 0), "doc_type": meta.get("doc_type", ""), "metadata": meta}
        if include_embeddings:
            emb = [float(x) for x in r["embedding"]]
            item["embedding_preview"] = emb[:5]
            item["embedding_dimensions"] = len(emb)
        items.append(item)
    return items


def get_all_embeddings(collection: str | None = None) -> tuple[list[list[float]], list[str]]:
    with pool().connection() as conn:
        rows = conn.execute("SELECT embedding, metadata ->> 'source' AS source FROM chunks "
                            "WHERE index_name = %s ORDER BY id", (_name(collection),)).fetchall()
    return [[float(x) for x in r["embedding"]] for r in rows], [r["source"] or "" for r in rows]


# ---- The catalog, stored next to the index it points at ----

def load_catalog() -> dict | None:
    with pool().connection() as conn:
        row = conn.execute("SELECT data FROM catalog WHERE id = 1").fetchone()
    return row["data"] if row else None


def save_catalog(data: dict) -> None:
    with pool().connection() as conn:
        conn.execute("INSERT INTO catalog (id, data) VALUES (1, %s) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
                     (Jsonb(data),))
