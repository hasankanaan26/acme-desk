# Part 2 — The platform

## Objective

Turn Part 1's lab into a platform. Everything except the files moves into Postgres; people sign in;
what each person can read is decided by the database, live; tenants cannot see each other even when
the code forgets to filter; and the sync becomes its own process with its own, smaller rights.

The test of it: an admin unticks one box ("employees may read the salary bands"), and the intern's
very next question no longer finds them. No sync, no re-embedding, and an audit row says who did it.

## What's covered

- **Postgres + pgvector holds the state.** Tenants, people, groups, the register, chunks and their
  vectors, sessions, sync runs and the audit log. Part 1 kept these in two JSON files, a ChromaDB
  folder, a catalog file and process memory.
- **Sign-in.** Email and password, argon2id hashes, a server-side session in an `HttpOnly`,
  `SameSite=Lax` cookie, idle and absolute expiry, a rate limit, one error message for every failure.
  Who you are, your tenant and your groups come from the session, never from the request.
- **Access is a JOIN.** The search joins `document_acl` against the user's groups inside the same SQL
  query as the vector search. Change a document's groups or a person's groups, and the next question
  obeys it.
- **Row-Level Security.** Every tenant table carries `tenant_id`; every transaction says which tenant
  it acts for; the database adds `tenant_id = app_tenant()` to every query. No tenant set: no rows.
- **Three database roles.** `acme_app` (the API) reads chunks and manages people, and cannot write the
  index. `acme_sync` (the worker) writes the index, and cannot read people, passwords, sessions or
  groups. The owner (`db.py`) changes the schema and is never used by a running process.
- **The worker.** `worker.py` syncs every tenant on a timer and on "Run now", one sync per tenant at a
  time across any number of workers (a Postgres advisory lock), each sync in one transaction.
- **Unchanged from Part 1:** the connectors, parsers, PII redaction, the chunker, the sync's decision
  ladder, blue/green indexes. Retrieval parity was checked: all 24 golden retrieval questions return
  the same top 5, in the same order, with the same distances, as Part 1's ChromaDB.

## Run it

```bash
docker compose up -d db                                  # Postgres 17 + pgvector, on port 5433
python checkpoints/02-platform/db.py migrate             # the schema, the roles, the policies
python checkpoints/02-platform/db.py seed                # Acme: 6 accounts (passwords printed once), the register
python checkpoints/02-platform/fake_drive.py reset       # offline: Friday's files (skip with SOURCE=drive)
python checkpoints/02-platform/sync.py --apply           # the first index (add 18, quarantine 1, skip 1)
python run_checkpoint.py 02-platform                     # http://localhost:8000 -> sign in
python checkpoints/02-platform/worker.py --interval 60   # a second terminal: the worker
```

Set `ACME_SEED_PASSWORD` in `.env` before `seed` to give every demo account the same password (handy in
class). Leave it empty and `seed` prints a random one per account. The accounts are the five personas
of Part 1 (`intern@acme.test`, `eng-manager@`, `hr-partner@`, `finance-lead@`, `sales-rep@`), with the
same groups, plus `admin@acme.test`, the tenant admin.

