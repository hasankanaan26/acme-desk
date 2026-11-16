"""
route_eval.py — is the router sending each question down the right path?

    python route_eval.py                 # the rules and the model, side by side (one cached call per question)
    python route_eval.py --router rules  # the regular expressions only, no model needed
    python route_eval.py --details       # what each router said, and why, for every question
    python route_eval.py --misses        # the backlog: lists the directory couldn't answer, by missing column

The scoreboard measures what retrieval RETURNS. This measures one decision before it: the route.
A wrong route is a miss no ranking can fix: a list sent to search comes back with policies, not
people; a passage sent to the directory comes back with every engineer instead of a contact.

The questions (shared/golden/golden_routes.json) carry the route a person would give them and,
for a list, the exact filters. "Right" means the route AND, for a list, the filters.
The directory is shared/data's team-directory.csv (the weekend's events don't touch it), read as
everyone may read it. No database needed.
"""

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import REPO_ROOT, ROUTER_MISSES_FILE, RUNS_DIR
from app.ingest.parsers import parse
from app.llm import get_model_name
from app.rag import router, router_llm

GOLDEN = REPO_ROOT / "shared" / "golden" / "golden_routes.json"
SITES = REPO_ROOT / "shared" / "data" / "sites"
REGISTER = REPO_ROOT / "shared" / "data" / "register.json"
DIRECTORY = SITES / "people" / "team-directory.csv"


def directory_rows() -> list[dict]:
    """The directory as text rows: one row per person, 'heading\\nname: ...; office: ...' (version 1's input)."""
    sections = parse("people/team-directory.csv", DIRECTORY.read_bytes()).sections
    return [{"text": f"{s.heading}\n{s.text}"} for s in sections]


def record_menu(sources: list[str] | None = None) -> dict[str, dict]:
    """The router's menu, built from the CSVs themselves (no database): every record set in
    router.ROUTABLE (or `sources`), as store.record_menu() returns it after a sync."""
    paths = {e["doc_id"]: e["path"] for e in json.loads(REGISTER.read_text(encoding="utf-8"))["documents"]}
    records = [{"doc_id": doc_id, "fields": s.fields}
               for doc_id in (sources if sources is not None else router.ROUTABLE)
               for s in parse(paths[doc_id], (SITES / paths[doc_id]).read_bytes()).sections]
    return router_llm.menu_from_records(records)


def load_questions() -> list[dict]:
    return json.loads(GOLDEN.read_text(encoding="utf-8"))["questions"]


def is_right(q: dict, p: router_llm.Plan) -> bool:
    if p.route != q["route"]:
        return False
    if q["route"] != router_llm.AGGREGATION:
        return True
    if p.source != q.get("source", router.PEOPLE):
        return False
    return {k: sorted(v) for k, v in p.filters.items()} == {k: sorted(v) for k, v in q["filters"].items()}


def _in(source: str | None) -> str:
    return "" if source in (None, router.PEOPLE) else f" in {source}"


def said(p: router_llm.Plan) -> str:
    if p.route == router_llm.AGGREGATION:
        return "aggregation " + " ".join(f"{k}={'|'.join(v)}" for k, v in sorted(p.filters.items())) + _in(p.source)
    if p.route == router_llm.AGGREGATION_UNINDEXED:
        return f"unindexed ({p.missing_column})"
    return "pointwise"


def expected(q: dict) -> str:
    if q["route"] == router_llm.AGGREGATION:
        return ("aggregation " + " ".join(f"{k}={'|'.join(v)}" for k, v in sorted(q["filters"].items()))
                + _in(q.get("source")))
    return "unindexed" if q["route"] == router_llm.AGGREGATION_UNINDEXED else "pointwise"


# Purpose:
# Group the wrong answers by HOW they were wrong: each kind has its own cost.
def kind_of_miss(q: dict, p: router_llm.Plan) -> str:
    if q["route"] == router_llm.AGGREGATION and p.route == router_llm.AGGREGATION:
        return "a list with the wrong filters"
    if q["route"] == router_llm.AGGREGATION:
        return "a list sent to search"
    if p.route == router_llm.AGGREGATION:
        return "turned into a directory list"
    return "unindexed and pointwise mixed up"


