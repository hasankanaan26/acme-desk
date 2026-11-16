# ============================================================
# Router: /evals — the last saved runs of Part 3's three checks
# ============================================================
#   GET /evals/runs         which saved runs exist
#   GET /evals/scoreboard   scoreboard.py: one table per kind of question
#   GET /evals/routes       route_eval.py: the rules and the model, per question
#   GET /evals/answers      answers.py: correct / retrieval miss / generation miss / made it up
#
# Read-only, and only what the scripts already saved in RUNS_DIR: the
# API never runs an eval. The scripts impersonate every persona with
# the owner's database URL, which the API process must not have (see
# app/db/impersonate.py). Run them in a terminal, then refresh the tab.
#
# Tenant admins only: a run names the documents each persona got back,
# including ones you may not read yourself.
# ============================================================

import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.deps import require_admin
from app.auth.service import Principal
from app.config import REPO_ROOT, RUNS_DIR
from app.evals.scoreboard import ABOUT, SCENARIOS, summarize

router = APIRouter(prefix="/evals", tags=["Evals"])

GOLDEN = REPO_ROOT / "shared" / "golden" / "golden_scenarios.json"
STAMP = r"^\d{8}-\d{6}$"
RUN_PATTERN = r"^(latest|baseline|\d{8}-\d{6})$"


def _read(path: Path, missing: str) -> dict:
    if not path.exists():
        raise HTTPException(status_code=404, detail=missing)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"{path.name} is unreadable: {exc}")


def _stamps() -> list[str]:
    stamps = [p.stem.removeprefix("scoreboard-") for p in RUNS_DIR.glob("scoreboard-*.json")]
    return sorted((s for s in stamps if re.match(STAMP, s)), reverse=True)


def _golden() -> dict[str, dict]:
    if not GOLDEN.exists():
        return {}
    return {q["id"]: q for q in json.loads(GOLDEN.read_text(encoding="utf-8"))["questions"]}


@router.get("/runs")
def runs(_: Principal = Depends(require_admin)):
    baseline = RUNS_DIR / "scoreboard-baseline.json"
    return {
        "scoreboard": _stamps(),
        "baseline": json.loads(baseline.read_text(encoding="utf-8")).get("saved") if baseline.exists() else None,
        "routes": (RUNS_DIR / "route-eval-latest.json").exists(),
        "answers": (RUNS_DIR / "answers-latest.json").exists(),
    }


# Purpose:
# A saved scoreboard run, shaped for the tab: the tables per kind of
# question, the winners, the misleading overall line, the leaks, and
# every question's row per technique (no traces: they are long).
@router.get("/scoreboard")
def scoreboard(run: str = Query("latest", pattern=RUN_PATTERN), _: Principal = Depends(require_admin)):
    if run == "latest":
        stamps = _stamps()
        if not stamps:
            raise HTTPException(status_code=404, detail="No scoreboard run saved yet. Run: python scoreboard.py")
        run = stamps[0]
    name = "scoreboard-baseline.json" if run == "baseline" else f"scoreboard-{run}.json"
    data = _read(RUNS_DIR / name, f"No saved run {run}. Run: python scoreboard.py"
                 + (" --save-baseline" if run == "baseline" else ""))
    results = data["results"]
    techniques = list(results)
    fell_back = sorted(n for n, r in results.items() if r.get("fell_back"))
    present = [s for s in SCENARIOS if any(s in r.get("by_scenario", {}) for r in results.values())]
    scenarios = [{"name": s, "about": ABOUT[s], "winner": data.get("winners", {}).get(s),
                  "questions": next((r["by_scenario"][s]["questions"] for r in results.values()
                                     if s in r.get("by_scenario", {})), 0),
                  "table": {n: r["by_scenario"].get(s) for n, r in results.items()}} for s in present]
    answerable = {n: summarize([row for row in r["rows"] if row["answerable"]]) for n, r in results.items()}
    first = results[techniques[0]]["rows"] if techniques else []
    golden = _golden()   # what each question needs, for the tab's worked example
    questions = [{"id": q["id"], "scenario": q["scenario"], "user": q["user"], "question": q["question"],
                  "needs": golden.get(q["id"], {}).get("needs", []), "answer": golden.get(q["id"], {}).get("answer"),
                  "by": {n: next(({k: v for k, v in row.items() if k != "trace"}
                                  for row in r["rows"] if row["id"] == q["id"]), None)
                         for n, r in results.items()}} for q in first]
    return {"run": run, "saved": data.get("saved"), "embedding_model": data.get("embedding_model"),
            "index": data.get("index"), "top_k": data.get("top_k"), "techniques": techniques,
            "fell_back": fell_back, "scenarios": scenarios,
            "all_answerable": {n: {"recall": s["recall"], "precision": s["precision"], "hit@1": s["hit@1"]}
                               for n, s in answerable.items()},
            "leaks": sum((r["by_scenario"].get(s) or {}).get("leaks", 0) for r in results.values() for s in present),
            "questions": questions}


@router.get("/routes")
def routes(_: Principal = Depends(require_admin)):
    return _read(RUNS_DIR / "route-eval-latest.json", "No route eval saved yet. Run: python route_eval.py")


# Purpose:
# answers.py's last run, with each question's text and the right
# answer from the golden set, and the verdicts counted per technique.
@router.get("/answers")
def answers(_: Principal = Depends(require_admin)):
    data = _read(RUNS_DIR / "answers-latest.json", "No answers run saved yet. Run: python answers.py")
    golden = _golden()
    kinds = ["correct", "retrieval miss", "generation miss", "made it up"]
    counts = {name: {k: sum(r["verdict"] == k for r in rows) for k in kinds} for name, rows in data["results"].items()}
    judged = [r.get("faithfulness") for rows in data["results"].values() for r in rows]
    scores = {name: {"faithfulness": _mean(r.get("faithfulness") for r in rows),
                     "correctness": round(sum(r["verdict"] == "correct" for r in rows) / len(rows), 2) if rows else None}
              for name, rows in data["results"].items()}
    questions = {}
    for rows in data["results"].values():
        for r in rows:
            q = golden.get(r["id"], {})
            questions.setdefault(r["id"], {"question": q.get("question", ""), "user": q.get("user", ""),
                                           "scenario": r["scenario"],
                                           "expected": q.get("answer") or "(says it does not know)"})
    return {"model": data.get("model"), "judged": any(v is not None for v in judged), "kinds": kinds,
            "counts": counts, "scores": scores, "questions": questions, "results": data["results"]}


def _mean(values) -> float | None:
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 2) if values else None
