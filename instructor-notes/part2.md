# Part 2 run sheet: better than top-k (Wed 11 Nov)

Companion for the second of the four "Creating your production application" sessions. Setup, the
order of commands, what to expect, and what to do when something breaks.

Re-planned on 11 Nov: a 10-minute warm-up on limiting Google API calls (yours), then the rest of the
night on five retrieval techniques, tried live in the RAG weeks' checkpoint 6 app ("the lab", port
8001). The platform block (sign-in, access, companies) was cut on 11 Nov; multitenancy was covered
earlier. Checkpoint `02-platform` is still the repo's Part 2 code, documented in the reference slides
(security model, the worker, hybrid search, the chat), not presented.

Lab numbers and screenshots come from checkpoint 6 on 11 Nov, with Azure OpenAI for both the
embeddings (`text-embedding-3-small`, index rebuilt 11 Nov) and the answers (`gpt-4.1-mini`). Acme Desk numbers come from the rehearsal on 10 Nov (`fallbacks/part2/demo-transcript.txt`).

- Code: `rag-week-bootcamp/checkpoints/checkpoint-6-advanced-retrieval/` (the lab, presented);
  `checkpoints/02-platform/` (reference only)
- Deck: `slides/part2-platform.pptx` (source `slides/src/p2.js`, 41 slides: 24 presented, 17 reference)
- Step-by-step version: `part2-teaching-guide.md`
- Fallbacks: `instructor-notes/fallbacks/part2/screens-rag` (the lab); `screens` and the transcript
  (Acme Desk, for questions only); the exercise solution

---

## 1. The point

1. Plain top-k misses in a few typical ways: a buried fact (rerank), a list (route it), lost context
   (contextual retrieval), a two-part or vague question (multi-query), a question that needs a second
   search (agentic RAG). Pick the fix by the kind of miss.
2. Every fix has a price: an LLM call, a second or two, a path that changes between runs. Pay only for
   a miss you have seen, and measure it (Friday).
3. Better search never means more access: every technique searches as you, inside the access filter.

Line to leave them with: one dropdown showed that the right fix depends on the question.

---

## 2. Before class (15 minutes)

- [ ] The lab on port 8001 (section 3, "The lab: start it"). `http://localhost:8001/health` shows
      `azure:text-embedding-3-small` for both `embedding_model` and `live_index_built_with`. Ask the
      billing question once with `rerank` so the reranker is loaded.
- [ ] `http://localhost:8001/ui`, Ask (RAG), Options: leave top_k at **3** (the default), Doc type filter **off**.
- [ ] `fallbacks/part2/screens-rag/` open in the editor. Editor and terminal zoomed to 18pt+.
- [ ] Your Google-calls segment ready (slide 2).

**Optional: Acme Desk on port 8000.** Not presented tonight. Start it only if you want it running for
questions about the checkpoint or the reference slides. `.env`: `SOURCE=local`,
`EMBEDDING_PROVIDER=azure`, `RETRIEVAL_STRATEGY=hybrid`, `ACME_SEED_PASSWORD=<12+ characters>`. Then:

```bash
docker compose up -d db
python checkpoints/02-platform/db.py migrate                   # new since the last pull: 004_chat and LangGraph's tables
python checkpoints/02-platform/db.py seed --reset-passwords
python checkpoints/02-platform/fake_drive.py reset
python checkpoints/02-platform/fake_drive.py apply 1           # and 2, 3, 5 (not 4)
python checkpoints/02-platform/sync.py --apply                 # 89 chunks at the end
python run_checkpoint.py 02-platform                           # http://localhost:8000
```

---

## 3. Run of show (about 1 h 30)

A picture before any code, nothing typed live, a "what you should see" slide after the live step.
Online: no questions to the room; read the chat at the divider, at the break and at the end.

| Block | Slides | Min | Ends by | Live | Expect |
|---|---|---|---|---|---|
| Opening | 1, 3, 4 | 3 | 0:03 | none | the two parts, the arc |
| Google calls (yours) | 2 | 10 | 0:15 | yours | |
| Retrieval, the techniques | 5–15 | 35 | 0:50 | none | how top-k works; where it misses; the lab; multi-query and fusion by hand; why the handbook ranked 4th, reranking; contextual retrieval; why search can't list, routers |
| Break | 16 | 10 | 1:00 | check the lab, warm the reranker | |
| Retrieval, live and agents | 17–21 | 20 | 1:20 | the lab, "Tonight's demo" buttons 1–5: billing question dense vs rerank; "Who works remotely?" dense vs routed; multi_query trace | "at least one" vs "two reviewers"; the policy vs three people. Fallback: screens-rag r1–r5 |
| Wrap | 22–24 | 10 | 1:30 | none | three ideas, tonight, Friday |

