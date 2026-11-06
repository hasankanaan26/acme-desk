# ============================================================
# Seed — the Acme tenant, its people, its groups, its register
# ============================================================
# Turns Part 1's two JSON files into rows:
#
#   shared/data/identities.json  -> users, memberships, groups,
#                                   group_members (the 5 personas)
#   shared/data/register.json    -> documents, document_acl
#
# plus one tenant admin (admin@acme.test), who manages people, groups
# and document access in the app. The personas keep the groups they
# had in Part 1, so every Part 1 demo answers the same way.
#
# Passwords: ACME_SEED_PASSWORD for every account if it is set (handy
# in class), otherwise a random one per account, printed once. Never a
# default password that ships in the repository.
#
# Safe to run again: existing rows are updated, existing passwords
# are kept unless reset_passwords=True.
# ============================================================

import json
import secrets
from pathlib import Path

from app.auth.passwords import hash_password
from app.config import (
    DRIVE_ROOT_FOLDER_ID,
    IDENTITIES_FILE,
    REGISTER_FILE,
    REPO_ROOT,
    SEED_PASSWORD,
    SOURCE,
    SOURCE_DIR,
)
from app.db import connect_admin
from app.ingest.registry import import_register

EMAIL_DOMAIN = "acme.test"   # .test is reserved (RFC 2606): it can never be a real mailbox
ADMIN = {"key": "admin", "display": "Acme Desk admin", "groups": ["employees"], "role": "admin"}


def default_source() -> tuple[str, str]:
    if SOURCE == "drive":
        if not DRIVE_ROOT_FOLDER_ID:
            raise SystemExit("SOURCE=drive but DRIVE_ROOT_FOLDER_ID is not set")
        return "drive", DRIVE_ROOT_FOLDER_ID
    try:
        return "local", SOURCE_DIR.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return "local", str(SOURCE_DIR)


def upsert_tenant(conn, slug: str, name: str, source_kind: str, source_ref: str) -> str:
    row = conn.execute("""
        INSERT INTO tenants (slug, name, source_kind, source_ref) VALUES (%s, %s, %s, %s)
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, source_kind = EXCLUDED.source_kind,
                                         source_ref = EXCLUDED.source_ref
        RETURNING id""", (slug, name, source_kind, source_ref)).fetchone()
    return str(row["id"])


# Purpose:
# Create (or update) one account in one tenant with exactly these
# groups. Returns the password if one was set, else None.
def upsert_user(conn, tenant_id: str, email: str, display: str, groups: list[str], role: str = "member",
                password: str | None = None, reset_password: bool = False) -> str | None:
    existing = conn.execute("SELECT id, password_hash FROM users WHERE email = %s", (email,)).fetchone()
    new_password = None
    if existing is None or existing["password_hash"] is None or reset_password:
        new_password = password or SEED_PASSWORD or secrets.token_urlsafe(12)
    if existing is None:
        user_id = conn.execute("INSERT INTO users (email, display_name, password_hash) VALUES (%s, %s, %s) "
                               "RETURNING id", (email, display, hash_password(new_password))).fetchone()["id"]
    else:
        user_id = existing["id"]
        conn.execute("UPDATE users SET display_name = %s WHERE id = %s", (display, user_id))
        if new_password:
            conn.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(new_password), user_id))
    conn.execute("""INSERT INTO memberships (tenant_id, user_id, role) VALUES (%s, %s, %s)
                    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role""",
                 (tenant_id, user_id, role))
    for g in groups:
        conn.execute("INSERT INTO groups (tenant_id, name) VALUES (%s, %s) ON CONFLICT DO NOTHING", (tenant_id, g))
    conn.execute("DELETE FROM group_members WHERE tenant_id = %s AND user_id = %s", (tenant_id, user_id))
    conn.execute("""INSERT INTO group_members (tenant_id, group_id, user_id)
                    SELECT %s, id, %s FROM groups WHERE tenant_id = %s AND name = ANY(%s)""",
                 (tenant_id, user_id, tenant_id, groups))
    return new_password


def seed(slug: str = "acme", name: str = "Acme Corp", source: tuple[str, str] | None = None,
         register_file: Path = REGISTER_FILE, identities_file: Path = IDENTITIES_FILE,
         reset_passwords: bool = False, email_domain: str = EMAIL_DOMAIN) -> dict:
    source_kind, source_ref = source or default_source()
    register = json.loads(Path(register_file).read_text(encoding="utf-8"))
    personas = json.loads(Path(identities_file).read_text(encoding="utf-8"))["users"]
    passwords = {}
    with connect_admin(autocommit=False) as conn:
        with conn.transaction():
            tenant_id = upsert_tenant(conn, slug, name, source_kind, source_ref)
            reg = import_register(conn, tenant_id, register, replace=True)
            for key, p in personas.items():
                pw = upsert_user(conn, tenant_id, f"{key}@{email_domain}", p["display"], p["groups"],
                                 reset_password=reset_passwords)
                if pw:
                    passwords[f"{key}@{email_domain}"] = pw
            pw = upsert_user(conn, tenant_id, f"{ADMIN['key']}@{email_domain}", ADMIN["display"], ADMIN["groups"],
                             role=ADMIN["role"], reset_password=reset_passwords)
            if pw:
                passwords[f"{ADMIN['key']}@{email_domain}"] = pw
    return {"tenant": slug, "tenant_id": tenant_id, "source": f"{source_kind}:{source_ref}",
            "register": reg, "accounts": len(personas) + 1, "passwords": passwords}
