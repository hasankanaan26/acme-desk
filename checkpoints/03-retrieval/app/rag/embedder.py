# ============================================================
# Embedder — turns text into vectors, in batches, with retries
# ============================================================
# Checkpoint 4 sent every chunk in ONE request. Fine for 40 chunks.
# At 50,000 chunks that request is rejected (APIs cap a batch, e.g.
# 100 texts for Gemini, 2,048 for Azure) or rate-limited halfway.
#
# Added in Checkpoint 5:
#   - batches of EMBED_BATCH_SIZE texts
#   - retries with exponential backoff when a batch fails
#   - a "local" provider (all-MiniLM-L6-v2 via ChromaDB, no API key)
#   - embedding_model_id(): the index remembers which model built it,
#     because vectors from two models must never share an index
#   - estimate_tokens(): so the sync job can price a run BEFORE it runs
#   - a "fake" provider for the offline tests (hash-based vectors)
# ============================================================

import hashlib
import logging
import math
import random
import re
import time

import httpx

from app.config import (
    EMBEDDING_PROVIDER,
    GEMINI_API_KEY,
    GEMINI_EMBEDDING_MODEL,
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    OLLAMA_BASE_URL,
    OLLAMA_EMBEDDING_MODEL,
    EMBED_BATCH_SIZE,
    EMBED_MAX_ATTEMPTS,
    EMBED_RETRY_BASE_SECONDS,
)

logger = logging.getLogger("rag.embedder")

# Which provider is active. Tests switch this to "fake".
_provider = EMBEDDING_PROVIDER


def set_provider(name: str) -> None:
    """Switch provider at runtime (used by the offline tests)."""
    global _provider
    _provider = name


def get_provider() -> str:
    return _provider


# Purpose:
# A short, stable name for the model behind the vectors. Stored with the
# index. If it changes, the old vectors are useless and the index must be
# rebuilt from scratch (sync.py --rebuild).
def embedding_model_id() -> str:
    """Return e.g. 'local:all-MiniLM-L6-v2' or 'gemini:gemini-embedding-001'."""
    names = {
        "local": "all-MiniLM-L6-v2",
        "gemini": GEMINI_EMBEDDING_MODEL,
        "azure": AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
        "ollama": OLLAMA_EMBEDDING_MODEL,
        "fake": "hash-64",
    }
    return f"{_provider}:{names.get(_provider, 'unknown')}"


# Purpose:
# A rough token count (about 4 characters per token for English text).
# Good enough to price a run before you start it.
def estimate_tokens(texts: list[str]) -> int:
    return sum(math.ceil(len(t) / 4) for t in texts)


def embed_text(text: str) -> list[float]:
    """Embed one piece of text (a query at search time)."""
    return embed_texts([text])[0]


# Purpose:
# Embed many texts in batches. Each batch is retried on failure, so one
# timeout or one 429 does not kill a 50,000-chunk run.
def embed_texts(texts: list[str], batch_size: int | None = None) -> list[list[float]]:
    """Return one vector per text, in the same order."""
    size = batch_size or EMBED_BATCH_SIZE
    vectors: list[list[float]] = []
    for start in range(0, len(texts), size):
        batch = texts[start:start + size]
        vectors.extend(with_retries(_embed_batch, batch, label=f"embed batch {start // size + 1}"))
    return vectors


# Purpose:
# Call fn(*args). If it raises, wait and try again: 1s, 2s, 4s, 8s ...
# plus a little random jitter so 50 workers don't retry in lockstep.
# After max_attempts, give up loudly: a silent failure leaves holes in
# the index that nobody notices until a user asks.
def with_retries(fn, *args, max_attempts: int | None = None,
                 base_seconds: float | None = None, label: str = "call",
                 sleep=time.sleep):
    attempts = max_attempts or EMBED_MAX_ATTEMPTS
    base = EMBED_RETRY_BASE_SECONDS if base_seconds is None else base_seconds
    for attempt in range(1, attempts + 1):
        try:
            return fn(*args)
        except Exception as exc:  # network errors, 429s, 5xx ...
            if attempt == attempts:
                logger.error("%s failed after %d attempts: %s", label, attempts, exc)
                raise
            delay = base * (2 ** (attempt - 1)) + random.uniform(0, base / 2)
            logger.warning("%s failed (attempt %d/%d): %s. Retrying in %.1fs",
                           label, attempt, attempts, exc, delay)
            sleep(delay)


def _embed_batch(texts: list[str]) -> list[list[float]]:
    if _provider == "fake":
        return [_embed_fake(t) for t in texts]
    if _provider == "local":
        return _embed_local(texts)
    if _provider == "ollama":
        return _embed_ollama(texts)
    if _provider == "gemini":
        return _embed_gemini(texts)
    if _provider == "azure":
        return _embed_azure(texts)
    raise ValueError(f"Unknown EMBEDDING_PROVIDER: {_provider}")


# ---- Providers ----

_local_model = None


# Purpose:
# A small sentence-embedding model that ships with ChromaDB. The first call
# downloads it (about 80 MB) to ~/.cache/chroma, then it runs offline.
def _embed_local(texts: list[str]) -> list[list[float]]:
    global _local_model
    if _local_model is None:
        from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
        _local_model = DefaultEmbeddingFunction()
    return [list(map(float, v)) for v in _local_model(texts)]


def _embed_gemini(texts: list[str]) -> list[list[float]]:
    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)
    result = client.models.embed_content(model=GEMINI_EMBEDDING_MODEL, contents=texts)
    return [embedding.values for embedding in result.embeddings]


def _embed_azure(texts: list[str]) -> list[list[float]]:
    from openai import AzureOpenAI

    client = AzureOpenAI(
        api_key=AZURE_OPENAI_API_KEY,
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_version=AZURE_OPENAI_API_VERSION,
    )
    response = client.embeddings.create(model=AZURE_OPENAI_EMBEDDING_DEPLOYMENT, input=texts)
    return [item.embedding for item in response.data]


def _embed_ollama(texts: list[str]) -> list[list[float]]:
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": OLLAMA_EMBEDDING_MODEL, "input": texts},
            timeout=120.0,
        )
    except httpx.ConnectError:
        raise RuntimeError(f"Can't reach Ollama at {OLLAMA_BASE_URL}. Is it running?")
    if response.status_code != 200:
        raise RuntimeError(f"Ollama error {response.status_code}: {response.text}")
    return response.json()["embeddings"]


# Purpose:
# Offline tests need vectors without a model. Hash each word into one of
# 64 buckets: texts that share words land close together. Deterministic.
def _embed_fake(text: str) -> list[float]:
    vec = [0.0] * 64
    for word in re.findall(r"[a-z0-9$]+", text.lower()):
        bucket = int(hashlib.md5(word.encode()).hexdigest(), 16) % 64
        vec[bucket] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]
