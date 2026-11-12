"""
scoreboard.py — every retrieval technique, the same scenario questions, one table per kind of question.

    python scoreboard.py                       # the techniques that need no model
    python scoreboard.py --llm                 # + hyde and multi_query (one cached LLM call per question each)
    python scoreboard.py --strategies dense,parent --details
    python scoreboard.py --scenario whole-section --details
    python scoreboard.py --save-baseline       # freeze today's numbers (runs/scoreboard-baseline.json)
    python scoreboard.py --against-baseline    # what moved since, question by question

The questions (shared/golden/golden_scenarios.json) are built so the techniques DISAGREE: casual
wording, an exact id, a whole-section list, an answer away from the words that match, two
documents, and questions nothing answers. Each is asked as its own person (intern, eng-manager,
...), through the same retrieve() and access filter as the API. No LLM is needed to score.

The set describes MONDAY: run `python fake_drive.py apply all` and a sync first.
Metrics: app/evals/scoreboard.py. Part 4's release gate reads the saved JSON.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import db  # noqa: E402
from app.config import REPO_ROOT, RETRIEVAL_STRATEGIES, RUNS_DIR, SOURCE_DIR  # noqa: E402
from app.evals.judge import build_truth, judge_chunk  # noqa: E402
from app.evals.runner import LLM_STRATEGIES, People, ask  # noqa: E402
from app.evals.scoreboard import ABOUT, SCENARIOS, score, summarize, winner  # noqa: E402
from app.ingest.registry import fetch_register  # noqa: E402
from app.rag import catalog, store  # noqa: E402
from app.rag.embedder import embedding_model_id  # noqa: E402

GOLDEN = REPO_ROOT / "shared" / "golden" / "golden_scenarios.json"
BASELINE = RUNS_DIR / "scoreboard-baseline.json"


def load_questions(scenario: str | None = None) -> tuple[list[dict], int]:
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    questions = [q for q in golden["questions"] if not scenario or q["scenario"] == scenario]
    return questions, golden["top_k"]


# Purpose:
# Every question through one technique, scored, with its cost and its flags.
def evaluate(strategy: str, questions: list[dict], k: int, truth: dict, people: People) -> list[dict]:
    rows = []
    for q in questions:
        person = people(q["user"])
        run = ask(person, q["question"], strategy, k, q.get("as_of"))
        flags = sorted({f for c in run.chunks
                        for f in judge_chunk(c, truth, person.group_names, q.get("as_of"), naive=False)[1]})
        rows.append({**score(q, run.chunks, k), "id": q["id"], "scenario": q["scenario"], "user": q["user"],
                     "question": q["question"], "llm_calls": run.llm_calls, "ms": round(run.ms, 1),
                     "flags": flags, "trace": run.trace})
    return rows


def _cell(value, width: int, digits: int = 2) -> str:
    if value is None:
        return f"{'-':>{width}}"
    if isinstance(value, float):
        return f"{value:>{width}.{digits}f}"
    return f"{value:>{width}}"


def print_scenario(scenario: str, table: dict[str, dict], n: int, fell_back: set[str]) -> str | None:
    # A technique that fell back (no model, no reranker) is shown, starred, and can't win:
    # its numbers are another technique's.
    best = winner({name: s for name, s in table.items() if name not in fell_back})
    print(f"\n{scenario}: {ABOUT[scenario]} ({n} question{'s' if n != 1 else ''})")
    if scenario == "unanswerable":
        print(f"  {'technique':<15}{'calm':>7}{'LLM/q':>8}{'ms/q':>8}{'leaks':>7}")
        for name, s in table.items():
            mark = "  <- winner" if name == best else ""
            name = f"{name}*" if name in fell_back else name
            print(f"  {name:<15}{_cell(s['calm'], 7)}{_cell(s['llm'], 8, 1)}{_cell(s['ms'], 8, 0)}"
                  f"{_cell(s['leaks'], 7)}{mark}")
    else:
        print(f"  {'technique':<15}{'Hit@1':>7}{'Hit@5':>7}{'MRR':>7}{'doc@5':>7}{'LLM/q':>8}{'ms/q':>8}{'leaks':>7}")
        for name, s in table.items():
            mark = "  <- winner" if name == best else ""
            name = f"{name}*" if name in fell_back else name
            print(f"  {name:<15}{_cell(s['hit@1'], 7)}{_cell(s['hit@5'], 7)}{_cell(s['mrr'], 7)}"
                  f"{_cell(s['doc@5'], 7)}{_cell(s['llm'], 8, 1)}{_cell(s['ms'], 8, 0)}{_cell(s['leaks'], 7)}{mark}")
    return best


def print_details(results: dict, questions: list[dict]) -> None:
    print("\nQuestion by question (ready = the position where the results first hold every need; - = never):")
    for q in questions:
        print(f"\n  {q['id']} [{q['scenario']}] as {q['user']}: {q['question']}")
        for name, res in results.items():
            r = next(r for r in res["rows"] if r["id"] == q["id"])
            if r["answerable"]:
                verdict = f"ready@{r['ready']}" if r["ready"] else ("right doc, wrong piece" if r["doc@5"] else "missed")
            else:
                verdict = f"{'calm' if r['calm'] else 'SURE OF ITSELF'} (best distance {r['best_distance'] or 0:.2f})"
            flags = f"  [{', '.join(r['flags'])}]" if r["flags"] else ""
            print(f"    {name:<14} {verdict:<24} {' '.join(d or '?' for d in r['docs'][:3])}{flags}")


def compare_baseline(results: dict) -> None:
    if not BASELINE.exists():
        sys.exit("No baseline yet. Run: python scoreboard.py --save-baseline")
    base = json.loads(BASELINE.read_text(encoding="utf-8"))
    print(f"\nAgainst the baseline of {base['saved']} ({base.get('embedding_model', '?')}):")
    for name, res in results.items():
        old = base["results"].get(name)
        if not old:
            continue
        before = {r["id"]: r for r in old["rows"]}
        moved = []
        for r in res["rows"]:
            b = before.get(r["id"])
            if b and r["answerable"] and b["hit@1"] != r["hit@1"]:
                moved.append(f"{r['id']}: {'miss -> HIT@1' if r['hit@1'] else 'HIT@1 -> miss'}")
            if b and not r["answerable"] and b["calm"] != r["calm"]:
                moved.append(f"{r['id']}: {'sure -> calm' if r['calm'] else 'calm -> SURE'}")
            if b and not b["flags"] and r["flags"]:
                moved.append(f"{r['id']}: new flags {r['flags']}")
        print(f"  {name:<15} {'unchanged' if not moved else ''}")
        for line in moved:
            print(f"      {line}   explain this one")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--strategies", default="", help="comma-separated (default: all that need no model)")
    parser.add_argument("--llm", action="store_true", help="include hyde and multi_query")
    parser.add_argument("--scenario", choices=SCENARIOS)
    parser.add_argument("--details", action="store_true")
    parser.add_argument("--save-baseline", action="store_true")
    parser.add_argument("--against-baseline", action="store_true")
    args = parser.parse_args()

    names = [s.strip() for s in args.strategies.split(",") if s.strip()] or [
        s for s in RETRIEVAL_STRATEGIES if args.llm or s not in LLM_STRATEGIES]
    unknown = [n for n in names if n not in RETRIEVAL_STRATEGIES]
    if unknown:
        sys.exit(f"Unknown strategy {unknown}; choose from {', '.join(RETRIEVAL_STRATEGIES)}")

    applied = SOURCE_DIR / ".applied_events.json"
    if not applied.exists() or len(json.loads(applied.read_text())) < 4:
        print("NOTE: the questions describe Monday. Run `python fake_drive.py apply all` and a sync first.\n")

    questions, k = load_questions(args.scenario)
    people = People("scoreboard.py")
    admin = people("admin")
    with db.tx("app", admin.tenant_id):
        live = catalog.active_name()
        register = fetch_register(with_acl=True)
        sections, small = store.count(), store.count_small()
    if not live:
        sys.exit("No live index. Run: python sync.py --apply")
    if not small:
        sys.exit("The live index has no small chunks: it was built before Part 3. Run: python sync.py --apply")
    truth = build_truth(register)

    # Warm up: load the embedder and the cross-encoder once, so the
    # timings below measure searches, not model loading.
    for name in names:
        ask(people(questions[0]["user"]), "warm up", name, k)

    results = {}
    for name in names:
        rows = evaluate(name, questions, k, truth, people)
        results[name] = {"rows": rows}

    fell_back = {n for n, res in results.items() for r in res["rows"]
                 if any("unavailable" in line for line in r["trace"])}
    for name in fell_back:
        results[name]["fell_back"] = True
    present = [s for s in SCENARIOS if any(q["scenario"] == s for q in questions)]
    print(f"Scoreboard: {len(questions)} questions, top {k}, {embedding_model_id()}, "
          f"index {live} ({sections} sections + {small} small chunks)")
    winners = {}
    for scenario in present:
        table = {name: summarize([r for r in res["rows"] if r["scenario"] == scenario])
                 for name, res in results.items()}
        for name in table:
            results[name].setdefault("by_scenario", {})[scenario] = table[name]
        winners[scenario] = print_scenario(scenario, table, sum(1 for q in questions if q["scenario"] == scenario),
                                           fell_back)

    print("\nWho wins what (quality first, then fewer LLM calls, then speed; a leak disqualifies):")
    for scenario, best in winners.items():
        s = results[best]["by_scenario"][scenario] if best else {}
        quality = f"calm {s['calm']:.2f}" if scenario == "unanswerable" else f"Hit@1 {s['hit@1']:.2f}  MRR {s['mrr']:.2f}"
        print(f"  {scenario:<15} {best or '(none)':<15} {quality}")
    answerable = {name: summarize([r for r in res["rows"] if r["answerable"]]) for name, res in results.items()}
    print(f"\n  {'all answerable':<15}" + "".join(f"  {n} {s['hit@1']:.2f}" for n, s in answerable.items()))
    print("  (Hit@1 over every answerable question: the number one would put on a slide, and the reason not to.)")
    leaks = sum(s["leaks"] for res in results.values() for s in res["by_scenario"].values())
    print(f"\nLeaks, every technique, every question: {leaks}")
    if fell_back:
        print(f"* {', '.join(sorted(fell_back))}: ran without a model or reranker and fell back to plain search, "
              "so those rows are another technique's numbers and can't win. (--details shows the traces.)")

    if args.details:
        print_details(results, questions)

    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    saved = {"saved": stamp, "embedding_model": embedding_model_id(), "index": live, "top_k": k,
             "winners": winners, "results": results}
    out = RUNS_DIR / f"scoreboard-{stamp}.json"
    out.write_text(json.dumps(saved, indent=1), encoding="utf-8")
    print(f"\nSaved: {out}")
    if args.save_baseline:
        BASELINE.write_text(json.dumps(saved, indent=1), encoding="utf-8")
        print(f"Baseline frozen: {BASELINE}")
    if args.against_baseline:
        compare_baseline(results)


if __name__ == "__main__":
    main()
