-- ============================================================
-- 002 — who may touch what, enforced by the database
-- ============================================================
-- Three database roles, each with the least it needs:
--
--   postgres    (the owner) runs migrations, seed, admin scripts.
--               Never used by the running app.
--   acme_app    the API. Reads chunks, manages users, groups,
--               sessions and the register. CANNOT write chunks or
--               indexes: a bug in a web route cannot corrupt the index.
--   acme_sync   the sync worker. Writes chunks and indexes, reads the
--               register. CANNOT see users, password hashes, sessions
--               or groups: a compromised worker leaks no identities.
--
-- Row-Level Security: every transaction says which tenant it acts for
-- (SET LOCAL app.tenant_id = '...'), and every tenant table has a
-- policy "tenant_id = app_tenant()". Forget a WHERE clause in Python
-- and the database still returns nothing from another tenant. No
-- tenant set at all: no rows.
--
-- acme_app and acme_sync are created by db.py before this file runs
-- (their passwords come from .env, not from a file in git).
-- ============================================================

-- The tenant and user this transaction acts for. Empty -> NULL -> no rows.
CREATE FUNCTION app_tenant() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION app_user() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- ---- Row-Level Security on every tenant table ----
-- FORCE: the policies apply to the table owner too (only a superuser
-- bypasses them, and the app never connects as one).

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['groups', 'group_members', 'documents', 'document_acl',
                             'search_indexes', 'chunks', 'sync_runs', 'sync_requests']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant()) '
                       'WITH CHECK (tenant_id = app_tenant())', t);
    END LOOP;
END $$;

-- Memberships: at sign-in we know the user before we know the tenant,
-- so a user may also see their OWN memberships in any tenant.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_self ON memberships
    USING (tenant_id = app_tenant() OR user_id = app_user())
    WITH CHECK (tenant_id = app_tenant());

-- Tenants: the API sees the tenant it acts for and the tenants the
-- signed-in user belongs to. The worker must loop over every tenant.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY app_sees_own ON tenants TO acme_app
    USING (id = app_tenant() OR id IN (SELECT tenant_id FROM memberships WHERE user_id = app_user()))
    WITH CHECK (id = app_tenant());
CREATE POLICY sync_sees_all ON tenants TO acme_sync USING (true) WITH CHECK (true);

-- Audit: written for a tenant, or with no tenant (a failed sign-in for
-- an unknown email); read only for the tenant you act for.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY read_own ON audit_log FOR SELECT USING (tenant_id = app_tenant());
CREATE POLICY write_own_or_none ON audit_log FOR INSERT
    WITH CHECK (tenant_id = app_tenant() OR tenant_id IS NULL);

-- users, sessions, login_attempts, workers: not tenant data. Only
-- acme_app can reach the first three (the worker has no grant at all).

-- ---- Grants: nothing by default, then exactly what each role needs ----

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO acme_app, acme_sync;

-- The API
GRANT SELECT ON tenants TO acme_app;
GRANT UPDATE (sync_paused) ON tenants TO acme_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, memberships, groups, group_members,
                                        documents, document_acl, sessions TO acme_app;
GRANT SELECT, INSERT ON login_attempts, audit_log, sync_requests TO acme_app;
GRANT SELECT ON search_indexes, chunks, sync_runs, workers TO acme_app;

-- The sync worker
GRANT SELECT ON tenants, documents TO acme_sync;
GRANT UPDATE (live_index, previous_index) ON tenants TO acme_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_indexes, chunks TO acme_sync;
GRANT SELECT, INSERT, UPDATE ON sync_runs TO acme_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON workers TO acme_sync;
GRANT SELECT, UPDATE ON sync_requests TO acme_sync;
GRANT INSERT ON audit_log TO acme_sync;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO acme_app, acme_sync;
