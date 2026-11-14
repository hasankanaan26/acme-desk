# Acme Desk

An employee helpdesk assistant for Acme Corp, built across four sessions as one production-shaped
application: a real document source synced on a schedule, a platform on Postgres with sign-in,
per-person access and tenants, retrieval techniques compared and measured on the same documents,
and guardrails, evals and a release gate on top.

Each session is one checkpoint, a complete runnable app copied forward from the one before it:

| Checkpoint | Session | What it adds |
|---|---|---|
| `checkpoints/01-source` | Part 1, Mon 9 Nov | The ingestion pipeline on a real document source (Google Drive), synced on a timer |
| `checkpoints/02-platform` | Part 2, Wed 11 Nov | Postgres + pgvector for all state, sign-in, access checked live in the query, Row-Level Security between tenants, a sync worker with its own database role |
| `checkpoints/03-retrieval` | Part 3, Fri 13 Nov | Two indexes chunked differently, parent-document and HyDE, and a scoreboard of which technique wins which kind of question, at what cost, with leaks at zero |
| `checkpoints/04-release` | Part 4, Mon 16 Nov | Guardrails, evals as a release gate, kill switch, dashboard, Docker, runbook |

Everything runs on a laptop: local folder mode, local embeddings, fake services in the tests, and
from Part 2 a Postgres container (`docker compose up -d db`). An LLM key is needed only for written
answers. A Google account is needed only by the instructor (see `docs/drive-setup.md`).

## Quick start

```bash
git clone https://github.com/hasankanaan26/acme-desk
cd acme-desk
python -m venv .venv
.venv\Scripts\activate              # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env              # macOS/Linux: cp .env.example .env
python warmup.py                    # downloads the local embedding model, about 80 MB
python run_checkpoint.py 01-source  # http://localhost:8000/ui
```

From Part 2 on, start Postgres first and set up the database once (see `checkpoints/02-platform/README.md`):

```bash
docker compose up -d db
python checkpoints/02-platform/db.py migrate
python checkpoints/02-platform/db.py seed
```

Each checkpoint's `README.md` has the commands for its session and the exercises for that night.

## Layout

```
checkpoints/0N-*/      one complete app per session: app/, the CLI scripts, tests/
shared/data/           Acme's documents (20 files, 7 sites), the register, the identities, the weekend's events
                       (from Part 2 the register and identities are only what db.py seeds Postgres from)
shared/golden/         the golden sets the evaluations run on
docs/                  drive-setup.md, sharepoint-mapping.md, architecture, runbook (Part 4)
slides/                the decks (.pptx) for each part
```

## Code style

Small files, small functions, descriptive names. Every module opens with a `# ====` banner that says
what it is for; key functions carry a `# Purpose:` comment; `# TODO (Lab exercise):` marks the
exercises. Settings come from `.env` through `os.getenv()`. The ingestion code is plain functions.
The assistant (Parts 2 to 4) uses LangGraph for the graph and the checkpointer, and nothing else:
nodes and tools are plain functions you can read top to bottom.

## Sources

Part 1 lifts the ingestion pipeline from the RAG module's checkpoint 5 (`rag-week-bootcamp`). Parts 2 to 4
lift the graph runtime, streaming, approval, guardrail and release-gate code from the Deskhand workshop
(`resolvo-workshop`). Both are credited in the headers of the files that came from them.
