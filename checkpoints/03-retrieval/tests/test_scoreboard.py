# ============================================================
# Part 3: the scoreboard's metrics, and the scenario set itself
# ============================================================
# Two kinds of test, neither needs Postgres or a model:
#   - the metrics on hand-made results: what "ready", Hit@1, MRR,
#     doc@5 and calm mean, exactly
#   - a lint on shared/golden/golden_scenarios.json: every evidence
#     string really is in its document ON MONDAY (after the weekend's
#     events), every needed document is one the asker may read, and
#     every question names a known scenario. A golden set that
#     quietly rots is worse than none: it measures the wrong thing
#     with confidence.
# ============================================================

import json

import pytest

from app.config import CORPORATE_EMAIL_DOMAINS, REPO_ROOT
from app.evals import scoreboard
from app.evals.scoreboard import SCENARIOS, meets, score, summarize, winner, words
from app.ingest.parsers import parse
from app.ingest.pii import redact

GOLDEN = json.loads((REPO_ROOT / "shared" / "golden" / "golden_scenarios.json").read_text(encoding="utf-8"))
DATA = REPO_ROOT / "shared" / "data"


def chunk(doc_id, text, distance=0.5):
    return {"doc_id": doc_id, "text": text, "distance": distance}


# ---- the metrics ----

def test_words_ignores_case_spacing_and_punctuation():
    assert words("Hotels: up to $230 per\nnight!") == "hotels up to $230 per night"
    assert words("$1,500") == words("$1 500")


def test_a_need_is_met_by_the_right_document_holding_every_word():
    need = {"doc": "ENG-HANDBOOK", "evidence": ["two reviewers", "billing"]}
    assert meets(chunk("ENG-HANDBOOK", "Changes to billing need two reviewers."), need)
    assert not meets(chunk("ENG-HANDBOOK", "Changes need two reviewers."), need)          # a word missing
    assert not meets(chunk("ENG-CODING", "billing: two reviewers"), need)                 # wrong document
    assert not meets(chunk("ENG-HANDBOOK", "billing: twelve reviewers"), need)            # whole words only
    assert meets(chunk("COMPANY-FAQ", "$1,500 allowance"), {"doc": ["FIN-EXP-2026", "COMPANY-FAQ"],
                                                           "evidence": ["$1,500"]})


def test_ready_is_where_the_context_first_holds_every_need():
    q = {"needs": [{"doc": "A", "evidence": ["alpha"]}, {"doc": "B", "evidence": ["beta"]}]}
    results = [chunk("A", "alpha"), chunk("C", "noise"), chunk("B", "beta")]
    s = score(q, results)
    assert s["ready"] == 3 and s["hit@1"] is False and s["hit@5"] is True and s["rr"] == pytest.approx(1 / 3)
    assert score({"needs": [{"doc": "A", "evidence": ["alpha"]}]}, results)["hit@1"] is True


def test_right_document_wrong_piece_is_doc_at_5_without_a_hit():
    q = {"needs": [{"doc": "HR-ONBOARDING", "evidence": ["badge", "security awareness"]}]}
    s = score(q, [chunk("HR-ONBOARDING", "Collect your laptop and badge."),
                  chunk("HR-ONBOARDING", "Complete the security awareness training.")])
    assert s["doc@5"] is True and s["hit@5"] is False and s["rr"] == 0.0


def test_only_the_top_k_count():
    q = {"needs": [{"doc": "A", "evidence": ["alpha"]}]}
    results = [chunk("X", "x")] * 5 + [chunk("A", "alpha")]
    assert score(q, results, k=5)["hit@5"] is False


def test_an_unanswerable_question_is_calm_when_nothing_looks_sure():
    q = {"needs": []}
    assert score(q, [chunk("A", "a", distance=1.2)])["calm"] is True
    assert score(q, [chunk("A", "a", distance=0.4)])["calm"] is False
    assert score(q, [])["calm"] is True
    assert score(q, [chunk("A", "a")])["hit@1"] is None      # no hit to score


def test_the_winner_is_quality_then_cost_and_a_leak_disqualifies():
    def row(hit, mrr, llm, ms, leaks=0):
        return {"hit@1": hit, "mrr": mrr, "calm": None, "llm": llm, "ms": ms, "leaks": leaks}
    assert winner({"dense": row(0.5, 0.7, 0, 40), "rerank": row(0.75, 0.8, 0, 400)}) == "rerank"
    assert winner({"hyde": row(0.75, 0.8, 1, 2000), "rerank": row(0.75, 0.8, 0, 400)}) == "rerank"
    assert winner({"leaky": row(1.0, 1.0, 0, 10, leaks=1), "dense": row(0.25, 0.4, 0, 40)}) == "dense"


def test_summarize_counts_leaks_per_question():
    rows = [{"hit@1": True, "hit@5": True, "rr": 1.0, "doc@5": True, "calm": None, "llm_calls": 0, "ms": 10,
             "flags": ["leak"]},
            {"hit@1": False, "hit@5": True, "rr": 0.5, "doc@5": True, "calm": None, "llm_calls": 0, "ms": 30,
             "flags": []}]
    s = summarize(rows)
    assert s["hit@1"] == 0.5 and s["mrr"] == 0.75 and s["leaks"] == 1 and s["ms"] == 20