As three containers, each with only its own database URL (the API has no Drive key, the worker has no
API URL, neither has the owner's):

```bash
docker compose --profile platform up --build             # after db.py migrate + seed from the laptop
```

## The demo

1. Sign in as `intern@acme.test`. Search "salary range senior developer": the 2026 bands come back.
   That is Friday's mis-share: the register says `employees` may read them.
2. In a second browser (or a private window), sign in as `admin@acme.test`. **Document access** →
   Engineering Salary Bands → untick `employees`, tick `hr` and `managers` → Save.
3. Back to the intern: the same search, no bands. Nothing was re-embedded and the worker did nothing.
4. **People** → the intern → tick `hr` → Save. The intern's next search finds the bands again; untick,
   and they are gone again. Same session: groups are re-read on every request.
5. **Audit log**: both changes, with before and after, and every search with the documents it returned.
6. **Sync**: the worker's runs. Edit a file in Drive (or `fake_drive.py apply 2`) and watch the next
   tick plan `change`.

## The security model, layer by layer

| Layer | What enforces it | What it stops |
|---|---|---|
| Who you are | the session cookie → `sessions` → `users` (`app/auth/`) | `?user=hr-partner`: there is no such parameter any more |
| What you can read | `EXISTS (document_acl ⨝ your groups)` inside the search (`app/rag/store_pg.py`) | a forbidden chunk taking a top-k slot, or reaching the model |
| Which tenant | Row-Level Security on every tenant table (`002_security.sql`) | a missing `WHERE tenant_id = ...` in Python leaking another company |
| What each process can do | three database roles with exact grants (`002_security.sql`) | a web bug corrupting the index; a worker bug leaking password hashes |
| Who changed what | `audit_log`, written in the same transaction as the change | "who gave the intern access to the salary bands?" |
| Requests from other sites | `SameSite=Lax` + the `X-Acme-Request` header on every write | another site making your browser post to Acme Desk |

## What's new in this checkpoint

| File | What it does |
|------|-------------|
| `app/db/migrations/001_schema.sql` | Every table, with `tenant_id` and composite keys that make a cross-tenant row impossible |
| `app/db/migrations/002_security.sql` | `app_tenant()`, Row-Level Security, the two roles' grants |
| `app/db/migrations/003_admin_checks.sql` | `tenants_of_user()`: one narrow `SECURITY DEFINER` question past RLS |
| `app/db/__init__.py` | `db.tx(role, tenant_id, user_id)`: one pool per role, `SET LOCAL app.tenant_id` |
| `app/db/migrate.py`, `app/db/seed.py`, `db.py` | Migrations (plain SQL, applied once), the seed, `migrate` / `seed` / `reset` / `status` |
| `app/rag/store_pg.py` | The vector store on pgvector: same functions as `store_chroma.py`, the ACL join, iterative HNSW scans |
| `app/rag/catalog.py` | Blue/green: `tenants.live_index`, flipped in the same transaction that built the index |
| `app/ingest/registry.py` | The register in Postgres, read back in `register.json`'s shape |
| `app/ingest/worker.py`, `worker.py` | The worker: advisory lock, `sync_runs`, `sync_requests` + `NOTIFY`, heartbeat |
| `app/auth/` | `passwords.py` (argon2id), `sessions.py`, `service.py` (sign-in, the `Principal`), `deps.py` (guards, CSRF) |
| `app/routers/auth.py`, `admin.py` | Sign in / out / me / password; people, groups, document access, audit |
| `app/static/login.html`, `app.html`, `app.js` | The sign-in page and the workbench (admin tabs only for admins) |
| `tests/` | 76 tests against a throwaway `acme_test` database: sync, access, tenants, roles, sign-in, the worker |

Removed from Part 1, because they belonged to the RAG module's workbench: the compare, embed,
visualize and store-inspect tabs, the naive ingest, and the in-process scheduler.

## Tests

```bash
docker compose up -d db
pytest checkpoints/02-platform/tests -q     # builds acme_test from the migrations every run
```

## Honest limits

- **Passwords, not SSO.** A company would sign people in through its identity provider (Google
  Workspace, Entra ID) with OpenID Connect. The `users` table already has `auth_provider` and
  `external_subject`; `app/auth/service.py` marks where the token check would replace the password check.
- **Groups live here, not in a directory.** A company's groups come from its directory. Here an admin
  maintains them in the People tab.
- **The register is still the truth about access, not Drive's sharing.** Reading Drive's sharing needs a
  second, admin-approved identity (Part 1, slide 15). The register is now edited in the app, audited.
- **One tenant has documents.** Acme. The schema, RLS and tests are multi-tenant (the tests run a second
  company, Globex); a real second tenant needs only a row and a second shared folder.
- **The `users` table is global and readable by the API role.** A tenant admin adding someone by email
  can learn that the email has an account elsewhere. Production would put that lookup behind a narrow
  function too, like `tenants_of_user()`.
- **The sync holds a transaction open while it embeds.** Fine for 88 chunks; for 50,000 you would
  embed first, outside the transaction, then write in one short one.
