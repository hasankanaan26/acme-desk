# Part 3 run sheet: which search wins (Fri 13 Nov)

Companion for the third of the four "Creating your production application" sessions. Setup, the
order of commands, what to expect, and what to do when something breaks.

Planned 11 Nov, built 12 Nov: Wednesday tried five retrieval techniques by eye in the lab; tonight we
measure them, on Acme Desk itself (checkpoint `03-retrieval`, port 8000), with two more techniques
(`small`/`parent`, and HyDE) and a scoreboard. Tools and agents, the original Part 3, were covered in
an earlier course.

Numbers below are from 12 Nov on the build laptop: local MiniLM embeddings, no reranker (Hugging Face
is blocked on that network), no model key. The rows that need the reranker or a model are marked
**fill Fri AM**: section 2 has the four commands that produce them on the class machine.

- Code: `checkpoints/03-retrieval/` (presented). Its README has "What you should see" and the exercises.
- Deck: `slides/part3-retrieval.pptx` (source `slides/src/p3.js`; 30 presented, then reference)
- Step-by-step version: `part3-teaching-guide.md`
- Fallbacks: `instructor-notes/fallbacks/part3/` (`scoreboard-local.txt`, screens, the exercise solution)

---

## 1. The point

First, before any measuring (added 15 Nov): **route the question.** Some questions want a list ("who
works remotely?"): every directory row that matches, which top-k can never return. A router decides
the shape before the search. Version one is two regular expressions (11 of 23 routes right); version
two is a model's plan checked by code (22 of 23, one call a question). Then the night's three ideas:

1. **Measure by kind of question.** No technique wins every kind, and the average across all
   questions hides it: over every question `dense` looks best, while `hybrid` wins three of the seven tables.
2. **Measure what the model needs, what it costs, and leaks.** "Right document in the top 5" is too
   kind: `small` finds the right document and hands over a sentence of a list. Count the words the
   answer needs, the LLM calls, the milliseconds, and the leaks, which must be 0 for every technique.
3. **Correct, not only faithful.** An answer can be faithful to its context and wrong (the FAQ's stale
   "5 days"). Tell a retrieval miss from a generation miss before you fix anything.

Line to leave them with: "Which search is best?" has no answer. "Which search is best for this kind
of question, at what price?" does, and now you can measure it.

---

## 2. Before class

### Friday morning on the class machine (30 minutes, once)

Run the demo on **local embeddings**: the live numbers then match the slides and the students'
laptops. The class machine adds what the build laptop could not: the cross-encoder (downloads ~90 MB
from Hugging Face on first use) and the model (Azure `gpt-4.1-mini`, as Wednesday).

`.env`: `EMBEDDING_PROVIDER=local`, `LLM_PROVIDER=azure` and Wednesday's Azure values,
`RETRIEVAL_STRATEGY=hybrid`, `ACME_SEED_PASSWORD=<12+ characters>`. Then:

```bash
git pull
docker compose up -d db
python checkpoints/03-retrieval/db.py migrate                  # 006_small_chunks
python checkpoints/03-retrieval/db.py seed --reset-passwords   # only if the class password isn't set; BEFORE the events
python checkpoints/03-retrieval/fake_drive.py reset
python checkpoints/03-retrieval/fake_drive.py apply all        # Monday, all five events (the bands restricted)
python checkpoints/03-retrieval/sync.py --rebuild --apply      # local embeddings: a new index, 89 sections + 136 small
python checkpoints/03-retrieval/warmup.py                      # MiniLM, if this machine never had it
```

(`--rebuild` because Wednesday's Acme Desk index was built with Azure embeddings: the sync refuses to
mix two models in one index and says so.)

Then the four commands that fill the **fill Fri AM** rows (about 10 minutes, ~90 Azure calls the first
time, all cached in `checkpoints/03-retrieval/runs/llm_cache.json` afterwards):

```bash
python checkpoints/03-retrieval/scoreboard.py --llm --details > instructor-notes/fallbacks/part3/scoreboard-class.txt
python checkpoints/03-retrieval/answers.py --strategies dense,hybrid,parent > instructor-notes/fallbacks/part3/answers-class.txt
python checkpoints/03-retrieval/answers.py --strategies dense --scenario lost-context --show
python checkpoints/03-retrieval/scoreboard.py --save-baseline                  # Monday's gate starts from here
```

Copy the numbers into section 4. If `rerank` still shows a star, the cross-encoder didn't download: see section 6.

### 15 minutes before class

- [ ] `python run_checkpoint.py 03-retrieval` (port 8000). `http://localhost:8000/health` shows
      `local:all-MiniLM-L6-v2` for both the embedder and the live index.
- [ ] Signed in as `intern@acme.test` in one browser. Search tab, top_k **3** (the slides' screenshots).
- [ ] One `python checkpoints/03-retrieval/scoreboard.py` run in the terminal, so the cross-encoder is loaded and
      the output is there to scroll back to if the live run is slow.
- [ ] `fallbacks/part3/` open in the editor. Editor and terminal zoomed to 18pt+.
- [ ] The seven words ready to paste (`part3-teaching-guide.md`).
- [ ] A model in `.env` (`LLM_PROVIDER` and its key): `routed` asks it for the route. One
      `python checkpoints/03-retrieval/route_eval.py` run, so its 23 answers are cached and the live run is instant.
- [ ] Search tab, strategy `routed`, "Who works remotely?" once: the trace says "decided by the model".

---

## 3. Run of show (about 1 h 50; about 1 h 35 with the cuts below)

A picture before any code, nothing typed live except the commands below, a "what you should see"
slide after every live step. Online: no questions to the room; read the chat at the dividers, at
the break and at the end.

| Block | Slides | Min | Ends by | Live | Expect |
|---|---|---|---|---|---|
| Opening | 1–4 | 6 | 0:06 | none | the arc; three ideas; Wednesday was by eye |
| **Lists and routing** | 5–12 | 15 | 0:21 | Search tab, `dense` vs `routed`, three questions | search can't list; pointwise vs aggregation; the rules and their misses; a model's plan checked by code |
| Two cuts of the same documents | 13–18 | 20 | 0:41 | none | sections vs small chunks; match small, return big; why the sync writes both; read your chunks |
| HyDE | 19 | 4 | 0:45 | none | search with a made-up answer; one LLM call; looks surer than it is |
| A scoreboard you can trust | 20–25 | 20 | 1:05 | none | needs, not documents; seven kinds; the numbers in plain words; freeze and lint |
| Break | 26 | 10 | 1:15 | run the scoreboard once; app signed in as the intern | |
| Live: the scoreboard, small vs parent | 27–31 | 16 | 1:31 | `scoreboard.py`; Search tab, two questions | the tables disagree; the average lies; fragments vs the whole section |
| **Live: the router, measured** | 32–33 | 5 | 1:36 | `route_eval.py --details` | rules 11/23, model 22/23 at one call a question; R22 |
| Correct, not only faithful | 34–37 | 9 | 1:45 | `answers-class.txt` (pre-run) | the stale FAQ; retrieval miss vs generation miss; sure of itself |
| Wrap | 38–40 | 5 | 1:50 | none | three ideas, tonight, next session |

To finish near 1 h 35, cut in this order: HyDE to one sentence (19), the sync code (17), the grid (28,
if the live run was readable), the billing steps of small vs parent (30, steps 3 and 4), "sure of
itself" (37). If you are more than 10 minutes behind at the break: show slide 30 from its screenshots
only. Never cut routing's first live step (11, steps 1 and 2), the scoreboard run (27–29), small vs
parent (30), the router's numbers (33), or the stale FAQ (35).

**Demo rule:** never debug in front of the room for more than 60 seconds. Say "here's what it does",
go to the next slide (it shows the output), fix it at the break.

### Introducing the code

Nothing typed. If someone asks to see code, in this order: `app/rag/router.py` (the rules, 70 lines),
`app/rag/router_llm.py` `check()` (the guards), `app/prompts/route_question.py`, `app/rag/children.py` (the second cut,
40 lines), `app/rag/retriever.py` `_parent()` (12 lines), `app/rag/store_pg.py` `by_ids()` (why the
sections are fetched through the filter again), `app/evals/scoreboard.py` (`meets()`, `score()`,
`winner()`), `shared/golden/golden_scenarios.json` (S09, S13, S20).

### The live demo, exactly

**0. routed (slide 11).** Browser, signed in as the intern, Search tab, top_k 3:

1. "Who works remotely?", strategy `dense`: the remote-work policy and the FAQ, no people.
2. Same question, strategy `routed`: Maria Garcia, Michael Brown, Ahmed Hassan, total 3 (not top 3: the
   lookup ignores k). Trace: `route: aggregation on {'office': ['Remote']} -> 3 matching record(s), all
   of them (decided by the model)`, then `router: Every person whose office is Remote.`
3. "Show me all remote staff", `routed`: the same three. The rules would have searched (no who / list /
   how many).
4. "Who do I talk to on the Engineering team about a deploy?", `routed`: `route: pointwise (decided by
   the model)` and its reason. The rules would have listed every engineer.

No model: the trace says `router model unavailable (...): the rules decided`; steps 1, 2 and 4's rules
answer still show the idea, step 3 searches. Say "that's version one" and go to slide 12.

**1. The scoreboard (slide 27).** In the terminal:

```bash
python checkpoints/03-retrieval/scoreboard.py
```

About 20 seconds on the build laptop, model loading included (time it this morning on the class
machine: the reranker adds ~0.6 s a question there for 3 techniques × 28 questions). Scroll to the top and read three tables, not all
seven: **casual** (dense wins, keyword 0.00), **identifier** (keyword and hybrid win, small 0.25),
**whole-section** (small: doc@5 1.00, Hit@5 0.25). Then "Who wins what" and the `all answerable`
line: dense 0.42 overall, while hybrid wins three tables. Then "Leaks ... 0".

**2. small vs parent (slide 30).** Browser, signed in as the intern, Search tab, top_k 3:

1. "What do I need to do in my first week?", strategy `small`. #1 is Week 3 ("First Contributions":
   the word "first"), #2 is one sentence of Week 1: "Complete the mandatory security awareness training…".
2. Same question, strategy `parent`. #2 is now the **whole** Week 1 section: laptop and badge, email
   and Slack, the security training, the 1-on-1 about 30-day goals, the channels. Open it: "Matched by
   the small chunk: …security awareness training…". Same search, the model gets the list.
3. "How many reviewers does a change to the billing code need?", strategy `dense`: Coding Standards
   ("at least one reviewer") first, and the Engineering Handbook isn't in the top 5 (its section is a
   whole PDF page, distance 1.46).
