# ============================================================
# Memory — the conversation, kept in Postgres
# ============================================================
# LangGraph saves the graph's state after every step (a "checkpoint"),
# keyed by a thread id. Load the thread, and the conversation is back:
# after a restart, on another API process, on another day. Part 2 keeps
# those checkpoints in the same Postgres as everything else, with
# LangGraph's own PostgresSaver.
#
# THE SECURITY QUESTION: the checkpointer's tables are LangGraph's, not
# ours. They have a thread_id and no tenant_id. So we add one rule:
#
#   a checkpoint row is visible only if its thread_id is a thread in
#   chat_threads that this person may see
#
# and chat_threads only shows a person their own (004_chat.sql). Pass
# the API someone else's thread id and the database returns nothing,
# the same way Row-Level Security hides another tenant's chunks.
#
# For that rule to work, the checkpointer's connection must say who it
# acts for: db.session() sets the tenant and the person for as long as
# the conversation turn holds the connection.
# ============================================================

from contextlib import contextmanager
from typing import Iterator

from app import db
from app.auth.service import Principal

TABLES = ("checkpoints", "checkpoint_blobs", "checkpoint_writes")


# Purpose:
# Create LangGraph's tables and put them under the thread rule. Runs
# as the database owner, from db.py migrate. Safe to repeat.
def setup(conn) -> None:
    from langgraph.checkpoint.postgres import PostgresSaver

    PostgresSaver(conn).setup()
    for table in TABLES:
        conn.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        conn.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        conn.execute(f"DROP POLICY IF EXISTS own_thread ON {table}")
        conn.execute(f"""
            CREATE POLICY own_thread ON {table}
                USING (thread_id IN (SELECT id::text FROM chat_threads))
                WITH CHECK (thread_id IN (SELECT id::text FROM chat_threads))""")
        conn.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO acme_app")


# Purpose:
# A checkpointer that acts as this person, for one conversation turn.
@contextmanager
def checkpointer(principal: Principal) -> Iterator["PostgresSaver"]:  # noqa: F821
    from langgraph.checkpoint.postgres import PostgresSaver

    with db.session("app", principal.tenant_id, principal.user_id) as conn:
        yield PostgresSaver(conn)
