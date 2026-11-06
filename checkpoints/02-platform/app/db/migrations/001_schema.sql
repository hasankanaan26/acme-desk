-- ============================================================
-- 001 — the schema: everything except the files themselves
-- ============================================================
-- Part 1 kept state in four places: identities.json (who is who),
-- register.json (who may read what), ChromaDB on disk (the chunks)
-- and process memory (the scheduler). From Part 2 all of it lives
-- here, in one database, so it can be protected in one place.
--
--   tenants         one row per company that uses Acme Desk
--   users           people; global, because one person can belong
--                   to several tenants
--   memberships     user x tenant, with a role (member | admin)
--   groups          per tenant: employees, hr, finance, ...
--   group_members   who is in which group
--   documents       the register: one row per document (owner,
--                   status, dates). Was shared/data/register.json
--   document_acl    which groups may read which document
--   search_indexes  the blue/green indexes (was acme_catalog.json)
--   chunks          text + vector + labels (was ChromaDB)
--   sessions        who is signed in (only a hash of the cookie)
--   login_attempts  for rate limiting sign-in
--   sync_runs       every sync: when, why, what it decided
--   sync_requests   "Run now" from the UI, waiting for the worker
--   workers         the sync worker's heartbeat
--   audit_log       who did what
--
-- Every table that belongs to a tenant carries tenant_id. 002 turns
-- on Row-Level Security so the DATABASE refuses rows of other tenants,
-- whatever the application code forgets.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE tenants (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
    name           text NOT NULL,
    source_kind    text NOT NULL CHECK (source_kind IN ('drive', 'local')),
    source_ref     text NOT NULL,          -- a Drive folder id, or a folder path
    live_index     text,                   -- the blue/green pointer
    previous_index text,                   -- kept for rollback
    sync_paused    boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email            citext NOT NULL UNIQUE,
    display_name     text NOT NULL,
    password_hash    text,                 -- argon2id; NULL for an SSO-only account
    auth_provider    text NOT NULL DEFAULT 'password',
    external_subject text,                 -- the identity provider's id for this person (SSO, later)
    is_active        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_login_at    timestamptz,
    UNIQUE (auth_provider, external_subject)
);

CREATE TABLE memberships (
    tenant_id  uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE groups (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name        text NOT NULL CHECK (name ~ '^[a-z0-9-]+$'),
    description text NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE (tenant_id, name),
    UNIQUE (tenant_id, id)
);

-- The composite foreign keys make a cross-tenant membership impossible:
-- a group of tenant A cannot contain a member of tenant B.
CREATE TABLE group_members (
    tenant_id uuid NOT NULL,
    group_id  uuid NOT NULL,
    user_id   uuid NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (tenant_id, group_id) REFERENCES groups (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, user_id) REFERENCES memberships (tenant_id, user_id) ON DELETE CASCADE
);

-- The register. Same fields as register.json; the sync reads it with
-- the same load_register() as Part 1.
CREATE TABLE documents (
    tenant_id      uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_id         text NOT NULL,
    path           text NOT NULL,
    title          text NOT NULL,
    owner          text NOT NULL,
    doc_type       text NOT NULL,
    topic          text NOT NULL DEFAULT '',
    status         text NOT NULL,
    version        integer NOT NULL DEFAULT 1,
    effective_from date NOT NULL,
    effective_to   date,
    superseded_by  text,
    supersedes     text[] NOT NULL DEFAULT '{}',
    amends         text,
    depends_on     text[] NOT NULL DEFAULT '{}',
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, doc_id),
    UNIQUE (tenant_id, path)
);

-- Who may read a document. The search joins this table at query time,
-- so a change here takes effect on the next question: no sync, no
-- re-embedding.
CREATE TABLE document_acl (
    tenant_id uuid NOT NULL,
    doc_id    text NOT NULL,
    group_id  uuid NOT NULL,
    PRIMARY KEY (tenant_id, doc_id, group_id),
    FOREIGN KEY (tenant_id, doc_id) REFERENCES documents (tenant_id, doc_id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, group_id) REFERENCES groups (tenant_id, id) ON DELETE CASCADE
);

