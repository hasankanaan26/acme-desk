# ============================================================
# ACME DESK — Part 2: the platform
# ============================================================
# Part 1 was a lab: the right pipeline, with its state in files and
# anyone able to say "I am hr-partner". Part 2 makes it a platform:
#
#   - Postgres + pgvector holds everything but the files: tenants,
#     people, groups, the register, chunks and vectors, sessions,
#     sync runs, the audit log (app/db/migrations/)
#   - sign-in with email and password; the session decides who you
#     are, your tenant and your groups (app/auth/)
#   - access is a JOIN at query time: change a user's groups or a
#     document's groups and the next question obeys it, no sync
#   - Row-Level Security: the database refuses other tenants' rows
#   - three database roles: the API cannot write chunks, the worker
#     cannot read users, only db.py can change the schema
#   - the sync is a separate worker process (python worker.py)
#   - the chat: a LangGraph workflow (identify -> retrieve -> answer
#     -> finalize) with its memory in Postgres, under the same rules,
#     hybrid retrieval, streamed to the browser (app/assistant/)
#
# Unchanged from Part 1: the connector, parsers, PII redaction, the
# chunker, the sync's decision ladder, blue/green indexes, and every
# answer it retrieves (same top-5 for all 24 golden questions).
# ============================================================

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app import db
from app.config import (
    CONFIDENCE_HIGH_THRESHOLD,
    CONFIDENCE_LOW_THRESHOLD,
    LLM_PROVIDER,
    NO_RESULT_DISTANCE,
    RETRIEVAL_STRATEGY,
    RETRIEVAL_STRATEGY_NOTE,
    VECTOR_STORE,
)
from app.llm import get_model_name
from app.rag.doc_types import DOC_TYPES
from app.rag.embedder import embedding_model_id
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.chat import router as chat_router
from app.routers.documents import router as documents_router
from app.routers.query import router as query_router
from app.routers.search import router as search_router
from app.routers.sync import router as sync_router
from app.routers.ui import router as ui_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-18s | %(levelname)-5s | %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("google_genai.models").setLevel(logging.WARNING)
logging.getLogger("psycopg.pool").setLevel(logging.WARNING)

app = FastAPI(
    title="Acme Desk — Employee Helpdesk",
    description="Part 2: the platform. Postgres + pgvector, sign-in, per-user access, tenants, a sync worker, the chat.",
    version="2.0.0",
)

app.include_router(auth_router)
app.include_router(search_router)
app.include_router(query_router)
app.include_router(chat_router)
app.include_router(documents_router)
app.include_router(sync_router)
app.include_router(admin_router)
app.include_router(ui_router)

app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/ui")


@app.get("/health")
def health_check():
    """Public: is the app up, can it reach the database. Names no tenant and no document."""
    try:
        with db.tx("app") as conn:
            conn.execute("SELECT 1")
        database = "ok"
    except Exception as exc:  # noqa: BLE001
        database = f"unreachable: {type(exc).__name__}"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "checkpoint": "02-platform",
        "database": database,
        "vector_store": VECTOR_STORE,
        "retrieval": RETRIEVAL_STRATEGY,
        "retrieval_note": RETRIEVAL_STRATEGY_NOTE,
        "llm_provider": LLM_PROVIDER,
        "model": get_model_name(),
        "embedding_model": embedding_model_id(),
        "thresholds": {"high": CONFIDENCE_HIGH_THRESHOLD, "low": CONFIDENCE_LOW_THRESHOLD,
                       "no_result": NO_RESULT_DISTANCE},
        "doc_types": list(DOC_TYPES),
    }
