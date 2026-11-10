# ============================================================
# The Postgres + pgvector store (VECTOR_STORE=postgres)
# ============================================================
# Runs against a throwaway database, acme_part1_test, in the docker
# compose `db` service. Skipped when that Postgres is not running:
#   docker compose up -d db
# ============================================================

import numpy as np
import psycopg
import pytest
from psycopg.conninfo import make_conninfo

from app import config
from app.rag import store_pg
from app.rag.retriever import access_filter

TEST_URL = make_conninfo(config.VECTOR_DB_URL, dbname="acme_part1_test")


@pytest.fixture(scope="module")
def pg():
    try:
        psycopg.connect(make_conninfo(TEST_URL, dbname="postgres"), connect_timeout=3).close()
    except psycopg.OperationalError:
        pytest.skip("Postgres on port 5433 is not running (docker compose up -d db)")
    saved_url, saved_pool = store_pg.VECTOR_DB_URL, store_pg._pool
    store_pg.VECTOR_DB_URL, store_pg._pool = TEST_URL, None
    for name in store_pg.list_collections():
        store_pg.drop_collection(name)
    yield store_pg
    for name in store_pg.list_collections():
        store_pg.drop_collection(name)
    store_pg._pool.close()
    store_pg.VECTOR_DB_URL, store_pg._pool = saved_url, saved_pool


def unit(*values):
    v = np.asarray(values, dtype=np.float32)
    return (v / np.linalg.norm(v)).tolist()


def chunk(doc_id, n, groups, status="current", frm=20260101, to=99991231, **extra):
    meta = {"doc_id": doc_id, "source": doc_id.lower() + ".md", "chunk_index": n, "status": status,
            "effective_from": frm, "effective_to": to, "doc_type": "policy",
            **{f"acl_{g}": g in groups for g in ("hr", "employees", "engineering")}, **extra}
    return {"id": f"{doc_id}::{n:03d}", "text": f"{doc_id} chunk {n}", "metadata": meta}


@pytest.fixture
def index(pg):
    name = "acme_kb_test"
    pg.drop_collection(name)
    pg.add_chunks([chunk("HR-LEAVE", 0, ["employees"]), chunk("HR-LEAVE", 1, ["employees"]),
                   chunk("HR-SALARY", 0, ["hr"]),
                   chunk("HR-OLD", 0, ["employees"], status="superseded", frm=20230101, to=20260101)],
                  [unit(1, 0, 0), unit(1, 1, 0), unit(1, 0.1, 0), unit(1, 0, 0.1)], name)
    return name


def test_the_store_says_where_it_is(pg):
    assert pg.location() == "postgres://localhost:5433/acme_part1_test"


def test_chunks_in_state_out_and_a_label_change_without_re_embedding(pg, index):
    state = pg.index_state(index)
    assert state["HR-LEAVE"]["chunks"] == 2 and pg.count(index) == 4
    assert pg.update_doc_labels("HR-LEAVE", {"status": "superseded"}, index) == 2
    assert pg.index_state(index)["HR-LEAVE"]["status"] == "superseded"
    assert pg.delete_doc("HR-LEAVE", index) == 2 and pg.count(index) == 2
    pg.add_chunks([chunk("HR-SALARY", 0, ["hr"], version=2)], [unit(0, 1, 0)], index)  # upsert, not a duplicate
    assert pg.count(index) == 2 and pg.index_state(index)["HR-SALARY"]["version"] == 2


def test_search_obeys_the_same_filter_the_retriever_builds(pg, index):
    hits = pg.search(unit(1, 0, 0), top_k=10, where=access_filter(["employees"]), collection=index)
    assert {h["doc_id"] for h in hits} == {"HR-LEAVE"}        # not HR (no access), not superseded
    assert hits[0]["id"] == "HR-LEAVE::000" and hits[0]["source"] == "hr-leave.md"
    assert hits[0]["distance"] == pytest.approx(0.0, abs=1e-6)
    # squared L2, like ChromaDB: |(1,0,0) - (1,1,0)/sqrt2|^2 = 2 - sqrt2
    assert hits[1]["distance"] == pytest.approx(2 - 2 ** 0.5, abs=1e-5)

    as_of_2025 = pg.search(unit(1, 0, 0), top_k=10, where=access_filter(["employees"], as_of="2025-06-01"),
                           collection=index)
    assert [h["doc_id"] for h in as_of_2025] == ["HR-OLD"]  # what was in force then
    assert pg.search(unit(1, 0, 0), where=access_filter(["hr", "employees"]), top_k=1, collection=index)


def test_every_filter_operator(pg, index):
    def ids(where):
        return sorted({h["doc_id"] for h in pg.search(unit(1, 0, 0), top_k=10, where=where, collection=index)})
    assert ids({"doc_id": {"$in": ["HR-SALARY", "HR-OLD"]}}) == ["HR-OLD", "HR-SALARY"]
    assert ids({"doc_id": {"$nin": ["HR-SALARY", "HR-OLD"]}}) == ["HR-LEAVE"]
    assert ids({"status": {"$ne": "current"}}) == ["HR-OLD"]
    assert ids({"$or": [{"acl_hr": True}, {"status": "superseded"}]}) == ["HR-OLD", "HR-SALARY"]
    assert ids({"effective_to": {"$lt": 20300101}}) == ["HR-OLD"]
    assert ids({"effective_from": {"$gte": 20260101}, "acl_hr": False}) == ["HR-LEAVE"]
    assert ids({"doc_type": {"$gt": "a"}}) == ["HR-LEAVE", "HR-OLD", "HR-SALARY"]  # strings compare as text
    assert ids({"nothing_here": True}) == []
    with pytest.raises(ValueError):
        ids({"doc_id": {"$regex": "HR"}})


def test_listing_embeddings_and_dropping(pg, index):
    chunks = pg.get_all_chunks(source="hr-leave.md", include_embeddings=True, collection=index)
    assert [c["chunk_index"] for c in chunks] == [0, 1] and chunks[0]["embedding_dimensions"] == 3
    vectors, sources = pg.get_all_embeddings(index)
    assert len(vectors) == 4 and isinstance(vectors[0][0], float) and "hr-salary.md" in sources
    assert index in pg.list_collections()
    pg.drop_collection(index)
    assert not pg.collection_exists(index) and pg.count(index) == 0


def test_the_catalog_lives_next_to_the_index(pg):
    pg.save_catalog({"active": "acme_kb_a", "previous": None, "collections": {"acme_kb_a": {"chunks": 3}}})
    assert pg.load_catalog()["active"] == "acme_kb_a"
    pg.save_catalog({"active": "acme_kb_b", "previous": "acme_kb_a", "collections": {}})
    assert pg.load_catalog()["previous"] == "acme_kb_a"