The night now runs about 1 h 30. If you are more than 10 minutes behind at the break: show agentic
RAG (20) from its slide only, and skip step 4 of the lab demo. Never cut how top-k works (6),
reranking (11, 12), routers (14, 15), or the rerank and router steps of the lab demo.

**Demo rule:** never debug in front of the room for more than 60 seconds. Say "here's what it does",
go to the next slide (it shows the output), fix it at the break.

### Introducing the code

Nothing typed. If someone asks to see code: checkpoint 6's `app/rag/strategies.py` (the nine
strategies behind one `run()`), `reranker.py`, `router.py` (two regular expressions), `bm25.py`
(`rrf()`).

Students write code tonight (the exercises), not during class.

### The live demo, exactly

**The lab (slide 17).** `http://localhost:8001/ui`, Ask (RAG), Options: top_k **3** (the default),
Doc type filter **off** (with it on, dense asks an LLM for a document type first, and the plain-search
miss disappears). Keep top_k at 3: with Azure embeddings plain search ranks the handbook #4, so at
top_k 5 the model sees it and answers correctly, and the contrast with rerank is gone.

1. Strategy `dense`: "How many reviewers does a change to the billing code need?" → "at least one
   reviewer", from Coding Standards; the three sources are all Coding Standards.
2. Strategy `rerank`, same question → "two reviewers", Engineering Handbook #1.
3. "Who works remotely?" with `dense` → the remote-work policy. With `routed` → Maria Garcia, Michael
   Brown, Ahmed Hassan, from the team directory.
4. `http://localhost:8001/docs`, `GET /retrieve`, q "I work remotely: what are my core hours, and how
   much is the home office allowance?", strategy `multi_query`, user `intern` → the trace shows the
   three rewrites and "4 x dense top 20 -> RRF -> top 5".

### The lab: start it

From `C:\Users\hasan\source\repos\rag-week-bootcamp` (PowerShell), in its own terminal:

```powershell
.venv\Scripts\python -m uvicorn app.main:app --port 8001 --app-dir checkpoints/checkpoint-6-advanced-retrieval
```

It reads the repo's `.env`: Azure OpenAI for the embeddings and the LLM. The index was rebuilt with
Azure embeddings on 11 Nov (`sharepoint.py apply all`, then `sync.py --rebuild --apply`, then
`sync.py --apply`); the earlier local-embedding index is kept as the previous one (`sync.py --rollback`
switches back, but then the lab needs `EMBEDDING_PROVIDER=local`). Don't set `EMBEDDING_PROVIDER=local`
in the terminal, and not `run_checkpoint.py`: it always uses port 8000. The first `rerank` loads the
cross-encoder (a few seconds); after that ~0.6 s extra. Every search makes one Azure embedding call
(~0.8 s); multi-query and HyDE rewrites are cached in `runs/llm_cache.json`.

---

## 4. Numbers

Acme Desk (rehearsed 10 Nov). Not presented tonight; here for questions about the checkpoint:

