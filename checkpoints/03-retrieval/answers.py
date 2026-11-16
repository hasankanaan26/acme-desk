"""
answers.py — the two answer numbers: is the answer FAITHFUL to what it was given, and is it CORRECT?

    python answers.py                                  # dense and parent, every scenario question
    python answers.py --strategies hybrid_rerank,parent --scenario lost-context
    python answers.py --show                           # print every answer
    python answers.py --no-judge                       # correctness only: half the model calls

For each scenario question: retrieve with the technique (as the question's person, inside the
access filter), write the answer exactly as POST /query does (same prompt, same context blocks),
then grade it twice:

    faithfulness        (RAGAS's name) the share of the answer's claims its context supports.
                        An LLM judge splits the answer into claims and checks each one
                        (app/prompts/faithfulness.py). Low: the model added things.
    answer correctness  every fact a person wrote down (shared/golden/golden_scenarios.json) is in
                        the answer, or, for a question nothing answers, it says so. No judge.

A wrong answer is then told apart by whose fault it is:

    correct          right
    retrieval miss   wrong, and the context never held the facts: no prompt could have fixed it
    generation miss  wrong, although the context held every fact: the model's fault, not the search's
    made it up       a question nothing answers, answered anyway

Why both? A faithful answer to the wrong context is still wrong: "at least one reviewer" is 100%
faithful to the coding standards and wrong about billing code. Faithfulness can't see that, so
correctness is checked against the facts, without a judge: cheap, repeatable, no opinion.

Needs a model (LLM_PROVIDER and its key in .env). Answers and verdicts are cached in
runs/llm_cache.json: the second run costs nothing.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import RETRIEVAL_STRATEGIES, RUNS_DIR  # noqa: E402
from app.evals.runner import People, ask  # noqa: E402
from app.evals.scoreboard import SCENARIOS, score, words  # noqa: E402
from app.llm import STATS, cached_call_llm, get_model_name  # noqa: E402
from app.prompts.faithfulness import FAITHFULNESS_SYSTEM_PROMPT, faithfulness_prompt  # noqa: E402
from app.prompts.rag_answer import RAG_SYSTEM_PROMPT  # noqa: E402
from app.rag.retriever import is_no_result  # noqa: E402
from app.rag.router_llm import parse_reply  # noqa: E402
from app.routers.query import NO_RESULT_ANSWER, build_context  # noqa: E402
from scoreboard import load_questions  # noqa: E402

ABSTAINS = ("don't have information", "do not have information", "no information")


def has_fact(answer: str, fact) -> bool:
    """A fact is a string, or a list of ways to say it (["two", "2"])."""
    options = fact if isinstance(fact, list) else [fact]
    have = f" {words(answer)} "
    return any(f" {words(o)} " in have for o in options)


def abstained(answer: str) -> bool:
    return any(a in answer.lower().replace("’", "'") for a in ABSTAINS)


# Purpose:
# What went right or wrong with one answer, and whose fault it was.
def verdict(q: dict, answer: str, chunks: list[dict], k: int) -> str:
    if not q.get("needs"):
        return "correct" if abstained(answer) else "made it up"
    if all(has_fact(answer, f) for f in q["facts"]):
        return "correct"
    context_ready = score(q, chunks, k)["hit@5"]
    return "generation miss" if context_ready else "retrieval miss"


def answer(question: str, chunks: list[dict]) -> str:
    if is_no_result(chunks):
        return NO_RESULT_ANSWER
    return cached_call_llm(question, RAG_SYSTEM_PROMPT.format(context=build_context(chunks)))


def claims_from(reply: str | None) -> list[dict] | None:
    """The judge's reply -> [{"claim", "supported"}], or None when it isn't the JSON we asked for."""
    data = parse_reply(reply)
    if not data or not isinstance(data.get("claims"), list):
        return None
    return [{"claim": str(c.get("claim", "")), "supported": c.get("supported") is True}
            for c in data["claims"] if isinstance(c, dict)]


# Purpose:
# RAGAS's faithfulness: supported claims / all claims, judged against
# the same context the answer was written from. None when there is
# nothing to judge: no context, an "I don't know", or no claims.
def faithfulness(text: str, chunks: list[dict]) -> tuple[float | None, list[dict]]:
    if is_no_result(chunks) or abstained(text):
        return None, []
    claims = claims_from(cached_call_llm(faithfulness_prompt(build_context(chunks), text), FAITHFULNESS_SYSTEM_PROMPT))
    if not claims:
        return None, claims or []
    return round(sum(c["supported"] for c in claims) / len(claims), 2), claims


def _mean(values) -> float | None:
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 2) if values else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--strategies", default="dense,parent")
    parser.add_argument("--scenario", choices=SCENARIOS)
    parser.add_argument("--show", action="store_true", help="print every answer")
    parser.add_argument("--no-judge", action="store_true", help="skip faithfulness (no judge calls)")
    args = parser.parse_args()
    names = [s.strip() for s in args.strategies.split(",") if s.strip()]
    if any(n not in RETRIEVAL_STRATEGIES for n in names):
        sys.exit(f"choose from {', '.join(RETRIEVAL_STRATEGIES)}")

    questions, k = load_questions(args.scenario)
    people = People("answers.py")
    try:
        cached_call_llm("Reply with the single word: ready")
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"No model ({type(exc).__name__}: {exc}). Set LLM_PROVIDER and its key in .env. "
                 "scoreboard.py needs none.")

    kinds = ["correct", "retrieval miss", "generation miss", "made it up"]
    results = {}
    for name in names:
        rows = []
        for q in questions:
            run = ask(people(q["user"]), q["question"], name, k, q.get("as_of"))
            text = answer(q["question"], run.chunks)
            faith, claims = (None, []) if args.no_judge else faithfulness(text, run.chunks)
            rows.append({"id": q["id"], "scenario": q["scenario"], "verdict": verdict(q, text, run.chunks, k),
                         "faithfulness": faith, "claims": claims,
                         "answer": text, "docs": [c.get("doc_id") for c in run.chunks]})
        results[name] = rows

    print(f"Answers: {len(questions)} questions, top {k}, written by {get_model_name()} with POST /query's prompt\n")
    print(f"  {'technique':<15}{'faithfulness':>14}{'correctness':>13}")
    for name, rows in results.items():
        faith = _mean(r["faithfulness"] for r in rows)
        correct = sum(r["verdict"] == "correct" for r in rows) / len(rows)
        print(f"  {name:<15}{'-' if faith is None else f'{faith:.2f}':>14}{correct:>13.2f}")
    print("  (faithfulness: claims the context supports, judged by the model; correctness: the facts, no judge)")

    print(f"\nWhose fault?\n  {'technique':<15}" + "".join(f"{kind:>17}" for kind in kinds))
    for name, rows in results.items():
        print(f"  {name:<15}" + "".join(f"{sum(r['verdict'] == kind for r in rows):>17}" for kind in kinds))
    faithful_wrong = [(n, r["id"]) for n, rows in results.items() for r in rows
                      if r["faithfulness"] == 1.0 and r["verdict"] != "correct"]
    if faithful_wrong:
        print("\nFaithful (1.00) and wrong: " + ", ".join(f"{i} ({n})" for n, i in faithful_wrong))

    print("\nBy scenario (correct / questions):")
    for scenario in [s for s in SCENARIOS if any(q["scenario"] == s for q in questions)]:
        n = sum(1 for q in questions if q["scenario"] == scenario)
        cells = "".join(f"  {name} {sum(r['verdict'] == 'correct' for r in rows if r['scenario'] == scenario)}/{n}"
                        for name, rows in results.items())
        print(f"  {scenario:<15}{cells}")

    for name, rows in results.items():
        wrong = [r for r in rows if r["verdict"] != "correct" or args.show]
        if wrong:
            print(f"\n{name}:")
        for r in wrong:
            q = next(q for q in questions if q["id"] == r["id"])
            faith = "" if r["faithfulness"] is None else f" faithfulness {r['faithfulness']:.2f}"
            print(f"  {r['id']} [{r['verdict']}]{faith} {q['question']}")
            print(f"      answer: {' '.join(r['answer'].split())[:220]}")
            if r["verdict"] != "correct":
                print(f"      expected: {q.get('answer', '(says it does not know)')}")
    print(f"\nLLM: {STATS['calls']} real call(s), {STATS['cache_hits']} from the cache")
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    out = RUNS_DIR / "answers-latest.json"
    out.write_text(json.dumps({"model": get_model_name(), "judged": not args.no_judge, "results": results}, indent=1),
                   encoding="utf-8")
    print(f"Saved: {out}")


if __name__ == "__main__":
    main()
