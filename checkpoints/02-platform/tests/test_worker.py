# Tests: the sync worker — runs recorded in tables, one sync per tenant at a time.

import psycopg
from conftest import W, as_tenant, sign_in

from app.config import DATABASE_SYNC_URL
from app.ingest import sync as sync_module
from app.ingest import worker


def acme(tenants):
    with as_tenant("sync", tenants["acme"]) as conn:
        return conn.execute("SELECT * FROM tenants WHERE id = app_tenant()").fetchone()


def test_a_run_is_recorded_with_its_plan(friday, tenants):
    result = worker.run_tenant(acme(tenants), trigger="tick")
    assert result["error"] is None and result["report"]["counts"]["add"] == 18
    with as_tenant("app", tenants["acme"]) as conn:
        row = conn.execute("SELECT * FROM sync_runs WHERE id = %s", (result["run_id"],)).fetchone()
        status = worker.status()
    assert row["ok"] is True and row["counts"]["add"] == 18 and row["report"]["documents"]
    assert status["runs"] == 1 and status["last_summary"]["chunks_in_index"] == row["chunks_in_index"]


def test_only_one_sync_per_tenant_at_a_time(friday, tenants):
    # Another worker holds the tenant's lock (as if it were mid-sync).
    with psycopg.connect(DATABASE_SYNC_URL) as other:
        other.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (f"acme.sync:{tenants['acme']}",))
        result = worker.run_tenant(acme(tenants), trigger="tick")
    assert result["skipped"] == "another sync of this tenant is running" and result["report"] is None
    assert worker.run_tenant(acme(tenants), trigger="tick")["error"] is None   # lock released: it runs


def test_a_failed_run_is_recorded_and_the_worker_carries_on(friday, tenants, monkeypatch):
    def outage(texts):
        raise ConnectionError("embedding API down")

    monkeypatch.setattr(sync_module, "embed_texts", outage)
    result = worker.run_tenant(acme(tenants), trigger="tick")               # does not raise
    assert result["error"].startswith("ConnectionError")
    with as_tenant("app", tenants["acme"]) as conn:
        assert conn.execute("SELECT count(*) AS n FROM chunks").fetchone()["n"] == 0
        assert worker.status()["errors"] == 1


def test_run_now_from_the_api_reaches_the_worker(friday, tenants, client):
    admin = sign_in(client(), "admin@acme.test")
    assert admin.post("/sync/now", headers=W).json()["pending_requests"] == 1
    claim = worker.claim_requests(tenants["acme"])
    assert claim and claim["requested_by"] is not None
    assert worker.claim_requests(tenants["acme"]) is None                   # claimed once, never twice


def test_pause_skips_ticks_but_not_run_now(friday, tenants, client):
    admin = sign_in(client(), "admin@acme.test")
    assert admin.post("/sync/pause", headers=W).json()["paused"] is True
    admin.post("/sync/now", headers=W)
    worker.loop(interval=3600, once=False, stop=_stop_after_one_round())
    with as_tenant("app", tenants["acme"]) as conn:
        triggers = [r["trigger"] for r in conn.execute("SELECT trigger FROM sync_runs")]
    assert triggers == ["manual"]


def _stop_after_one_round():
    import threading

    class OneRound(threading.Event):
        def __init__(self):
            super().__init__()
            self.rounds = 0

        def is_set(self):
            self.rounds += 1
            return self.rounds > 1

    return OneRound()
