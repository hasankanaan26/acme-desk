# ============================================================
# Part 3: the second cut — small chunks written by the sync
# ============================================================
# What these tests pin:
#   - one sync writes both cuts, in the same index, and every small
#     chunk points to a section that exists (the foreign key)
#   - the section searches never see a small chunk (Part 2's numbers
#     don't move), and count() still counts sections
#   - a changed file replaces both cuts; a deleted one removes both;
#     a relabel (status, dates) reaches the small chunks too
#   - small and parent run inside the access filter, live, like every
#     other strategy; parent re-checks it when it fetches the sections
#   - the API role still cannot write chunks, small ones included
# Fake embedder and fake reranker (conftest.py): no model, no download.
# ============================================================

import psycopg
import pytest
from conftest import W, as_tenant, sign_in

from app import db
from app.config import CHILD_MAX_CHARS
from app.ingest.sync import run_sync
from app.rag import store
from app.rag.children import body_of, small_chunks, split_sentences


@pytest.fixture
def synced(friday, tenants):
    with as_tenant("sync", tenants["acme"]):
        report = run_sync(apply=True)
    return {**tenants, "report": report}


def search(c, q, strategy, **params):
    r = c.get("/search", params={"q": q, "strategy": strategy, **params})
    assert r.status_code == 200, r.text
    return r.json()


def rows(tenant, sql, *args):
    with as_tenant("app", tenant) as conn:
        return conn.execute(sql, args).fetchall()


# ---- the cut itself (no database) ----

def test_split_sentences_keeps_whole_sentences_under_the_limit():
    text = "One short sentence. Another one here! A third? " + "word " * 80
    pieces = split_sentences(text, 60)
    assert pieces[0] == "One short sentence. Another one here! A third?"
    assert all(len(p) <= 60 for p in pieces[:-1])


def test_small_chunks_point_to_their_section_and_carry_its_labels():
    section = {"id": "HR-LEAVE::002", "text": "Leave Policy > Sick Leave\nTen days a year. A note after three days.",
               "metadata": {"doc_id": "HR-LEAVE", "status": "current", "chunk_index": 2, "title": "Leave Policy"}}
    small = small_chunks([section], "Leave Policy", 20)
    assert [s["id"] for s in small] == ["HR-LEAVE::002#00", "HR-LEAVE::002#01"]
    assert small[0]["text"] == "Leave Policy: Ten days a year."
    assert all(s["metadata"]["parent_id"] == "HR-LEAVE::002" and s["metadata"]["status"] == "current" for s in small)
    assert "Sick Leave" not in small[1]["text"]          # the heading stays with the section
    assert body_of({**small[1], **small[1]["metadata"]}) == "A note after three days."
    assert body_of({**section, **section["metadata"]}) == "Ten days a year. A note after three days."


# ---- the sync writes both cuts ----

def test_one_sync_writes_both_cuts(synced):
    acme = synced["acme"]
    with as_tenant("app", acme):
        sections, small = store.count(), store.count_small()
    assert sections > 0 and small > sections
    assert synced["report"]["small_chunks_in_index"] == small
    orphans = rows(acme, """SELECT count(*) AS n FROM chunks s WHERE s.parent_id IS NOT NULL AND NOT EXISTS
                             (SELECT 1 FROM chunks p WHERE p.index_name = s.index_name AND p.id = s.parent_id)""")
    assert orphans[0]["n"] == 0
    longest = rows(acme, "SELECT max(length(text) - length(metadata->>'title') - 2) AS n FROM chunks "
                         "WHERE parent_id IS NOT NULL AND text NOT LIKE '%%| %%'")[0]["n"]
    assert longest <= CHILD_MAX_CHARS * 2       # a single very long sentence may exceed the limit, not by much


