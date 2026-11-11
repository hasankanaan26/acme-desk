# ============================================================
# Router — pick the retrieval by the SHAPE of the question
# ============================================================
# Top-k is a budget. "Who works in our San Francisco office?" has six
# right answers, one per row of the team directory. Top-5 can return
# at most five of them, however good the embedding. No reranker,
# no HyDE, no prompt fixes that: the answer is bigger than k.
#
# Two shapes of question:
#   pointwise    the answer lives in one or two places
#                -> similarity search (hybrid + rerank)
#   aggregation  the answer is a SET scattered across records
#                ("who / how many / list everyone ... in <office>")
#                -> a structured lookup over the records: every match
#
# Here the classifier is a few rules, because the shapes are clear
# and rules are free, fast and testable. When rules can't tell, a
# small LLM call can classify. The lesson is the split, not the regex.
#
# In production the structured side is SQL over a table (or pandas
# over a sheet). Spreadsheets and directories are records, not prose.
# ============================================================

import re

AGGREGATION_RE = re.compile(r"\b(who|list|how many|which people|everyone|anyone)\b", re.IGNORECASE)
MEMBERSHIP_RE = re.compile(r"\b(work|works|working|based|office|team|department|in the|remotely)\b", re.IGNORECASE)
GROUP_FIELDS = ("office", "department", "role")


def _fields(text: str) -> dict[str, str]:
    """'name: Sarah Chen; role: ...; office: San Francisco' -> dict"""
    body = text.split("\n", 1)[-1]
    out = {}
    for part in body.split(";"):
        key, _, value = part.partition(":")
        if value:
            out[key.strip().lower()] = value.strip()
    return out


# Purpose:
# Decide the shape. Aggregation only when the question both asks for a
# set AND names a value that exists in a group-able field of the records.
def classify(question: str, records: list[dict]) -> tuple[str, dict]:
    if not (AGGREGATION_RE.search(question) and MEMBERSHIP_RE.search(question)):
        return "pointwise", {}
    q = question.lower()
    values = {}
    for rec in records:
        for field, value in _fields(rec["text"]).items():
            if field in GROUP_FIELDS and value and re.search(r"\b" + re.escape(value.lower()) + r"\b", q):
                values.setdefault(field, set()).add(value)
    # "remote" / "remotely" both mean office = Remote
    if "remote" in q and not values.get("office"):
        values["office"] = {"Remote"}
    if not values:
        return "pointwise", {}
    return "aggregation", {k: sorted(v) for k, v in values.items()}


# Purpose:
# Every record matching ALL the named values. Not top-k: all of them.
def lookup(records: list[dict], wanted: dict) -> list[dict]:
    hits = []
    for rec in records:
        fields = _fields(rec["text"])
        if all(fields.get(f) in values for f, values in wanted.items()):
            hits.append(rec)
    return hits
