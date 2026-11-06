# ============================================================
# Doc types — a small, fixed set of labels for every chunk
# ============================================================
# Checkpoint 4 mapped FILE NAMES to doc types in this file.
# Checkpoint 5 reads each document's doc_type from the register
# (data/enterprise/register.json), next to its owner and permissions:
# the people who own a document decide what it is, not a dict in
# our code. This file keeps only the closed list the classifier may
# pick from.
#
# WHY A FIXED LIST?
#   The classifier can only answer with a label we actually stored.
#   If it invents "hr" while the chunks say "policy", the filter
#   matches nothing. The no-filter fallback in retriever.py is the
#   safety net.
# ============================================================

DOC_TYPES = {
    "policy": "HR and company rules: annual leave, sick leave, expenses, reimbursements, remote work",
    "engineering": "coding standards, code review, deployments, on-call, releases, the technology stack, the wiki",
    "people": "the team directory: who someone is, their role, department, office or email",
    "onboarding": "what new employees do in their first days and weeks",
    "meetings": "meeting notes: decisions, plans, hiring and budget discussions",
    "faq": "short answers to common employee questions on mixed topics",
    "finance": "headcount numbers, budgets and spending by category",
    "compensation": "salary bands and pay ranges",
    "security": "security notices, phishing warnings and what to do about them",
    "it": "IT helpdesk tickets: laptop, VPN, monitor and login problems and how they were fixed",
}

UNKNOWN_DOC_TYPE = "other"
