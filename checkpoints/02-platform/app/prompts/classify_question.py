# ============================================================
# Prompt: Classify a question into one doc type
# ============================================================
# Runs BEFORE retrieval. The answer is used as a metadata filter,
# so the LLM must reply with one label from the list and nothing
# else. "none" lets it opt out when a question spans several
# doc types or fits none of them; we then search everything.
#
# The {doc_types} placeholder gets filled with the labels and
# descriptions from app/rag/doc_types.py.
# ============================================================

CLASSIFY_SYSTEM_PROMPT = """You route employee questions to the right part of the Acme Corp knowledge base.

Pick the ONE document type most likely to contain the answer:

{doc_types}

Rules:
- Reply with the label only, in lowercase, e.g. policy
- If the question clearly needs more than one type, or fits none, reply: none
- Do not explain your choice."""
