"""
evaluate.py — score the live index on the golden set. No LLM is called.

Runs the hand-written golden set (shared/golden/golden_qa.json) against the
live index built by the sync job, and reports quality (Hit@5, MRR) next to
safety (leaks, stale chunks, ghosts, PII, empty chunks).

    python evaluate.py              # the live index
    python evaluate.py --details    # plus every question and what came back

Part 2: each golden question is asked as its persona's real account
(intern -> intern@acme.test), with that person's groups from Postgres,
and the judge reads the register from Postgres too. Like search.py it
acts as people without their passwords: owner tooling, audited.

The golden set describes MONDAY: in local mode run `python fake_drive.py apply all`
and a sync first, or the numbers will not mean much.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import db  # noqa: E402
from app.config import REPO_ROOT, RUNS_DIR, SOURCE_DIR  # noqa: E402
from app.db.impersonate import as_person  # noqa: E402
from app.evals.judge import build_truth, score_question, summarize  # noqa: E402
from app.ingest.registry import current_tenant_row, fetch_register  # noqa: E402
from app.rag import catalog  # noqa: E402
from app.rag.retriever import retrieve  # noqa: E402

GOLDEN = REPO_ROOT / "shared" / "golden" / "golden_qa.json"

LABELS = {
    "hit@5": "Hit@5: right document in the top 5",
    "mrr": "MRR: how high it ranks (1.0 = always first)",
    "leak_questions": "questions with a chunk the user may NOT read",
    "stale_questions": "questions with a superseded or draft chunk",
    "ghost_questions": "questions with a deleted or outdated chunk",
    "pii_questions": "questions with personal data in a chunk",
    "empty_questions": "questions with an empty chunk",
    "clean_questions": "questions with none of the above",
}


def run(questions: list[dict], top_k: int, truth: dict) -> list[dict]:
    rows, people = [], {}
    for q in questions:
        person = people.get(q["user"]) or people.setdefault(q["user"], as_person(q["user"], "evaluate.py"))
        with db.tx("app", person.tenant_id, person.user_id):
            chunks = retrieve(q["question"], person.group_ids, top_k=top_k, as_of=q.get("as_of"))
        rows.append(score_question(q, chunks, truth, person.group_names, naive=False))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--details", action="store_true")
    args = parser.parse_args()

    applied = SOURCE_DIR / ".applied_events.json"
    if not applied.exists() or len(json.loads(applied.read_text())) < 5:
        print("NOTE: the golden set describes Monday. Run `python fake_drive.py apply all` "
              "and a sync first, or the numbers will not mean much.\n")

    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    questions, top_k = golden["questions"], golden["top_k"]
    tenant = as_person("admin", "evaluate.py").tenant_id
    with db.tx("app", tenant):
        live_register = fetch_register(with_acl=True)
        live = catalog.active_name()
        if current_tenant_row()["source_kind"] != "local":
            print("NOTE: the judge reads files from the local folder; with a Drive tenant its ghost and "
                  "stale flags describe the local copy, not Drive.\n")
    if not live:
        print("No live index. Run: python sync.py --apply")
        return
    rows = run(questions, top_k, build_truth(live_register))
    results = {"sync": {"summary": summarize(rows), "rows": rows}}

    if not results:
        return
    names = {"naive": "one-shot /ingest", "sync": "the sync job"}
    header = f"{'':48}" + "".join(f"{names[i]:>22}" for i in results)
    print(header)
    first = next(iter(results.values()))["summary"]
    print(f"{'(' + str(first['questions']) + ' questions, ' + str(first['answerable']) + ' answerable, top ' + str(top_k) + ')':48}")
    for key, label in LABELS.items():
        cells = []
        for i in results:
            value = results[i]["summary"][key]
            cells.append(f"{value:>22.2f}" if isinstance(value, float) else f"{value:>19} / {first['questions']}")
        print(f"{label:48}" + "".join(cells))

    for index, result in results.items():
        bad = [r for r in result["rows"] if r["flags"] or r["hit"] is False]
        if bad:
            print(f"\n{names[index]}: {len(bad)} question(s) to look at")
            for r in bad:
                miss = " MISSED" if r["hit"] is False else ""
                flags = f" [{', '.join(r['flags'])}]" if r["flags"] else ""
                print(f"  {r['id']} ({r['user']}{', as of ' + r['as_of'] if r['as_of'] else ''}){miss}{flags}  {r['question']}")
                if args.details:
                    for got in r["retrieved"]:
                        print(f"        {got['doc_id']:<26} {', '.join(got['flags'])}")

    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    out = RUNS_DIR / f"eval-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nSaved: {out}")


if __name__ == "__main__":
    main()
