# ============================================================
# Router: /admin — people, groups, document access, audit
# ============================================================
# Everything here needs a tenant admin (role = 'admin' in memberships)
# and acts ONLY inside the admin's tenant: Row-Level Security makes
# another tenant's rows invisible, and the queries say so again.
#
# Three changes take effect on the very next request, with no sync and
# no re-embedding, because the search joins these tables live:
#   - a user's groups              (PATCH /admin/users/{id})
#   - a document's allowed groups  (PATCH /admin/documents/{doc_id})
#   - removing a user              (DELETE /admin/users/{id})
# A document's STATUS also changes here, but the index follows on the
# worker's next sync (withdrawn -> its chunks are removed).
#
# Guard rails:
#   - an admin cannot demote, deactivate or remove themselves (no
#     tenant without an admin by accident)
#   - a person is global, an admin is not: password, name and active
#     flag can be changed only for people who belong to THIS tenant
#     alone (tenants_of_user(), migration 003)
#   - every change is written to audit_log, with before and after
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from psycopg.errors import UniqueViolation

from app import db
from app.auth import passwords, sessions
from app.auth.deps import client_ip, csrf_guard, require_admin
from app.auth.service import Principal, audit
from app.models import (
    AuditEntry,
    DocumentUpdate,
    GroupCreate,
    GroupInfo,
    UserCreate,
    UserInfo,
    UserUpdate,
)

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(csrf_guard)])

USERS_SQL = """
    SELECT u.id::text AS id, u.email, u.display_name, u.is_active, u.last_login_at, m.role,
           coalesce(array_agg(g.name ORDER BY g.name) FILTER (WHERE g.name IS NOT NULL), '{{}}') AS groups,
           tenants_of_user(u.id) > 1 AS other_tenants
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.tenant_id = m.tenant_id
    LEFT JOIN groups g ON g.id = gm.group_id
    WHERE m.tenant_id = app_tenant() {extra}
    GROUP BY u.id, m.role
    ORDER BY u.email"""


def _users(conn, user_id: str | None = None) -> list[dict]:
    if user_id:
        return conn.execute(USERS_SQL.format(extra="AND u.id = %s"), (user_id,)).fetchall()
    return conn.execute(USERS_SQL.format(extra="")).fetchall()


def _group_ids(conn, names: list[str]) -> list[str]:
    names = sorted(set(names))
    rows = conn.execute("SELECT id::text AS id, name FROM groups WHERE name = ANY(%s)", (names,)).fetchall()
    unknown = set(names) - {r["name"] for r in rows}
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown group(s): {', '.join(sorted(unknown))}")
    return [r["id"] for r in rows]


def _set_groups(conn, user_id: str, names: list[str]) -> None:
    ids = _group_ids(conn, names)
    conn.execute("DELETE FROM group_members WHERE user_id = %s", (user_id,))  # RLS: this tenant's rows only
    for gid in ids:
        conn.execute("INSERT INTO group_members (tenant_id, group_id, user_id) VALUES (app_tenant(), %s, %s)",
                     (gid, user_id))


# ---- People ----

@router.get("/users", response_model=list[UserInfo])
def list_users(principal: Principal = Depends(require_admin)):
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        return _users(conn)


@router.post("/users", response_model=UserInfo, status_code=201)
def create_user(body: UserCreate, request: Request, principal: Principal = Depends(require_admin)):
    """Add a person to this tenant: a new account, or an existing one by email."""
    email = body.email.strip().lower()
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        existing = conn.execute("SELECT id::text AS id FROM users WHERE email = %s", (email,)).fetchone()
        if existing:
            user_id = existing["id"]
            created = False
        else:
            problem = passwords.password_problem(body.password)
            if problem:
                raise HTTPException(status_code=422, detail=problem)
            user_id = conn.execute("INSERT INTO users (email, display_name, password_hash) VALUES (%s, %s, %s) "
                                   "RETURNING id::text AS id",
                                   (email, body.display_name, passwords.hash_password(body.password))).fetchone()["id"]
            created = True
        try:
            conn.execute("INSERT INTO memberships (tenant_id, user_id, role) VALUES (app_tenant(), %s, %s)",
                         (user_id, body.role))
        except UniqueViolation:
            raise HTTPException(status_code=409, detail=f"{email} is already a member of this tenant.")
        _set_groups(conn, user_id, body.groups)
        audit("admin.user.add", principal.email, user_id=principal.user_id, target=email, ip=client_ip(request),
              detail={"new_account": created, "role": body.role, "groups": sorted(body.groups)})
        return _users(conn, user_id)[0]