4. Same question, `parent`: the handbook is #2, "Matched by the small chunk: Engineering Handbook: A
   change that touches billing or authentication needs two reviewers." (0.90). That is what parent is
   for: a fact drowned in a long section. Acme's sections are rarely long (slide 31).

**2b. The router, measured (slide 32).** In the terminal:

```bash
python checkpoints/03-retrieval/route_eval.py --details
```

Instant once cached (this morning's run). Read the two summary lines at the bottom: rules 11/23 (5
lists sent to search, 4 passages turned into lists, 2 unindexed mixed up, 1 wrong filter), model 22/23
(1 unindexed mixed up). Scroll to R22, "Who joined the company this year?": the model's reason says the
directory has no start date, and it still answered pointwise. Don't edit the prompt to fix it. The
model costs one call before every search (median 1.4 s on 15 Nov, gpt-4.1-mini). No model: `--router
rules`, and slide 33 for the model's column.

**3. Correct, not only faithful (slides 35–36).** Show `fallbacks/part3/answers-class.txt` (run this
morning), not a live run. If the room asks for live: Ask tab, intern, "How many days of unused
vacation can I carry over now?", strategy `dense`, top_k 3. See section 4 for what it said this morning.

---

## 4. Numbers

Build laptop, 12 Nov: 28 questions, top 5, Monday's documents, local MiniLM, laptop CPU. Hit@1 (for
unanswerable questions: *calm*, the share where the best result is not high confidence).
Full output: `fallbacks/part3/scoreboard-local.txt`.

