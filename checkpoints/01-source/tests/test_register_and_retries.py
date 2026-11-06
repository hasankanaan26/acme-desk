# Tests: the register's rules, identities, and retry with backoff.

import pytest

from app.ingest.register import (
    RegisterError,
    can_read,
    dependents_of,
    groups_for,
    load_register,
    register_warnings,
)
from app.rag.embedder import with_retries


def entry(doc_id, path, **extra):
    base = {"doc_id": doc_id, "path": path, "title": doc_id, "owner": "o", "doc_type": "policy",
            "allowed_groups": ["employees"], "status": "current", "effective_from": "2025-01-01"}
    return {**base, **extra}


def test_a_register_entry_needs_permissions():
    with pytest.raises(RegisterError):
        load_register({"documents": [entry("A", "a.md", allowed_groups=[])]})


def test_duplicate_ids_and_unknown_statuses_are_rejected():
    with pytest.raises(RegisterError):
        load_register({"documents": [entry("A", "a.md"), entry("A", "b.md")]})
    with pytest.raises(RegisterError):
        load_register({"documents": [entry("A", "a.md", status="final")]})


def test_drafts_and_withdrawn_documents_are_never_indexable():
    entries = load_register({"documents": [entry("A", "a.md", status="draft"),
                                           entry("B", "b.md", status="withdrawn"),
                                           entry("C", "c.md", status="superseded", superseded_by="A")]})
    assert [e.indexable for e in entries.values()] == [False, False, True]


def test_two_unlinked_current_documents_on_one_topic_get_a_warning():
    entries = load_register({"documents": [entry("A", "a.md", topic="onboarding"),
                                           entry("B", "b.md", topic="onboarding"),
                                           entry("C", "c.md", topic="expenses"),
                                           entry("D", "d.md", topic="expenses", amends="C")]})
    warnings = register_warnings(entries)
    assert len(warnings) == 1 and "onboarding" in warnings[0]


def test_dependents_are_found():
    entries = load_register({"documents": [entry("POLICY", "p.md"), entry("FAQ", "f.md", depends_on=["POLICY"])]})
    assert [(d.doc_id, dep) for d, dep in dependents_of({"POLICY"}, entries)] == [("FAQ", "POLICY")]


def test_unknown_users_fail_closed():
    identities = {"intern": {"groups": ["employees"]}}
    assert groups_for("intern", identities) == ["employees"]
    with pytest.raises(PermissionError):
        groups_for("ceo", identities)
    assert can_read(["hr", "managers"], ["employees", "managers"])
    assert not can_read(["hr", "managers"], ["employees", "engineering"])


def test_retries_recover_from_transient_failures():
    calls = {"n": 0}

    def flaky(x):
        calls["n"] += 1
        if calls["n"] < 3:
            raise ConnectionError("429 Too Many Requests")
        return x * 2

    assert with_retries(flaky, 21, max_attempts=5, base_seconds=0, sleep=lambda s: None) == 42
    assert calls["n"] == 3


def test_retries_give_up_loudly():
    def always_down():
        raise TimeoutError("down")

    with pytest.raises(TimeoutError):
        with_retries(always_down, max_attempts=3, base_seconds=0, sleep=lambda s: None)
