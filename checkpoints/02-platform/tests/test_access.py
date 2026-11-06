# Tests: who can see what, enforced by the database.
#   - access changes are live (no sync, no embedding)
#   - tenants never see each other, even if the code forgets to filter
#   - each database role can do its job and nothing else

import psycopg
import pytest
from conftest import W, as_tenant, groups_of, sign_in

from app.ingest import sync as sync_module
from app.ingest.sync import run_sync
from app.rag.retriever import retrieve


@pytest.fixture
def synced(friday, tenants):
    with as_tenant("sync", tenants["acme"]):
        run_sync(apply=True)
    return tenants


def doc_ids(response):
    return {r["doc_id"] for r in response.json()["results"]}


# ---- Live access ----

def test_an_admin_access_change_is_live_without_a_sync(synced, client, monkeypatch):
    monkeypatch.setattr(sync_module, "embed_texts", lambda texts: pytest.fail("must not embed"))
    intern, admin = sign_in(client(), "intern@acme.test"), sign_in(client(), "admin@acme.test")
    q = {"q": "salary range senior developer", "top_k": 5}
    assert "HR-SALARY-BANDS-2026" in doc_ids(intern.get("/search", params=q))          # Friday's mis-share
    r = admin.patch("/admin/documents/HR-SALARY-BANDS-2026", json={"allowed_groups": ["hr", "managers"]}, headers=W)
    assert r.status_code == 200 and r.json()["access_change"] == "live now"
    assert "HR-SALARY-BANDS-2026" not in doc_ids(intern.get("/search", params=q))      # the next search obeys it


def test_a_group_change_is_live_on_the_next_question(synced, client):
    intern, admin = sign_in(client(), "intern@acme.test"), sign_in(client(), "admin@acme.test")
    admin.patch("/admin/documents/HR-SALARY-BANDS-2026", json={"allowed_groups": ["hr"]}, headers=W)
    q = {"q": "salary range senior developer", "top_k": 5}
    assert "HR-SALARY-BANDS-2026" not in doc_ids(intern.get("/search", params=q))
    uid = next(u["id"] for u in admin.get("/admin/users").json() if u["email"] == "intern@acme.test")
    admin.patch(f"/admin/users/{uid}", json={"groups": ["employees", "engineering", "hr"]}, headers=W)
    assert "HR-SALARY-BANDS-2026" in doc_ids(intern.get("/search", params=q))          # same session, new groups
    admin.patch(f"/admin/users/{uid}", json={"groups": ["employees", "engineering"]}, headers=W)
    assert "HR-SALARY-BANDS-2026" not in doc_ids(intern.get("/search", params=q))


def test_a_person_with_no_groups_reads_nothing(synced, client):
    admin = sign_in(client(), "admin@acme.test")
    uid = next(u["id"] for u in admin.get("/admin/users").json() if u["email"] == "sales-rep@acme.test")
    admin.patch(f"/admin/users/{uid}", json={"groups": []}, headers=W)
    rep = sign_in(client(), "sales-rep@acme.test")
    assert rep.get("/search", params={"q": "vacation days"}).json()["results"] == []
    assert rep.get("/documents").json()["documents"] == []


def test_members_do_not_even_see_titles_they_cannot_read(synced, client):
    admin = sign_in(client(), "admin@acme.test")
    admin.patch("/admin/documents/HR-SALARY-BANDS-2026", json={"allowed_groups": ["hr"]}, headers=W)
    intern = sign_in(client(), "intern@acme.test")
    assert "HR-SALARY-BANDS-2026" not in {d["doc_id"] for d in intern.get("/documents").json()["documents"]}
    listed = {d["doc_id"]: d for d in admin.get("/documents").json()["documents"]}
    assert listed["HR-SALARY-BANDS-2026"]["readable_by_you"] is False                  # admin sees it exists


# ---- Tenants ----

def test_the_same_question_gets_each_tenants_own_answer(synced, client):
    acme, globex = sign_in(client(), "intern@acme.test"), sign_in(client(), "alice@globex.test")
    q = {"q": "unused leave can be carried over to the next year", "top_k": 1}
    assert doc_ids(globex.get("/search", params=q)) == {"GLX-LEAVE"}
    acme_ids = doc_ids(acme.get("/search", params={**q, "top_k": 5}))
    assert "HR-LEAVE" in acme_ids and "GLX-LEAVE" not in acme_ids


def test_nothing_crosses_tenants_whatever_the_question(synced, client):
    acme, globex = sign_in(client(), "admin@acme.test"), sign_in(client(), "alice@globex.test")
    for q in ("Project Falcon rocket acquisition", "secret roadmap", "salary bands"):
        assert not doc_ids(acme.get("/search", params={"q": q, "top_k": 20})) & {"GLX-LEAVE", "GLX-ROADMAP"}
        assert doc_ids(globex.get("/search", params={"q": q, "top_k": 20})) <= {"GLX-LEAVE", "GLX-ROADMAP"}
    assert {u["email"] for u in acme.get("/admin/users").json()}.isdisjoint({"alice@globex.test"})


def test_row_level_security_hides_everything_without_a_tenant(synced):
    from app import db

    with db.tx("app") as conn:   # no tenant set: a bug that forgot it
        for table in ("chunks", "documents", "document_acl", "groups", "search_indexes", "sync_runs"):
            assert conn.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"] == 0, table


def test_row_level_security_scopes_a_query_with_no_where_clause(synced):
    with as_tenant("app", synced["globex"]) as conn:
        ids = {r["doc_id"] for r in conn.execute("SELECT DISTINCT doc_id FROM chunks")}   # no tenant filter written
    assert ids == {"GLX-LEAVE", "GLX-ROADMAP"}


def test_search_by_raw_group_ids_of_another_tenant_finds_nothing(synced):
    # Even handed Acme's group ids, a Globex transaction cannot reach Acme's rows.
    with as_tenant("app", synced["globex"]):
        assert retrieve("salary range senior developer", groups_of("hr-partner@acme.test"), top_k=5) == []


def test_a_group_cannot_contain_a_member_of_another_tenant(synced):
    from app.db import connect_admin

    with connect_admin() as conn, pytest.raises(psycopg.errors.ForeignKeyViolation):
        conn.execute("""INSERT INTO group_members (tenant_id, group_id, user_id)
                        SELECT g.tenant_id, g.id, u.id FROM groups g, users u
                        WHERE g.tenant_id = %s AND g.name = 'employees' AND u.email = 'alice@globex.test'""",
                     (synced["acme"],))


# ---- Database roles: least privilege ----

def test_the_api_role_cannot_write_the_index(synced):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with as_tenant("app", synced["acme"]) as conn:
            conn.execute("DELETE FROM chunks")


@pytest.mark.parametrize("table", ["users", "sessions", "groups", "group_members", "document_acl", "login_attempts"])
def test_the_worker_role_cannot_read_identities(synced, table):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with as_tenant("sync", synced["acme"]) as conn:
            conn.execute(f"SELECT * FROM {table} LIMIT 1")


def test_the_api_role_cannot_change_who_owns_the_live_index(synced):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with as_tenant("app", synced["acme"]) as conn:
            conn.execute("UPDATE tenants SET live_index = NULL")
