# Tests: the chat. A conversation follows the same rules as a search,
# on every turn.
#   - a turn streams its steps, then its tokens, then the answer
#   - the second turn remembers the first
#   - a thread is its owner's: the API and the DATABASE refuse others
#   - access is live inside a conversation, memory included
#   - no model: sources and a clear message; nothing found: no model call
#   - hybrid retrieval: words find what meaning missed, inside the filter
# No paid model: a fake chat model replies from a list and records
# every prompt it was given.

import json

import psycopg
import pytest
from conftest import W, as_tenant, sign_in
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from pydantic import Field

from app.assistant import model as model_module
from app.assistant.nodes import HIDDEN
from app.ingest.sync import run_sync
from app.rag.retriever import fuse


class RecordingModel(GenericFakeChatModel):
    """Replies from a list, in order; remembers every prompt."""
    prompts: list = Field(default_factory=list)

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.prompts.append(messages)
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


@pytest.fixture
def fake_model(monkeypatch):
    def install(*replies):
        fake = RecordingModel(messages=iter([AIMessage(r) for r in replies]))
        monkeypatch.setattr(model_module, "chat_model", lambda temperature=0.3: fake)
        return fake
    return install


@pytest.fixture
def synced(friday, tenants):
    with as_tenant("sync", tenants["acme"]):
        run_sync(apply=True)
    return tenants


def events(response) -> list[tuple[str, dict]]:
    out = []
    for block in response.text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((fields["event"], json.loads(fields["data"])))
    return out


def new_thread(browser) -> str:
    r = browser.post("/chat/threads", headers=W)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def ask(browser, thread_id: str, message: str):
    r = browser.post(f"/chat/threads/{thread_id}/messages", json={"message": message}, headers=W)
    assert r.status_code == 200, r.text
    ev = events(r)
    done = [d for e, d in ev if e == "done"]
    assert done, ev
    return ev, done[0]


def doc_ids(done: dict) -> set[str]:
    return {s["doc_id"] for s in done["sources"]}


SALARY = "What is the salary range for a senior developer?"


# ---- One turn, streamed ----

def test_a_turn_streams_its_steps_then_its_tokens_then_the_answer(synced, client, fake_model):
    fake = fake_model("You can carry over up to 5 days, says the Leave Policy.")
    intern = sign_in(client(), "intern@acme.test")
    ev, done = ask(intern, new_thread(intern), "How many unused vacation days can I roll over?")

    order = [d["node"] if e == "step" else e for e, d in ev]
    assert [o for o in order if o != "token"] == ["identify", "retrieve", "answer", "finalize", "done"]
    first_token = order.index("token")
    assert order.index("retrieve") < first_token < order.index("answer")   # tokens arrive WHILE answer runs
    assert "".join(d["text"] for e, d in ev if e == "token") == done["answer"]
    assert done["answer"] == "You can carry over up to 5 days, says the Leave Policy."
    assert done["outcome"] == "answered" and "HR-LEAVE" in doc_ids(done)

    identify = next(d for e, d in ev if e == "step" and d["node"] == "identify")
    assert identify["user"] == "intern@acme.test"                           # from the session, not the message
    system = fake.prompts[0][0].content
    assert "Engineering intern" in system and "Leave Policy" in system      # who, and the context


def test_the_second_turn_remembers_the_first(synced, client, fake_model):
    fake = fake_model("The limit is $75 per person.",            # turn 1: the answer
                      "What was the team dinner limit in 2023?",  # turn 2: the rewrite
                      "It was $50 per person in 2023.")           # turn 2: the answer
    intern = sign_in(client(), "intern@acme.test")
    thread = new_thread(intern)
    ask(intern, thread, "How much can I spend per person on a team dinner?")
    ev, done = ask(intern, thread, "and in 2023?")

    retrieve = next(d for e, d in ev if e == "step" and d["node"] == "retrieve")
    assert retrieve["search_query"] == "What was the team dinner limit in 2023?"   # the follow-up, rewritten
    answer_prompt = [m.content for m in fake.prompts[-1]]
    assert "How much can I spend per person on a team dinner?" in answer_prompt     # turn 1 is in the prompt
    assert "The limit is $75 per person." in answer_prompt
    messages = intern.get(f"/chat/threads/{thread}").json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant"]