| Step | Output |
|---|---|
| `/search?...&user=hr-partner` as the intern | `user: intern@acme.test`, `groups: employees, engineering` |
| Intern, "salary range senior developer", before | HR-SALARY-BANDS-2026 0.68, PEOPLE-DIRECTORY 1.22, HR-SALARY-BANDS-2026 1.14, HR-SALARY-BANDS-2026 1.05, ENG-STACK 1.40 (hybrid) |
| After the admin's click | PEOPLE-DIRECTORY 1.22, ENG-STACK 1.40, PEOPLE-DIRECTORY 1.33, HR-ONBOARDING 1.44, PEOPLE-DIRECTORY 1.31 |
| With `hr` / without | the first list / the second list |
| Audit log | `admin.document.update` (employees → hr, managers), `admin.user.update` ×2 (before and after), a `search` row per search with doc ids |
| Chat: team dinner | "up to $90 per person … Expense Policy (2026 edition)" |
| Chat: "And for a client dinner?" | rewritten to "How much can I spend per person on a client dinner?"; "$150 per person with prior manager approval" |
| Chat with `hr`: Senior Developer | "$120,000 to $155,000 per year … Engineering Salary Bands (2026)" |
| After `hr` is removed: "And for a junior?" | rewritten to "What is the salary range for a Junior Developer?"; retrieve: "1 doc(s) no longer yours"; "I don't have that information in the documents you can access." |
| Reopen the thread | the first answer: "(An earlier answer is hidden here: it used a document you can no longer read.)" |
| `hr-partner` opens the intern's thread | `404` |
| Turn time | 2.6 to 4.7 s per turn (Azure gpt-4.1-mini); the first turn after starting the API ~10 s |
| "Copilot", by meaning / words / hybrid | not in the top 5 / FIN-EXP-2026 only / FIN-EXP-2026 at #2 |
| `evaluate.py --strategy all` (31 questions, Monday's documents) | Hit@5 1.00 / 0.96 / 1.00, MRR 0.91 / 0.89 / 0.94, leaks 0 / 0 / 0. Words alone misses Q07 "Which tools do we use for CI/CD?" |
| `pytest checkpoints/02-platform/tests -q` | 88 passed, 1 skipped (tonight's exercise), about 2.5 minutes |

The lab (checkpoint 6, 24 golden questions, top 5, Azure embeddings and gpt-4.1-mini, `compare.py --llm` on 11 Nov):

| Strategy | Hit@5 | MRR | Median time | LLM calls |
|---|---|---|---|---|
| dense (plain) | 0.92 | 0.84 | ~0.9 s | 0 |
| multi_query | 0.88 | 0.85 | ~5.3 s | 1 |
| rerank | 0.96 | 0.94 | ~1.5 s | 0 |
| hybrid_rerank | 0.96 | 0.94 | ~1.5 s | 0 |
| routed | 1.00 | 0.98 | ~1.5 s (a list: ~28 ms) | 0 |
| hyde, parent (Friday) | 0.96 | 0.80, 0.90 | ~2.7 s, ~1 s | 1, 0 |

(With the old local embeddings on 5 Nov: dense 0.92 / 0.84, multi_query 0.92 / 0.87, rerank 0.96 /
0.94, routed 1.00 / 0.98. The story is the same; multi-query is now slightly worse than plain.)

| Lab step (UI, top_k 3) | Output |
|---|---|
| dense, billing question | "at least one reviewer" (Coding Standards); the three sources are Coding Standards (Code Review, Documentation, Testing); the handbook is #4 |
| rerank, billing question | "two reviewers before it can be merged" (Engineering Handbook); handbook #1 |
| multi_query, billing question (top 5) | the handbook drops out of the top 5 entirely |
| dense, "Who works remotely?" | the remote-work policy and the FAQ |
| routed, "Who works remotely?" | Maria Garcia, Michael Brown, Ahmed Hassan; trace "aggregation on {'office': ['Remote']} -> 3 matching record(s)" |
| multi_query rewrites (the remote-work question) | "What are the required working hours and home office stipend for remote employees?" and two more |
| Agentic RAG (history-rag `ladder.py`, 4 Nov, other corpus) | plain top-5 3/6, router 5/6, agent 6/6; agent up to 20× the cost |
| Contextual retrieval (Anthropic, Sep 2024, their tests) | failed top-20 retrievals −35% (contextual embeddings), −49% (+ keyword), −67% (+ rerank) |

---

## 5. Fallbacks (`fallbacks/part2/`)

`screens/01-login.png` to `15-sync-worker.png` (every step of the three demos, taken from the real UI),
`demo-transcript.txt` (every request and answer above), `chat-raw-stream.txt` (the SSE stream of one
turn, reference slide "streaming is just text"), `solutions/forget_thread.py` (tonight's exercise 2; don't share it tonight).

`screens-rag/` (taken 11 Nov from the lab at 1.5x): `r1-remote-routed`, `r2-remote-dense`,
`r3-billing-rerank`, `r4-billing-dense` (both with Doc type filter off), `r5-remote-multiquery`.

If the lab won't start or the model is down: teach the lab demo from slide 18 and `screens-rag/`.

---

## 6. If something breaks

The lab rows are at the bottom; the rest only matter if you run Acme Desk.

| Symptom | Cause | Fix |
|---|---|---|
| The intern doesn't find the bands at the start | the bands are already `hr, managers`: event 4 was applied, or a rehearsal left it | Admin, Document access: tick `employees` on the bands, Save. Or redo the reset in section 2 |
| Team dinner says $75, or "no information"; Documents has no 2026 expense policy | `db.py seed` ran after the events and put Friday's register back | `fake_drive.py reset`, `apply 1`, `2`, `3`, `5`, `sync.py --apply` |
| Demo accounts can't sign in | the class password was never set: seed keeps old random passwords | `ACME_SEED_PASSWORD` in `.env`, then `db.py seed --reset-passwords` |
| "Too many failed sign-ins" | 5 failures for that email in 15 minutes | wait, or `docker compose exec db psql -U postgres acme -c "DELETE FROM login_attempts"` |
| Chat: error "the turn failed"; the log says `relation "checkpoints" does not exist` | migration not run | `db.py migrate` |
| Chat answers "the AI model is not available" | no key, quota, Azure outage | sources still show; keep teaching; fallback screens |
| Both windows show the same person | one browser profile shares one cookie jar | the admin in a private window |
| `/health` shows `retrieval_note` | `RETRIEVAL_STRATEGY` isn't dense, keyword or hybrid | set it to `hybrid` (the app already falls back to hybrid) |
| The tenant switched to Drive after a seed | `SOURCE=drive` in `.env` when you ran `db.py seed` | `SOURCE=local`, seed again, redo the reset |
| `sync.py` stops: "Vectors from two models cannot share an index" | `EMBEDDING_PROVIDER` changed | set it back to `azure`, or `sync.py --rebuild --apply` |
| Port 8000 shows Part 1 | an old server or its reload worker | stop the PID, restart |
| Lab: "Embedding dimension 384 does not match collection dimensionality 1536" | the terminal has `EMBEDDING_PROVIDER=local` set | `Remove-Item Env:EMBEDDING_PROVIDER`, start again (the `.env` says `azure`) |
| Lab: dense answers "two reviewers" for the billing question | top_k is 5 (the handbook is #4), or Doc type filter is on | Options: top_k 3, Doc type filter off |
| Lab: port 8001 in use | an earlier lab still running | stop that PID, or use another port |
| Anything else | | the reset in section 2, then start the block again |

---

## 7. Honest answers

- **Why move off ChromaDB?** Not because Chroma is bad: because access, people, companies and the
  index now need one place that enforces rules. ChromaDB can't JOIN a permissions table or hold a
  Row-Level Security policy.
- **Can an admin read someone's chat?** No, by design: `chat_threads` shows a conversation only to
  its owner. The audit log records which documents each turn retrieved (ids, not text).
- **The checkpoint tables have no tenant column. Is that a hole?** Their policy shows a row only if
  its thread is in `chat_threads`, which is filtered by tenant and person. Test:
  `test_the_database_hides_other_peoples_memory`.
- **Is a hidden answer deleted?** No. Hidden from the model and the screen, still in the tables.
  Forgetting is tonight's exercise; retention is a policy decision.
- **Does hybrid matter on 89 chunks?** A little: MRR 0.91 → 0.94, and it rescues exact names
  ("Copilot"). On a large corpus of product names and codes it matters more. Both searches run inside
  the access filter, so it never costs safety.
- **Why LangGraph for four steps in a row?** The checkpointer (memory per conversation, in Postgres)
  and streaming come with it. The code is on the reference slide "the graph, in eleven lines"
  (`app/assistant/workflow.py` line 26, `state.py` lines 26 and 38: `DeskState` saved, `DeskContext`
  given and never saved).
- **Why didn't multi-query help?** Our documents are short and clearly written, so the embedding
  already bridges most wording gaps. Rewrites fix vocabulary, not ranking: on the billing question the
  four phrasings all voted for the coding-standards chunks and pushed the handbook (plain search's #4)
  out of the top 5. On our 24 questions it scored slightly below plain search (Hit@5 0.88 vs 0.92).
- **Why is reranking slower but no LLM call?** The cross-encoder is a small model (ms-marco-MiniLM-L-6-v2,
  ~90 MB) running on the CPU. It reads 20 (question, chunk) pairs per question, ~0.6 s on top of the
  search. The candidate count matters: it can only promote what the first search found.
- **Local or Azure embeddings?** The lab ran on both. The ranking story is the same (dense 0.92 / 0.84,
  rerank 0.96 / 0.94, routed 1.00 / 0.98 with either); what changes is the detail, e.g. the billing
  handbook chunk is #4 with Azure and outside the top 5 with local embeddings.
- **Is the router an agent?** No. It makes one decision before the search, and code runs the path. The
  lab's router is two regular expressions; a small LLM classifier is the next step when rules can't tell.
- **Do these techniques get around access?** No. Every strategy in the lab runs inside the same access
  filter; a reranker only re-orders what you may read; each rewrite searches as you.
- **Isn't the intern's title list a leak?** Members don't even see titles they can't read
  (`test_members_do_not_even_see_titles_they_cannot_read`).
- **The register is still in our database, not Drive's sharing.** Yes; reading Drive's sharing needs a
  second, admin-approved identity (Part 1, Reference). Groups typed in by an admin are the same gap.
