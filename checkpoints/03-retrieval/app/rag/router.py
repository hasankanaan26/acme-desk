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

# ---- What the router may list (Part 3) ----
# The sync STORES every column of every CSV row (chunks.fields, 007).
# This says which record sets a question may list, and which of their
# columns it may filter on. Columns that group many records (an office,
# a department) are filters; columns that point at one record (a name,
# an email, a ticket id) are not: those are pointwise questions.
# Adding a record set is one entry here. Everything else (the menu, the
# lookup, the checks) reads this dict and the stored fields.
#
# "values" (optional) fixes a column to a closed list, for a column that
# is a state, not a name: a ticket is open, resolved or disputed, nothing
# else. The router's menu offers exactly that list (so "how many disputed
# tickets?" is a lookup even on a day no ticket is disputed), and the sync
# reports every row whose value isn't on it: "Resolved " or "closed" would
# otherwise drop out of every count without a word. Columns of names
# (reporter, office) have no list: their values are whatever the rows say.
ROUTABLE: dict[str, dict] = {
    "PEOPLE-DIRECTORY": {"about": "the team directory, one row per person",
                         "filters": ("office", "department", "role")},
    "IT-HELPDESK-EXPORT": {"about": "IT helpdesk tickets, one row per ticket",
                           "filters": ("reporter", "status"),
                           "values": {"status": ("open", "resolved", "disputed")}},
}
PEOPLE = "PEOPLE-DIRECTORY"
GROUP_FIELDS = ROUTABLE[PEOPLE]["filters"]   # the rules below only ever knew the directory


# Purpose:
# The sync's half of "values": the rows of a record set whose fixed
# column holds something off the list, as one readable line each. The
# value is checked exactly as stored (a lookup matches exactly too), so
# "Resolved" is reported, not quietly fixed: the export is what to fix.
#   off_list_values("IT-HELPDESK-EXPORT", [{"ticket_id": "IT-1", "status": "closed"}])
#   -> ["IT-HELPDESK-EXPORT row 1 (IT-1): status 'closed' is not one of open, resolved, disputed"]
def off_list_values(doc_id: str, rows: list[dict | None], routable: dict[str, dict] | None = None) -> list[str]:
    fixed = (routable if routable is not None else ROUTABLE).get(doc_id, {}).get("values", {})
    problems = []
    for n, row in enumerate(rows, start=1):
        if not row:
            continue
        for column, allowed in fixed.items():
            value = row.get(column)
            if value not in allowed:
                label = next(iter(row.values()), "")
                problems.append(f"{doc_id} row {n} ({label}): {column} {value!r} is not one of {', '.join(allowed)}")
    return problems


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
    columns: dict[str, set] = {}
    for rec in records:
        for field, value in _fields(rec["text"]).items():
            if field in GROUP_FIELDS and value:
                columns.setdefault(field, set()).add(value)
    return classify_columns(question, columns)


# Purpose:
# The same rules, given the directory's values directly ({"office": [...]}),
# as the production router's menu already has them (router_llm's fallback).
def classify_columns(question: str, columns: dict) -> tuple[str, dict]:
    if not (AGGREGATION_RE.search(question) and MEMBERSHIP_RE.search(question)):
        return "pointwise", {}
    q = question.lower()
    values = {}
    for field in GROUP_FIELDS:
        for value in columns.get(field, ()):
            if value and re.search(r"\b" + re.escape(value.lower()) + r"\b", q):
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
