# ============================================================
# Prompts: rewriting the question before searching (from the RAG weeks, checkpoint 6)
# ============================================================
# Two ways to change WHAT YOU SEARCH WITH:
#
# HyDE (Hypothetical Document Embeddings)
#   A question doesn't look like its answer. "Who do I call if I'm
#   locked out?" sits far from "For urgent issues (e.g., account
#   lockout) call the IT hotline at ext. 4357". So ask the LLM to WRITE
#   a plausible answer, in the voice of a company document, and search
#   with that. It doesn't need to be correct, only shaped like the
#   documents. Wrong guesses can drag the search off topic.
#
# Multi-query
#   One phrasing is one shot. Ask for three rewrites, search with each,
#   fuse the rankings. Helps with phrasing; costs one LLM call and
#   several searches per question.
#
# Both add an LLM call (latency and cost) to EVERY question. Measure
# before you keep them.
# ============================================================

HYDE_PROMPT = """Write a short passage (3 to 5 sentences) from an internal company document
(a policy, handbook, FAQ, ticket or announcement) that would answer the question below.
Write it as the document would, with concrete specifics. Do not mention the question.

Question: {question}"""

MULTI_QUERY_PROMPT = """Rewrite the question below in 3 different ways an employee might search a
company knowledge base for it. Use different words for the key ideas. One rewrite per line,
no numbering, no extra text.

Question: {question}"""