@pytest.mark.skip(reason="Lab exercise (Part 3): write context_tokens(), then remove this line")
def test_context_tokens_counts_what_the_model_would_read():
    sections = [chunk("A", "x" * 800), chunk("B", "y" * 400)]
    small = [chunk("A", "x" * 200), chunk("B", "y" * 100)]
    assert scoreboard.context_tokens(sections) == 300
    assert scoreboard.context_tokens(small) == 75
    assert scoreboard.context_tokens([]) == 0
    rows = [{"hit@1": True, "hit@5": True, "rr": 1.0, "doc@5": True, "calm": None, "llm_calls": 0, "ms": 10,
             "flags": [], "tokens": 300}]
    assert summarize(rows)["tokens"] == 300


# ---- the scenario set ----

def monday() -> tuple[dict, dict]:
    """Monday's register ({doc_id: entry}) and files ({path: bytes}), from shared/data and its events."""
    register = {d["doc_id"]: d for d in json.loads((DATA / "register.json").read_text(encoding="utf-8"))["documents"]}
    files = {d["path"]: (DATA / "sites" / d["path"]).read_bytes() for d in register.values()
             if (DATA / "sites" / d["path"]).exists()}
    for event in json.loads((DATA / "events" / "events.json").read_text(encoding="utf-8"))["events"]:
        for op in event["ops"]:
            if op["op"] in ("add_file", "replace_file"):
                files[op["path"]] = (DATA / "events" / op["from"]).read_bytes()
            elif op["op"] == "delete_file":
                files.pop(op["path"], None)
            elif op["op"] == "add_entry":
                register[op["entry"]["doc_id"]] = op["entry"]
            elif op["op"] == "patch_entry":
                register[op["doc_id"]].update(op["set"])
            elif op["op"] == "remove_entry":
                register.pop(op["doc_id"], None)
    return register, files


REGISTER, FILES = monday()
IDENTITIES = json.loads((DATA / "identities.json").read_text(encoding="utf-8"))["users"]


def monday_text(doc_id: str) -> str:
    entry = REGISTER[doc_id]
    sections = parse(entry["path"], FILES[entry["path"]]).sections
    return words(" ".join(f"{s.heading} {redact(s.text, CORPORATE_EMAIL_DOMAINS)[0]}" for s in sections))


def test_every_question_names_a_known_scenario_and_person():
    ids = [q["id"] for q in GOLDEN["questions"]]
    assert len(ids) == len(set(ids))
    assert set(GOLDEN["scenarios"]) == set(SCENARIOS)
    for q in GOLDEN["questions"]:
        assert q["scenario"] in SCENARIOS, q["id"]
        assert q["user"] in IDENTITIES, q["id"]
        assert bool(q["needs"]) == bool(q["facts"]) == (q["scenario"] != "unanswerable"), q["id"]
    for scenario in SCENARIOS:
        assert sum(q["scenario"] == scenario for q in GOLDEN["questions"]) >= 3, scenario


@pytest.mark.parametrize("q", [q for q in GOLDEN["questions"] if q["needs"]], ids=lambda q: q["id"])
def test_every_evidence_string_is_in_its_document_on_monday(q):
    groups = set(IDENTITIES[q["user"]]["groups"])
    for need in q["needs"]:
        docs = need["doc"] if isinstance(need["doc"], list) else [need["doc"]]
        for doc_id in docs:
            entry = REGISTER[doc_id]
            assert entry["status"] == "current", (q["id"], doc_id)
            assert groups & set(entry["allowed_groups"]), f"{q['user']} may not read {doc_id}"
            text = monday_text(doc_id)
            for evidence in need["evidence"]:
                assert f" {words(evidence)} " in f" {text} ", f"{q['id']}: {evidence!r} is not in {doc_id}"


# ---- answers.py: the answer-level check (no model: the answers are written here) ----

def test_a_fact_can_be_said_several_ways():
    import answers

    assert answers.has_fact("Changes to billing need two reviewers.", ["two", "2"])
    assert answers.has_fact("You need 2 reviewers", ["two", "2"])
    assert not answers.has_fact("You need twelve reviewers", ["two", "2"])
    assert answers.abstained("I don’t have information about that in the knowledge base.")


def test_the_verdict_says_whose_fault_a_wrong_answer_is():
    import answers

    q = {"needs": [{"doc": "ENG-HANDBOOK", "evidence": ["two reviewers"]}], "facts": [["two", "2"]]}
    right_context = [chunk("ENG-HANDBOOK", "Billing changes need two reviewers.")]
    wrong_context = [chunk("ENG-CODING", "Every PR needs at least one reviewer.")]
    assert answers.verdict(q, "Two reviewers (Engineering Handbook).", right_context, 5) == "correct"
    # Faithful to its context, and wrong: the search's fault
    assert answers.verdict(q, "At least one reviewer.", wrong_context, 5) == "retrieval miss"
    # The context had it, the answer didn't: the model's fault
    assert answers.verdict(q, "At least one reviewer.", right_context, 5) == "generation miss"
    nothing = {"needs": [], "facts": []}
    assert answers.verdict(nothing, "I don't have information about that.", wrong_context, 5) == "correct"
    assert answers.verdict(nothing, "Parking is $200 a month.", wrong_context, 5) == "made it up"
