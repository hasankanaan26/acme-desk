# ============================================================
# Configuration — Acme Desk, Part 2: the platform
# ============================================================
# Part 1 kept its state in files (identities.json, register.json,
# ChromaDB on disk, a catalog JSON). Part 2 keeps all of it in
# Postgres, reached through two database roles with different rights
# (see app/db/migrations/002_security.sql):
#
#   DATABASE_APP_URL    the API      (acme_app)
#   DATABASE_SYNC_URL   the worker   (acme_sync)
#   DATABASE_ADMIN_URL  db.py only   (the owner: migrations, seed)
#
# The documents themselves still live in Google Drive (or the local
# folder offline). SOURCE and DRIVE_ROOT_FOLDER_ID now only say where
# the FIRST tenant's documents are when db.py seeds it; after that the
# tenants table is the truth.
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

# --- The document source (where the seeded tenant's files are) ---
# SOURCE=local  the folder workspace/local-drive plays Google Drive.
#               fake_drive.py creates it from shared/data (Friday's
#               snapshot) and replays the weekend's edits into it.
# SOURCE=drive  a real Google Drive folder, read through a service
#               account (app/ingest/connector_drive.py).
# Either way, Part 2 reads the REGISTER from Postgres, not from a file.
SOURCE = os.getenv("SOURCE", "local")
SEED_DIR = _path(os.getenv("SEED_DIR", "shared/data"))
SOURCE_DIR = _path(os.getenv("SOURCE_DIR", "workspace/local-drive"))
REGISTER_FILENAME = "_register.json"
REGISTER_SOURCE = "local"  # Part 1's switch, kept so drive_admin.py's connector code is unchanged
# Part 2: the register lives in Postgres (the documents and
# document_acl tables). This file is only what db.py seeds it from.
REGISTER_FILE = _path(os.getenv("REGISTER_FILE", "shared/data/register.json"))
IDENTITIES_FILE = _path(os.getenv("IDENTITIES_FILE", "shared/data/identities.json"))  # seed only

# --- Google Drive (SOURCE=drive) ---
DRIVE_SA_KEY = _path(os.getenv("DRIVE_SA_KEY", "secrets/acme-desk-sa.json"))
DRIVE_ROOT_FOLDER_ID = os.getenv("DRIVE_ROOT_FOLDER_ID", "")
DRIVE_DOC_EXPORT = os.getenv("DRIVE_DOC_EXPORT", "markdown")  # markdown | html, for native Google Docs

# --- The sync worker (python worker.py) ---
# How often the worker syncs each tenant. Part 1 ran this as a thread
# in the API; Part 2 runs it as its own process with its own DB role.
SYNC_INTERVAL_SECONDS = float(os.getenv("SYNC_INTERVAL_SECONDS", "60"))
# The change gate (app/ingest/gate.py): a tick first asks Drive's change
# log whether anything moved, and skips the sync when nothing did. The
# safety net: a full sync at least this often anyway. 0 = never forced.
SYNC_FULL_EVERY_SECONDS = float(os.getenv("SYNC_FULL_EVERY_SECONDS", str(6 * 3600)))

# --- Postgres ---
DATABASE_APP_URL = os.getenv("DATABASE_APP_URL", "postgresql://acme_app:app-local-only@localhost:5433/acme")
DATABASE_SYNC_URL = os.getenv("DATABASE_SYNC_URL", "postgresql://acme_sync:sync-local-only@localhost:5433/acme")
DATABASE_ADMIN_URL = os.getenv("DATABASE_ADMIN_URL", "postgresql://postgres:postgres-local-only@localhost:5433/acme")