def test_section_searches_never_return_a_small_chunk(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    for strategy in ("dense", "keyword", "hybrid", "rerank", "hybrid_rerank", "routed"):
        for r in search(intern, "How many vacation days can I roll over?", strategy, top_k=20)["results"]:
            assert " > " in r["text"].split("\n", 1)[0], (strategy, r["text"][:80])   # a section's header


def test_small_returns_small_chunks_and_parent_returns_their_sections(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    q = "How many vacation days can I roll over?"
    small = search(intern, q, "small")["results"]
    parent = search(intern, q, "parent")["results"]
    assert small and parent
    assert all("\n" not in r["text"] for r in small)                     # "<title>: <sentence>"
    assert all(" > " in r["text"].split("\n", 1)[0] for r in parent)      # "<title> > <heading>\n..."
    assert all(r["matched"] for r in parent)
    assert parent[0]["text"].split("\n", 1)[1].find(parent[0]["matched"].split(": ", 1)[1][:30]) >= 0
    assert len({r["chunk_index"] for r in parent if r["doc_id"] == parent[0]["doc_id"]}) == \
        len([r for r in parent if r["doc_id"] == parent[0]["doc_id"]])   # distinct sections
    trace = search(intern, q, "parent")["trace"][0]
    assert "distinct section" in trace


def test_a_changed_file_replaces_both_cuts_and_a_deleted_one_removes_both(synced, friday, events):
    acme = synced["acme"]
    before = rows(acme, "SELECT count(*) AS n FROM chunks WHERE doc_id = 'HR-LEAVE' AND parent_id IS NOT NULL")[0]["n"]
    friday.apply_event(events[2])                    # HR edits the leave policy: the file gets shorter
    friday.apply_event(events[3])                    # Legal deletes the Q3 planning notes
    with as_tenant("sync", acme):
        report = run_sync(apply=True)
    actions = {d["doc_id"]: d["action"] for d in report["documents"]}
    assert actions["HR-LEAVE"] == "change" and actions["LEAD-Q3-NOTES"] == "remove"
    after = rows(acme, "SELECT count(*) AS n FROM chunks WHERE doc_id = 'HR-LEAVE' AND parent_id IS NOT NULL")[0]["n"]
    assert 0 < after < before
    assert rows(acme, "SELECT count(*) AS n FROM chunks WHERE doc_id = 'LEAD-Q3-NOTES'")[0]["n"] == 0
    stale = rows(acme, """SELECT count(*) AS n FROM chunks WHERE doc_id = 'HR-LEAVE' AND parent_id IS NOT NULL
                          AND text ILIKE '%%5 days%%' AND text ILIKE '%%carry%%'""")[0]["n"]
    assert stale == 0                                # no small chunk still says carry-over is 5 days


def test_a_relabel_reaches_the_small_chunks(synced, friday, events):
    acme = synced["acme"]
    friday.apply_event(events[1])                    # the 2026 policy supersedes the 2023 one: a relabel
    with as_tenant("sync", acme):
        run_sync(apply=True)
    statuses = rows(acme, "SELECT DISTINCT status FROM chunks WHERE doc_id = 'FIN-EXP-2023'")
    assert [r["status"] for r in statuses] == ["superseded"]


def test_small_and_parent_obey_an_access_change_on_the_next_question(synced, client):
    intern, admin = sign_in(client(), "intern@acme.test"), sign_in(client(), "admin@acme.test")
    q = "salary bands senior developer"
    for strategy in ("small", "parent"):
        assert "HR-SALARY-BANDS-2026" in {r["doc_id"] for r in search(intern, q, strategy)["results"]}, strategy
    admin.patch("/admin/documents/HR-SALARY-BANDS-2026", json={"allowed_groups": ["hr"]}, headers=W)
    for strategy in ("small", "parent"):
        assert "HR-SALARY-BANDS-2026" not in {r["doc_id"] for r in search(intern, q, strategy)["results"]}, strategy


def test_parent_re_checks_access_when_it_fetches_the_sections(synced):
    from app.rag.retriever import access_filter
    from conftest import groups_of

    acme = synced["acme"]
    section = rows(acme, "SELECT id FROM chunks WHERE doc_id = 'HR-SALARY-BANDS-2026' AND parent_id IS NULL")[0]["id"]
    with as_tenant("app", acme):
        assert store.by_ids([section], access_filter(groups_of("hr-partner@acme.test")))
        assert store.by_ids([section], access_filter([])) == []           # nobody: nothing
        small = rows(acme, "SELECT id FROM chunks WHERE parent_id = %s", section)[0]["id"]
        assert store.by_ids([small], access_filter(groups_of("hr-partner@acme.test"))) == []   # sections only


def test_the_api_role_cannot_write_a_small_chunk(synced):
    acme = synced["acme"]
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with db.tx("app", acme) as conn:
            conn.execute("UPDATE chunks SET text = 'Salary bands: ask anyone' WHERE parent_id IS NOT NULL")


def test_a_new_cut_reaches_every_document_even_with_the_same_bytes(synced, monkeypatch):
    # Same files, same eTags: before Part 3 the sync said "unchanged" and kept the old cut.
    from app.ingest import sync

    acme = synced["acme"]
    with as_tenant("app", acme):
        before = store.count_small()
    monkeypatch.setattr(sync, "CHILD_MAX_CHARS", 80)
    with as_tenant("sync", acme):
        report = sync.run_sync(apply=True)
    actions = {d["action"] for d in report["documents"] if d["action"] not in ("skip", "quarantine")}
    assert actions == {"change"}
    with as_tenant("app", acme):
        assert store.count_small() > before
    with as_tenant("sync", acme):
        again = sync.run_sync(apply=True)               # and then it is stable again
    assert {d["action"] for d in again["documents"] if d["action"] not in ("skip", "quarantine")} == {"unchanged"}
