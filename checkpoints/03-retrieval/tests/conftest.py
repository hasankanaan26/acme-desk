# ============================================================
# Test setup — a throwaway database, no API keys, no Google account
# ============================================================
# Run from the repository root, with Postgres up:
#   docker compose up -d db
#   pytest checkpoints/02-platform/tests -q
#
# Everything runs against a SEPARATE database, acme_test, on the same
# server as your dev database (same roles, same passwords). It is
# dropped and rebuilt from the migrations at the start of every run,
# so the tests also prove the migrations work from zero.
#
# Two tenants are seeded:
#   acme    the Part 1 library (a temp copy of the local drive) and
#           the five personas plus admin@acme.test
#   globex  a second company with two documents of its own and one
#           person, alice@globex.test, to prove tenants never meet
#
# No Postgres? Every test is skipped with one clear message, not 80
# connection errors.
# ============================================================

import os
import shutil
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

import pytest

CHECKPOINT = Path(__file__).resolve().parents[1]
REPO = CHECKPOINT.parents[1]
TMP = Path(tempfile.mkdtemp(prefix="acme-02-tests-"))
PASSWORD = "correct horse battery staple"   # every test account; 12+ characters


def _test_url(url: str) -> str:
    """The same server and role, database acme_test."""
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    info = conninfo_to_dict(url)
    info["dbname"] = "acme_test"
    return make_conninfo(**info)


def _configured(name: str, default: str) -> str:
    from dotenv import dotenv_values

    return os.environ.get(name) or dotenv_values(REPO / ".env").get(name) or default


ADMIN_URL = _configured("DATABASE_ADMIN_URL", "postgresql://postgres:postgres-local-only@localhost:5433/acme")
os.environ["DATABASE_ADMIN_URL"] = _test_url(ADMIN_URL)
os.environ["DATABASE_APP_URL"] = _test_url(_configured("DATABASE_APP_URL",
                                                       "postgresql://acme_app:app-local-only@localhost:5433/acme"))
os.environ["DATABASE_SYNC_URL"] = _test_url(_configured("DATABASE_SYNC_URL",
                                                        "postgresql://acme_sync:sync-local-only@localhost:5433/acme"))
