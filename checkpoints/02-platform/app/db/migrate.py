# ============================================================
# Migrations — plain SQL files, applied once each, in order
# ============================================================
# app/db/migrations/NNN_name.sql run in name order. The table
# schema_migrations remembers which ones ran, so `db.py migrate` is
# safe to run any number of times. A new change to the schema is a new
# file; an old file is never edited once it has run anywhere.
#
# The two application roles are created here, before 002 grants them
# anything, with the passwords from DATABASE_APP_URL and
# DATABASE_SYNC_URL. Passwords live in .env, never in a .sql file.
# ============================================================

from pathlib import Path

from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

from app.config import DATABASE_APP_URL, DATABASE_SYNC_URL
from app.db import connect_admin

MIGRATIONS = Path(__file__).parent / "migrations"
ROLES = {"acme_app": DATABASE_APP_URL, "acme_sync": DATABASE_SYNC_URL}


def ensure_roles(conn) -> None:
    for role, url in ROLES.items():
        info = conninfo_to_dict(url)
        if info.get("user") != role:
            raise SystemExit(f"{url!r} must connect as {role} (the policies in 002 name it)")
        password = info.get("password") or ""
        exists = conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,)).fetchone()
        verb = "ALTER" if exists else "CREATE"
        # NOBYPASSRLS: Row-Level Security always applies to these roles.
        conn.execute(sql.SQL("{} ROLE {} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD {}").format(
            sql.SQL(verb), sql.Identifier(role), sql.Literal(password)))


def applied(conn) -> set[str]:
    conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations "
                 "(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
    return {r["version"] for r in conn.execute("SELECT version FROM schema_migrations")}


def migrate() -> list[str]:
    ran = []
    with connect_admin() as conn:
        ensure_roles(conn)
        done = applied(conn)
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if path.stem in done:
                continue
            with conn.transaction():
                conn.execute(path.read_text(encoding="utf-8"))
                conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (path.stem,))
            ran.append(path.stem)
        # The chat's memory: LangGraph creates its own tables (and keeps
        # its own migration list), then they get the thread rule. Not a
        # .sql file because the table definitions are LangGraph's.
        from app.assistant import memory

        memory.setup(conn)
    return ran


def reset() -> None:
    """Drop EVERYTHING in the database and start empty. For class resets and tests."""
    with connect_admin() as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        conn.execute("GRANT USAGE ON SCHEMA public TO PUBLIC")
