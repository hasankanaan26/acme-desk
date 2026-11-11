# ============================================================
# The change gate — skip a scheduled sync when nothing changed
# ============================================================
# A sync asks Drive for the WHOLE tree, every tick: one listing call
# per folder, then a decision for every document. Fine for 20 files;
# for 20,000 almost every one of those calls answers "same as before".
#
# The gate asks first, cheaply, whether anything could have changed:
#
#   Drive's side   changes.list since our bookmark   (1 call when quiet)
#   our side       the register, the embedding model, the pipeline
#                  versions (a fingerprint), and which index is live
#
# Nothing on either side: the tick is SKIPPED, no walk at all.
# Anything: the full sync runs, exactly as before. The gate never
# decides WHAT to do with a document, only WHETHER to look.
#
# Always runs, gate or not:
#   Run now / the CLI / a rebuild    a person asked: the gate is bypassed
#   no change log                    the local folder has none
#   the change log cannot be read    fail open: a full sync, to be safe
#   the safety net                   a full sync every SYNC_FULL_EVERY_SECONDS,
#                                    for what a change log can miss
#                                    (a folder shared or unshared, ...)
#
# The bookmark moves only when the sync it guarded COMMITS: save()
# runs inside the worker's one transaction. A failed sync rolls the
# bookmark back too, and the next tick sees the same changes again.
# ============================================================

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app import db
from app.config import PIPELINE_VERSION, SECTION_MAX_CHARS, SYNC_FULL_EVERY_SECONDS
from app.ingest.parsers import PARSER_VERSION
from app.ingest.registry import current_tenant_row, fetch_register
from app.rag.embedder import embedding_model_id

SHOW_CHANGES = 10   # changed files listed in the Sync tab; the count is always exact


@dataclass
class Gate:
    run: bool
    reason: str
    fingerprint: str
    page_token: str | None = None          # the bookmark to save if this run commits
    detail: dict = field(default_factory=dict)

    def record(self, connector=None) -> dict:
        """What sync_runs.gate stores: the decision, its evidence, and what it cost."""
        return {"decision": "run" if self.run else "skip", "reason": self.reason, **self.detail,
                "drive_calls": getattr(_inner(connector), "api_calls", None)}


def _inner(connector):
    return getattr(connector, "inner", connector)   # DbRegister wraps the real connector


# Purpose:
# Our side of "something changed", as one short hash: everything the
# index is built from that does not live in Drive.
def fingerprint() -> str:
    register = fetch_register(with_acl=False)   # who may read is checked at query time, not in the index
    parts = {"register": register["documents"], "model": embedding_model_id(),
             "pipeline": [PIPELINE_VERSION, PARSER_VERSION, SECTION_MAX_CHARS]}
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _describe(change: dict) -> dict:
    file = change.get("file") or {}
    kind = "removed" if change.get("removed") else "trashed" if file.get("trashed") else "changed"
    return {"name": file.get("name") or change.get("fileId", "?"), "kind": kind}


# Purpose:
# Decide whether this sync runs. Reads only (one Drive call, three
# small queries). Call it inside the transaction that holds the
# tenant's lock, so no other worker moves the bookmark meanwhile.
def check(connector, trigger: str = "tick", rebuild: bool = False) -> Gate:
    conn = db.current()
    cursor = conn.execute("SELECT * FROM sync_cursors").fetchone()   # RLS: this tenant's row only
    tenant = current_tenant_row()
    fp = fingerprint()
    feed = _inner(connector)
    has_log = hasattr(feed, "changes_since")

    detail: dict = {"change_log": has_log}
    token, changes, feed_error = None, None, None
    if has_log:
        try:
            if cursor and cursor["page_token"]:
                changes, token = feed.changes_since(cursor["page_token"])
            else:
                token = feed.start_page_token()   # first run with the gate: bookmark "now", then sync
        except Exception as exc:  # noqa: BLE001 - the gate fails open, never closed
            feed_error = f"{type(exc).__name__}: {exc}"
        if changes is not None:
            detail["changes"] = len(changes)
            detail["changed_files"] = [_describe(c) for c in changes[:SHOW_CHANGES]]

    register_changed = bool(cursor) and cursor["fingerprint"] != fp
    detail["register_changed"] = register_changed
    due = cursor["full_sync_due_at"] if cursor else None
    now = datetime.now(timezone.utc)

    def gate(run: bool, reason: str) -> Gate:
        return Gate(run, reason, fp, token, detail)

    if rebuild:
        return gate(True, "rebuild: the gate is bypassed")
    if trigger != "tick":
        return gate(True, f"{'Run now' if trigger == 'manual' else trigger}: a person asked, the gate is bypassed")
    if not has_log:
        return gate(True, "this source has no change log: a full sync every tick")
    if feed_error:
        return gate(True, f"the change log could not be read ({feed_error}): a full sync, to be safe")
    if not cursor or not cursor["page_token"]:
        return gate(True, "first sync with the gate: bookmark taken, full sync")
    if not tenant["live_index"]:
        return gate(True, "no live index yet")
    if cursor["live_index"] != tenant["live_index"]:
        return gate(True, "the live index changed since the last sync (a rollback or a wipe)")
    if register_changed:
        return gate(True, "the register, the embedding model or the pipeline changed")
    if due and now >= due:
        return gate(True, "safety net: the scheduled full sync is due")
    if changes:
        return gate(True, f"{len(changes)} change(s) in Drive since the last sync")
    return gate(False, "nothing changed in Drive or the register since the last sync")


# Purpose:
# After a sync that ran, in the SAME transaction: move the bookmark,
# remember our side's fingerprint and the live index, and set the next
# safety-net deadline.
def save(g: Gate) -> None:
    conn = db.current()
    live = current_tenant_row()["live_index"]   # read AFTER the sync: a first build or a rebuild just moved it
    due = (datetime.now(timezone.utc) + timedelta(seconds=SYNC_FULL_EVERY_SECONDS)
           if SYNC_FULL_EVERY_SECONDS > 0 else None)
    conn.execute("""
        INSERT INTO sync_cursors (tenant_id, page_token, fingerprint, live_index, full_sync_at, full_sync_due_at)
        VALUES (app_tenant(), %s, %s, %s, now(), %s)
        ON CONFLICT (tenant_id) DO UPDATE SET
            page_token = coalesce(EXCLUDED.page_token, sync_cursors.page_token),
            fingerprint = EXCLUDED.fingerprint, live_index = EXCLUDED.live_index,
            full_sync_at = now(), full_sync_due_at = EXCLUDED.full_sync_due_at, updated_at = now()""",
        (g.page_token, g.fingerprint, live, due))


# Purpose:
# A skipped tick: nothing changed, but Drive may still have handed out
# a newer bookmark. Keep it, so the next question starts from here.
def advance(g: Gate) -> None:
    if g.page_token:
        db.current().execute("UPDATE sync_cursors SET page_token = %s, updated_at = now()", (g.page_token,))
