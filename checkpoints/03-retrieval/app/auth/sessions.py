# ============================================================
# Sessions — who is signed in
# ============================================================
# After a correct password the browser gets a cookie holding a random
# 256-bit token. The database stores only the token's SHA-256, so a
# copy of the sessions table cannot be replayed as cookies.
#
# A session dies when:
#   - nobody used it for SESSION_IDLE_MINUTES       (idle timeout)
#   - SESSION_MAX_HOURS passed since sign-in         (absolute limit)
#   - the user signs out, or changes their password
#   - an admin removes the user, or deactivates them
#
# Why not a JWT? A JWT cannot be taken back before it expires: sign
# out, remove a user, and their token still works. A row in a table
# can be deleted. Tokens make sense between services; for a browser,
# a server-side session is simpler and safer.
#
# The cookie is HttpOnly (JavaScript cannot read it, so an XSS bug
# cannot steal it), SameSite=Lax (other sites cannot make the browser
# send it with their POSTs) and Secure on HTTPS (COOKIE_SECURE=true).
# ============================================================

import hashlib
import secrets

from app import db
from app.config import SESSION_IDLE_MINUTES, SESSION_MAX_HOURS


def token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode("utf-8")).digest()


def create(user_id: str, tenant_id: str, ip: str | None, user_agent: str | None) -> str:
    token = secrets.token_urlsafe(32)
    db.current().execute("""
        INSERT INTO sessions (token_hash, user_id, tenant_id, expires_at, ip, user_agent)
        VALUES (%s, %s, %s, now() + make_interval(hours => %s), %s, %s)""",
        (token_hash(token), user_id, tenant_id, SESSION_MAX_HOURS, ip, (user_agent or "")[:300]))
    return token


# Purpose:
# The session behind a cookie, if it is still alive. Touches
# last_seen_at at most once a minute (not a write per request).
def lookup(token: str) -> dict | None:
    conn = db.current()
    row = conn.execute("""
        SELECT s.user_id, s.tenant_id, s.created_at, s.last_seen_at, s.expires_at,
               u.email, u.display_name, u.is_active
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = %s AND s.expires_at > now()
          AND s.last_seen_at > now() - make_interval(mins => %s)""",
        (token_hash(token), SESSION_IDLE_MINUTES)).fetchone()
    if not row or not row["is_active"]:
        return None
    conn.execute("UPDATE sessions SET last_seen_at = now() "
                 "WHERE token_hash = %s AND last_seen_at < now() - interval '1 minute'", (token_hash(token),))
    return row


def delete(token: str) -> None:
    db.current().execute("DELETE FROM sessions WHERE token_hash = %s", (token_hash(token),))


def delete_for_user(user_id: str, tenant_id: str | None = None, keep: str | None = None) -> int:
    """End a user's sessions (in one tenant, or everywhere), optionally keeping the current one."""
    return db.current().execute("""
        DELETE FROM sessions WHERE user_id = %s
          AND (%s::uuid IS NULL OR tenant_id = %s::uuid)
          AND (%s::bytea IS NULL OR token_hash <> %s::bytea)""",
        (user_id, tenant_id, tenant_id, token_hash(keep) if keep else None,
         token_hash(keep) if keep else None)).rowcount
