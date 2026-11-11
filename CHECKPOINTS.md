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

Endpoints: `POST /auth/login|logout|password`, `GET /auth/me`, `GET /search` (`?strategy=dense|keyword|hybrid`),
`POST /query`, `GET /chat/threads`, `POST /chat/threads`, `GET /chat/threads/{id}`,
`POST /chat/threads/{id}/messages` (Server-Sent Events), `GET /documents`, `GET /sync/status|runs|runs/{id}`,
`POST /sync/now|pause|resume`, `/admin/users`, `/admin/groups`, `PATCH /admin/documents/{doc_id}`,
`GET /admin/audit`, `/login`, `/ui`, `/health`.

The session's last block, the chat: a LangGraph workflow (`identify → retrieve → answer → finalize`,
one branch) whose `identify` node is the session's Principal; follow-ups rewritten into standalone
questions; the Postgres checkpointer, with its tables under a policy that shows a conversation only to
the person who started it; every turn re-checks the documents earlier answers used and hides the ones
built on a document the person can no longer read; hybrid retrieval (pgvector + Postgres full-text,
fused by rank); the reply streamed as Server-Sent Events (`app/assistant/`, `app/routers/chat.py`).

Merged in on 11 Nov: the change gate (a tick asks Drive's change log first and skips the sync when
nothing moved, `app/ingest/gate.py`, `005_change_gate.sql`), and the RAG weeks' checkpoint 6
techniques on the same Postgres store and access filter: `rerank`, `hybrid_rerank`, `hyde`,
`multi_query`, `routed` (`app/rag/reranker.py`, `router.py`), each with a `trace`, on `/search`,
`/query` and both UI tabs. 111 tests.

Demo flow, chat: the team dinner limit ($90), "And for a client dinner?" ($150, the follow-up rewritten)
→ give the intern `hr`, the salary bands in a new conversation → take `hr` away, "And for a junior?":
no information, and the earlier answer is hidden → the same thread as `hr-partner`: 404.

## 03-retrieval: which search wins, and how you prove it (Part 3, Fri 13 Nov)

Planned (tools and agents were covered in an earlier course, so this session replaces them): the same
Acme documents in two indexes, today's sections with a title header and small chunks that point to
their parent section (parent-document retrieval); HyDE at query time; a scenario question set built so
the techniques disagree (casual wording, an exact ticket id, a whole-section list, a chunk that loses
its context, two documents, a question the documents can't answer); one scoreboard per scenario with
Hit@1, MRR, LLM calls, latency and leaks; one answer-level check (correct, not only faithful). Every
technique runs inside Part 2's access filter.

## 04-release: guardrails, evals, release (Part 4, Mon 16 Nov)

Planned: a planted document with an indirect prompt injection; input, document and output guards;
two eval suites (retrieval from Part 3, and safety) behind `release.py` thresholds; kill switch, cost
dashboard, Docker Compose, runbook.
