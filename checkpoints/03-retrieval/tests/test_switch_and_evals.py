# Tests: the role switcher (local testing only) and the Evals tab's API.

import json
import sys

import pytest
from conftest import W, sign_in

import app.routers.auth as auth_router
from app.config import RUNS_DIR, SESSION_COOKIE
from app.evals.scoreboard import summarize

STAMP = "20991231-235959"   # later than any real run: "latest"


@pytest.fixture
def switcher(monkeypatch):
    monkeypatch.setattr(auth_router, "ROLE_SWITCHER", True)


def switch(c, email, headers=W):
    return c.post("/auth/switch", json={"email": email}, headers=headers)


# ---- The role switcher ----

def test_the_switcher_is_off_unless_the_server_turns_it_on(friday, client):
    c = sign_in(client(), "intern@acme.test")
    assert c.get("/auth/switch").json() == {"enabled": False, "accounts": []}
    assert switch(c, "admin@acme.test").status_code == 404
    assert c.get("/auth/me").json()["email"] == "intern@acme.test"


def test_a_switch_is_a_real_new_session_as_that_person(friday, client, switcher):
    c = sign_in(client(), "admin@acme.test")
    admin_cookie = c.cookies.get(SESSION_COOKIE)
    emails = [a["email"] for a in c.get("/auth/switch").json()["accounts"]]
    assert emails[0] == "admin@acme.test" and "intern@acme.test" in emails

    r = switch(c, "intern@acme.test")
    assert r.status_code == 200 and r.json()["groups"] == ["employees", "engineering"]
    assert c.get("/auth/me").json()["email"] == "intern@acme.test"
    assert c.get("/admin/users").status_code == 403            # the intern now, for real

    old = client()
    old.cookies.set(SESSION_COOKIE, admin_cookie)
    assert old.get("/auth/me").status_code == 401               # the admin's session ended

    assert switch(c, "admin@acme.test").status_code == 200      # and back
    audit = c.get("/admin/audit", params={"action": "auth.switch"}).json()
    assert [(e["actor"], e["target"]) for e in audit] == [("intern@acme.test", "admin@acme.test"),
                                                           ("admin@acme.test", "intern@acme.test")]


def test_no_switching_into_another_tenant_without_the_header_or_without_a_session(friday, client, switcher):
    c = sign_in(client(), "intern@acme.test")
    assert "alice@globex.test" not in [a["email"] for a in c.get("/auth/switch").json()["accounts"]]
    assert switch(c, "alice@globex.test").status_code == 404
    assert switch(c, "nobody@acme.test").status_code == 404
    assert switch(c, "admin@acme.test", headers={}).status_code == 403   # CSRF guard
    assert switch(client(), "admin@acme.test").status_code == 401
    assert c.get("/auth/me").json()["email"] == "intern@acme.test"


# ---- /evals: the scripts' saved runs ----

@pytest.fixture
def saved_runs():
    rows = [{"answerable": True, "ready": 1, "hit@1": True, "hit@5": True, "rr": 1.0, "doc@5": True, "calm": None,
             "recall": 1.0, "precision": 1.0, "useful": [True],
             "best_distance": 0.5, "docs": ["COMPANY-FAQ"], "id": "S01", "scenario": "casual", "user": "intern",
             "question": "I'm locked out of my laptop. Who do I ring?", "llm_calls": 0, "ms": 10.0, "flags": [],
             "trace": ["a long trace"]}]
    board = {"saved": STAMP, "embedding_model": "fake", "index": "acme_kb_test", "top_k": 5,
             "winners": {"casual": "dense"}, "results": {"dense": {"rows": rows, "by_scenario": {"casual": summarize(rows)}}}}
    answers = {"model": "fake-model", "results": {"dense": [
        {"id": "S01", "scenario": "casual", "verdict": "retrieval miss", "faithfulness": 1.0,
         "claims": [{"claim": "Ask a colleague", "supported": True}], "answer": "Ask a colleague.", "docs": []}]}}
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    files = {RUNS_DIR / f"scoreboard-{STAMP}.json": board, RUNS_DIR / "answers-latest.json": answers}
    for path, data in files.items():
        path.write_text(json.dumps(data), encoding="utf-8")
    yield
    for path in [*files, RUNS_DIR / "route-eval-latest.json"]:
        path.unlink(missing_ok=True)


def test_evals_are_for_tenant_admins_only(friday, client, saved_runs):
    c = sign_in(client(), "intern@acme.test")
    for path in ("/evals/runs", "/evals/scoreboard", "/evals/routes", "/evals/answers"):
        assert c.get(path).status_code == 403, path


def test_the_scoreboard_is_read_from_the_saved_run(friday, client, saved_runs):
    c = sign_in(client(), "admin@acme.test")
    assert STAMP in c.get("/evals/runs").json()["scoreboard"]
    board = c.get("/evals/scoreboard").json()
    assert board["run"] == STAMP and board["techniques"] == ["dense"] and board["leaks"] == 0
    assert board["scenarios"][0]["name"] == "casual" and board["scenarios"][0]["winner"] == "dense"
    assert board["all_answerable"] == {"dense": {"recall": 1.0, "precision": 1.0, "hit@1": 1.0}}
    assert board["questions"][0]["needs"][0]["doc"] == "COMPANY-FAQ"           # the key, for the worked example
    assert "trace" not in board["questions"][0]["by"]["dense"]
    assert c.get("/evals/scoreboard", params={"run": "../../.env"}).status_code == 422
    assert c.get("/evals/scoreboard", params={"run": "20000101-000000"}).status_code == 404


def test_answers_come_with_the_question_and_the_right_answer(friday, client, saved_runs):
    data = sign_in(client(), "admin@acme.test").get("/evals/answers").json()
    assert data["counts"]["dense"]["retrieval miss"] == 1 and data["counts"]["dense"]["correct"] == 0
    assert data["scores"]["dense"] == {"faithfulness": 1.0, "correctness": 0.0} and data["judged"]   # faithful, and wrong
    assert "4357" in data["questions"]["S01"]["expected"]


def test_route_eval_saves_what_the_tab_shows(friday, client, saved_runs, monkeypatch):
    import route_eval

    monkeypatch.setattr(sys, "argv", ["route_eval.py", "--router", "rules"])
    route_eval.main()
    data = sign_in(client(), "admin@acme.test").get("/evals/routes").json()
    questions = route_eval.load_questions()
    assert data["summary"]["rules"]["total"] == len(questions) == len(data["questions"])
    assert data["summary"]["rules"]["right"] == sum(q["routers"]["rules"]["ok"] for q in data["questions"])