def show_misses() -> None:
    if not ROUTER_MISSES_FILE.exists():
        print(f"No misses logged yet ({ROUTER_MISSES_FILE}). Ask `routed` a list the directory can't answer,")
        print('e.g. "Who speaks Spanish?", with a model configured.')
        return
    records = [json.loads(line) for line in ROUTER_MISSES_FILE.read_text(encoding="utf-8").splitlines() if line.strip()]

    def gap(r: dict) -> str:
        column = (r.get("missing_column") or "unknown").lower()
        return f"{column} ({r['source']})" if r.get("source") else f"{column} (no record set)"

    by_gap = Counter(gap(r) for r in records)
    print(f"{len(records)} list question(s) the router couldn't answer exactly ({ROUTER_MISSES_FILE.name}):\n")
    for what, n in by_gap.most_common():
        example = next(r["question"] for r in reversed(records) if gap(r) == what)
        print(f"  {n:>3}  {what:<40} e.g. \"{example}\"")
    print("\nThe top line is what to add next. A missing column of a record set: add it to the CSV and to its")
    print("filters in router.ROUTABLE, then sync. A whole kind of record (no record set): one ROUTABLE entry")
    print("for the document that holds it. Either way: label two questions in golden_routes.json first.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--router", choices=("both", "rules", "llm"), default="both")
    parser.add_argument("--details", action="store_true")
    parser.add_argument("--misses", action="store_true")
    args = parser.parse_args()
    if args.misses:
        show_misses()
        return

    menu, questions = record_menu(), load_questions()
    modes = ["rules", "llm"] if args.router == "both" else [args.router]
    plans = {m: [router_llm.plan(q["question"], menu, mode=m) for q in questions] for m in modes}
    no_model = "llm" in plans and all(p.decided_by == "the rules" for p in plans["llm"])

    sets = ", ".join(f"{s} ({m['rows']} rows)" for s, m in menu.items())
    print(f"Route accuracy: {len(questions)} questions ({GOLDEN.relative_to(REPO_ROOT)}); record sets: {sets}\n")
    width = max(len(expected(q)) for q in questions) + 3
    head = f"  {'id':<5}{'expected':<{width}}" + "".join(f"{('model' if m == 'llm' else m):<45}" for m in modes)
    print(head.rstrip())
    for i, q in enumerate(questions):
        cells = []
        for m in modes:
            p = plans[m][i]
            cells.append(f"{'ok' if is_right(q, p) else 'WRONG: ' + said(p):<45}")
        print(f"  {q['id']:<5}{expected(q):<{width}}" + "".join(cells).rstrip())
        if args.details:
            print(f"       {q['question']}")
            for m in modes:
                p = plans[m][i]
                why = p.reasoning or "; ".join(p.notes) or "-"
                print(f"       {m:>5}: {said(p)}  [{why}]")

    print()
    summary = {}
    for m in modes:
        right = [is_right(q, p) for q, p in zip(questions, plans[m])]
        misses = Counter(kind_of_miss(q, p) for q, p, ok in zip(questions, plans[m], right) if not ok)
        label = "model" if m == "llm" else "rules"
        summary[label] = {"right": sum(right), "total": len(questions), "misses": dict(misses.most_common())}
        print(f"  {label}: {sum(right)}/{len(questions)} right"
              + (f"  ({', '.join(f'{n} {k}' for k, n in misses.most_common())})" if misses else ""))
    if no_model:
        print("\n* No model answered (no key, quota or outage), so the model column is the rules' fallback.")
        print("  Set LLM_PROVIDER and its key in .env to score the model.")

    # For the UI's Evals tab: the last run, whole.
    saved = {"saved": datetime.now().strftime("%Y%m%d-%H%M%S"), "model": get_model_name() if "llm" in modes else None,
             "no_model": no_model, "summary": summary, "questions": [
                 {"id": q["id"], "question": q["question"], "expected": expected(q),
                  "routers": {("model" if m == "llm" else "rules"): {
                      "said": said(plans[m][i]), "ok": is_right(q, plans[m][i]),
                      "why": plans[m][i].reasoning or "; ".join(plans[m][i].notes),
                      "miss": None if is_right(q, plans[m][i]) else kind_of_miss(q, plans[m][i])} for m in modes}}
                 for i, q in enumerate(questions)]}
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    out = RUNS_DIR / "route-eval-latest.json"
    out.write_text(json.dumps(saved, indent=1), encoding="utf-8")
    print(f"\nSaved: {out}")


if __name__ == "__main__":
    main()
