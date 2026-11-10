# ============================================================
# The chat model — LangChain, so LangGraph can stream its tokens
# ============================================================
# /query (Part 1's endpoint) calls the provider's SDK directly through
# app/llm.py. The chat uses a LangChain chat model instead, for one
# reason: when a LangChain model runs inside a LangGraph node,
# graph.stream(stream_mode="messages") hands us its tokens as they
# arrive, tagged with the node they came from. That is the streaming.
#
#   LLM_PROVIDER=azure   AzureChatOpenAI, the deployment in .env
#   LLM_PROVIDER=gemini  Gemini through its OpenAI-compatible endpoint,
#                        so one package (langchain-openai) covers both
#
# No key: ModelUnavailable, and the chat answers with its sources and
# says plainly that there is no written answer. Never a 500.
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

GEMINI_OPENAI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/"


class ModelUnavailable(RuntimeError):
    pass


def chat_model(temperature: float = 0.3):
    if LLM_PROVIDER == "gemini":
        if not GEMINI_API_KEY:
            raise ModelUnavailable("GEMINI_API_KEY is not set")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=GEMINI_MODEL, api_key=GEMINI_API_KEY, base_url=GEMINI_OPENAI_ENDPOINT,
                          temperature=temperature, timeout=60, max_retries=1)
    if not (AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT):
        raise ModelUnavailable("AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT must be set")
    from langchain_openai import AzureChatOpenAI

    return AzureChatOpenAI(azure_deployment=AZURE_OPENAI_DEPLOYMENT, azure_endpoint=AZURE_OPENAI_ENDPOINT,
                           api_version=AZURE_OPENAI_API_VERSION, api_key=AZURE_OPENAI_API_KEY,
                           temperature=temperature, timeout=60, max_retries=1)
