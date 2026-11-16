# ============================================================
# Faithfulness judge — does the answer stick to its context?
# ============================================================
# RAGAS's faithfulness, done by hand: split the answer into its
# factual claims, and check each one against the context the model
# was given. faithfulness = supported claims / all claims.
#
# The judge is an LLM, so it can be wrong too. That's why it grades
# only this one thing, and why correctness is checked without it
# (against the facts a person wrote down, answers.py).
# ============================================================

FAITHFULNESS_SYSTEM_PROMPT = """You check whether an ANSWER sticks to its CONTEXT.

1. Split the ANSWER into its factual claims: short statements that are either true or false.
   Skip greetings, source names, and sentences that only say the information isn't available.
2. For each claim, decide whether the CONTEXT supports it. Supported means the CONTEXT states it
   or it follows directly from what the CONTEXT states. Your own knowledge does not count.

Reply with JSON only, no other text:
{"claims": [{"claim": "<the claim>", "supported": true}, {"claim": "<the claim>", "supported": false}]}
If the ANSWER makes no factual claims, reply {"claims": []}."""


def faithfulness_prompt(context: str, answer: str) -> str:
    return f"CONTEXT:\n{context}\n\nANSWER:\n{answer}"
