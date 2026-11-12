# ============================================================
# Classifier — asks the LLM which doc type a question is about
# ============================================================
# One extra LLM call before retrieval. The reply must be one of
# the labels in doc_types.py, otherwise we treat it as "no idea"
# and search without a filter.
#
# TEACHING POINT:
#   Never trust free-text LLM output as a database filter.
#   parse_doc_type() checks the reply against the closed list.
# ============================================================

from app.llm import call_llm
from app.prompts.classify_question import CLASSIFY_SYSTEM_PROMPT
from app.rag.doc_types import DOC_TYPES


# Purpose:
# Formats the doc types as "- label: description" lines for the prompt.
def format_doc_types() -> str:
    """Render the allowed labels and their descriptions."""
    return "\n".join(f"- {label}: {desc}" for label, desc in DOC_TYPES.items())


# Purpose:
# Turns the raw LLM reply into a known label, or None.
def parse_doc_type(reply: str) -> str | None:
    """Return the label if the reply is one of DOC_TYPES, else None."""
    label = reply.strip().strip(".`'\"*").strip().lower()
    return label if label in DOC_TYPES else None


# Purpose:
# Asks the LLM to pick a doc type for the question.
# Returns the raw reply too, so the UI can show what the LLM actually said.
def classify_question(question: str) -> dict:
    """
    Classify a question into one doc type.

    Returns a dict with:
      doc_type  - a label from DOC_TYPES, or None if the reply wasn't one
      raw_reply - the LLM's reply, unparsed
    """
    system_prompt = CLASSIFY_SYSTEM_PROMPT.format(doc_types=format_doc_types())
    reply = call_llm(user_prompt=question, system_prompt=system_prompt) or ""
    return {"doc_type": parse_doc_type(reply), "raw_reply": reply.strip()}
