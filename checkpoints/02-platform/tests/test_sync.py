# Tests: the sync job on Postgres, against the fake Drive, with the fake embedder.
# The same stories as Part 1's test_sync.py. Each test starts from Friday with
# no Acme index (the `friday` fixture) and runs as the worker's role, acme_sync.

import pytest
from conftest import as_tenant, groups_of

from app.ingest import sync as sync_module
from app.ingest.sync import ModelMismatch, run_sync
from app.rag import catalog, store
from app.rag.retriever import retrieve


def actions(report):
    return {d["doc_id"]: d["action"] for d in report["documents"]}


def sync(tenants, **kwargs):
    with as_tenant("sync", tenants["acme"]):
        return run_sync(**kwargs)


def search(tenants, email, question, top_k=5, as_of=None):
    with as_tenant("app", tenants["acme"]):
        return retrieve(question, groups_of(email), top_k=top_k, as_of=as_of)


def test_first_sync_builds_and_activates_an_index(friday, tenants):
    plan = sync(tenants, apply=False)
    acts = actions(plan)
    assert plan["counts"] == {"add": 18, "quarantine": 1, "skip": 1}   # the Part 1 numbers
    assert acts["ENG-INCIDENT-REPORT"] == "quarantine" and acts["HR-PARENTAL-2027-DRAFT"] == "skip"
    with as_tenant("sync", tenants["acme"]):
        assert catalog.active_name() is None                           # a dry run writes nothing

    report = sync(tenants, apply=True)
    assert report["activated"] is True
    with as_tenant("sync", tenants["acme"]):
        assert store.count() == report["chunks_in_index"] > 0
    again = sync(tenants, apply=False)
    assert set(again["counts"]) <= {"unchanged", "quarantine", "skip"} and again["chunks_to_embed"] == 0


def test_a_file_without_a_register_entry_is_not_indexed(friday, tenants):
    from app.config import SOURCE_DIR

    (SOURCE_DIR / "hr" / "stray-notes.md").write_text("# Stray\n## Secret\nthe bonus pool is $2M\n")
    report = sync(tenants, apply=True)
    stray = [d for d in report["documents"] if d["path"] == "hr/stray-notes.md"]
    assert stray and stray[0]["action"] == "skip"
    assert all("bonus pool" not in c["text"] for c in search(tenants, "hr-partner@acme.test", "bonus pool"))


def test_the_weekend_produces_one_action_per_kind(friday, events, tenants):
    sync(tenants, apply=True)
    for event_id in (1, 2, 3, 4, 5):
        friday.apply_event(events[event_id])
    acts = actions(sync(tenants, apply=False))
    assert acts["FIN-EXP-2026"] == "add"
    assert acts["HR-LEAVE"] == "change"
    assert acts["FIN-EXP-2023"] == "relabel"            # status -> superseded: still a label
    assert acts["FIN-EXP-2024-UPDATE"] == "relabel"
    assert acts["ENG-WIKI-VECTOR-DB"] == "touch"
    assert acts["LEAD-Q3-NOTES"] == "remove"
    # Part 1: "relabel" (the ACL was copied onto every chunk). Part 2: access
    # is checked live at query time, so the sync has nothing to do.
    assert acts["HR-SALARY-BANDS-2026"] == "unchanged"


def test_no_orphans_and_no_ghosts_after_the_weekend(friday, events, tenants):
    sync(tenants, apply=True)
    for event_id in (2, 3):
        friday.apply_event(events[event_id])
    report = sync(tenants, apply=True)
    with as_tenant("sync", tenants["acme"]):
        state = store.index_state()
    planned = next(d for d in report["documents"] if d["doc_id"] == "HR-LEAVE")["chunks"]
    assert state["HR-LEAVE"]["chunks"] == planned
    assert "LEAD-Q3-NOTES" not in state
    texts = " ".join(c["text"] for c in search(tenants, "intern@acme.test", "unpaid leave days per year", 10))
    assert "30 days of unpaid leave" not in texts


def test_the_salary_bands_fix_needs_no_sync_at_all(friday, events, tenants, monkeypatch):
    sync(tenants, apply=True)
    assert any(c["doc_id"] == "HR-SALARY-BANDS-2026"
               for c in search(tenants, "intern@acme.test", "salary range senior developer"))  # mis-shared!
    monkeypatch.setattr(sync_module, "embed_texts", lambda texts: pytest.fail("must not embed"))
    friday.apply_event(events[4])                                  # the register is fixed: hr + managers
    intern = search(tenants, "intern@acme.test", "salary range senior developer")
    hr = search(tenants, "hr-partner@acme.test", "salary range senior developer")
    assert all(c["doc_id"] != "HR-SALARY-BANDS-2026" for c in intern)
    assert "HR-SALARY-BANDS-2026" in {c["doc_id"] for c in hr}


def test_superseded_documents_only_answer_questions_about_the_past(friday, events, tenants):
    sync(tenants, apply=True)
    friday.apply_event(events[1])
    sync(tenants, apply=True)
    today = {c["doc_id"] for c in search(tenants, "intern@acme.test", "team meals per person limit", 10)}
    back_then = {c["doc_id"] for c in search(tenants, "intern@acme.test", "team meals per person limit", 10,
                                             as_of="2023-06-01")}
    assert "FIN-EXP-2026" in today and not today & {"FIN-EXP-2023", "FIN-EXP-2024-UPDATE"}
    assert "FIN-EXP-2023" in back_then and not back_then & {"FIN-EXP-2026", "FIN-EXP-2024-UPDATE"}


def test_a_failed_sync_rolls_back_as_a_whole(friday, events, tenants, monkeypatch):
    sync(tenants, apply=True)
    with as_tenant("sync", tenants["acme"]):
        before = store.index_state()
    friday.apply_event(events[2])   # HR-LEAVE changes
    friday.apply_event(events[3])   # LEAD-Q3-NOTES is deleted

    real_add = store.add_chunks

    def store_dies(chunks, embeddings, collection=None):
        real_add(chunks, embeddings, collection)
        raise ConnectionError("database connection lost halfway")

    monkeypatch.setattr(sync_module.store, "add_chunks", store_dies)
    with pytest.raises(ConnectionError):
        sync(tenants, apply=True)
    with as_tenant("sync", tenants["acme"]):
        after = store.index_state()
    # Part 1 could lose HR-LEAVE here (deleted, then the insert failed). One
    # transaction: the delete of LEAD-Q3-NOTES and of the old HR-LEAVE rolled back too.
    assert after == before


def test_changing_the_embedding_model_requires_a_rebuild(friday, tenants):
    sync(tenants, apply=True)
    with as_tenant("sync", tenants["acme"]):
        first = catalog.active_name()
        catalog.record_collection(first, {"embedding_model": "gemini:gemini-embedding-001"})
    with pytest.raises(ModelMismatch):
        sync(tenants, apply=True)
    report = sync(tenants, apply=True, rebuild=True)
    with as_tenant("sync", tenants["acme"]):
        assert report["activated"] and catalog.active_name() != first
        assert catalog.rollback() == first
