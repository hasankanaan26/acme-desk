# ============================================================
# Router, the production way: a model writes a plan, code checks it
# ============================================================
# router.py decides the shape with two regular expressions. That shows
# the idea in ten lines, and it reads WORDS, not meaning:
#   "Show me all remote staff"               no who/list/how many: missed
#   "Who do I talk to on the Engineering team about a deploy?"
#                                            who + team + Engineering: every
#                                            engineer, instead of a contact
# This file is the history-rag project's router on Acme's records:
#
#   1. The menu is built from the data: for every record set this user may
#      read (router.ROUTABLE: the directory, ...), its filter columns and
#      every value they hold. One SQL query over chunks.fields
#      (store.record_menu, 007), rebuilt on every question.
#   2. One cached model call returns a PLAN (JSON): a route, the record set
#      (source), the filters, and, for a list we can't answer, what's missing.
#   3. Code checks every field before anything runs (check()):
#        - an unknown route                       -> the reply is unusable
#        - a record set we can't list             -> aggregation_unindexed
#        - a column the record set doesn't have   -> aggregation_unindexed
#        - a value no row has ("London")          -> a normal search instead
#        - a synonym the model kept ("remote")    -> the stored value ("Remote")
#   4. The model never writes the query that runs: store.lookup_records()
#      does, from the checked values only, as SQL parameters.
#   5. A reply that isn't JSON gets one retry, the bad reply quoted back.
#   6. No model, or a reply still unusable: Wednesday's rules decide, and
#      the trace says so. The search degrades; it never fails. (history-rag
#      raises here. In production the question still deserves an answer.)
#   7. A list we can't answer is searched instead, AND written to
#      runs/router_misses.jsonl: the backlog of columns (or whole record
#      sets) worth adding.
#
# Access is unchanged: the menu and the lookup read chunks inside the
# user's filter. The model only ever sees values from rows this person may read.
# ============================================================

import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app import config
from app.llm import cached_call_llm
from app.prompts.route_question import ROUTE_SYSTEM_PROMPT
from app.rag import router

POINTWISE = "pointwise"
AGGREGATION = "aggregation"
AGGREGATION_UNINDEXED = "aggregation_unindexed"
ROUTES = (POINTWISE, AGGREGATION, AGGREGATION_UNINDEXED)


class UnusableReply(ValueError):
    """The model answered, but not with a plan we can check."""


@dataclass
class Plan:
    route: str
    filters: dict[str, list[str]] = field(default_factory=dict)
    reasoning: str = ""
    missing_column: str | None = None
    source: str | None = None                        # the record set a list reads ("PEOPLE-DIRECTORY")
    decided_by: str = "the model"                    # or "the rules"
    notes: list[str] = field(default_factory=list)   # what the guards changed, for the trace


# Purpose:
# What the router may offer: the record sets in router.ROUTABLE that this
# user may read, each with only its filter columns. `menu` is what
# store.record_menu() returns (every stored column); this keeps the ones
# ROUTABLE allows. It is the prompt's menu AND what check() validates against.
# A column with fixed "values" offers that list, whatever the rows hold
# today: a state nobody is in yet is still a question with an answer, and
# a stray value the sync reported is never offered.
#   {"PEOPLE-DIRECTORY": {"about": "...", "rows": 12, "columns": {"office": [...], ...}}}
def vocabulary(menu: dict[str, dict], routable: dict[str, dict] | None = None) -> dict[str, dict]:
    vocab = {}
    for source, spec in (routable if routable is not None else router.ROUTABLE).items():
        stored = menu.get(source)
        if not stored:
            continue  # not in the index, or this user may not read it
        filters = (spec["filters"],) if isinstance(spec["filters"], str) else spec["filters"]  # ("reporter") is a str
        fixed = spec.get("values", {})
        vocab[source] = {"about": spec["about"], "rows": stored.get("rows", 0),
                         "columns": {c: list(fixed[c]) if c in fixed else stored["columns"][c]
                                     for c in filters if c in stored["columns"]}}
    return vocab


