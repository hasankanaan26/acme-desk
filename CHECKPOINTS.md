# Checkpoints

One per session. Each is a complete app; diff two neighbours to see exactly what a session added.

```bash
git diff --no-index checkpoints/01-source checkpoints/02-assistant --stat
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

## 02-assistant: chat, retrieval, identity (Part 2, Wed 11 Nov)

Planned: a LangGraph workflow (`identify → retrieve → answer → finalize`) with a SQLite checkpointer
and one `thread_id` per conversation; identity from an `X-Api-Key` header mapped to a person and their
groups (no more `?user=`); hybrid retrieval and re-ranking from the RAG module's checkpoint 6, every
strategy inside `access_filter()`; SSE streaming with replay; a chat page with citations.

## 03-tools: tools and agents with real security controls (Part 3, Fri 13 Nov)

Planned: six tools (`search_docs`, `lookup_employee`, `get_my_tickets`, `open_it_ticket`,
`file_leave_request`, `draft_policy_exception_email`); a per-group allowlist, Pydantic argument
validation, arg-level policy in code, human approval for every write through LangGraph `interrupt()`,
idempotency keys, step and cost budgets, an audit row for every decision; the workflow and the
autonomous agent side by side on the same tools; writes mirrored to a Google Sheet.

## 04-release: guardrails, evals, release (Part 4, Mon 16 Nov)

Planned: a planted document with an indirect prompt injection; input, document and output guards plus
an "unsolicited write" policy check; three eval suites (retrieval, safety, tool calls) behind
`release.py` thresholds; kill switch, cost dashboard, Docker Compose, runbook.
