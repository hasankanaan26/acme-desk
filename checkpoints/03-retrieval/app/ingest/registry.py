# ============================================================
# Registry — the register, in Postgres
# ============================================================
# Part 1's register was a JSON file next to the documents. Part 2
# keeps it in two tables:
#
#   documents      one row per document: owner, status, dates, links
#   document_acl   which groups may read it
#
# fetch_register() turns the rows back into the JSON shape of Part 1,
# so load_register() and the sync job read it exactly as before.
#
# Who may change it: a tenant admin, through the API (acme_app).
# Who may read it: the API (with the ACL) and the sync worker (WITHOUT
# the ACL: acme_sync has no grant on document_acl or groups, and does
# not need one, because access is checked at query time).
# ============================================================

from pathlib import Path

from app import db
from app.config import REPO_ROOT

REGISTER_FIELDS = ("doc_id", "path", "title", "owner", "doc_type", "topic", "status", "version",
                   "effective_from", "effective_to", "superseded_by", "supersedes", "amends", "depends_on")


def _entry(row: dict) -> dict:
    """A documents row -> a register.json entry (dates as YYYY-MM-DD, empty fields left out)."""
    entry = {}
    for key in REGISTER_FIELDS:
        value = row.get(key)
        if value is None or value == [] or value == "":
            continue
        entry[key] = value.isoformat() if hasattr(value, "isoformat") else value
    if "allowed_groups" in row:
        entry["allowed_groups"] = list(row["allowed_groups"])
    return entry


# Purpose:
# The register of the tenant this transaction acts for, in Part 1's
# JSON shape. with_acl=False for the sync worker.
def fetch_register(with_acl: bool = True) -> dict:
    conn = db.current()
    if with_acl:
        rows = conn.execute("""
            SELECT d.*, coalesce(array_agg(g.name ORDER BY g.name) FILTER (WHERE g.name IS NOT NULL),
                                 '{}') AS allowed_groups
            FROM documents d
            LEFT JOIN document_acl a ON a.tenant_id = d.tenant_id AND a.doc_id = d.doc_id
            LEFT JOIN groups g ON g.id = a.group_id
            GROUP BY d.tenant_id, d.doc_id
            ORDER BY d.doc_id""").fetchall()
    else:
        rows = conn.execute("SELECT * FROM documents ORDER BY doc_id").fetchall()
    return {"about": "The register, read from Postgres.", "documents": [_entry(r) for r in rows]}


def current_tenant_row() -> dict:
    row = db.current().execute("SELECT * FROM tenants WHERE id = app_tenant()").fetchone()
    if not row:
        raise RuntimeError("No tenant set for this transaction (db.tx(..., tenant_id=...)).")
    return row


def resolve_source_dir(source_ref: str) -> Path:
    p = Path(source_ref)
    return p if p.is_absolute() else REPO_ROOT / p


class DbRegister:
    """Any connector, with its register read from Postgres instead of from the source."""

    def __init__(self, inner, with_acl: bool = False):
        self.inner = inner
        self.with_acl = with_acl

    def list_items(self):
        return self.inner.list_items()

    def fetch(self, path: str) -> bytes:
        return self.inner.fetch(path)

    def fetch_register(self) -> dict:
        return fetch_register(with_acl=self.with_acl)

    def source_url(self, path: str) -> str:
        return self.inner.source_url(path)


# ---- Writing the register (db.py seed, fake_drive.py, tests) ----

# Purpose:
# Make the register of one tenant equal to `raw` (register.json shape).
# Creates any group named in allowed_groups that does not exist yet.
# replace=True also deletes documents that are not in `raw`.
# Runs on the OWNER's connection (db.connect_admin()), with the tenant
# given explicitly: this is set-up tooling, not an API path.
def import_register(conn, tenant_id: str, raw: dict, replace: bool = True) -> dict:
    docs = raw.get("documents", [])
    names = sorted({g for d in docs for g in d.get("allowed_groups", [])})
    for name in names:
        conn.execute("INSERT INTO groups (tenant_id, name) VALUES (%s, %s) ON CONFLICT (tenant_id, name) DO NOTHING",
                     (tenant_id, name))
    group_id = {r["name"]: r["id"] for r in conn.execute(
        "SELECT id, name FROM groups WHERE tenant_id = %s", (tenant_id,))}

    for d in docs:
        conn.execute("""
            INSERT INTO documents (tenant_id, doc_id, path, title, owner, doc_type, topic, status, version,
                                   effective_from, effective_to, superseded_by, supersedes, amends, depends_on)
            VALUES (%(t)s, %(doc_id)s, %(path)s, %(title)s, %(owner)s, %(doc_type)s, %(topic)s, %(status)s,
                    %(version)s, %(effective_from)s, %(effective_to)s, %(superseded_by)s, %(supersedes)s,
                    %(amends)s, %(depends_on)s)
            ON CONFLICT (tenant_id, doc_id) DO UPDATE SET
                path = EXCLUDED.path, title = EXCLUDED.title, owner = EXCLUDED.owner,
                doc_type = EXCLUDED.doc_type, topic = EXCLUDED.topic, status = EXCLUDED.status,
                version = EXCLUDED.version, effective_from = EXCLUDED.effective_from,
                effective_to = EXCLUDED.effective_to, superseded_by = EXCLUDED.superseded_by,
                supersedes = EXCLUDED.supersedes, amends = EXCLUDED.amends,
                depends_on = EXCLUDED.depends_on, updated_at = now()""",
            {"t": tenant_id, "topic": d.get("topic", ""), "version": int(d.get("version", 1)),
             "effective_to": d.get("effective_to"), "superseded_by": d.get("superseded_by"),
             "supersedes": list(d.get("supersedes", [])), "amends": d.get("amends"),
             "depends_on": list(d.get("depends_on", [])),
             **{k: d[k] for k in ("doc_id", "path", "title", "owner", "doc_type", "status", "effective_from")}})
        conn.execute("DELETE FROM document_acl WHERE tenant_id = %s AND doc_id = %s", (tenant_id, d["doc_id"]))
        for name in d.get("allowed_groups", []):
            conn.execute("INSERT INTO document_acl (tenant_id, doc_id, group_id) VALUES (%s, %s, %s)",
                         (tenant_id, d["doc_id"], group_id[name]))

    removed = 0
    if replace:
        keep = [d["doc_id"] for d in docs]
        removed = conn.execute("DELETE FROM documents WHERE tenant_id = %s AND NOT (doc_id = ANY(%s))",
                               (tenant_id, keep)).rowcount
    return {"documents": len(docs), "groups": len(names), "removed": removed}
