# ============================================================
# Configuration — Acme Desk, Part 1: the source
# ============================================================
# Everything an ingestion JOB needs that a demo endpoint did not:
# where the source system is, who may read what, how big a batch
# is, how often to retry, what a run costs, and (new today) how
# often the job runs on its own.
#
# TEACHING POINT:
#   Session 8 synced a folder that stood in for SharePoint. Today the
#   same job reads a real Google Drive folder through a service
#   account (SOURCE=drive), or that local folder when you are offline
#   (SOURCE=local). Nothing below the connector knows the difference.
# ============================================================

import os
from pathlib import Path

from dotenv import load_dotenv

# Paths are resolved from the repository root, so the scripts in this
# checkpoint work no matter which folder you run them from.
REPO_ROOT = Path(__file__).resolve().parents[3]
CHECKPOINT_DIR = Path(__file__).resolve().parents[1]

load_dotenv(REPO_ROOT / ".env")


def _path(value: str) -> Path:
    """Resolve a path from .env: absolute stays absolute, relative is from the repo root."""
    p = Path(value)
    return p if p.is_absolute() else REPO_ROOT / p


# --- LLM provider: "gemini" or "azure" ---
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")

# --- Gemini settings (used when LLM_PROVIDER=gemini) ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")

# --- Azure OpenAI settings (used when LLM_PROVIDER=azure) ---
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")
AZURE_OPENAI_EMBEDDING_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "")

# --- Embedding provider: "local", "gemini", "azure" or "ollama" ---
# "local" is a small model (all-MiniLM-L6-v2) that ships with ChromaDB
# and runs on your laptop: free, offline after the first download, the
# same numbers on every machine. Switching providers means a full
# rebuild (python sync.py --rebuild --apply); the sync job will say so.
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "local")

# --- Ollama settings (used when EMBEDDING_PROVIDER=ollama) ---
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")

# --- The document source ---
# SOURCE=local  the folder workspace/local-drive plays Google Drive.
#               fake_drive.py creates it from shared/data (Friday's
#               snapshot) and replays the weekend's edits into it. The
#               register is the _register.json inside that folder.
# SOURCE=drive  a real Google Drive folder, read through a service
#               account (app/ingest/connector_drive.py). The register
#               is REGISTER_FILE, or _register.json in the Drive root
#               when REGISTER_SOURCE=drive.
SOURCE = os.getenv("SOURCE", "local")
SEED_DIR = _path(os.getenv("SEED_DIR", "shared/data"))
SOURCE_DIR = _path(os.getenv("SOURCE_DIR", "workspace/local-drive"))
REGISTER_FILENAME = "_register.json"
REGISTER_SOURCE = os.getenv("REGISTER_SOURCE", "local")
REGISTER_FILE = _path(os.getenv("REGISTER_FILE", "shared/data/register.json"))
IDENTITIES_FILE = _path(os.getenv("IDENTITIES_FILE", "shared/data/identities.json"))

# --- Google Drive (SOURCE=drive) ---
DRIVE_SA_KEY = _path(os.getenv("DRIVE_SA_KEY", "secrets/acme-desk-sa.json"))
DRIVE_ROOT_FOLDER_ID = os.getenv("DRIVE_ROOT_FOLDER_ID", "")
DRIVE_DOC_EXPORT = os.getenv("DRIVE_DOC_EXPORT", "markdown")  # markdown | html, for native Google Docs

# --- The scheduler ---
# 0 = off: the sync runs only when asked (python sync.py, POST /sync).
# 60 in class: a tick every minute, inside the API process.
SYNC_INTERVAL_SECONDS = float(os.getenv("SYNC_INTERVAL_SECONDS", "0"))

# The user the API acts as when you don't say. Least privilege by default.
# (Part 2 replaces this with an API key that maps to a person.)
DEFAULT_USER = os.getenv("DEFAULT_USER", "intern")

# --- Sync job settings ---
# Bump PIPELINE_VERSION whenever parsing or chunking logic changes: it is
# part of every document's content hash, so the next sync re-embeds all.
PIPELINE_VERSION = "acme.1"
SECTION_MAX_CHARS = int(os.getenv("SECTION_MAX_CHARS", "900"))
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "64"))
EMBED_MAX_ATTEMPTS = int(os.getenv("EMBED_MAX_ATTEMPTS", "5"))
EMBED_RETRY_BASE_SECONDS = float(os.getenv("EMBED_RETRY_BASE_SECONDS", "1.0"))

# Rough list prices in USD per 1M input tokens, for the cost estimate the
# sync job prints BEFORE it spends anything. Check current pricing.
EMBEDDING_PRICE_PER_1M_TOKENS = {
    "local": 0.0,
    "ollama": 0.0,
    "fake": 0.0,
    "gemini": float(os.getenv("GEMINI_EMBEDDING_PRICE", "0.15")),
    "azure": float(os.getenv("AZURE_EMBEDDING_PRICE", "0.02")),
}

# Personal data we redact before embedding. Addresses at these domains
# are business contacts and stay readable.
CORPORATE_EMAIL_DOMAINS = ["acmecorp.com", "acme.example"]

# --- Vector store settings ---
CHROMA_PATH = _path(os.getenv("CHROMA_PATH", "chroma_data"))
CATALOG_FILE = CHROMA_PATH / "acme_catalog.json"
NAIVE_COLLECTION = "acme_naive"  # checkpoint 4's one-shot ingest, kept for evaluate.py comparisons
RUNS_DIR = _path(os.getenv("ACME_RUNS_DIR", str(CHECKPOINT_DIR / "runs")))

# --- Kept from the RAG module ---
DEFAULT_CHUNK_SIZE = int(os.getenv("DEFAULT_CHUNK_SIZE", "500"))
DEFAULT_CHUNK_OVERLAP = int(os.getenv("DEFAULT_CHUNK_OVERLAP", "50"))
VECTOR_STORE = "chroma"

# --- Confidence thresholds ---
# Squared L2 distance between normalized vectors: 0 = identical, 2 = unrelated.
CONFIDENCE_HIGH_THRESHOLD = float(os.getenv("CONFIDENCE_HIGH_THRESHOLD", "0.8"))
CONFIDENCE_LOW_THRESHOLD = float(os.getenv("CONFIDENCE_LOW_THRESHOLD", "1.4"))
NO_RESULT_DISTANCE = float(os.getenv("NO_RESULT_DISTANCE", "1.6"))