-- Blue/green: a rebuild writes a NEW index next to the live one, then
-- tenants.live_index flips in the same transaction.
CREATE TABLE search_indexes (
    tenant_id        uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name             text NOT NULL,
    embedding_model  text,
    pipeline_version text,
    chunks           integer NOT NULL DEFAULT 0,
    last_sync        timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, name)
);

-- The chunks. `metadata` holds every label Part 1 stored in ChromaDB;
-- the generated columns pull out the ones the search filters on, so
-- they can be indexed and there is still one source of truth.
-- `embedding` has no fixed size because the embedding model is a
-- setting (local MiniLM: 384, Azure text-embedding-3-small: 1536).
CREATE TABLE chunks (
    tenant_id      uuid NOT NULL,
    index_name     text NOT NULL,
    id             text NOT NULL,          -- "<doc_id>::<nnn>"
    doc_id         text NOT NULL,
    chunk_index    integer NOT NULL,
    text           text NOT NULL,
    metadata       jsonb NOT NULL,
    embedding      vector NOT NULL,
    dims           integer GENERATED ALWAYS AS (vector_dims(embedding)) STORED,
    status         text GENERATED ALWAYS AS (metadata ->> 'status') STORED,
    doc_type       text GENERATED ALWAYS AS (metadata ->> 'doc_type') STORED,
    effective_from integer GENERATED ALWAYS AS ((metadata ->> 'effective_from')::integer) STORED,
    effective_to   integer GENERATED ALWAYS AS ((metadata ->> 'effective_to')::integer) STORED,
    tsv            tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
    PRIMARY KEY (tenant_id, index_name, id),
    FOREIGN KEY (tenant_id, index_name) REFERENCES search_indexes (tenant_id, name) ON DELETE CASCADE
);

CREATE INDEX chunks_by_doc ON chunks (tenant_id, index_name, doc_id);
CREATE INDEX chunks_fulltext ON chunks USING gin (tsv);
-- One approximate-nearest-neighbour index per vector size we use. The
-- search casts to the same size, so the planner can pick the right one.
CREATE INDEX chunks_hnsw_384 ON chunks
    USING hnsw ((embedding::vector(384)) vector_cosine_ops) WHERE dims = 384;
CREATE INDEX chunks_hnsw_1536 ON chunks
    USING hnsw ((embedding::vector(1536)) vector_cosine_ops) WHERE dims = 1536;

-- Sign-in. The cookie holds a random token; the database holds only its
-- SHA-256, so a leaked sessions table cannot be replayed.
CREATE TABLE sessions (
    token_hash   bytea PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    ip           text,
    user_agent   text
);
CREATE INDEX sessions_by_user ON sessions (user_id);

CREATE TABLE login_attempts (
    id        bigserial PRIMARY KEY,
    email     citext NOT NULL,
    ip        text,
    succeeded boolean NOT NULL,
    at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_by_email ON login_attempts (email, at);
CREATE INDEX login_attempts_by_ip ON login_attempts (ip, at);

-- The sync job, now a worker process. Part 1 kept this in memory.
CREATE TABLE sync_runs (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    trigger         text NOT NULL CHECK (trigger IN ('tick', 'manual', 'cli')),
    requested_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    worker          text,
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    seconds         numeric,
    ok              boolean,               -- NULL while running, or when skipped
    skipped_reason  text,
    counts          jsonb,
    chunks_in_index integer,
    error           text,
    report          jsonb
);
CREATE INDEX sync_runs_recent ON sync_runs (tenant_id, started_at DESC);

CREATE TABLE sync_requests (
    id           bigserial PRIMARY KEY,
    tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    requested_by uuid REFERENCES users (id) ON DELETE SET NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    picked_at    timestamptz
);

CREATE TABLE workers (
    id               text PRIMARY KEY,
    started_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at     timestamptz NOT NULL DEFAULT now(),
    interval_seconds numeric NOT NULL
);

CREATE TABLE audit_log (
    id        bigserial PRIMARY KEY,
    tenant_id uuid REFERENCES tenants (id) ON DELETE CASCADE,
    user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    actor     text NOT NULL,               -- an email, or "worker:<id>"
    action    text NOT NULL,               -- e.g. auth.login, search, admin.document.update
    target    text,
    detail    jsonb NOT NULL DEFAULT '{}',
    ip        text,
    at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_recent ON audit_log (tenant_id, at DESC);
