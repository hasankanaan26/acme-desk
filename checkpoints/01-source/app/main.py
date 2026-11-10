# ============================================================
# ACME DESK — Part 1: the source
# ============================================================
# The Session 8 pipeline, now on a real document source.
#
# After this checkpoint, students have:
#   - Everything from the RAG module's checkpoint 5: the sync job
#     (add / change / relabel / touch / remove / quarantine, decided
#     per document and priced before it runs), format-aware parsers,
#     the document register, permission and freshness filters INSIDE
#     the vector search, "as of" retrieval, PII redaction, blue/green
#     rebuilds, and the leak / stale / ghost evaluation
#   - A second connector: a real Google Drive folder, read through a
#     service account (SOURCE=drive). The local folder stays for
#     offline work (SOURCE=local). Nothing in sync.py changed.
#   - A scheduler: the sync runs on its own every
#     SYNC_INTERVAL_SECONDS, inside this process (GET /sync/status)
#
# Key teaching moments:
#   - edit a Google Doc, trash a file, and watch the next tick plan
#     "change" and "remove" without anyone typing a command
#   - the same decision ladder on two sources: zero edits in sync.py
#   - Drive's md5Checksum and our MD5 agree: same bytes, same eTag
# ============================================================

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import (
    CONFIDENCE_HIGH_THRESHOLD,
    CONFIDENCE_LOW_THRESHOLD,
    DEFAULT_USER,
    DRIVE_ROOT_FOLDER_ID,
    LLM_PROVIDER,
    NO_RESULT_DISTANCE,
    ONEDRIVE_FOLDER,
    SOURCE,
    SOURCE_DIR,
)
from app.ingest import scheduler
from app.llm import get_model_name
from app.rag import catalog, store
from app.rag.doc_types import DOC_TYPES
from app.rag.embedder import embedding_model_id
from app.routers.ask import router as ask_router
from app.routers.compare import router as compare_router
from app.routers.documents import router as documents_router
from app.routers.embed import router as embed_router
from app.routers.inspect import router as inspect_router
from app.routers.query import router as query_router
from app.routers.search import router as search_router
from app.routers.sync import router as sync_router
from app.routers.ui import router as ui_router
from app.routers.visualize import router as visualize_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-18s | %(levelname)-5s | %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("chromadb.telemetry").setLevel(logging.WARNING)
logging.getLogger("chromadb.telemetry.product.posthog").setLevel(logging.CRITICAL)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("google_genai.models").setLevel(logging.WARNING)
logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)


# The one async function in this checkpoint: FastAPI's hook for "the
# server is starting / stopping". It starts the timer thread and
# stops it cleanly. With SYNC_INTERVAL_SECONDS=0 it does nothing.
@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(
    title="Acme Desk — Employee Helpdesk",
    description="Part 1: the source. The Session 8 pipeline on a real document source, synced on a schedule.",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(ask_router)
app.include_router(sync_router)
app.include_router(documents_router)
app.include_router(search_router)
app.include_router(inspect_router)
app.include_router(embed_router)
app.include_router(query_router)
app.include_router(compare_router)
app.include_router(ui_router)
app.include_router(visualize_router)

if SOURCE == "local":
    # The weekend-replay buttons only make sense for the fake source.
    from app.routers.source_events import router as source_events_router

    app.include_router(source_events_router)

app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")


@app.get("/health")
def health_check():
    """Health check — confirms the app is running and shows active settings."""
    try:
        live, info, store_error = catalog.active_name(), catalog.active_info(), None
    except Exception as exc:  # noqa: BLE001 - the vector database is down: say so, don't 500
        live, info, store_error = None, {}, str(exc)
    return {
        "status": "ok" if store_error is None else "degraded",
        "checkpoint": "01-source",
        "llm_provider": LLM_PROVIDER,
        "model": get_model_name(),
        "embedding_model": embedding_model_id(),
        "vector_store": store.LABEL,
        "vector_store_location": store.location(),
        "vector_store_error": store_error,
        "live_index": live,
        "live_index_built_with": info.get("embedding_model"),
        "source": SOURCE,
        "source_location": {
            "local": str(SOURCE_DIR),
            "onedrive": f"onedrive folder {ONEDRIVE_FOLDER or '(the drive root)'}",
        }.get(SOURCE, f"drive folder {DRIVE_ROOT_FOLDER_ID or '(not set)'}"),
        "scheduler": scheduler.status(),
        "default_user": DEFAULT_USER,
        "thresholds": {
            "high": CONFIDENCE_HIGH_THRESHOLD,
            "low": CONFIDENCE_LOW_THRESHOLD,
            "no_result": NO_RESULT_DISTANCE,
        },
        "doc_types": list(DOC_TYPES),
    }