| Scenario | dense | keyword | hybrid | small | parent | rerank | hybrid_rerank | hyde | multi_query | Winner (no-model techniques) |
|---|---|---|---|---|---|---|---|---|---|---|
| casual | **0.75** | 0.00 | 0.00 | 0.50 | 0.50 | fill Fri AM | fill | fill | fill | dense |
| identifier | 0.50 | **0.75** | **0.75** | 0.25 | 0.50 | fill | fill | fill | fill | hybrid (MRR 0.88) |
| buried | 0.50 | **0.75** | 0.50 | 0.50 | 0.50 | fill | fill | fill | fill | keyword |
| whole-section | **0.50** | 0.00 | 0.25 | 0.00 | 0.25 | fill | fill | fill | fill | dense |
| lost-context | 0.25 | 0.25 | **0.50** | 0.25 | 0.25 | fill | fill | fill | fill | hybrid |
| two-docs | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | fill | fill | fill | fill | hybrid (MRR 0.40) |
| unanswerable (calm) | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | fill | fill | fill | fill | a tie |
| all answerable | **0.42** | 0.29 | 0.33 | 0.25 | 0.33 | fill | fill | fill | fill | |

MRR for the same run: casual 0.88 / 0.06 / 0.34 / 0.71 / 0.71 (dense, keyword, hybrid, small, parent);
identifier 0.65 / 0.81 / 0.88 / 0.30 / 0.56; buried 0.58 / 0.75 / 0.75 / 0.62 / 0.62; whole-section
0.71 / 0.31 / 0.54 / 0.08 / 0.58; lost-context 0.58 / 0.56 / 0.75 / 0.49 / 0.50; two-docs 0.32 / 0.33
/ 0.40 / 0.25 / 0.33.

