# ============================================================
# The router, the production way (app/rag/router_llm.py)
# ============================================================
# A model writes a plan; code checks every field against the stored
# records before anything runs. What these tests pin:
#   - the prompt's menu is the records' real values, per record set
#   - a checked plan runs; a synonym becomes the stored value
#   - a column the record set lacks, or a record set we can't list
#     -> aggregation_unindexed, logged
#   - a value no row has, or any bad value -> a search, never a wider list
#   - a reply that isn't JSON gets one retry, then the rules decide
#   - no model -> the rules decide, and the trace says "unavailable"
#   - the sync stores a CSV row's fields (redacted) on its chunk (007)
#   - through /search: the plan drives `routed`, the lookup is SQL over
#     chunks.fields, inside the access filter
# The model is always a fake: these tests never call a paid API.
# ============================================================

import json

import pytest
from conftest import W, as_tenant, sign_in

import route_eval
from app import config, db
from app.ingest.sync import run_sync
from app.rag import router, router_llm

# The tests pin their own ROUTABLE (the directory only), so they pass before
# AND after the class adds record sets to router.ROUTABLE. The route-set lint
# below is the one test that reads the real ROUTABLE.
REAL_ROUTABLE = dict(router.ROUTABLE)
PEOPLE_ONLY = {router.PEOPLE: REAL_ROUTABLE[router.PEOPLE]}
ROWS = route_eval.directory_rows()                     # version 1 (the rules) reads text rows
MENU = route_eval.record_menu([router.PEOPLE])         # version 2 reads the stored fields
VOCAB = router_llm.vocabulary(MENU, PEOPLE_ONLY)
PEOPLE = VOCAB[router.PEOPLE]["columns"]
TICKETS = "IT-HELPDESK-EXPORT"
DEPLOY = "Who do I talk to on the Engineering team about a deploy?"


@pytest.fixture(autouse=True)
def people_only(monkeypatch):
    monkeypatch.setattr(router, "ROUTABLE", dict(PEOPLE_ONLY))


@pytest.fixture
def tickets_routable(monkeypatch):
    """The helpdesk export as a second record set: reporter, and status from a fixed list."""
    monkeypatch.setitem(router.ROUTABLE, TICKETS, REAL_ROUTABLE[TICKETS])


def fake_model(*replies):
    """Returns the replies in order (the last one repeats); an Exception is raised. Records every prompt."""
    calls = []

    def call(user_prompt, system_prompt=""):
        calls.append((user_prompt, system_prompt))
        reply = replies[min(len(calls), len(replies)) - 1]
        if isinstance(reply, Exception):
            raise reply
        return reply if isinstance(reply, str) else json.dumps(reply)

    call.calls = calls
    return call


@pytest.fixture
def model(monkeypatch):
    def use(*replies):
        fake = fake_model(*replies)
        monkeypatch.setattr(router_llm, "cached_call_llm", fake)
        return fake
    return use


def names(filters) -> set[str]:
    return {r["text"].split("\n")[0] for r in router.lookup(ROWS, filters)}


# ---- the menu ----

def test_the_prompt_lists_the_directory_values():
    assert PEOPLE["office"] == ["New York", "Remote", "San Francisco"]
    assert "Human Resources" in PEOPLE["department"] and "Product Manager" in PEOPLE["role"]
    assert set(PEOPLE) == {"office", "department", "role"}      # stored: name, email too; filters: these
    prompt = router_llm.system_prompt(VOCAB)
    assert "- PEOPLE-DIRECTORY: the team directory, one row per person (12 rows)" in prompt
    assert "    office: New York, Remote, San Francisco" in prompt
    assert "{{VOCABULARY}}" not in prompt and TICKETS not in prompt


def test_a_second_record_set_is_one_routable_entry(tickets_routable):
    vocab = router_llm.vocabulary(route_eval.record_menu())
    assert list(vocab) == [router.PEOPLE, TICKETS]
    assert set(vocab[TICKETS]["columns"]) == {"reporter", "status"}   # not ticket_id, contact, summary...
    assert {"Maria Garcia", "James Wilson", "Tom Baker"} <= set(vocab[TICKETS]["columns"]["reporter"])
    prompt = router_llm.system_prompt(vocab)
    assert "- IT-HELPDESK-EXPORT: IT helpdesk tickets, one row per ticket (16 rows)" in prompt
    assert "    status: open, resolved, disputed" in prompt