# ---- A thread is its owner's ----

def test_another_person_cannot_read_or_continue_a_thread(synced, client, fake_model):
    fake_model("Five days.")
    intern = sign_in(client(), "intern@acme.test")
    thread = new_thread(intern)
    ask(intern, thread, "How many unused vacation days can I roll over?")

    for email in ("hr-partner@acme.test", "admin@acme.test", "alice@globex.test"):
        other = sign_in(client(), email)
        assert other.get(f"/chat/threads/{thread}").status_code == 404           # same as a made-up id
        assert other.post(f"/chat/threads/{thread}/messages", json={"message": "hi"}, headers=W).status_code == 404
        assert thread not in {t["id"] for t in other.get("/chat/threads").json()}
    assert intern.get("/chat/threads/00000000-0000-0000-0000-000000000000").status_code == 404


def test_the_database_hides_other_peoples_memory(synced, client, fake_model, tenants):
    """Even with the thread id in hand, SQL as another person returns no checkpoint."""
    fake_model("Five days.")
    intern = sign_in(client(), "intern@acme.test")
    thread = new_thread(intern)
    ask(intern, thread, "How many unused vacation days can I roll over?")
    from app.db import connect_admin

    with connect_admin() as conn:
        ids = {r["email"]: str(r["id"]) for r in conn.execute("SELECT id, email FROM users")}
    count = "SELECT count(*) AS n FROM checkpoints WHERE thread_id = %s"
    with as_tenant("app", tenants["acme"], ids["intern@acme.test"]) as conn:
        assert conn.execute(count, (thread,)).fetchone()["n"] > 0
    with as_tenant("app", tenants["acme"], ids["hr-partner@acme.test"]) as conn:
        assert conn.execute(count, (thread,)).fetchone()["n"] == 0
        assert conn.execute("SELECT count(*) AS n FROM chat_threads").fetchone()["n"] == 0
    with as_tenant("sync", tenants["acme"]) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("SELECT count(*) FROM checkpoints")


def test_writing_needs_the_csrf_header(synced, client):
    intern = sign_in(client(), "intern@acme.test")
    thread = new_thread(intern)
    assert intern.post(f"/chat/threads/{thread}/messages", json={"message": "hi"}).status_code == 403


# ---- Access is live inside a conversation ----

def test_losing_access_mid_conversation_hides_the_old_answer(synced, client, fake_model):
    fake = fake_model("Senior Developer (L3): $120,000 to $155,000.",   # turn 1
                      "What is the salary range for a junior developer?",  # turn 2: the rewrite
                      "I don't have that information.")                 # turn 2: the answer
    intern, admin = sign_in(client(), "intern@acme.test"), sign_in(client(), "admin@acme.test")
    thread = new_thread(intern)
    _, first = ask(intern, thread, SALARY)
    assert "HR-SALARY-BANDS-2026" in doc_ids(first)                      # Friday's mis-share

    admin.patch("/admin/documents/HR-SALARY-BANDS-2026", json={"allowed_groups": ["hr", "managers"]}, headers=W)
    ev, second = ask(intern, thread, "And for a junior?")

    assert "HR-SALARY-BANDS-2026" not in doc_ids(second)                 # this turn's search obeys it
    retrieve = next(d for e, d in ev if e == "step" and d["node"] == "retrieve")
    assert retrieve["hidden_documents"] == 1
    for prompt in fake.prompts[1:]:                                       # the rewrite AND the answer
        text = " ".join(str(m.content) for m in prompt)
        assert "$120,000" not in text and HIDDEN in text                  # the old answer never reaches the model
    messages = intern.get(f"/chat/threads/{thread}").json()["messages"]
    assert messages[1]["hidden"] and messages[1]["text"] == HIDDEN and messages[1]["sources"] == []
    assert not messages[3]["hidden"]

    admin.patch("/admin/documents/HR-SALARY-BANDS-2026", json={"allowed_groups": ["employees"]}, headers=W)
    messages = intern.get(f"/chat/threads/{thread}").json()["messages"]
    assert not messages[1]["hidden"] and "$120,000" in messages[1]["text"]   # access back, answer back


# ---- When something is missing ----

