# Tests: sign-in, sessions, and the admin's guard rails.

import pytest
from conftest import PASSWORD, W, sign_in

from app.config import SESSION_COOKIE


def login(c, email, password=PASSWORD, headers=W):
    return c.post("/auth/login", json={"email": email, "password": password}, headers=headers)


def admin_user_id(admin, email):
    return next(u["id"] for u in admin.get("/admin/users").json() if u["email"] == email)


# ---- Signing in ----

def test_a_correct_password_sets_a_safe_cookie(friday, client):
    r = login(client(), "intern@acme.test")
    assert r.status_code == 200 and r.json()["groups"] == ["employees", "engineering"]
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie


def test_a_wrong_password_and_an_unknown_email_look_the_same(friday, client):
    wrong = login(client(), "intern@acme.test", "not the password at all")
    unknown = login(client(), "nobody@acme.test", "not the password at all")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Email or password is wrong."}


def test_writes_need_the_csrf_header(friday, client):
    assert login(client(), "intern@acme.test", headers={}).status_code == 403
    c = sign_in(client(), "admin@acme.test")
    assert c.post("/sync/now").status_code == 403
    assert c.patch("/admin/documents/HR-LEAVE", json={"allowed_groups": ["employees"]}).status_code == 403


def test_five_failures_lock_the_email_even_against_the_right_password(friday, client):
    c = client()
    for _ in range(5):
        assert login(c, "finance-lead@acme.test", "guessing-passwords").status_code == 401
    r = login(c, "finance-lead@acme.test")
    assert r.status_code == 429
    assert login(client(), "intern@acme.test").status_code == 200        # other accounts are unaffected


def test_nothing_without_a_session(friday, client):
    c = client()
    for path in ("/search?q=leave", "/documents", "/auth/me", "/admin/users", "/sync/status"):
        assert c.get(path).status_code == 401, path


def test_a_forged_cookie_is_nobody(friday, client):
    c = client()
    c.cookies.set(SESSION_COOKIE, "made-up-token")
    assert c.get("/auth/me").status_code == 401


# ---- Sessions end ----

def test_sign_out_kills_the_session_on_the_server(friday, client):
    c = sign_in(client(), "intern@acme.test")
    token = c.cookies.get(SESSION_COOKIE)
    c.post("/auth/logout", headers=W)
    replay = client()
    replay.cookies.set(SESSION_COOKIE, token)              # someone kept a copy of the cookie
    assert replay.get("/auth/me").status_code == 401


def test_changing_your_password_signs_out_your_other_sessions(friday, client):
    laptop, phone = sign_in(client(), "eng-manager@acme.test"), sign_in(client(), "eng-manager@acme.test")
    r = laptop.post("/auth/password", json={"current_password": PASSWORD, "new_password": "a brand new passphrase"},
                    headers=W)
    assert r.status_code == 200
    assert laptop.get("/auth/me").status_code == 200 and phone.get("/auth/me").status_code == 401
    assert login(client(), "eng-manager@acme.test").status_code == 401
    assert login(client(), "eng-manager@acme.test", "a brand new passphrase").status_code == 200


def test_short_passwords_are_refused(friday, client):
    c = sign_in(client(), "intern@acme.test")
    r = c.post("/auth/password", json={"current_password": PASSWORD, "new_password": "short"}, headers=W)
    assert r.status_code == 422


# ---- Admins ----

def test_members_cannot_use_the_admin_api(friday, client):
    c = sign_in(client(), "hr-partner@acme.test")
    assert c.get("/admin/users").status_code == 403
    assert c.patch("/admin/documents/HR-SALARY-BANDS-2026", json={"allowed_groups": ["employees"]},
                   headers=W).status_code == 403
    assert c.post("/sync/now", headers=W).status_code == 403