# ---- a column with fixed values (ROUTABLE "values") ----

FIXED = {TICKETS: {"about": "tickets", "filters": ("reporter", "status"),
                   "values": {"status": ("open", "resolved", "disputed")}}}


def test_a_fixed_column_offers_its_list_not_what_the_rows_hold():
    # No row is disputed today, and one says "Closed": the menu is still the list.
    menu = {TICKETS: {"rows": 2, "columns": {"reporter": ["Maria Garcia"], "status": ["Closed", "open"]}}}
    assert router_llm.vocabulary(menu, FIXED)[TICKETS]["columns"]["status"] == ["open", "resolved", "disputed"]


def test_a_state_nobody_is_in_is_still_a_lookup(model, monkeypatch):
    monkeypatch.setattr(router, "ROUTABLE", FIXED)
    menu = {TICKETS: {"rows": 1, "columns": {"reporter": ["Maria Garcia"], "status": ["open"]}}}
    model({"route": "AGGREGATION", "source": TICKETS, "filters": {"status": ["Disputed"]}})
    plan = router_llm.plan("Which tickets are disputed?", menu)
    assert (plan.route, plan.filters) == ("aggregation", {"status": ["disputed"]})


def test_a_value_off_the_list_is_never_a_filter(model, monkeypatch):
    monkeypatch.setattr(router, "ROUTABLE", FIXED)
    menu = {TICKETS: {"rows": 1, "columns": {"reporter": ["Maria Garcia"], "status": ["Closed"]}}}
    model({"route": "AGGREGATION", "source": TICKETS, "filters": {"status": ["Closed"]}})
    assert router_llm.plan("Which tickets are closed?", menu).route == "pointwise"


def test_the_sync_check_names_every_row_off_the_list():
    rows = [{"ticket_id": "IT-1", "status": "open"}, {"ticket_id": "IT-2", "status": "Resolved"},
            None, {"ticket_id": "IT-4"}]
    assert router.off_list_values(TICKETS, rows, FIXED) == [
        "IT-HELPDESK-EXPORT row 2 (IT-2): status 'Resolved' is not one of open, resolved, disputed",
        "IT-HELPDESK-EXPORT row 4 (IT-4): status None is not one of open, resolved, disputed"]
    assert router.off_list_values(router.PEOPLE, rows, FIXED) == []      # no fixed columns: nothing to check


def test_the_real_ticket_export_is_on_the_list():
    rows = [s.fields for s in route_eval.parse("it/helpdesk-export-2026-10.csv",
                                               (route_eval.SITES / "it" / "helpdesk-export-2026-10.csv").read_bytes()).sections]
    assert router.off_list_values(TICKETS, rows, REAL_ROUTABLE) == []
    assert {r["status"] for r in rows} == {"open", "resolved", "disputed"}


# ---- a checked plan ----

def test_a_checked_plan_runs_with_the_stored_values(model):
    model({"route": "AGGREGATION", "reasoning": "Remote office.", "filters": {"Office": ["remote"]}})
    plan = router_llm.plan("Show me all remote staff", MENU)
    assert (plan.route, plan.filters, plan.decided_by) == ("aggregation", {"office": ["Remote"]}, "the model")
    assert plan.source == router.PEOPLE      # one record set on the menu: the model may leave source out
    assert names(plan.filters) == {"Maria Garcia", "Michael Brown", "Ahmed Hassan"}


def test_the_rules_list_is_the_models_passage(model):
    # The regular expressions see who + team + Engineering: every engineer.
    assert router.classify(DEPLOY, ROWS)[0] == "aggregation"
    model({"route": "POINTWISE", "reasoning": "Wants one contact.", "filters": {}, "missing_column": None})
    plan = router_llm.plan(DEPLOY, MENU)
    assert plan.route == "pointwise" and plan.filters == {}


def test_two_columns_must_both_match(model):
    model({"route": "AGGREGATION", "filters": {"department": ["Engineering"], "office": ["New York"]}})
    plan = router_llm.plan("Which people in Engineering work from NYC?", MENU)
    assert names(plan.filters) == {"David Kim", "Lisa Wang", "Rachel Adams"}


# ---- the guards ----

def test_a_column_the_directory_lacks_is_unindexed(model):
    model({"route": "AGGREGATION", "filters": {"language": ["Spanish"]}})
    plan = router_llm.plan("Who speaks Spanish?", MENU)
    assert (plan.route, plan.missing_column) == ("aggregation_unindexed", "language")
    assert any("no 'language' column" in n for n in plan.notes)