# --- Sign-in ---
# A session ends after SESSION_IDLE_MINUTES without a request, and in
# any case SESSION_MAX_HOURS after sign-in.
SESSION_COOKIE = "acme_session"
SESSION_IDLE_MINUTES = int(os.getenv("SESSION_IDLE_MINUTES", "480"))
SESSION_MAX_HOURS = int(os.getenv("SESSION_MAX_HOURS", "168"))
# Secure cookies need HTTPS. Off on localhost, on in any real deployment.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
# Brute-force limits, per 15 minutes.
LOGIN_MAX_FAILURES_PER_EMAIL = int(os.getenv("LOGIN_MAX_FAILURES_PER_EMAIL", "5"))
LOGIN_MAX_FAILURES_PER_IP = int(os.getenv("LOGIN_MAX_FAILURES_PER_IP", "20"))
PASSWORD_MIN_LENGTH = 12
# db.py seed gives every demo account this password. Empty: a random
# password per account, printed once.
SEED_PASSWORD = os.getenv("ACME_SEED_PASSWORD", "")
# Sign-in switched off: every request without a session acts as this
# account (e.g. admin@acme.test). Empty: normal sign-in. Local use only.
AUTO_SIGNIN_EMAIL = os.getenv("ACME_AUTO_SIGNIN_EMAIL", "").strip().lower()

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
VECTOR_STORE = "postgres+pgvector"
RUNS_DIR = _path(os.getenv("ACME_RUNS_DIR", str(CHECKPOINT_DIR / "runs")))

# --- Confidence thresholds ---
# The search reports 2 x cosine distance, which for unit vectors is the
# squared L2 distance Part 1's ChromaDB reported: 0 = identical,
# 2 = unrelated. So these thresholds carry over unchanged.
CONFIDENCE_HIGH_THRESHOLD = float(os.getenv("CONFIDENCE_HIGH_THRESHOLD", "0.8"))
CONFIDENCE_LOW_THRESHOLD = float(os.getenv("CONFIDENCE_LOW_THRESHOLD", "1.4"))
NO_RESULT_DISTANCE = float(os.getenv("NO_RESULT_DISTANCE", "1.6"))

# --- Retrieval: how the search finds passages ---
#   dense    by meaning: pgvector, the same search as Part 1
#   keyword  by words: Postgres full-text search on the same chunks
#   hybrid   both, fused by rank (Reciprocal Rank Fusion)
# From the RAG weeks' checkpoint 6 (the lab), on the same Postgres store:
#   rerank         dense top 20, re-ordered by a cross-encoder
#   hybrid_rerank  hybrid top 20, re-ordered by a cross-encoder
#   hyde           search with an LLM-written hypothetical answer
#   multi_query    the question + three LLM rewrites, fused by rank
#   routed         "who works remotely?" -> every matching directory
#                  row (a lookup, not top k); else hybrid_rerank
# (The lab's bm25 is `keyword` here: Postgres full-text does the job.)
# Every strategy runs inside the same access filter. /search takes
# ?strategy= to compare them side by side.
RETRIEVAL_STRATEGIES = ("dense", "keyword", "hybrid", "rerank", "hybrid_rerank", "hyde", "multi_query", "routed")
_STRATEGY_ALIASES = {"bm25": "keyword"}
_requested_strategy = os.getenv("RETRIEVAL_STRATEGY", "hybrid").split("#")[0].strip().lower() or "hybrid"
_requested_strategy = _STRATEGY_ALIASES.get(_requested_strategy, _requested_strategy)
RETRIEVAL_STRATEGY = _requested_strategy if _requested_strategy in RETRIEVAL_STRATEGIES else "hybrid"
# Shown in /health when .env asks for something this checkpoint does not have.
RETRIEVAL_STRATEGY_NOTE = (None if _requested_strategy in RETRIEVAL_STRATEGIES else
                           f"RETRIEVAL_STRATEGY={_requested_strategy} is not available here; using hybrid")
HYBRID_CANDIDATES = int(os.getenv("HYBRID_CANDIDATES", "20"))  # how deep each list goes before fusing
RRF_K = 60  # the usual constant: a rank-1 hit scores 1/61, rank 10 scores 1/70
# The cross-encoder behind rerank and hybrid_rerank (ONNX, CPU, ~90 MB).
RERANKER_MODEL = os.getenv("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
# hyde and multi_query cache their LLM rewrites here: same model + same
# prompt = the answer we already paid for. Delete it to force fresh calls.
LLM_CACHE_FILE = RUNS_DIR / "llm_cache.json"

# --- The chat (Part 2, last block) ---
# How many earlier question + answer pairs the model sees. The thread
# keeps everything; the prompt keeps the last few.
HISTORY_TURNS = int(os.getenv("HISTORY_TURNS", "6"))
CHAT_TOP_K = int(os.getenv("CHAT_TOP_K", "5"))
