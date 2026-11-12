# ============================================================
# PII — redact personal data BEFORE it is embedded
# ============================================================
# Once a phone number is inside a chunk, it is inside the index,
# inside every backup of the index, and inside any answer that
# quotes the chunk. Embeddings are not one-way: text can be partly
# recovered from them. So personal data is removed at ingest time.
#
# This is a deliberately small, readable detector:
#   - personal email addresses (business domains stay readable)
#   - phone numbers in common formats
#   - card-like numbers (13 to 16 digits)
# Production systems use Microsoft Presidio, AWS Comprehend or
# Google DLP, which also find names, addresses and ID numbers.
#
# TEACHING POINT:
#   Redaction is a policy decision, not a regex. "jane.doe@gmail.com"
#   in a phishing report is a customer's data. "security@acmecorp.com"
#   is the address employees need. Same pattern, opposite decision.
# ============================================================

import re

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")
# +1 415 555 0134, (415) 555-0134, 415-555-0134, +44 20 7946 0958 ...
PHONE_RE = re.compile(
    r"(?<![\w$])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{3,4}(?![\w])"
)
CARD_RE = re.compile(r"\b(?:\d[ -]?){13,16}\b")


# Purpose:
# Replace personal data with a placeholder and count what was removed.
# The counts go into the sync report, so a human can audit them.
def redact(text: str, corporate_domains: list[str]) -> tuple[str, dict]:
    counts = {"email": 0, "phone": 0, "card": 0}
    business = tuple(d.lower() for d in corporate_domains)

    def _email(match: re.Match) -> str:
        domain = match.group(1).lower()
        if domain.endswith(business):
            return match.group(0)
        counts["email"] += 1
        return "[EMAIL REDACTED]"

    def _phone(match: re.Match) -> str:
        counts["phone"] += 1
        return "[PHONE REDACTED]"

    def _card(match: re.Match) -> str:
        counts["card"] += 1
        return "[NUMBER REDACTED]"

    text = EMAIL_RE.sub(_email, text)
    text = CARD_RE.sub(_card, text)
    text = PHONE_RE.sub(_phone, text)
    return text, {k: v for k, v in counts.items() if v}