| Measured | Value |
|---|---|
| Leaks, every technique, every question | 0 (S26 intern / salary bands, S28 sales rep / Q3 headcount: nothing from either) |
| Search time | 30–45 ms a question for dense, keyword, hybrid, small, parent; the reranker didn't run on the build laptop (Wednesday's class machine: ~0.6 s extra); rerank, hyde, multi_query: fill Fri AM |
| Context per question (median tokens) | dense ~360, hybrid ~378, parent ~396, small ~228 |
| The index | 89 sections (avg 275 characters, max 905) + 136 small chunks (avg 174, max 285); 50 sections have 1 small chunk, 35 have 2, 4 have 3 or more |
| Sync, first run on Part 2's database | `change 18, quarantine 1, skip 1`, 225 vectors, ~8 s (local) |
| `pytest checkpoints/03-retrieval/tests -q` | 157 passed, 2 skipped (the exercises), ~2 min |

| Live step | Output (12 Nov) |
|---|---|
| first week, `small` | #1 Week 3 (1.36), #2 "Complete the mandatory security awareness training…" (1.47), #3 ENG-ONBOARDING-GUIDE Day One |
| first week, `parent` | #1 Week 3, #2 the whole Week 1 section, matched by the security-training sentence |
| billing, `dense` | ENG-CODING Code Review Process 0.91 ("at least one reviewer"); no handbook in the top 5 |
| billing, `parent` | ENG-CODING 0.89, ENG-HANDBOOK 0.90 matched by "…billing or authentication needs two reviewers." |
| billing, `keyword` | ENG-HANDBOOK #1 |
| carry-over, every technique | #1 COMPANY-FAQ "Up to 5 days…" (0.47), #2 HR-LEAVE "…a maximum of 10 days" (0.81) |
| S27 parental 2027, every technique | HR-LEAVE "Primary caregivers receive 16 weeks…" at 0.50: high confidence, and not the answer |

