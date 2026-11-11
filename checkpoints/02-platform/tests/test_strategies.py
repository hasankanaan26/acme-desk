# ============================================================
# The lab's retrieval strategies on Acme Desk's Postgres store
# ============================================================
# rerank, hybrid_rerank, hyde, multi_query and routed came from the RAG
# weeks' checkpoint 6. Here they run on pgvector + full-text, inside the
# same access filter as dense, keyword and hybrid. What these tests pin:
#   - every strategy answers through /search and /query, with a trace
#   - none of them lets a document past the access filter
#   - no model, or no reranker, degrades the search; it never fails it
# The reranker is the shared-word fake (RERANKER=fake, conftest.py).
# ============================================================

import pytest
from conftest import W, as_tenant, sign_in

from app.config import RETRIEVAL_STRATEGIES
from app.ingest.sync import run_sync
from app.rag import reranker, retriever, router


@pytest.fixture
def synced(friday, tenants):
    with as_tenant("sync", tenants["acme"]):
        run_sync(apply=True)
    return tenants


def search(c, q, strategy, **params):
    r = c.get("/search", params={"q": q, "strategy": strategy, **params})
    assert r.status_code == 200, r.text
    return r.json()


def test_every_strategy_answers_with_a_trace(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    for strategy in RETRIEVAL_STRATEGIES:
        data = search(intern, "How many vacation days can I roll over?", strategy)
        assert data["strategy"] == strategy and data["trace"], strategy
        assert data["results"], strategy


def test_bm25_is_the_keyword_search(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    data = search(intern, "Copilot", "bm25")
    assert data["strategy"] == "keyword"
    assert [h["doc_id"] for h in data["results"]] == ["FIN-EXP-2024-UPDATE"]


def test_an_unknown_strategy_is_a_422(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    assert intern.get("/search", params={"q": "leave", "strategy": "magic"}).status_code == 422


# ---- rerank ----

def test_rerank_reorders_the_dense_candidates(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    q = "How many reviewers does a change to the billing code need?"
    dense = search(intern, q, "dense", top_k=20)
    reranked = search(intern, q, "rerank", top_k=5)
    assert "cross-encoder" in reranked["trace"][0]
    assert all(r["rerank_score"] is not None for r in reranked["results"])
    scores = [r["rerank_score"] for r in reranked["results"]]
    assert scores == sorted(scores, reverse=True)
    # Only re-orders what the first stage found: nothing new, nothing forbidden
    assert {r["doc_id"] for r in reranked["results"]} <= {r["doc_id"] for r in dense["results"]}


def test_no_reranker_means_the_first_stage_order(synced, client, monkeypatch):
    def broken(*_args, **_kwargs):
        raise OSError("no network")

    monkeypatch.setattr(reranker, "score", broken)
    intern = sign_in(client(), "intern@acme.test")
    data = search(intern, "remote work core hours", "hybrid_rerank", top_k=3)
    hybrid = search(intern, "remote work core hours", "hybrid", top_k=3)
    assert "reranker unavailable" in data["trace"][0]
    assert [r["doc_id"] for r in data["results"]] == [r["doc_id"] for r in hybrid["results"]]


def test_rerank_stays_inside_the_access_filter(synced, client):
    intern, admin = sign_in(client(), "intern@acme.test"), sign_in(client(), "admin@acme.test")
    q = "salary bands senior developer"
    assert "HR-SALARY-BANDS-2026" in {r["doc_id"] for r in search(intern, q, "hybrid_rerank")["results"]}
    admin.patch("/admin/documents/HR-SALARY-BANDS-2026", json={"allowed_groups": ["hr"]}, headers=W)
    for strategy in ("rerank", "hybrid_rerank", "routed", "multi_query", "hyde"):
        assert "HR-SALARY-BANDS-2026" not in {r["doc_id"] for r in search(intern, q, strategy)["results"]}, strategy


# ---- routed ----

def test_router_tells_a_list_from_a_lookup():
    rows = [{"text": "Maria Garcia\nname: Maria Garcia; office: Remote; department: Engineering"},
            {"text": "Sarah Chen\nname: Sarah Chen; office: San Francisco; department: Engineering"}]
    assert router.classify("Who works remotely?", rows) == ("aggregation", {"office": ["Remote"]})
    assert router.classify("Who works in San Francisco?", rows) == ("aggregation", {"office": ["San Francisco"]})
    assert router.classify("How many vacation days do I get?", rows)[0] == "pointwise"
    assert [r["text"][:5] for r in router.lookup(rows, {"office": ["Remote"]})] == ["Maria"]


def test_routed_returns_every_matching_directory_row(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    data = search(intern, "Who works remotely?", "routed", top_k=2)
    assert data["trace"][0].startswith("route: aggregation on {'office': ['Remote']} -> 3 matching record(s)")
    assert {r["doc_id"] for r in data["results"]} == {"PEOPLE-DIRECTORY"}
    names = " ".join(r["text"] for r in data["results"])
    assert all(n in names for n in ("Maria Garcia", "Michael Brown", "Ahmed Hassan"))
    assert data["total_results"] == 3                    # all of them, not top_k
    assert all(r["found_by"] == ["records"] for r in data["results"])


def test_routed_only_reads_a_directory_you_may_read(synced, client):
    intern, admin = sign_in(client(), "intern@acme.test"), sign_in(client(), "admin@acme.test")
    admin.patch("/admin/documents/PEOPLE-DIRECTORY", json={"allowed_groups": ["hr"]}, headers=W)
    data = search(intern, "Who works remotely?", "routed")
    assert data["trace"][0] == "route: pointwise"         # no rows to look up, so a normal search
    assert "PEOPLE-DIRECTORY" not in {r["doc_id"] for r in data["results"]}


# ---- hyde and multi_query ----

def test_no_model_means_the_question_as_asked(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    q = "How many vacation days can I roll over?"
    dense = [r["doc_id"] for r in search(intern, q, "dense", top_k=3)["results"]]
    for strategy in ("hyde", "multi_query"):
        data = search(intern, q, strategy, top_k=3)
        assert data["trace"][0].startswith("model unavailable"), strategy
        assert [r["doc_id"] for r in data["results"]] == dense, strategy


def test_multi_query_fuses_the_question_and_three_rewrites(synced, client, monkeypatch):
    prompts = []

    def fake_llm(prompt, system_prompt=""):
        prompts.append(prompt)
        return "carry over unused leave\n- annual leave rollover limit\nvacation days next year"

    monkeypatch.setattr(retriever, "cached_call_llm", fake_llm)
    intern = sign_in(client(), "intern@acme.test")
    data = search(intern, "How many vacation days can I roll over?", "multi_query")
    assert len(prompts) == 1
    assert "annual leave rollover limit" in data["trace"][0]            # the bullet stripped
    assert data["trace"][1].startswith("4 x dense top 20 -> RRF")
    assert "HR-LEAVE" in {r["doc_id"] for r in data["results"]}


def test_hyde_searches_with_the_written_answer(synced, client, monkeypatch):
    monkeypatch.setattr(retriever, "cached_call_llm",
                        lambda prompt, system_prompt="": "Employees may carry over up to 5 unused vacation days.")
    intern = sign_in(client(), "intern@acme.test")
    data = search(intern, "Can I keep my days off?", "hyde")
    assert data["trace"][0].startswith("LLM wrote: Employees may carry over")
    assert data["results"]


# ---- /query ----

def test_query_takes_a_strategy_and_reports_it(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    r = intern.post("/query", params={"strategy": "routed"}, json={"question": "Who works remotely?"}, headers=W)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["strategy"] == "routed" and data["trace"][0].startswith("route: aggregation")
    assert data["llm_available"] is False                 # no model in tests: sources, no 500
    assert {s["doc_id"] for s in data["sources"]} == {"PEOPLE-DIRECTORY"}