os.environ["SOURCE"] = "local"
os.environ["SOURCE_DIR"] = str(TMP / "local-drive")
os.environ["ACME_RUNS_DIR"] = str(TMP / "runs")
os.environ["EMBEDDING_PROVIDER"] = "fake"
os.environ["EMBED_RETRY_BASE_SECONDS"] = "0"
os.environ["SYNC_INTERVAL_SECONDS"] = "0"
os.environ["ACME_SEED_PASSWORD"] = PASSWORD
os.environ["ACME_AUTO_SIGNIN_EMAIL"] = ""      # sign-in always on in tests, whatever .env says
os.environ["RETRIEVAL_STRATEGY"] = "hybrid"    # the tests' default, whatever .env says
os.environ["RERANKER"] = "fake"                # shared-word count: no model download in tests
# No paid API, ever: blank every model key, whatever .env holds. (load_dotenv
# never overrides a variable that is already set, even to "".)
for key in ("GEMINI_API_KEY", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"):
    os.environ[key] = ""
sys.path.insert(0, str(CHECKPOINT))

GLOBEX_REGISTER = {"documents": [
    {"doc_id": "GLX-LEAVE", "path": "hr/leave-policy.md", "title": "Globex Leave Policy", "owner": "Globex HR",
     "doc_type": "policy", "topic": "leave", "allowed_groups": ["employees"], "status": "current", "version": 1,
     "effective_from": "2025-01-01"},
    {"doc_id": "GLX-ROADMAP", "path": "strategy/roadmap.md", "title": "Globex Secret Roadmap", "owner": "Globex CEO",
     "doc_type": "meetings", "topic": "roadmap", "allowed_groups": ["employees"], "status": "current", "version": 1,
     "effective_from": "2026-01-01"},
]}
GLOBEX_FILES = {
    "hr/leave-policy.md": "# Globex Leave Policy\n\n## Annual Leave\n\nUnused annual leave can be carried over "
                          "to the next year, up to a maximum of 12 days.\n",
    "strategy/roadmap.md": "# Globex Secret Roadmap\n\n## Project Falcon\n\nGlobex will acquire a rocket company "
                           "in March. The codename is Falcon.\n",
}


def _database_up() -> str | None:
    import psycopg

    try:
        psycopg.connect(ADMIN_URL, connect_timeout=3).close()
        return None
    except Exception as exc:  # noqa: BLE001
        return f"{type(exc).__name__}: {exc}"


def pytest_collection_modifyitems(config, items):
    problem = _database_up()
    if problem:
        skip = pytest.mark.skip(reason=f"Postgres is not reachable (docker compose up -d db): {problem}")
        for item in items:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def tenants():
    """Build acme_test from zero: migrations, both tenants, everyone's accounts."""
    import psycopg
    from psycopg import sql

    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        conn.execute("DROP DATABASE IF EXISTS acme_test WITH (FORCE)")
        conn.execute(sql.SQL("CREATE DATABASE acme_test"))

    import fake_drive
    from app.db import connect_admin
    from app.db.migrate import migrate
    from app.db.seed import seed, upsert_tenant, upsert_user
    from app.ingest.registry import import_register

    migrate()
    fake_drive.reset()
    acme = seed(source=("local", str(TMP / "local-drive")))["tenant_id"]

    globex_dir = TMP / "globex-drive"
    for path, text in GLOBEX_FILES.items():
        (globex_dir / path).parent.mkdir(parents=True, exist_ok=True)
        (globex_dir / path).write_text(text, encoding="utf-8")
    with connect_admin(autocommit=False) as conn, conn.transaction():
        globex = upsert_tenant(conn, "globex", "Globex", "local", str(globex_dir))
        import_register(conn, globex, GLOBEX_REGISTER)
        upsert_user(conn, globex, "alice@globex.test", "Alice (Globex)", ["employees"], password=PASSWORD)
    yield {"acme": acme, "globex": globex}
    from app.db import close_pools

    close_pools()


@pytest.fixture
def friday(tenants):
    """Acme's library back to Friday, its register too, no index; Globex synced; no sessions."""
    import fake_drive
    from app.db import connect_admin

    with connect_admin() as conn:
        conn.execute("UPDATE tenants SET live_index = NULL, previous_index = NULL, sync_paused = false")
        conn.execute("DELETE FROM search_indexes WHERE tenant_id = %s", (tenants["acme"],))
        conn.execute("DELETE FROM sync_runs; DELETE FROM sync_requests; DELETE FROM sessions; "
                     "DELETE FROM login_attempts; DELETE FROM audit_log; DELETE FROM workers; "
                     "DELETE FROM chat_threads; DELETE FROM checkpoint_writes; DELETE FROM checkpoint_blobs; "
                     "DELETE FROM checkpoints; DELETE FROM sync_cursors")
    fake_drive.reset()
    from app.db.seed import seed

    seed(source=("local", str(TMP / "local-drive")))   # personas back to their Part 1 groups
    with as_tenant("sync", tenants["globex"]):
        from app.ingest.sync import run_sync

        run_sync(apply=True, rebuild=True)
    return fake_drive


@pytest.fixture
def events():
    import fake_drive
    return {e["id"]: e for e in fake_drive.load_events()}


@contextmanager
def as_tenant(role: str, tenant_id: str, user_id: str | None = None):
    from app import db

    with db.tx(role, tenant_id, user_id) as conn:
        yield conn


def groups_of(email: str) -> list[str]:
    """A person's group ids, read as the owner (tests only)."""
    from app.db import connect_admin

    with connect_admin() as conn:
        return [r["id"] for r in conn.execute(
            "SELECT gm.group_id::text AS id FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE u.email = %s",
            (email,))]


@pytest.fixture
def client():
    """A fresh browser: its own cookie jar."""
    from fastapi.testclient import TestClient

    from app.main import app

    def make():
        return TestClient(app)
    return make


def sign_in(client, email: str, password: str = PASSWORD):
    r = client.post("/auth/login", json={"email": email, "password": password}, headers={"X-Acme-Request": "1"})
    assert r.status_code == 200, r.text
    return client


W = {"X-Acme-Request": "1"}   # the header every write needs (CSRF guard)


def cleanup():
    shutil.rmtree(TMP, ignore_errors=True)
