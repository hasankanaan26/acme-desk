# ============================================================
# Router: /ui — RAG workbench (every endpoint in one page)
# ============================================================
# Serves static/query.html. Its tabs cover the whole pipeline:
#   Answer:   Ask (RAG) /query, RAG vs plain /compare, LLM only /ask
#   Retrieve: Search /search, Embeddings /embed
#   Data:     Ingest /ingest, Store /store/inspect, Visualize /visualize
# The page also shows confidence badges, distance scores, and
# clear no-result and weak-evidence states.
#
# TEACHING POINT:
#   This is NOT a frontend course. The page is plain HTML with
#   vanilla JS (static/ui.js) and CSS (static/ui.css), no frameworks.
#   The point is to show transparent UX, not build a UI.
# ============================================================

from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["UI"])


# Purpose:
# Serves the browser-based RAG query interface at /ui.
# Open http://localhost:8000/ui in your browser.
@router.get("/ui", response_class=HTMLResponse)
def show_query_ui():
    """Serve the transparent RAG query interface."""
    html_path = Path(__file__).parent.parent / "static" / "query.html"
    html_content = html_path.read_text(encoding="utf-8")
    return HTMLResponse(content=html_content)