# Purpose:
# The same menu, built from parsed rows instead of Postgres: route_eval.py
# and the tests read the CSVs directly, with no database.
#   records: [{"doc_id": ..., "fields": {...}}, ...]
def menu_from_records(records: list[dict]) -> dict[str, dict]:
    menu: dict[str, dict] = {}
    for rec in records:
        entry = menu.setdefault(rec["doc_id"], {"rows": 0, "columns": {}})
        entry["rows"] += 1
        for column, value in (rec.get("fields") or {}).items():
            if value:
                entry["columns"].setdefault(column, set()).add(value)
    for entry in menu.values():
        entry["columns"] = {c: sorted(v) for c, v in entry["columns"].items()}
    return menu


def system_prompt(vocab: dict[str, dict]) -> str:
    blocks = []
    for source, entry in vocab.items():
        lines = [f"- {source}: {entry['about']} ({entry['rows']} rows)"]
        lines += [f"    {column}: {', '.join(values) or '(none)'}" for column, values in entry["columns"].items()]
        blocks.append("\n".join(lines))
    return ROUTE_SYSTEM_PROMPT.replace("{{VOCABULARY}}", "\n".join(blocks) or "(none)")


# Purpose:
# Models wrap JSON in fences or a sentence. Take the outermost {...};
# anything else is not a plan.
def parse_reply(reply: str | None) -> dict | None:
    text = (reply or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


# Purpose:
# One cached call, one retry with the bad reply quoted back.
# Raises UnusableReply if the second reply isn't JSON either; any other
# exception means there is no model (no key, quota, outage).
def ask_model(question: str, vocab: dict[str, dict]) -> dict:
    system = system_prompt(vocab)
    user = f"QUESTION: {question}"
    reply = cached_call_llm(user, system)
    data = parse_reply(reply)
    if data is None:
        user += (f"\n\nYour previous reply was not one JSON object:\n{(reply or '')[:400]}\n"
                 "Reply again with ONLY the JSON object.")
        data = parse_reply(cached_call_llm(user, system))
    if data is None:
        raise UnusableReply("the reply was not JSON, twice")
    return data


def _text(value: object) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text if text and text.lower() not in ("null", "none") else None


# Purpose:
# Trust nothing the model wrote until it matches the stored records.
# A list runs only when EVERY filter checks out: dropping a bad value
# would quietly widen the list ("Remote AND Wizard" -> "Remote").
def check(data: dict, vocab: dict[str, dict]) -> Plan:
    route = str(data.get("route", "")).strip().lower()
    if route not in ROUTES:
        raise UnusableReply(f"unknown route {route!r}")
    plan = Plan(route=route, reasoning=str(data.get("reasoning", "")).strip(),
                missing_column=_text(data.get("missing_column")))
    if route == POINTWISE:
        plan.missing_column = None
        return plan

    # Which record set? A list with only one set on the menu: that one, even if
    # the model left it out. (An unindexed list with no source means "none of them".)
    source = _text(data.get("source"))
    if source is None and route == AGGREGATION and len(vocab) == 1:
        source = next(iter(vocab))
    if source is None and route == AGGREGATION_UNINDEXED:
        # "missing: office" names a column a record set HAS (London): that set.
        named = (plan.missing_column or "").strip().lower()
        source = next((s for s, entry in vocab.items() if named in entry["columns"]), None)
    if source not in vocab:
        # A list of something we can't list at all ("every helpdesk ticket"
        # while tickets aren't routable): search, and log what was asked for.
        if source:
            plan.notes.append(f"router guard: {source!r} is not a record set the router can list")
        plan.route, plan.filters = AGGREGATION_UNINDEXED, {}
        plan.missing_column = plan.missing_column or source or "unknown"
        return plan
    plan.source = source
    columns = vocab[source]["columns"]

    raw = data.get("filters") or {}
    if not isinstance(raw, dict):
        raw = {}
    unknown_columns, unknown_values = [], []
    for column, values in raw.items():
        column = str(column).strip().lower()
        values = [values] if isinstance(values, str) else list(values or [])
        if column not in columns:
            unknown_columns.append(column)
            continue
        stored = {v.lower(): v for v in columns[column]}
        for value in values:
            canonical = stored.get(str(value).strip().lower())
            if canonical is None:
                unknown_values.append(f"{column} = {str(value).strip()!r}")
            elif canonical not in plan.filters.setdefault(column, []):
                plan.filters[column].append(canonical)
    plan.filters = {c: v for c, v in plan.filters.items() if v}

    # "Who works in London?": a model that reads the menu won't write London,
    # so it calls the list unindexed on a column we DO have ("office"). The
    # column isn't missing, the value is: search, and don't log a fake gap.
    named = (plan.missing_column or "").strip().lower()
    if plan.route == AGGREGATION_UNINDEXED and not unknown_columns and named in columns:
        plan.notes.append(f"router guard: the directory has an {named!r} column, but no row has the "
                          "value asked for: searched instead" if source == router.PEOPLE else
                          f"router guard: {source} has an {named!r} column, but no row has the "
                          "value asked for: searched instead")
        plan.route, plan.filters, plan.missing_column = POINTWISE, {}, None
        return plan

    if unknown_columns:
        where = "the directory" if source == router.PEOPLE else source
        plan.notes.append(f"router guard: {where} has no {', '.join(map(repr, unknown_columns))} column")
        plan.route = AGGREGATION_UNINDEXED
        plan.missing_column = plan.missing_column or unknown_columns[0]
    if plan.route == AGGREGATION_UNINDEXED:
        plan.missing_column = plan.missing_column or "unknown"
        return plan
    if unknown_values:
        plan.notes.append(f"router guard: no row has {', '.join(unknown_values)}: searched instead")
        plan.route, plan.filters, plan.source = POINTWISE, {}, None
    elif not plan.filters:
        plan.notes.append("router guard: a list with no filter to look up: searched instead")
        plan.route, plan.source = POINTWISE, None
    return plan


# Purpose:
# Version 1, the rules, as the fallback. They only ever knew the directory.
def _by_rules(question: str, vocab: dict[str, dict], note: str | None = None) -> Plan:
    people = vocab.get(router.PEOPLE)
    shape, wanted = router.classify_columns(question, people["columns"]) if people else ("pointwise", {})
    aggregation = shape == "aggregation"
    return Plan(route=AGGREGATION if aggregation else POINTWISE, filters=wanted,
                source=router.PEOPLE if aggregation else None, decided_by="the rules",
                notes=[note] if note else [])


# Purpose:
# The one entry point: question + the record menu this user may read
# (store.record_menu, or menu_from_records) -> a checked plan.
def plan(question: str, menu: dict[str, dict], mode: str | None = None) -> Plan:
    vocab = vocabulary(menu)
    if (mode or config.ROUTER) == "rules":
        return _by_rules(question, vocab)
    try:
        return check(ask_model(question, vocab), vocab)
    except UnusableReply as exc:
        return _by_rules(question, vocab, f"router reply unusable ({exc}): the rules decided")
    except Exception as exc:  # noqa: BLE001 - no key, quota, outage: degrade, never fail
        return _by_rules(question, vocab, f"router model unavailable ({type(exc).__name__}): the rules decided")


# Purpose:
# The flywheel: a list we couldn't answer exactly, written down so the
# most-asked missing column (or record set) is the next one to add. A full
# disk or a read-only folder must never fail the search.
def log_miss(question: str, p: Plan) -> bool:
    record = {"at": datetime.now(UTC).isoformat(timespec="seconds"), "question": question,
              "source": p.source, "missing_column": p.missing_column, "filters": p.filters,
              "reasoning": p.reasoning}
    try:
        config.ROUTER_MISSES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with config.ROUTER_MISSES_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return True
    except OSError:
        return False
