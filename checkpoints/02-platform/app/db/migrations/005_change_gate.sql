-- ============================================================
-- 005 — the change gate: skip a tick when nothing changed
-- ============================================================
-- Before a scheduled sync, the worker asks Drive one question: "what
-- changed since my bookmark?" (changes.list with a saved page token).
-- Nothing in Drive, nothing in the register: the tick is skipped and
-- costs one API call instead of a walk of every folder.
--
-- One row per tenant, written by the worker in the SAME transaction
-- as the sync it describes: a sync that rolls back leaves the bookmark
-- where it was, so the next tick sees the same changes again.
--
--   page_token        Drive's bookmark in its change log
--   fingerprint       our side of "changed": the register, the
--                     embedding model and the pipeline versions
--   live_index        the index the last sync left live (a rollback
--                     or a wipe moves it, and opens the gate)
--   full_sync_at      the last sync that actually ran
--   full_sync_due_at  the safety net: a full sync by then, changes or not
-- ============================================================

CREATE TABLE sync_cursors (
    tenant_id        uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    page_token       text,
    fingerprint      text,
    live_index       text,
    full_sync_at     timestamptz,
    full_sync_due_at timestamptz,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_cursors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sync_cursors USING (tenant_id = app_tenant())
    WITH CHECK (tenant_id = app_tenant());

-- What the gate decided for each run, shown in the Sync tab.
ALTER TABLE sync_runs ADD COLUMN gate jsonb;

-- The worker keeps the bookmark. The API only shows it.
GRANT SELECT, INSERT, UPDATE ON sync_cursors TO acme_sync;
GRANT SELECT ON sync_cursors TO acme_app;
