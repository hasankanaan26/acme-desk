# Tests: the change gate — a quiet tick asks Drive's change log once and walks nothing.
#
# The Acme tenant is played by the fake Drive from test_connector_drive.py,
# with its register in Postgres (DbRegister), through the worker's own
# run_tenant(): the same path a real tick takes.

import pytest
from conftest import as_tenant
from test_connector_drive import connector, seed_drive

from app.db import connect_admin
from app.ingest import sync as sync_module
from app.ingest import worker
from app.ingest.registry import DbRegister


@pytest.fixture
def drive(friday, tenants, monkeypatch):
    """Acme on a fake Drive: every run gets a fresh connector (so its call count is that run's alone)."""
    fake = seed_drive()
    monkeypatch.setattr(worker, "make_connector", lambda tenant: DbRegister(connector(fake)))
    return fake


def tick(tenants, trigger="tick"):
    with as_tenant("sync", tenants["acme"]) as conn:
        tenant = conn.execute("SELECT * FROM tenants WHERE id = app_tenant()").fetchone()
    return worker.run_tenant(tenant, trigger=trigger)


def walked(fake) -> int:
    return sum(1 for c in fake.calls if c[0] == "list")


def test_first_tick_takes_a_bookmark_and_syncs(drive, tenants):
    result = tick(tenants)
    assert result["error"] is None and result["report"]["counts"]["add"] == 18
    assert result["gate"]["decision"] == "run" and "bookmark taken" in result["gate"]["reason"]
    with as_tenant("sync", tenants["acme"]) as conn:
        cursor = conn.execute("SELECT * FROM sync_cursors").fetchone()
    assert cursor["page_token"] == "0" and cursor["live_index"] and cursor["full_sync_due_at"]


def test_a_quiet_tick_is_skipped_after_one_call(drive, tenants):
    tick(tenants)
    drive.calls.clear()
    result = tick(tenants)
    assert result["skipped"] == "nothing changed in Drive or the register since the last sync"
    assert result["report"] is None
    assert drive.calls == [("changes", "0")]          # one question, no walk, no download
    assert result["gate"]["drive_calls"] == 1 and result["gate"]["changes"] == 0
    with as_tenant("app", tenants["acme"]):
        gate = worker.status()["gate"]
    assert gate["last_decision"] == "skip" and gate["skipped_since_last_sync"] == 1
    assert gate["check_calls"] == 1 and gate["walk_calls"] > 1


def test_an_edit_in_drive_opens_the_gate_and_only_then(drive, tenants):
    tick(tenants)
    faq = drive.blobs["file-company-company-faq.md"] + b"\n\n## Parking\n\nBadge holders park on level 2.\n"
    drive.replace_bytes("file-company-company-faq.md", faq)
    result = tick(tenants)
    assert result["gate"]["decision"] == "run" and result["gate"]["changes"] == 1
    assert result["gate"]["changed_files"] == [{"name": "company-faq.md", "kind": "changed"}]
    assert result["report"]["counts"]["change"] == 1
    assert tick(tenants)["skipped"]                    # the bookmark moved past the edit: quiet again


def test_a_trashed_file_opens_the_gate(drive, tenants):
    tick(tenants)
    drive.trash("file-leadership-q3-planning-notes.md")
    result = tick(tenants)
    assert result["gate"]["changed_files"][0]["kind"] == "trashed"
    assert result["report"]["counts"]["remove"] == 1


def test_a_register_edit_opens_the_gate_without_any_drive_change(drive, tenants):
    tick(tenants)
    with connect_admin() as conn:
        conn.execute("UPDATE documents SET status = 'withdrawn', updated_at = now() "
                     "WHERE tenant_id = %s AND doc_id = 'HR-REMOTE'", (tenants["acme"],))
    result = tick(tenants)
    assert result["gate"]["changes"] == 0 and result["gate"]["register_changed"] is True
    assert {d["doc_id"]: d["action"] for d in result["report"]["documents"]}["HR-REMOTE"] == "remove"


def test_run_now_always_syncs(drive, tenants):
    tick(tenants)
    result = tick(tenants, trigger="manual")
    assert result["report"] is not None and "gate is bypassed" in result["gate"]["reason"]


def test_a_failed_sync_leaves_the_bookmark_where_it_was(drive, tenants, monkeypatch):
    tick(tenants)
    drive.replace_bytes("file-company-company-faq.md", drive.blobs["file-company-company-faq.md"] + b"\n\nMore.\n")

    def outage(texts):
        raise ConnectionError("embedding API down")

    monkeypatch.setattr(sync_module, "embed_texts", outage)
    assert tick(tenants)["error"].startswith("ConnectionError")
    with as_tenant("sync", tenants["acme"]) as conn:
        assert conn.execute("SELECT page_token FROM sync_cursors").fetchone()["page_token"] == "0"

    monkeypatch.undo()                                 # the API is back (and the fake Drive with it)
    monkeypatch.setattr(worker, "make_connector", lambda tenant: DbRegister(connector(drive)))
    result = tick(tenants)
    assert result["gate"]["changes"] == 1 and result["report"]["counts"]["change"] == 1


def test_the_safety_net_runs_a_full_sync_when_due(drive, tenants):
    tick(tenants)
    with connect_admin() as conn:
        conn.execute("UPDATE sync_cursors SET full_sync_due_at = now() - interval '1 minute'")
    drive.calls.clear()
    result = tick(tenants)
    assert result["gate"]["reason"].startswith("safety net") and result["report"] is not None
    assert walked(drive) == 8


def test_an_unreadable_change_log_fails_open(drive, tenants):
    tick(tenants)
    drive.log_down = True
    result = tick(tenants)
    assert result["report"] is not None and "could not be read" in result["gate"]["reason"]
    with as_tenant("sync", tenants["acme"]) as conn:
        assert conn.execute("SELECT page_token FROM sync_cursors").fetchone()["page_token"] == "0"


def test_a_source_without_a_change_log_syncs_every_tick(friday, tenants):
    first, second = tick(tenants), tick(tenants)        # the local folder: no change log
    assert first["report"] and second["report"]
    assert second["gate"]["change_log"] is False and second["gate"]["decision"] == "run"
