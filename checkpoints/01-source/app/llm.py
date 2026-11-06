# ============================================================
# LLM caller — thin wrapper around the LLM client
# ============================================================
# Supports both Gemini and Azure OpenAI via LLM_PROVIDER setting.
# One function, one job: send a prompt, get a response.
# ============================================================

from app.config import (
    LLM_PROVIDER,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_DEPLOYMENT,
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
