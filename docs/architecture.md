# Architecture

Acme Desk is four layers. Each session adds one, and each layer trusts the one below it less than
you would expect.

```
  people edit files            Google Drive (or the local folder)                 ← Part 1
        │                      SharePoint, Confluence, S3 would sit here too
        ▼
  the sync job                 connector → parse → redact PII → chunk → embed      ← Part 1
  (on a timer)                 one action per document, one transaction per sync
                               Part 2: its own process (worker.py), role acme_sync
        ▼
  Postgres + pgvector          chunks + vectors, the register, people, groups,      ← Part 2
                               sessions, sync runs, audit. Row-Level Security per
                               tenant; the ACL is JOINed INSIDE the vector search
        ▼
  the API                      sign-in → session → user, tenant, groups              ← Part 2
  (role acme_app)              (never from the request body); admin pages for
                               people, groups and document access
        ▼
  the assistant                a LangGraph workflow: identify → retrieve →         ← Part 2
  (one thread per              answer → finalize; identify = the session's
   conversation)               Principal; hybrid retrieval (pgvector + full-text);
                               memory in Postgres, visible only to its owner
        ▼
  retrieval                    every document cut twice: sections, and small       ← Part 3
  (inside the access filter)   chunks pointing to them, written by the same sync;
                               dense, keyword, hybrid, rerank, small, parent,
                               HyDE, multi-query, routed; one scoreboard per kind
                               of question, with leaks counted for every technique
        ▼
  guards and the gate          input, document and output guards; three eval       ← Part 4
                               suites behind thresholds; kill switch; dashboard
```

## Trust boundaries

| Crossing | What is trusted | What is not |
|---|---|---|
| Source → sync | the source's listing and change signals (md5, version) | file contents: parsed with fixed parsers, PII redacted, scans quarantined |
| Register → index | the register (owner, groups, status, dates) is the truth about a document | a file with no register entry is never indexed (fail closed) |
| Browser → API | the session cookie, looked up server-side to a person, a tenant and groups | anything in the request that claims an identity, a tenant or a group; a write without the `X-Acme-Request` header |
| API → database | nothing: the API's role (`acme_app`) cannot write the index, and every transaction is pinned to one tenant by Row-Level Security | a missing `WHERE tenant_id` in Python (the database adds it) |
| Worker → database | the worker's role (`acme_sync`) may write the index | the worker reading people, passwords, sessions or groups (no grant) |
| Index → model | nothing. Retrieved chunks are wrapped as untrusted documents | instructions found inside documents (Part 4 drops flagged chunks) |
| Retrieval technique → model | the technique's ranking of what this person may read | the technique deciding what may be read: every one searches inside the access filter, and `parent` re-checks it when it fetches the sections its small chunks point to |
| HyDE's rewrite → search | a model-written guess, used only as a search query | the guess as a source: it is never shown or quoted, only searched with |

## Where state lives

| State | Where | Owned by |
|---|---|---|
| documents | Google Drive, or `workspace/local-drive` | the document owners |
| the register: status, dates, who may read | Part 1: `register.json`. Part 2: `documents` + `document_acl` | Part 2: tenant admins, in the app, audited |
| people and groups | Part 1: `identities.json`. Part 2: `users`, `memberships`, `groups`, `group_members` | Part 2: tenant admins |
| chunks and vectors | Part 1: ChromaDB (with `acl_<group>` flags). Part 2: the `chunks` table (pgvector; access is a JOIN, not a flag) | the sync job |
| which index is live | Part 1: `acme_catalog.json`. Part 2: `tenants.live_index` | `app/rag/catalog.py` (blue/green) |
| sync runs | Part 1: `runs/sync-*.json` and process memory. Part 2: `sync_runs`, `sync_requests`, `workers` | the worker |
| sessions, sign-in attempts, audit | Part 2: `sessions`, `login_attempts`, `audit_log` | the API |
| conversations (Part 2) | `chat_threads` (one row per conversation, visible only to its owner) and LangGraph's checkpoint tables, whose rows are visible only through a thread you own | the person who started it |
| small chunks (Part 3) | the `chunks` table, `parent_id` = their section (a foreign key), written in the same transaction as the sections | the sync job |
| scoreboards (Part 3) | `runs/scoreboard-*.json`, and the frozen `runs/scoreboard-baseline.json` that Part 4's release gate compares against | `scoreboard.py` |

## Why these choices

- Plain functions for ingestion, LangGraph only for the graph and the checkpointer. The controls that
  matter (who may read, which version is in force, what a retrieval technique may return) are plain
  code you can read and test; the
  framework only decides which node runs next and remembers the conversation.
- A register instead of trusting file contents. Permissions, status and dates are facts about a
  document that live in the source system; the text of the file cannot be trusted to carry them.
- Filters inside the query, never after it. A top-k search that is filtered afterwards leaks through
  the ranking: the forbidden chunk took a slot a permitted one should have had.
- From Part 2, defence in depth is literal: the API filters by tenant, Row-Level Security filters by
  tenant again, and the database roles stop each process from doing the other's job. Any one of
  them failing alone leaks nothing.
- Every demo has an offline twin. `SOURCE=local`, the fake embedder and the fake Drive service in the
  tests mean a laptop with no keys can run every checkpoint and every test (from Part 2, with the
  Postgres container running).
