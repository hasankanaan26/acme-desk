-- ============================================================
-- 004 — the chat: conversations that belong to one person
-- ============================================================
-- One row per conversation (a "thread"). The messages themselves are
-- kept by LangGraph's Postgres checkpointer, in its own three tables
-- (checkpoints, checkpoint_blobs, checkpoint_writes), keyed by the
-- thread's id. db.py migrate creates those right after this file and
-- puts them under the same rule as this table (app/assistant/memory.py):
--
--   a thread is visible only to the person who started it, in the
--   tenant they started it in. Not to an admin, not to a colleague,
--   not to the worker.
--
-- So the database itself refuses another person's conversation, even
-- if the API is handed a valid thread id that is not theirs.
-- ============================================================

CREATE TABLE chat_threads (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  uuid NOT NULL,
    user_id    uuid NOT NULL,
    title      text NOT NULL DEFAULT 'New conversation',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- leave the tenant, and your conversations in it go too
    FOREIGN KEY (tenant_id, user_id) REFERENCES memberships (tenant_id, user_id) ON DELETE CASCADE
);
CREATE INDEX chat_threads_mine ON chat_threads (tenant_id, user_id, updated_at DESC);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY own_threads ON chat_threads
    USING (tenant_id = app_tenant() AND user_id = app_user())
    WITH CHECK (tenant_id = app_tenant() AND user_id = app_user());

-- The API reads and writes conversations. The worker has no grant at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_threads TO acme_app;