def test_a_value_no_row_has_means_a_search_not_an_empty_list(model):
    model({"route": "AGGREGATION", "filters": {"office": ["London"]}})
    plan = router_llm.plan("Who works in London?", MENU)
    assert plan.route == "pointwise" and plan.filters == {}
    assert any("'London'" in n and "searched instead" in n for n in plan.notes)


def test_unindexed_on_a_column_we_have_is_a_value_no_row_has(model):
    # What gpt-4.1-mini really answers for London: it won't write a value that
    # isn't on the menu, so it names the column. "office" isn't missing.
    model({"route": "AGGREGATION_UNINDEXED", "filters": {}, "missing_column": "office"})
    plan = router_llm.plan("Who works in London?", MENU)
    assert (plan.route, plan.missing_column) == ("pointwise", None)
    assert any("'office' column" in n and "searched instead" in n for n in plan.notes)


def test_a_bad_value_never_widens_the_list(model):
    # Dropping "Wizard" would list every remote person: search instead.
    model({"route": "AGGREGATION", "filters": {"office": ["Remote"], "role": ["Wizard"]}})
    assert router_llm.plan("Which remote wizards do we have?", MENU).route == "pointwise"


def test_a_list_of_records_we_cant_list_is_unindexed(model):
    # Tickets aren't routable yet: the model says so, and the backlog gets it.
    model({"route": "AGGREGATION_UNINDEXED", "source": None, "filters": {}, "missing_column": "helpdesk tickets"})
    plan = router_llm.plan("How many tickets did Maria Garcia report?", MENU)
    assert (plan.route, plan.source, plan.missing_column) == ("aggregation_unindexed", None, "helpdesk tickets")


def test_a_record_set_not_on_the_menu_is_unindexed(model):
    model({"route": "AGGREGATION", "source": TICKETS, "filters": {"reporter": ["Maria Garcia"]}})
    plan = router_llm.plan("How many tickets did Maria Garcia report?", MENU)
    assert (plan.route, plan.filters) == ("aggregation_unindexed", {})
    assert any("not a record set the router can list" in n for n in plan.notes)


def test_a_filter_must_belong_to_its_record_set(model, tickets_routable):
    # "office" is a directory column, not a ticket column.
    model({"route": "AGGREGATION", "source": TICKETS, "filters": {"office": ["Remote"]}})
    plan = router_llm.plan("Which tickets came from remote people?", route_eval.record_menu())
    assert plan.route == "aggregation_unindexed" and plan.missing_column == "office"


def test_once_routable_tickets_are_listed(model, tickets_routable):
    model({"route": "AGGREGATION", "source": TICKETS, "filters": {"reporter": ["maria garcia"]}})
    plan = router_llm.plan("How many tickets did Maria Garcia report?", route_eval.record_menu())
    assert (plan.route, plan.source, plan.filters) == ("aggregation", TICKETS, {"reporter": ["Maria Garcia"]})


def test_tickets_list_by_reporter_and_status_together(model, tickets_routable):
    model({"route": "AGGREGATION", "source": TICKETS, "filters": {"reporter": ["Maria Garcia"], "status": ["OPEN"]}})
    plan = router_llm.plan("Which of Maria Garcia's tickets are still open?", route_eval.record_menu())
    assert plan.filters == {"reporter": ["Maria Garcia"], "status": ["open"]}


def test_a_list_with_no_filter_is_searched(model):
    model({"route": "AGGREGATION", "filters": {}})
    assert router_llm.plan("Who works here?", MENU).route == "pointwise"


def test_fenced_json_is_read(model):
    model('```json\n{"route": "AGGREGATION", "filters": {"office": ["New York"]}}\n```')
    assert router_llm.plan("Give me the people in New York", MENU).filters == {"office": ["New York"]}


# ---- when the model fails ----

def test_not_json_gets_one_retry(model):
    fake = model("It's a list question!", {"route": "POINTWISE", "filters": {}})
    plan = router_llm.plan("How many vacation days do I get?", MENU)
    assert plan.route == "pointwise" and plan.decided_by == "the model"
    assert len(fake.calls) == 2 and "It's a list question!" in fake.calls[1][0]


