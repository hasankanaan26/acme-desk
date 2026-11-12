# ============================================================
# Sign-in and the Principal — who is asking, decided by the server
# ============================================================
# Part 1: "?user=hr-partner" in the request, and the app believed it.
# Part 2: the browser proves who it is with a session cookie, and the
# server works out everything else from its own tables:
#
#   cookie -> session -> user -> tenant -> role -> groups
#
# That chain is the Principal. Routes receive it; they never read an
# identity, a tenant or a group from the request.
#
# authenticate() rules:
#   - one message for every failure ("Email or password is wrong"):
#     the response never tells an attacker which emails exist
#   - the same amount of work whether the account exists or not
#     (passwords.verify() checks a dummy hash)
#   - at most LOGIN_MAX_FAILURES_PER_EMAIL failures per email and
#     LOGIN_MAX_FAILURES_PER_IP per address in 15 minutes
#   - every success and failure is written to audit_log
#
# Where SSO would plug in: instead of the password check, verify the
# identity provider's signed ID token, find the user by
# (auth_provider, external_subject), and create the same session.
# Everything after that line stays as it is.
# ============================================================

from dataclasses import dataclass

from psycopg.types.json import Jsonb

from app import db
from app.auth import passwords, sessions
from app.config import LOGIN_MAX_FAILURES_PER_EMAIL, LOGIN_MAX_FAILURES_PER_IP

WRONG = "Email or password is wrong."
TOO_MANY = "Too many failed sign-ins. Wait 15 minutes and try again."


class LoginError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class Principal:
    user_id: str
    email: str
    display_name: str
    tenant_id: str
    tenant_slug: str
    tenant_name: str
    role: str                                  # "member" | "admin"
    groups: tuple[tuple[str, str], ...]        # ((group_id, name), ...)

    @property
    def group_ids(self) -> list[str]:
        return [g[0] for g in self.groups]

    @property
    def group_names(self) -> list[str]:
        return [g[1] for g in self.groups]

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def public(self) -> dict:
        return {"email": self.email, "display_name": self.display_name, "role": self.role,
                "tenant": {"slug": self.tenant_slug, "name": self.tenant_name}, "groups": self.group_names}


def audit(action: str, actor: str, user_id: str | None = None, target: str | None = None,
          detail: dict | None = None, ip: str | None = None) -> None:
    """One audit row, for the tenant of the current transaction (or none)."""
    db.current().execute(
        "INSERT INTO audit_log (tenant_id, user_id, actor, action, target, detail, ip) "
        "VALUES (app_tenant(), %s, %s, %s, %s, %s, %s)",
        (user_id, actor, action, target, Jsonb(detail or {}), ip))


def _record_attempt(email: str, ip: str | None, ok: bool) -> None:
    db.current().execute("INSERT INTO login_attempts (email, ip, succeeded) VALUES (%s, %s, %s)", (email, ip, ok))


# Purpose:
# Check an email and password. Returns (session token, Principal) or
# raises LoginError. The caller puts the token in a cookie.
#
# A FAILURE IS WRITTEN IN ITS OWN TRANSACTION. Raising inside the
# sign-in transaction would roll back the very row that counts the
# failure, and the rate limit would never see a single one. (The tests
# caught exactly that.) So the check returns a verdict, the transaction
# ends, and only then is a failure recorded and raised.
def authenticate(email: str, password: str, ip: str | None, user_agent: str | None) -> tuple[str, "Principal"]:
    email = (email or "").strip().lower()
    failure: LoginError | None = None
    with db.tx("app") as conn:
        recent = conn.execute("""
            SELECT count(*) FILTER (WHERE email = %s) AS by_email, count(*) FILTER (WHERE ip = %s) AS by_ip
            FROM login_attempts WHERE NOT succeeded AND at > now() - interval '15 minutes'""",
            (email, ip)).fetchone()
        user = membership = None
        if recent["by_email"] >= LOGIN_MAX_FAILURES_PER_EMAIL or recent["by_ip"] >= LOGIN_MAX_FAILURES_PER_IP:
            failure = LoginError(429, TOO_MANY)
        else:
            user = conn.execute("SELECT * FROM users WHERE email = %s", (email,)).fetchone()
            ok = passwords.verify(user["password_hash"] if user else None, password) and bool(user and user["is_active"])
            if ok:
                conn.execute("SELECT set_config('app.user_id', %s, true)", (str(user["id"]),))
                membership = conn.execute("""
                    SELECT m.tenant_id FROM memberships m WHERE m.user_id = %s
                    ORDER BY m.created_at LIMIT 1""", (user["id"],)).fetchone()
            if not ok or not membership:
                failure = LoginError(401, WRONG)

        if failure is None:
            tenant_id = str(membership["tenant_id"])
            conn.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant_id,))
            if passwords.needs_rehash(user["password_hash"]):
                conn.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                             (passwords.hash_password(password), user["id"]))
            conn.execute("UPDATE users SET last_login_at = now() WHERE id = %s", (user["id"],))
            _record_attempt(email, ip, True)
            token = sessions.create(str(user["id"]), tenant_id, ip, user_agent)
            audit("auth.login", email, user_id=str(user["id"]), ip=ip)
            principal = _principal(conn, str(user["id"]), user["email"], user["display_name"], tenant_id)

    if failure is not None:
        with db.tx("app"):
            if failure.status == 401:
                _record_attempt(email, ip, False)
            audit("auth.login_failed" if failure.status == 401 else "auth.login_blocked", email, ip=ip)
        raise failure
    return token, principal


