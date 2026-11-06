# Tests: the sync job against the fake SharePoint, with the fake embedder.
# Each test starts from Friday with no index (the `friday` fixture).

import pytest

from app.config import SOURCE_DIR
from app.ingest import sync as sync_module
from app.ingest.sync import ModelMismatch, run_sync
from app.rag import catalog, store
from app.rag.retriever import retrieve


def actions(report):
    return {d["doc_id"]: d["action"] for d in report["documents"]}


def test_first_sync_builds_and_activates_an_index(friday):
    plan = run_sync(apply=False)
    acts = actions(plan)
    assert acts["ENG-INCIDENT-REPORT"] == "quarantine"       # the scan
    assert acts["HR-PARENTAL-2027-DRAFT"] == "skip"           # the draft
    assert acts["HR-LEAVE"] == "add"
    assert catalog.active_name() is None                      # a dry run writes nothing

    report = run_sync(apply=True)
    assert report["activated"] is True
    assert store.count() == report["chunks_in_index"] > 0
    # Nothing changed at the source: the next run does nothing at all.
    again = run_sync(apply=False)
    assert set(again["counts"]) <= {"unchanged", "quarantine", "skip"}
    assert again["chunks_to_embed"] == 0


def test_a_file_without_a_register_entry_is_not_indexed(friday):
    (SOURCE_DIR / "hr" / "stray-notes.md").write_text("# Stray\n## Secret\nthe bonus pool is $2M\n")
    report = run_sync(apply=True)
    stray = [d for d in report["documents"] if d["path"] == "hr/stray-notes.md"]
    assert stray and stray[0]["action"] == "skip"
    assert not retrieve("bonus pool", user="hr-partner", top_k=5) or all(
        "bonus pool" not in c["text"] for c in retrieve("bonus pool", user="hr-partner", top_k=5))


def test_the_weekend_produces_one_action_per_kind(friday, events):
    run_sync(apply=True)
    for event_id in (1, 2, 3, 4, 5):
        friday.apply_event(events[event_id])
    acts = actions(run_sync(apply=False))
    assert acts["FIN-EXP-2026"] == "add"
    assert acts["HR-LEAVE"] == "change"
    assert acts["FIN-EXP-2023"] == "relabel"
    assert acts["FIN-EXP-2024-UPDATE"] == "relabel"
    assert acts["HR-SALARY-BANDS-2026"] == "relabel"
    assert acts["ENG-WIKI-VECTOR-DB"] == "touch"
    assert acts["LEAD-Q3-NOTES"] == "remove"


def test_no_orphans_and_no_ghosts_after_the_weekend(friday, events):
    run_sync(apply=True)
    for event_id in (2, 3):
        friday.apply_event(events[event_id])
    report = run_sync(apply=True)
    state = store.index_state()
    planned = next(d for d in report["documents"] if d["doc_id"] == "HR-LEAVE")["chunks"]
    assert state["HR-LEAVE"]["chunks"] == planned            # old extra chunks are gone
    assert "LEAD-Q3-NOTES" not in state                      # withdrawn means gone
    texts = " ".join(c["text"] for c in retrieve("unpaid leave days per year", user="intern", top_k=10))
    assert "30 days of unpaid leave" not in texts


def test_permissions_change_without_reembedding(friday, events, monkeypatch):
    run_sync(apply=True)
    assert any(c["doc_id"] == "HR-SALARY-BANDS-2026"
               for c in retrieve("salary range senior developer", user="intern", top_k=5))  # mis-shared!
    friday.apply_event(events[4])
    monkeypatch.setattr(sync_module, "embed_texts", lambda texts: pytest.fail("must not embed") if texts else [])
    run_sync(apply=True)
    intern = retrieve("salary range senior developer", user="intern", top_k=5)
    hr = retrieve("salary range senior developer", user="hr-partner", top_k=5)
    assert all(c["doc_id"] != "HR-SALARY-BANDS-2026" for c in intern)
    assert "HR-SALARY-BANDS-2026" in {c["doc_id"] for c in hr}


def test_superseded_documents_only_answer_questions_about_the_past(friday, events):
    run_sync(apply=True)
    friday.apply_event(events[1])
    run_sync(apply=True)
    today = {c["doc_id"] for c in retrieve("team meals per person limit", user="intern", top_k=10)}
    back_then = {c["doc_id"] for c in retrieve("team meals per person limit", user="intern", top_k=10,
                                               as_of="2023-06-01")}
    assert "FIN-EXP-2026" in today and not today & {"FIN-EXP-2023", "FIN-EXP-2024-UPDATE"}
    assert "FIN-EXP-2023" in back_then and not back_then & {"FIN-EXP-2026", "FIN-EXP-2024-UPDATE"}


def test_a_failed_embedding_leaves_the_index_untouched(friday, events, monkeypatch):
    run_sync(apply=True)
    before = store.index_state()["HR-LEAVE"]["content_hash"]
    friday.apply_event(events[2])

    def outage(texts):
        raise ConnectionError("embedding API down")

    monkeypatch.setattr(sync_module, "embed_texts", outage)
    with pytest.raises(ConnectionError):
        run_sync(apply=True)
    assert store.index_state()["HR-LEAVE"]["content_hash"] == before   # old version still served


def test_changing_the_embedding_model_requires_a_rebuild(friday):
    run_sync(apply=True)
    first = catalog.active_name()
    catalog.record_collection(first, {"embedding_model": "gemini:gemini-embedding-001"})
    with pytest.raises(ModelMismatch):
        run_sync(apply=True)
    report = run_sync(apply=True, rebuild=True)
    assert report["activated"] and catalog.active_name() != first
    assert catalog.rollback() == first
