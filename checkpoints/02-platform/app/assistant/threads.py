# ============================================================
# Threads — one row per conversation, owned by one person
# ============================================================
# Every function runs as the signed-in person (db.tx with their tenant
# AND their user id), so chat_threads' policy shows them their own
# threads and nothing else. "Not yours" and "does not exist" look the
# same from here: None, and the router answers 404 for both.
# ============================================================

import uuid

from app import db
from app.auth.service import Principal

TITLE_LENGTH = 60


def _row(r: dict) -> dict:
    return {"id": str(r["id"]), "title": r["title"], "created_at": r["created_at"], "updated_at": r["updated_at"]}


def create(principal: Principal, title: str = "New conversation") -> dict:
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        r = conn.execute("""
            INSERT INTO chat_threads (tenant_id, user_id, title) VALUES (app_tenant(), app_user(), %s)
            RETURNING *""", (title[:TITLE_LENGTH],)).fetchone()
    return _row(r)


def mine(principal: Principal, limit: int = 30) -> list[dict]:
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        rows = conn.execute("SELECT * FROM chat_threads ORDER BY updated_at DESC LIMIT %s", (limit,)).fetchall()
    return [_row(r) for r in rows]


def get(principal: Principal, thread_id: uuid.UUID | str) -> dict | None:
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        r = conn.execute("SELECT * FROM chat_threads WHERE id = %s", (str(thread_id),)).fetchone()
    return _row(r) if r else None


# Purpose:
# After a turn: move the thread to the top of the list, and name it
# after its first question.
def touch(principal: Principal, thread_id: str, first_question: str | None = None) -> None:
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        if first_question:
            conn.execute("UPDATE chat_threads SET updated_at = now(), title = %s WHERE id = %s",
                         (first_question[:TITLE_LENGTH], thread_id))
        else:
            conn.execute("UPDATE chat_threads SET updated_at = now() WHERE id = %s", (thread_id,))