def _principal(conn, user_id: str, email: str, display_name: str, tenant_id: str) -> Principal | None:
    row = conn.execute("""
        SELECT m.role, t.slug, t.name FROM memberships m JOIN tenants t ON t.id = m.tenant_id
        WHERE m.user_id = %s AND m.tenant_id = %s""", (user_id, tenant_id)).fetchone()
    if not row:
        return None  # removed from the tenant since the session started
    groups = conn.execute("""
        SELECT g.id::text AS id, g.name FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = %s ORDER BY g.name""", (user_id,)).fetchall()
    return Principal(user_id=user_id, email=email, display_name=display_name, tenant_id=tenant_id,
                     tenant_slug=row["slug"], tenant_name=row["name"], role=row["role"],
                     groups=tuple((g["id"], g["name"]) for g in groups))


# Purpose:
# The Principal for an account by email, with no password and no
# session. Only for ACME_AUTO_SIGNIN_EMAIL (sign-in switched off).
def principal_for_email(email: str) -> Principal | None:
    with db.tx("app") as conn:
        user = conn.execute("SELECT id, email, display_name, is_active FROM users WHERE email = %s",
                            (email,)).fetchone()
        if not user or not user["is_active"]:
            return None
        conn.execute("SELECT set_config('app.user_id', %s, true)", (str(user["id"]),))
        membership = conn.execute("SELECT tenant_id FROM memberships WHERE user_id = %s "
                                  "ORDER BY created_at LIMIT 1", (user["id"],)).fetchone()
        if not membership:
            return None
        tenant_id = str(membership["tenant_id"])
        conn.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant_id,))
        return _principal(conn, str(user["id"]), user["email"], user["display_name"], tenant_id)


# Purpose:
# The Principal behind a session cookie, or None. Re-read on EVERY
# request: remove someone from the hr group and their very next
# question is answered without hr's documents.
def principal_for(token: str) -> Principal | None:
    with db.tx("app") as conn:
        session = sessions.lookup(token)
        if not session:
            return None
        tenant_id = str(session["tenant_id"])
        conn.execute("SELECT set_config('app.tenant_id', %s, true), set_config('app.user_id', %s, true)",
                     (tenant_id, str(session["user_id"])))
        return _principal(conn, str(session["user_id"]), session["email"], session["display_name"], tenant_id)


def sign_out(token: str, principal: Principal | None, ip: str | None) -> None:
    with db.tx("app", principal.tenant_id if principal else None) as conn:  # noqa: F841
        sessions.delete(token)
        if principal:
            audit("auth.logout", principal.email, user_id=principal.user_id, ip=ip)


def change_password(principal: Principal, token: str, current: str, new: str, ip: str | None) -> None:
    problem = passwords.password_problem(new)
    if problem:
        raise LoginError(422, problem)
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = %s", (principal.user_id,)).fetchone()
        wrong = not passwords.verify(row["password_hash"], current)
    if wrong:  # recorded in its own transaction, then raised (see authenticate)
        with db.tx("app", principal.tenant_id, principal.user_id):
            audit("auth.password_change_failed", principal.email, user_id=principal.user_id, ip=ip)
        raise LoginError(403, "The current password is wrong.")
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        conn.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                     (passwords.hash_password(new), principal.user_id))
        ended = sessions.delete_for_user(principal.user_id, keep=token)  # sign out everywhere else
        audit("auth.password_changed", principal.email, user_id=principal.user_id,
              detail={"other_sessions_ended": ended}, ip=ip)