def test_no_model_still_answers_with_the_sources(synced, client):
    intern = sign_in(client(), "intern@acme.test")                       # the tests blank every API key
    ev, done = ask(intern, new_thread(intern), "How many unused vacation days can I roll over?")
    assert done["outcome"] == "model_unavailable"
    assert "not available" in done["answer"] and "HR-LEAVE" in doc_ids(done)
    assert not [e for e, _ in ev if e == "error"]


def test_nothing_readable_found_never_calls_the_model(synced, client, monkeypatch):
    monkeypatch.setattr(model_module, "chat_model", lambda temperature=0.3: pytest.fail("must not call the model"))
    admin = sign_in(client(), "admin@acme.test")
    uid = next(u["id"] for u in admin.get("/admin/users").json() if u["email"] == "sales-rep@acme.test")
    admin.patch(f"/admin/users/{uid}", json={"groups": []}, headers=W)
    rep = sign_in(client(), "sales-rep@acme.test")
    ev, done = ask(rep, new_thread(rep), "How many unused vacation days can I roll over?")
    assert [d["node"] for e, d in ev if e == "step"] == ["identify", "retrieve", "finalize"]
    assert done["outcome"] == "no_result" and done["sources"] == []


# ---- Hybrid retrieval ----

def test_fuse_puts_what_both_lists_agree_on_first():
    a, b, c, d = ({"id": x, "doc_id": x, "distance": 1.0} for x in "abcd")
    fused = fuse({"meaning": [a, b, c], "words": [d, b]}, top_k=4)
    assert [x["id"] for x in fused] == ["b", "a", "d", "c"]
    assert fused[0]["found_by"] == ["meaning", "words"] and fused[2]["found_by"] == ["words"]


def test_words_find_an_exact_term_inside_the_access_filter(synced, client):
    intern, admin = sign_in(client(), "intern@acme.test"), sign_in(client(), "admin@acme.test")
    hits = intern.get("/search", params={"q": "Copilot", "strategy": "keyword"}).json()["results"]
    assert [h["doc_id"] for h in hits] == ["FIN-EXP-2024-UPDATE"]        # the one chunk that says it
    hybrid = intern.get("/search", params={"q": "Copilot", "strategy": "hybrid"}).json()
    assert hybrid["strategy"] == "hybrid" and hybrid["results"][0]["doc_id"] == "FIN-EXP-2024-UPDATE"
    assert "words" in hybrid["results"][0]["found_by"]

    q = {"q": "salary bands senior", "strategy": "keyword"}
    assert "HR-SALARY-BANDS-2026" in {h["doc_id"] for h in intern.get("/search", params=q).json()["results"]}
    admin.patch("/admin/documents/HR-SALARY-BANDS-2026", json={"allowed_groups": ["hr"]}, headers=W)
    assert "HR-SALARY-BANDS-2026" not in {h["doc_id"] for h in intern.get("/search", params=q).json()["results"]}


# ---- Tonight's exercise ----

@pytest.mark.skip(reason="Lab exercise: build DELETE /chat/threads/{id} (app/routers/chat.py), then remove this line")
def test_forget_a_conversation(synced, client, fake_model, tenants):
    fake_model("Five days.", "Five days.")
    intern, hr = sign_in(client(), "intern@acme.test"), sign_in(client(), "hr-partner@acme.test")
    mine, theirs = new_thread(intern), new_thread(hr)
    ask(intern, mine, "How many unused vacation days can I roll over?")
    ask(hr, theirs, "How many unused vacation days can I roll over?")

    assert intern.delete(f"/chat/threads/{theirs}", headers=W).status_code == 404   # not yours: nothing happens
    assert hr.get(f"/chat/threads/{theirs}").status_code == 200
    assert intern.delete(f"/chat/threads/{mine}", headers=W).status_code == 204
    assert intern.get(f"/chat/threads/{mine}").status_code == 404
    from app.db import connect_admin

    with connect_admin() as conn:                                        # gone from LangGraph's tables too
        assert conn.execute("SELECT count(*) AS n FROM checkpoints WHERE thread_id = %s", (mine,)).fetchone()["n"] == 0
        assert conn.execute("SELECT count(*) AS n FROM checkpoints WHERE thread_id = %s", (theirs,)).fetchone()["n"] > 0
        assert conn.execute("SELECT count(*) AS n FROM audit_log WHERE action = 'chat.forget'").fetchone()["n"] == 1
