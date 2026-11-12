# ============================================================
# Acting as someone, for the command-line tools (search.py, evaluate.py)
# ============================================================
# The API learns who you are from a session cookie. A command-line tool
# has no cookie, so it looks the person up directly with the OWNER's
# connection (DATABASE_ADMIN_URL) and then searches with the API's own
# role, for that person's tenant and groups.
#
# That is impersonation, and it is exactly why these tools need the
# owner's URL, which the API process never has: whoever holds it can be
# anyone. In production this is a break-glass admin tool, and its use is
# audited (see as_person: every call writes an audit row).
# ============================================================

from dataclasses import dataclass

from psycopg.types.json import Jsonb

from app.db import connect_admin

EMAIL_DOMAIN = "acme.test"


@dataclass(frozen=True)
class Person:
    email: str
    user_id: str
    tenant_id: str
    tenant_slug: str
    group_ids: list[str]
    group_names: list[str]


def as_person(who: str, tool: str, tenant_slug: str = "acme") -> Person:
    """'intern' or 'intern@acme.test' -> the person, their tenant and groups (and an audit row)."""
    email = who if "@" in who else f"{who}@{EMAIL_DOMAIN}"
    with connect_admin() as conn:
        row = conn.execute("""
            SELECT u.id::text AS user_id, t.id::text AS tenant_id, t.slug
            FROM users u JOIN memberships m ON m.user_id = u.id JOIN tenants t ON t.id = m.tenant_id
            WHERE u.email = %s AND t.slug = %s AND u.is_active""", (email, tenant_slug)).fetchone()
        if not row:
            raise SystemExit(f"No active member {email} in tenant {tenant_slug}. (python db.py seed?)")
        groups = conn.execute("""
            SELECT g.id::text AS id, g.name FROM group_members gm JOIN groups g ON g.id = gm.group_id
            WHERE gm.user_id = %s AND gm.tenant_id = %s ORDER BY g.name""",
            (row["user_id"], row["tenant_id"])).fetchall()
        conn.execute("INSERT INTO audit_log (tenant_id, actor, action, target, detail) VALUES (%s, %s, %s, %s, %s)",
                     (row["tenant_id"], f"cli:{tool}", "impersonate", email, Jsonb({"tool": tool})))
    return Person(email, row["user_id"], row["tenant_id"], row["slug"],
                  [g["id"] for g in groups], [g["name"] for g in groups])
