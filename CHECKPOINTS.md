# Checkpoints

One per session. Each is a complete app; diff two neighbours to see exactly what a session added.

```bash
git diff --no-index checkpoints/01-source checkpoints/02-platform --stat
```

## 01-source: the Session 8 pipeline on a real document source (Part 1, Mon 9 Nov)

Adds: `DriveConnector` (Google Drive through a service account), `make_connector()`, the MD5 eTag,
the scheduler (`app/ingest/scheduler.py`, `GET /sync/status`, `POST /sync/now|pause|resume`),
`drive_admin.py`, `scheduler.py`, `fake_drive.py` (the offline source), the scheduler card in the UI.

Demo flow: `drive_admin.py tree` → `sync.py --source drive` (add 18, quarantine 1, skip 1) → `--apply` →
API with `SYNC_INTERVAL_SECONDS=60` → edit a Doc and trash a file in Drive → the tick plans `change` and
`remove` → the answer to the carry-over question moves from 5 to 10 days → `GET /sync/explain`.

Endpoints: `POST /sync`, `GET /sync/status`, `POST /sync/now`, `GET /sync/explain`, `GET /documents`,
`GET /search`, `POST /query`, `GET /store/inspect`, `/source-events/*` (local mode), `/ui`, `/health`.

## 02-platform: Postgres, sign-in, access, tenants (Part 2, Wed 11 Nov)

Adds: Postgres + pgvector for every piece of state but the files (`app/db/migrations/`), plain-SQL
migrations and `db.py` (`migrate`, `seed`, `reset`, `status`); the vector store on pgvector with the
same functions as ChromaDB's (`app/rag/store_pg.py`); the register in Postgres (`registry.py`); sign-in
with argon2id and server-side sessions (`app/auth/`); access as a JOIN inside the search, live on the
next question; Row-Level Security between tenants; three database roles (owner, `acme_app`,
`acme_sync`); the sync as a separate worker (`worker.py`) with an advisory lock, `sync_runs` and
"Run now" over `NOTIFY`; an audit log; admin pages for people, groups and document access.

Demo flow: sign in as the intern, find the salary bands (Friday's mis-share) → sign in as the admin,
untick `employees` on the bands → the intern's next search has none, nothing re-embedded → give the
intern `hr` → the bands come back on the next search → the audit log shows both, with before and after.

Unchanged: the connectors, parsers, PII redaction, chunker, decision ladder and blue/green. Same top 5
for all 24 golden retrieval questions as Part 1's ChromaDB.

Endpoints: `POST /auth/login|logout|password`, `GET /auth/me`, `GET /search`, `POST /query`,
`GET /documents`, `GET /sync/status|runs|runs/{id}`, `POST /sync/now|pause|resume`,
`/admin/users`, `/admin/groups`, `PATCH /admin/documents/{doc_id}`, `GET /admin/audit`, `/login`, `/ui`, `/health`.

Planned for the session's last block: the chat assistant on this platform, a LangGraph workflow
(`identify → retrieve → answer → finalize`) whose `identify` node is the session's Principal, the
Postgres checkpointer, hybrid retrieval with Postgres full-text search next to pgvector, streaming.

## 03-tools: tools and agents with real security controls (Part 3, Fri 13 Nov)

Planned: six tools (`search_docs`, `lookup_employee`, `get_my_tickets`, `open_it_ticket`,
`file_leave_request`, `draft_policy_exception_email`); a per-group allowlist, Pydantic argument
validation, arg-level policy in code, human approval for every write through LangGraph `interrupt()`,
idempotency keys, step and cost budgets, an audit row for every decision; the workflow and the
autonomous agent side by side on the same tools; tickets, approvals and audit in Postgres, under the
same Row-Level Security as everything else.

## 04-release: guardrails, evals, release (Part 4, Mon 16 Nov)

Planned: a planted document with an indirect prompt injection; input, document and output guards plus
an "unsolicited write" policy check; three eval suites (retrieval, safety, tool calls) behind
`release.py` thresholds; kill switch, cost dashboard, Docker Compose, runbook.
