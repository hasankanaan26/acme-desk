# Architecture

Acme Desk is four layers. Each session adds one, and each layer trusts the one below it less than
you would expect.

```
  people edit files            Google Drive (or the local folder)                 ← Part 1
        │                      SharePoint, Confluence, S3 would sit here too
        ▼
  the sync job                 connector → parse → redact PII → chunk → embed      ← Part 1
  (on a timer)                 one action per document; the register decides who
                               may read what; labels travel onto every chunk
        ▼
  the index                    ChromaDB; permission and freshness filters run
                               INSIDE the query (access_filter), never after it
        ▼
  the assistant                a LangGraph workflow: identify → retrieve → answer  ← Part 2
  (one thread per              identity from an API key, groups from the directory;
   conversation)               retrieved text is data, never instructions
        ▼
  tools                        allowlist by group → argument validation → policy   ← Part 3
  (the only writes)            in code → human approval → idempotency key → audit
        ▼
  guards and the gate          input, document and output guards; three eval       ← Part 4
                               suites behind thresholds; kill switch; dashboard
```

## Trust boundaries

| Crossing | What is trusted | What is not |
|---|---|---|
| Source → sync | the source's listing and change signals (md5, version) | file contents: parsed with fixed parsers, PII redacted, scans quarantined |
| Register → index | the register (owner, groups, status, dates) is the truth about a document | a file with no register entry is never indexed (fail closed) |
| User → assistant | the API key, which maps to a person and their groups in `identities.json` | anything in the request body that claims an identity or a group |
| Index → model | nothing. Retrieved chunks are wrapped as untrusted documents | instructions found inside documents (Part 4 drops flagged chunks) |
| Model → tools | the model's *proposal* of a tool and its arguments | the proposal itself: the allowlist, the schema, the policy and a human decide whether it runs |
| Tools → model | the tool's result, as data | instructions in tool results |

## Where state lives

| State | Where | Owned by |
|---|---|---|
| documents | Google Drive, or `workspace/local-drive` | the document owners |
| what the index knows about each document | chunk metadata in ChromaDB (`DOC_ID::nnn` ids, `acl_<group>` flags, status, version, dates, eTag, content hash) | the sync job |
| which index is live | `chroma_data/acme_catalog.json` | `app/rag/catalog.py` (blue/green) |
| sync reports | `checkpoints/0N-*/runs/sync-*.json` | the sync job |
| the scheduler | process memory (`app/ingest/scheduler.py`) | the API process |
| conversations (Part 2) | SQLite, through the LangGraph checkpointer, one thread per conversation | the graph |
| approvals, audit, tickets (Part 3) | SQLite tables; a Google Sheet as a mirror | the tools layer |

## Why these choices

- Plain functions for ingestion, LangGraph only for the graph and the checkpointer. The controls that
  matter (who may read, which tool may run, who approved) are plain code you can read and test; the
  framework only decides which node runs next and remembers where a paused run stopped.
- A register instead of trusting file contents. Permissions, status and dates are facts about a
  document that live in the source system; the text of the file cannot be trusted to carry them.
- Filters inside the query, never after it. A top-k search that is filtered afterwards leaks through
  the ranking: the forbidden chunk took a slot a permitted one should have had.
- Every demo has an offline twin. `SOURCE=local`, the fake embedder and the fake Drive service in the
  tests mean a laptop with no keys can run every checkpoint and every test.