def test_an_admin_adds_a_person_who_can_then_sign_in(friday, client):
    admin = sign_in(client(), "admin@acme.test")
    r = admin.post("/admin/users", headers=W, json={"email": "Nadia@Acme.test", "display_name": "Nadia",
                                                    "password": "welcome to acme desk", "groups": ["employees", "hr"]})
    assert r.status_code == 201 and r.json()["groups"] == ["employees", "hr"]
    nadia = client()
    assert login(nadia, "nadia@acme.test", "welcome to acme desk").status_code == 200   # emails are case-insensitive
    assert nadia.get("/auth/me").json()["groups"] == ["employees", "hr"]


def test_removing_a_person_ends_their_session_now(friday, client):
    admin, rep = sign_in(client(), "admin@acme.test"), sign_in(client(), "sales-rep@acme.test")
    assert admin.delete(f"/admin/users/{admin_user_id(admin, 'sales-rep@acme.test')}", headers=W).status_code == 200
    assert rep.get("/auth/me").status_code == 401
    assert login(client(), "sales-rep@acme.test").status_code == 401


def test_a_deactivated_person_cannot_sign_in(friday, client):
    admin, lead = sign_in(client(), "admin@acme.test"), sign_in(client(), "finance-lead@acme.test")
    admin.patch(f"/admin/users/{admin_user_id(admin, 'finance-lead@acme.test')}", json={"is_active": False}, headers=W)
    assert lead.get("/auth/me").status_code == 401
    assert login(client(), "finance-lead@acme.test").status_code == 401


def test_an_admin_cannot_lock_themselves_out(friday, client):
    admin = sign_in(client(), "admin@acme.test")
    me = admin_user_id(admin, "admin@acme.test")
    assert admin.patch(f"/admin/users/{me}", json={"role": "member"}, headers=W).status_code == 409
    assert admin.delete(f"/admin/users/{me}", headers=W).status_code == 409


def test_an_admin_cannot_reset_the_password_of_someone_from_another_tenant(friday, client, tenants):
    acme_admin = sign_in(client(), "admin@acme.test")
    # Alice (Globex) also joins Acme. Her password is hers, not Acme's admin's.
    r = acme_admin.post("/admin/users", headers=W, json={"email": "alice@globex.test", "display_name": "ignored",
                                                         "password": "ignored-for-existing", "groups": ["employees"]})
    assert r.status_code == 201 and r.json()["other_tenants"] is True
    alice = r.json()["id"]
    assert acme_admin.patch(f"/admin/users/{alice}", json={"password": "acme admin takes over"},
                            headers=W).status_code == 409
    assert acme_admin.patch(f"/admin/users/{alice}", json={"groups": ["employees", "sales"]}, headers=W).status_code == 200
    assert login(client(), "alice@globex.test").status_code == 200    # her own password still works
    acme_admin.delete(f"/admin/users/{alice}", headers=W)


# ---- What is stored ----

def test_the_database_holds_hashes_not_secrets(friday, client):
    from app.db import connect_admin

    c = sign_in(client(), "intern@acme.test")
    token = c.cookies.get(SESSION_COOKIE)
    with connect_admin() as conn:
        pw = conn.execute("SELECT password_hash FROM users WHERE email = 'intern@acme.test'").fetchone()["password_hash"]
        stored = [bytes(r["token_hash"]) for r in conn.execute("SELECT token_hash FROM sessions")]
    assert pw.startswith("$argon2id$") and PASSWORD not in pw
    assert token.encode() not in stored and len(stored[0]) == 32


def test_every_sign_in_and_search_is_audited(friday, client):
    c = sign_in(client(), "intern@acme.test")
    login(client(), "intern@acme.test", "a wrong password here")
    c.get("/search", params={"q": "vacation"})
    admin = sign_in(client(), "admin@acme.test")
    actions = [(e["actor"], e["action"]) for e in admin.get("/admin/audit").json()]
    assert ("intern@acme.test", "auth.login") in actions
    assert ("intern@acme.test", "search") in actions
    assert ("intern@acme.test", "auth.login_failed") not in actions   # unknown tenant at that point: not in Acme's log


@pytest.mark.parametrize("path", ["/login", "/ui"])
def test_the_pages_load(friday, client, path):
    assert client().get(path).status_code == 200
