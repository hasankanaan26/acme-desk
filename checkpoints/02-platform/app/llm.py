# ============================================================
# LLM caller — thin wrapper around the LLM client
# ============================================================
# Supports both Gemini and Azure OpenAI via LLM_PROVIDER setting.
# One function, one job: send a prompt, get a response.
# ============================================================

from app.config import (
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_DEPLOYMENT,
    AZURE_OPENAI_ENDPOINT,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLM_PROVIDER,
)


# Purpose:
# Returns the model name string for the active LLM provider.
def get_model_name() -> str:
    """Return the model name for the active provider."""
    if LLM_PROVIDER == "gemini":
        return GEMINI_MODEL
    return AZURE_OPENAI_DEPLOYMENT


# Purpose:
# Sends a prompt to the configured LLM and returns the response text.
def call_llm(user_prompt: str, system_prompt: str = "") -> str:
    """
    Send a prompt to the LLM and return the response text.

    Uses Gemini or Azure OpenAI based on the LLM_PROVIDER setting.
    """
    if LLM_PROVIDER == "gemini":
        return _call_gemini(user_prompt, system_prompt)
    return _call_azure(user_prompt, system_prompt)


# ============================================================
# Cached calls (from the RAG weeks' checkpoint 6)
# ============================================================
# hyde and multi_query call the model once per question, before the
# search. Same model + same prompt = the answer we already paid for:
# cache it on disk (runs/llm_cache.json). STATS counts real calls vs
# cache hits; replayed_ms keeps timings honest when the cache answers.
# ============================================================

import hashlib
import json
import threading
import time

from app.config import LLM_CACHE_FILE

STATS = {"calls": 0, "cache_hits": 0, "replayed_ms": 0.0}
_cache: dict | None = None
_cache_lock = threading.Lock()


def cached_call_llm(user_prompt: str, system_prompt: str = "") -> str:
    global _cache
    key = hashlib.sha256(f"{get_model_name()}\x00{system_prompt}\x00{user_prompt}".encode()).hexdigest()
    with _cache_lock:
        if _cache is None:
            _cache = json.loads(LLM_CACHE_FILE.read_text(encoding="utf-8")) if LLM_CACHE_FILE.exists() else {}
        if key in _cache:
            STATS["cache_hits"] += 1
            STATS["replayed_ms"] += _cache[key]["ms"]
            return _cache[key]["answer"]
    start = time.perf_counter()
    answer = call_llm(user_prompt, system_prompt)
    with _cache_lock:
        STATS["calls"] += 1
        _cache[key] = {"answer": answer, "ms": round((time.perf_counter() - start) * 1000, 1)}
        LLM_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        LLM_CACHE_FILE.write_text(json.dumps(_cache, indent=1), encoding="utf-8")
    return answer


def _call_gemini(user_prompt: str, system_prompt: str) -> str:
    """Call Google Gemini API with proper system instruction support."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)

    config = None
    if system_prompt:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
        )

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_prompt,
        config=config,
    )

    return response.text


def _call_azure(user_prompt: str, system_prompt: str) -> str:
    """Call Azure OpenAI API."""
    from openai import AzureOpenAI

    client = AzureOpenAI(
        api_key=AZURE_OPENAI_API_KEY,
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_version=AZURE_OPENAI_API_VERSION,
    )

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    response = client.chat.completions.create(
        model=AZURE_OPENAI_DEPLOYMENT,
        messages=messages,
        temperature=0.3,
    )

    return response.choices[0].message.content