Answers (`answers.py --strategies dense,hybrid,parent`, Azure `gpt-4.1-mini`): **fill Fri AM** from
`answers-class.txt`.

| | correct | retrieval miss | generation miss | made it up |
|---|---|---|---|---|
| dense | | | | |
| hybrid | | | | |
| parent | | | | |
| S20 carry-over, dense, what it said | | | | |

On S20: the answer prompt says "if two blocks disagree, use the one with the later effective date".
If the model answers 10 days, the prompt rule saved a retrieval that ranked the stale copy first. Say
so: it is right, and only because of a rule that a different prompt wouldn't have. If it answers 5,
it is the slide.

---

## 5. Fallbacks (`fallbacks/part3/`)

`scoreboard-local.txt` (the 12 Nov run with `--details`: every question, every technique),
`scoreboard-class.txt` and `answers-class.txt` (Friday morning), `screens/` (Search tab: first week
with `small` and `parent`, the billing question with `dense` and `parent`), `solutions/context_tokens.py`
(tonight's exercise 2; don't share it tonight), `route-eval-class.txt` (`route_eval.py --details`,
gpt-4.1-mini, 15 Nov: the rules and the model on all 23 route questions, with the model's reasons).

If the app won't start: slides 12 and 28–30 carry the output. If Postgres won't start: the scoreboard text is
in `scoreboard-local.txt`; teach from it.

---

## 6. If something breaks

| Symptom | Cause | Fix |
|---|---|---|
| `routed` trace: "router model unavailable (…): the rules decided" | no model key, quota, outage | the rules still route "who works remotely?"; teach version two from slides 10–12 and `route-eval-class.txt` |
| `route_eval.py`: "No model answered … the model column is the rules' fallback" | the same | `--router rules` live, slide 33 for the model |
| `routed` trace: "route: pointwise" with no "decided by" | the signed-in person may not read the team directory | sign in as the intern (employees can read it) |
| `scoreboard.py`: "The live index has no small chunks" | the index was built by Part 2 | `python checkpoints/03-retrieval/sync.py --apply` (re-cuts every document: `change 18`) |
| `sync.py`: "The live index was built with azure:… but the embedder is now local:…" | Wednesday's index was Azure | `sync.py --rebuild --apply` |
| `rerank`, `hybrid_rerank`, `routed` starred, "reranker unavailable" in `--details` | the cross-encoder can't download (no network, a proxy, a corporate block) | run without them: `--strategies dense,keyword,hybrid,small,parent`; the slides have the rest |
| `hyde`, `multi_query` starred | no model: key, quota, outage | the same; `answers.py` exits with "No model", use `answers-class.txt` |
| Numbers differ from the slides | a different embedding model (`/health`), or Friday's documents (`fake_drive.py apply all` missing) | `EMBEDDING_PROVIDER=local`; `fake_drive.py reset`, `apply all`, `sync.py --apply` |
| S26 shows the salary bands | event 4 wasn't applied (Part 2's demo leaves it out) | `fake_drive.py apply 4`, `sync.py --apply` (a relabel: nothing re-embedded) |
| Every `seed` puts Friday's register back | `seed` after the events | seed first, then `fake_drive.py reset` and `apply all`, then the sync |
| Part 2's checkpoint now shows small chunks | 02 and 03 share the database | `python checkpoints/02-platform/sync.py --rebuild --apply` before running 02 again |
| A test run fails with `PermissionError` deleting a temp folder (Windows) | the repo is in OneDrive: read-only folders were copied | fixed on 12 Nov in both checkpoints' `fake_drive.py`; `git pull` |
| After sign-in no tab shows (blank workbench) | `app.js` had a line break inside a string (`traceBlock`, since 11 Nov): the whole script failed to parse | fixed 12 Nov in both checkpoints; `git pull`, then a hard refresh (Ctrl+F5) |
| Demo accounts can't sign in | the class password was never set | `ACME_SEED_PASSWORD` in `.env`, `db.py seed --reset-passwords`, then the events again |
