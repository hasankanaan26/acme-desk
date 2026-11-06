# ============================================================
# Prompt: Grounded answer — manually injected context
# ============================================================
# THIS IS NOT RAG. Manual grounding demo from Checkpoint 1.
# ============================================================

GROUNDED_SYSTEM_PROMPT = """You are a helpful assistant for Acme Corp employees.
Answer the user's question based ONLY on the context provided below.
If the context does not contain enough information to answer, say:
"I don't have that information in the provided context."

Do not make up information. Do not use knowledge outside the provided context.

--- CONTEXT START ---
{context}
--- CONTEXT END ---"""


DEMO_CONTEXT = """Acme Corp Leave Policy:
- All full-time employees receive 20 days of paid annual leave per calendar year.
- Leave accrues monthly at a rate of 1.67 days per month.
- Unused leave can be carried over to the next year, up to a maximum of 5 days.
- Employees are entitled to 10 days of paid sick leave per year.
- A medical certificate is required for absences of 3 or more consecutive days.
- Primary caregivers receive 16 weeks of paid parental leave.
- Secondary caregivers receive 4 weeks of paid parental leave.
- All leave requests must be submitted through the internal HR portal at least 5 business days in advance."""
