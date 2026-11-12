# ============================================================
# Prompt: Minimal RAG answer — intentionally weak
# ============================================================
# This prompt is deliberately bare-bones. Compare it with
# rag_answer.py to understand why prompt engineering matters.
#
# KEY DIFFERENCES from rag_answer.py:
#   - No "ONLY use the context" instruction
#   - No "say I don't know" fallback
#   - The LLM can freely mix context with its own knowledge
#
# USE THIS IN THE A/B EXPERIMENT:
#   POST /query {"question": "..."}                     -> default prompt
#   POST /query?prompt_style=minimal {"question": "..."} -> this prompt
# ============================================================

RAG_MINIMAL_PROMPT = """Answer the question using this context:

{context}"""
