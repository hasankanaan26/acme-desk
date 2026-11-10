# ============================================================
# Prompt: turn a follow-up into a question the search can use
# ============================================================
# The search sees one string, not the conversation. "And for
# managers?" retrieves nothing useful on its own; "What is the team
# dinner limit per person for managers?" does. Only used when the
# thread already has earlier turns.
# ============================================================

STANDALONE_QUESTION_PROMPT = """Rewrite the user's last message as one standalone question that can be understood without the conversation.
Keep every name, number, date and term the user used. Do not answer it. Do not add anything.
If the last message is already standalone, return it unchanged.
Reply with the question only."""
