# ============================================================
# Catalog — which index is live (blue/green), per tenant
# ============================================================
# Part 1 kept the pointer in acme_catalog.json. Part 2 keeps it in
# the tenant's row:
#
#   tenants.live_index      the index every search reads
#   tenants.previous_index  kept for rollback
#   search_indexes          one row per index: model, chunks, last sync
#
# A rebuild writes a NEW index next to the live one and flips
# live_index in the SAME transaction that wrote it. Postgres makes the
# switch atomic: a search sees the old index or the new one, never a
# half-built one. Rollback is flipping it back.
#
# Every function acts for the tenant of the current transaction
# (db.tx(..., tenant_id=...)); Row-Level Security does the rest.
# ============================================================

from datetime import datetime

from app import db


def active_name() -> str | None:
    row = db.current().execute("SELECT live_index FROM tenants WHERE id = app_tenant()").fetchone()
    return row["live_index"] if row else None


def active_info() -> dict:
    row = db.current().execute("""
        SELECT i.* FROM search_indexes i JOIN tenants t ON t.live_index = i.name
        WHERE t.id = app_tenant()""").fetchone()
    if not row:
        return {}
    info = {k: row[k] for k in ("embedding_model", "pipeline_version", "chunks")}
    info["last_sync"] = row["last_sync"].isoformat(timespec="seconds") if row["last_sync"] else None
    return info


def new_collection_name() -> str:
    return "acme_kb_" + datetime.now().strftime("%Y%m%d_%H%M%S")


def ensure_index(name: str) -> None:
    db.current().execute(
        "INSERT INTO search_indexes (tenant_id, name) VALUES (app_tenant(), %s) ON CONFLICT DO NOTHING", (name,))


def record_collection(name: str, info: dict) -> None:
    ensure_index(name)
    db.current().execute("""
        UPDATE search_indexes SET
            embedding_model  = coalesce(%(embedding_model)s, embedding_model),
            pipeline_version = coalesce(%(pipeline_version)s, pipeline_version),
            chunks           = coalesce(%(chunks)s, chunks),
            last_sync        = coalesce(%(last_sync)s::timestamptz, last_sync)
        WHERE name = %(name)s""",
        {"name": name, "embedding_model": info.get("embedding_model"),
         "pipeline_version": info.get("pipeline_version"), "chunks": info.get("chunks"),
         "last_sync": info.get("last_sync")})


# Purpose:
# Point searches at a new index. The old live one becomes "previous";
# anything older is dropped (its chunks go with it, ON DELETE CASCADE).
def activate(name: str) -> None:
    conn = db.current()
    conn.execute("""
        UPDATE tenants SET previous_index = live_index, live_index = %s
        WHERE id = app_tenant() AND live_index IS DISTINCT FROM %s""", (name, name))
    conn.execute("""
        DELETE FROM search_indexes
        WHERE name NOT IN (SELECT live_index FROM tenants WHERE id = app_tenant() AND live_index IS NOT NULL
                           UNION SELECT previous_index FROM tenants WHERE id = app_tenant()
                                                                     AND previous_index IS NOT NULL)""")


def rollback() -> str:
    conn = db.current()
    row = conn.execute("SELECT live_index, previous_index FROM tenants WHERE id = app_tenant()").fetchone()
    if not row or not row["previous_index"]:
        raise RuntimeError("Nothing to roll back to.")
    conn.execute("UPDATE tenants SET live_index = previous_index, previous_index = live_index WHERE id = app_tenant()")
    return row["previous_index"]