def test_not_json_twice_means_the_rules(model):
    fake = model("A list, I think.", "Still a list.")
    plan = router_llm.plan("Who works remotely?", MENU)
    assert len(fake.calls) == 2
    assert (plan.decided_by, plan.route, plan.filters) == ("the rules", "aggregation", {"office": ["Remote"]})
    assert "unusable" in plan.notes[0]


def test_an_unknown_route_means_the_rules(model):
    model({"route": "SQL", "filters": {}})
    plan = router_llm.plan("Who works remotely?", MENU)
    assert plan.decided_by == "the rules" and "unknown route 'sql'" in plan.notes[0]


def test_no_model_means_the_rules_and_says_unavailable(model):
    model(RuntimeError("no key"))
    plan = router_llm.plan("Who works remotely?", MENU)
    assert plan.decided_by == "the rules" and plan.route == "aggregation"
    assert "unavailable" in plan.notes[0]          # what scoreboard.py stars


def test_router_rules_never_calls_the_model(model, monkeypatch):
    fake = model(RuntimeError("must not be called"))
    monkeypatch.setattr(config, "ROUTER", "rules")
    plan = router_llm.plan("Who works remotely?", MENU)
    assert fake.calls == [] and plan.decided_by == "the rules" and plan.notes == []


def test_a_miss_is_one_json_line(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ROUTER_MISSES_FILE", tmp_path / "misses.jsonl")
    plan = router_llm.Plan(route="aggregation_unindexed", missing_column="language")
    assert router_llm.log_miss("Who speaks Spanish?", plan)
    assert router_llm.log_miss("Who speaks French?", plan)
    lines = [json.loads(x) for x in (tmp_path / "misses.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [x["missing_column"] for x in lines] == ["language", "language"]
    assert lines[1]["question"] == "Who speaks French?"


# ---- the route set (shared/golden/golden_routes.json) ----

def test_every_labelled_filter_exists_in_its_record_set():
    questions = route_eval.load_questions()
    assert len({q["id"] for q in questions}) == len(questions)
    for q in questions:
        assert q["route"] in router_llm.ROUTES, q["id"]
        if q["route"] == "aggregation":
            source = q.get("source", router.PEOPLE)
            assert source in REAL_ROUTABLE, f"{q['id']}: {source} is not in router.ROUTABLE"
            columns = router_llm.vocabulary(route_eval.record_menu(list(REAL_ROUTABLE)), REAL_ROUTABLE)[source]["columns"]
            assert q["filters"], q["id"]
            for column, values in q["filters"].items():
                assert set(values) <= set(columns[column]), q["id"]
            if source == router.PEOPLE:
                assert names(q["filters"]), q["id"]        # a label that matches nobody is a typo
        else:
            assert "filters" not in q, q["id"]


def test_the_rules_known_failures_are_still_failures():
    # The questions the route set was written around. If the rules start
    # getting these right, the set no longer shows why the model is there.
    by_id = {q["id"]: q for q in route_eval.load_questions()}
    for qid in ("R04", "R05", "R12", "R18", "R19", "R23"):
        plan = router_llm.plan(by_id[qid]["question"], MENU, mode="rules")
        assert not route_eval.is_right(by_id[qid], plan), qid


# ---- through /search ----

@pytest.fixture
def synced(friday, tenants):
    with as_tenant("sync", tenants["acme"]):
        run_sync(apply=True)
    return tenants


def search(c, q, **params):
    r = c.get("/search", params={"q": q, "strategy": "routed", **params})
    assert r.status_code == 200, r.text
    return r.json()


def test_routed_follows_the_models_plan(synced, client, model):
    model({"route": "POINTWISE", "reasoning": "Wants one contact.", "filters": {}})
    data = search(sign_in(client(), "intern@acme.test"), DEPLOY)
    assert data["trace"][0] == "route: pointwise (decided by the model)"
    assert "router: Wants one contact." in data["trace"]
    assert not any(r["found_by"] == ["records"] for r in data["results"])


def test_routed_lists_by_the_checked_filters(synced, client, model):
    model({"route": "AGGREGATION", "filters": {"office": ["remote"]}})
    data = search(sign_in(client(), "intern@acme.test"), "Show me all remote staff", top_k=1)
    assert data["trace"][0].startswith("route: aggregation on {'office': ['Remote']} -> 3 matching record(s)")
    assert data["trace"][1] == "router lookup: PEOPLE-DIRECTORY where fields->>'office' in ['Remote']"
    assert data["total_results"] == 3 and {r["doc_id"] for r in data["results"]} == {"PEOPLE-DIRECTORY"}


def test_the_sync_stores_each_rows_fields_redacted(synced):
    with as_tenant("app", synced["acme"]):
        rows = db.current().execute("SELECT id, fields FROM chunks WHERE doc_id = %s AND fields IS NOT NULL "
                                    "ORDER BY chunk_index", ("IT-HELPDESK-EXPORT",)).fetchall()
        prose = db.current().execute("SELECT count(*) AS n FROM chunks WHERE doc_id = 'HR-LEAVE' "
                                     "AND fields IS NOT NULL").fetchone()["n"]
    assert len(rows) == 16 and rows[0]["fields"]["reporter"] == "Maria Garcia"
    assert rows[0]["fields"]["status"] == "resolved"
    assert "gmail" not in rows[0]["fields"]["contact"] and "REDACTED" in rows[0]["fields"]["contact"]
    assert prose == 0                                          # a policy has no fields


def test_routed_lists_tickets_once_they_are_routable(synced, client, model, tickets_routable):
    model({"route": "AGGREGATION", "source": TICKETS, "filters": {"reporter": ["Maria Garcia"]}})
    data = search(sign_in(client(), "intern@acme.test"), "How many tickets did Maria Garcia report?")
    assert data["trace"][1] == "router lookup: IT-HELPDESK-EXPORT where fields->>'reporter' in ['Maria Garcia']"
    assert [r["section"] for r in data["results"]] == ["IT-4101", "IT-4109", "IT-4122", "IT-4133"]   # all 4, not top 3


def test_routed_counts_tickets_by_status(synced, client, model, tickets_routable):
    intern = sign_in(client(), "intern@acme.test")
    counts = {}
    for status in ("open", "resolved", "disputed"):
        model({"route": "AGGREGATION", "source": TICKETS, "filters": {"status": [status]}})
        counts[status] = search(intern, f"How many tickets are {status}?")["total_results"]
    assert counts == {"open": 4, "resolved": 9, "disputed": 3}

    model({"route": "AGGREGATION", "source": TICKETS, "filters": {"reporter": ["Maria Garcia"], "status": ["open"]}})
    data = search(intern, "Which of Maria Garcia's tickets are still open?")
    assert [r["section"] for r in data["results"]] == ["IT-4133"]


def test_routed_logs_a_list_of_records_it_cannot_list(synced, client, model, monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ROUTER_MISSES_FILE", tmp_path / "misses.jsonl")
    model({"route": "AGGREGATION_UNINDEXED", "source": None, "filters": {}, "missing_column": "helpdesk tickets"})
    data = search(sign_in(client(), "intern@acme.test"), "How many tickets did Maria Garcia report?")
    assert data["trace"][0].startswith("route: aggregation_unindexed: no record set holds 'helpdesk tickets'")
    logged = json.loads((tmp_path / "misses.jsonl").read_text(encoding="utf-8"))
    assert (logged["source"], logged["missing_column"]) == (None, "helpdesk tickets")


def test_routed_searches_and_logs_an_unindexed_list(synced, client, model, monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ROUTER_MISSES_FILE", tmp_path / "misses.jsonl")
    model({"route": "AGGREGATION_UNINDEXED", "source": router.PEOPLE, "filters": {}, "missing_column": "language"})
    data = search(sign_in(client(), "intern@acme.test"), "Who speaks Spanish?")
    assert data["trace"][0].startswith("route: aggregation_unindexed: the directory has no 'language' column")
    assert "logged as a missing column" in data["trace"][0]
    assert json.loads((tmp_path / "misses.jsonl").read_text(encoding="utf-8"))["question"] == "Who speaks Spanish?"


def test_the_model_never_sees_a_directory_you_may_not_read(synced, client, model):
    fake = model({"route": "AGGREGATION", "filters": {"office": ["Remote"]}})
    intern, admin = sign_in(client(), "intern@acme.test"), sign_in(client(), "admin@acme.test")
    admin.patch("/admin/documents/PEOPLE-DIRECTORY", json={"allowed_groups": ["hr"]}, headers=W)
    data = search(intern, "Who works remotely?")
    assert fake.calls == []                                    # no rows, so no menu, so no call
    assert data["trace"][0] == "route: pointwise"
    assert "PEOPLE-DIRECTORY" not in {r["doc_id"] for r in data["results"]}
