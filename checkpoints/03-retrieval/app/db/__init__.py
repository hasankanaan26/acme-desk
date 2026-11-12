# ============================================================
# Database access — one transaction, one role, one tenant
# ============================================================
# Every piece of code that touches Postgres does it inside
#
#     with db.tx("app", tenant_id=..., user_id=...) as conn:
#         ...
#
# which does three things:
#   1. borrows a connection from the pool of that ROLE ("app" = the
#      API's acme_app, "sync" = the worker's acme_sync). The role
#      decides which tables can be touched at all (002_security.sql).
#   2. opens a transaction: everything inside commits together or not
#      at all. A sync that fails halfway leaves the index as it was.
#   3. SET LOCAL app.tenant_id / app.user_id for that transaction.
#      Row-Level Security reads them; with no tenant set, tenant tables
#      return no rows. LOCAL = forgotten at commit, so a pooled
#      connection never carries one request's tenant into the next.
#
# Code deeper down (the store, the catalog, the register) does not take
# a connection argument: it calls db.current(), the connection of the
# transaction it runs in. Calling it outside db.tx() is an error, never
# a silent "no tenant".
# ============================================================

from __future__ import annotations

import atexit
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import DATABASE_ADMIN_URL, DATABASE_APP_URL, DATABASE_SYNC_URL

URLS = {"app": DATABASE_APP_URL, "sync": DATABASE_SYNC_URL, "admin": DATABASE_ADMIN_URL}

_pools: dict[str, ConnectionPool] = {}
_current: ContextVar[psycopg.Connection | None] = ContextVar("acme_db_connection", default=None)


def _configure(conn: psycopg.Connection) -> None:
    """Teach the connection the pgvector type, so a Python list goes in as a vector."""
    from pgvector.psycopg import register_vector

    register_vector(conn)
    conn.commit()  # leave the connection idle, as the pool expects


def pool(role: str) -> ConnectionPool:
    if role not in URLS:
        raise ValueError(f"unknown database role {role!r}")
    if role not in _pools:
        _pools[role] = ConnectionPool(
            URLS[role], min_size=1, max_size=8, open=True, name=f"acme-{role}",
            kwargs={"row_factory": dict_row}, configure=_configure,
        )
    return _pools[role]


def close_pools() -> None:
    for p in _pools.values():
        p.close()
    _pools.clear()


atexit.register(close_pools)


@contextmanager
def tx(role: str, tenant_id: str | None = None, user_id: str | None = None) -> Iterator[psycopg.Connection]:
    """One transaction as `role`, acting for `tenant_id` (and `user_id`)."""
    with pool(role).connection() as conn:
        with conn.transaction():
            if tenant_id:
                conn.execute("SELECT set_config('app.tenant_id', %s, true)", (str(tenant_id),))
            if user_id:
                conn.execute("SELECT set_config('app.user_id', %s, true)", (str(user_id),))
            token = _current.set(conn)
            try:
                yield conn
            finally:
                _current.reset(token)


def _forget_who(conn: psycopg.Connection) -> None:
    """Pool reset: a returned connection acts for nobody."""
    conn.execute("SELECT set_config('app.tenant_id', '', false), set_config('app.user_id', '', false)")


def _session_pool(role: str) -> ConnectionPool:
    key = role + "/session"
    if key not in _pools:
        _pools[key] = ConnectionPool(
            URLS[role], min_size=0, max_size=8, open=True, name=f"acme-{role}-session",
            kwargs={"row_factory": dict_row, "autocommit": True, "prepare_threshold": 0},
            reset=_forget_who,
        )
    return _pools[key]


# Purpose:
# A connection of its own, OUTSIDE any transaction, acting for one
# tenant and one person until it goes back to the pool. For LangGraph's
# checkpointer, which commits each of its writes by itself, so SET
# LOCAL (one transaction) would be forgotten after its first statement.
# The settings are session-wide here, and the pool's reset wipes them
# before anyone else borrows the connection.
@contextmanager
def session(role: str, tenant_id: str, user_id: str) -> Iterator[psycopg.Connection]:
    with _session_pool(role).connection() as conn:
        conn.execute("SELECT set_config('app.tenant_id', %s, false), set_config('app.user_id', %s, false)",
                      (str(tenant_id), str(user_id)))
        try:
            yield conn
        finally:
            _forget_who(conn)


def current() -> psycopg.Connection:
    conn = _current.get()
    if conn is None:
        raise RuntimeError("No database transaction here. Wrap the call in `with db.tx(...)`.")
    return conn


def current_tenant() -> str | None:
    row = current().execute("SELECT app_tenant() AS t").fetchone()
    return str(row["t"]) if row and row["t"] else None


def connect_admin(autocommit: bool = True) -> psycopg.Connection:
    """The owner's connection, for db.py only (migrations, seed, reset)."""
    return psycopg.connect(DATABASE_ADMIN_URL, autocommit=autocommit, row_factory=dict_row)