@router.patch("/users/{user_id}", response_model=UserInfo)
def update_user(user_id: str, body: UserUpdate, request: Request, principal: Principal = Depends(require_admin)):
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        found = _users(conn, user_id)
        if not found:
            raise HTTPException(status_code=404, detail="No such person in this tenant.")
        before = found[0]
        if user_id == principal.user_id and (body.role == "member" or body.is_active is False):
            raise HTTPException(status_code=409, detail="You cannot demote or deactivate yourself.")
        global_change = body.display_name is not None or body.password is not None or body.is_active is not None
        if global_change and before["other_tenants"]:
            raise HTTPException(status_code=409, detail="This person also belongs to another tenant: their name, "
                                                        "password and active flag are not this tenant's to change.")
        if body.role is not None:
            conn.execute("UPDATE memberships SET role = %s WHERE tenant_id = app_tenant() AND user_id = %s",
                         (body.role, user_id))
        if body.groups is not None:
            _set_groups(conn, user_id, body.groups)
        if body.display_name is not None:
            conn.execute("UPDATE users SET display_name = %s WHERE id = %s", (body.display_name, user_id))
        ended = 0
        if body.password is not None:
            problem = passwords.password_problem(body.password)
            if problem:
                raise HTTPException(status_code=422, detail=problem)
            conn.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                         (passwords.hash_password(body.password), user_id))
            ended += sessions.delete_for_user(user_id)
        if body.is_active is not None:
            conn.execute("UPDATE users SET is_active = %s WHERE id = %s", (body.is_active, user_id))
            if not body.is_active:
                ended += sessions.delete_for_user(user_id)
        after = _users(conn, user_id)[0]
        audit("admin.user.update", principal.email, user_id=principal.user_id, target=before["email"],
              ip=client_ip(request),
              detail={"before": {k: before[k] for k in ("role", "groups", "is_active", "display_name")},
                      "after": {k: after[k] for k in ("role", "groups", "is_active", "display_name")},
                      "password_reset": body.password is not None, "sessions_ended": ended})
        return after


@router.delete("/users/{user_id}")
def remove_user(user_id: str, request: Request, principal: Principal = Depends(require_admin)):
    """Remove a person from THIS tenant (their account stays, for other tenants)."""
    if user_id == principal.user_id:
        raise HTTPException(status_code=409, detail="You cannot remove yourself.")
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        found = _users(conn, user_id)
        if not found:
            raise HTTPException(status_code=404, detail="No such person in this tenant.")
        conn.execute("DELETE FROM memberships WHERE tenant_id = app_tenant() AND user_id = %s", (user_id,))
        ended = sessions.delete_for_user(user_id, tenant_id=principal.tenant_id)
        audit("admin.user.remove", principal.email, user_id=principal.user_id, target=found[0]["email"],
              ip=client_ip(request), detail={"groups": found[0]["groups"], "sessions_ended": ended})
    return {"removed": found[0]["email"], "sessions_ended": ended}


# ---- Groups ----

@router.get("/groups", response_model=list[GroupInfo])
def list_groups(principal: Principal = Depends(require_admin)):
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        return conn.execute("""
            SELECT g.id::text AS id, g.name, g.description,
                   (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id) AS members,
                   (SELECT count(*) FROM document_acl a WHERE a.group_id = g.id) AS documents
            FROM groups g ORDER BY g.name""").fetchall()


@router.post("/groups", response_model=GroupInfo, status_code=201)
def create_group(body: GroupCreate, request: Request, principal: Principal = Depends(require_admin)):
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        try:
            row = conn.execute("INSERT INTO groups (tenant_id, name, description) VALUES (app_tenant(), %s, %s) "
                               "RETURNING id::text AS id, name, description, 0 AS members, 0 AS documents",
                               (body.name, body.description)).fetchone()
        except UniqueViolation:
            raise HTTPException(status_code=409, detail=f"A group named {body.name} already exists.")
        audit("admin.group.create", principal.email, user_id=principal.user_id, target=body.name,
              ip=client_ip(request))
        return row


# ---- Document access ----

@router.patch("/documents/{doc_id}")
def update_document(doc_id: str, body: DocumentUpdate, request: Request, principal: Principal = Depends(require_admin)):
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        doc = conn.execute("SELECT doc_id, status FROM documents WHERE doc_id = %s", (doc_id,)).fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail=f"No document {doc_id} in the register.")
        before_groups = [r["name"] for r in conn.execute(
            "SELECT g.name FROM document_acl a JOIN groups g ON g.id = a.group_id WHERE a.doc_id = %s ORDER BY 1",
            (doc_id,))]
        if body.allowed_groups is not None:
            ids = _group_ids(conn, body.allowed_groups)
            conn.execute("DELETE FROM document_acl WHERE doc_id = %s", (doc_id,))
            for gid in ids:
                conn.execute("INSERT INTO document_acl (tenant_id, doc_id, group_id) VALUES (app_tenant(), %s, %s)",
                             (doc_id, gid))
        if body.status is not None:
            conn.execute("UPDATE documents SET status = %s, updated_at = now() WHERE doc_id = %s", (body.status, doc_id))
        after_groups = sorted(set(body.allowed_groups)) if body.allowed_groups is not None else before_groups
        audit("admin.document.update", principal.email, user_id=principal.user_id, target=doc_id,
              ip=client_ip(request),
              detail={"allowed_groups": {"before": before_groups, "after": after_groups},
                      "status": {"before": doc["status"], "after": body.status or doc["status"]}})
    return {"doc_id": doc_id, "allowed_groups": after_groups, "status": body.status or doc["status"],
            "access_change": "live now" if body.allowed_groups is not None else None,
            "status_change": "applied by the worker's next sync" if body.status and body.status != doc["status"]
            else None}


# ---- Audit ----

@router.get("/audit", response_model=list[AuditEntry])
def audit_log(limit: int = Query(default=100, ge=1, le=1000), action: str | None = Query(default=None, max_length=60),
              principal: Principal = Depends(require_admin)):
    with db.tx("app", principal.tenant_id, principal.user_id) as conn:
        return conn.execute("""
            SELECT at, actor, action, target, detail, ip FROM audit_log
            WHERE (%s::text IS NULL OR action LIKE %s || '%%')
            ORDER BY id DESC LIMIT %s""", (action, action, limit)).fetchall()
