# Part 3 — Which search wins, and how you prove it

## Objective

Wednesday we looked at retrieval techniques one question at a time, by eye. Tonight we measure them.
The same Acme documents are cut two ways, two more techniques read the second cut, and a scoreboard
shows which technique wins which kind of question, what it costs, and that none of them leaks.

The test of it: one command, `python scoreboard.py`, prints a table for each kind of question,
and no single technique wins every table. The average across all questions points at a different
winner than the tables do. Then one more command checks the answers themselves, because an answer
can be faithful to its context and still wrong.

## What's covered

- **Two cuts of every document, written by the same sync.** Sections (Parts 1 and 2: one chunk per
  section, up to 900 characters, with a `title > heading` header) and **small chunks**: each section
  split again into whole sentences, up to `CHILD_MAX_CHARS` (220), each with a `parent_id` pointing to
  its section. The worker (`acme_sync`) writes both cuts in one transaction, from the same parsed
  text, so they can never be out of step. A foreign key makes "a small chunk whose section is gone"
  impossible (`006_small_chunks.sql`). The lab built its small chunks at query time; here the API
  role cannot write chunks, and should not.
- **Two strategies on the second cut.** `small` searches the small chunks and returns them as they
  are: precise, with little context. `parent` searches the small chunks and returns the **sections**
  they point to ("match small, return big"), fetched by a second query that goes through the access
  filter again (`store.by_ids`). Each `parent` result says which small chunk picked it (`matched`,
  shown in the UI).
- **HyDE, measured.** Search with an answer the model made up (Part 2's `hyde`). One LLM call before
  every search, and the distance it reports is to the made-up answer, so it looks surer than it is.
- **A scenario question set built so the techniques disagree** (`shared/golden/golden_scenarios.json`):
  28 questions in seven kinds, each asked as its own person. They are casual wording, an exact id, a
  sentence buried in a section about something else, a whole-section list, an answer whose placing
  words are in the heading, two documents, and questions nothing this person may read answers. Each
  answerable question says what the model **needs** (a document plus the words it cannot do without),
  not just which document. A test checks every one of those words really is in its document on Monday.
- **One scoreboard per scenario** (`scoreboard.py`): Hit@1, Hit@5, MRR, doc@5 (Part 2's "right
  document somewhere"), LLM calls, milliseconds and leaks, for every technique. A winner per scenario
  (quality, then fewer LLM calls, then speed; a leak disqualifies), and a starred row for any
  technique that ran without its model or reranker and fell back. `--save-baseline` /
  `--against-baseline` show what moved, question by question. Part 4's release gate reads these files.
- **One answer-level check** (`answers.py`): write the answer exactly as `POST /query` does, then check
  it against facts a person wrote down. A wrong answer is a **retrieval miss** (the context never held
  the facts: no prompt could fix it) or a **generation miss** (the context had them). A question nothing
  answers must be answered with "I don't know". No LLM judge: the check is cheap, repeatable, and has
  no opinion.
- **Unchanged from Part 2:** sign-in, access, tenants, roles, the worker, the change gate, the chat
  (still `hybrid`), and every Part 2 strategy. The section searches never see a small chunk, so Part
  2's numbers don't move.

## Run it

```bash
docker compose up -d db
python checkpoints/03-retrieval/db.py migrate             # adds 006_small_chunks
python checkpoints/03-retrieval/db.py seed                # skip if Part 2's accounts are already there
python checkpoints/03-retrieval/fake_drive.py reset       # offline: Friday's files
python checkpoints/03-retrieval/fake_drive.py apply all   # Monday: all five events (the bands fixed too)
python checkpoints/03-retrieval/sync.py --apply           # every document re-embedded once: 89 sections + 136 small
python checkpoints/03-retrieval/scoreboard.py             # the scoreboard, no model needed
python run_checkpoint.py 03-retrieval                     # the UI: Search tab, strategy small / parent
```

Coming from Part 2's database: `migrate` adds the column, and the first `sync.py --apply` re-embeds
every document once (`change 18`), because every chunk now records how it was cut (`pipeline`) and
that changed (`acme.2`: two cuts). It doesn't need `--rebuild`. Order matters as in Part 2: a `seed` after the events puts Friday's register back.

```bash
python scoreboard.py --details                       # every question, every technique: where it was ready, or why not
python scoreboard.py --llm                           # + hyde and multi_query (one cached LLM call per question each)
python scoreboard.py --scenario whole-section --strategies dense,small,parent --details
python scoreboard.py --save-baseline                 # freeze tonight's numbers
python answers.py --strategies dense,hybrid,parent   # needs a model: LLM_PROVIDER and its key
```

## What you should see

28 questions, top 5, Monday's documents, local MiniLM embeddings, a laptop CPU (12 Nov). Hit@1 (for
the unanswerable questions: *calm*, the share where the best result is not high confidence):

| Scenario | dense | keyword | hybrid | small | parent | Winner |
|---|---:|---:|---:|---:|---:|---|
| casual | **0.75** | 0.00 | 0.00 | 0.50 | 0.50 | dense |
| identifier | 0.50 | **0.75** | **0.75** | 0.25 | 0.50 | hybrid (MRR 0.88) |
| buried | 0.50 | **0.75** | 0.50 | 0.50 | 0.50 | keyword |
| whole-section | **0.50** | 0.00 | 0.25 | 0.00 | 0.25 | dense |
| lost-context | 0.25 | 0.25 | **0.50** | 0.25 | 0.25 | hybrid |
| two-docs | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | hybrid (MRR 0.40) |
| unanswerable (calm) | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | a tie |
| **all answerable** | **0.42** | 0.29 | 0.33 | 0.25 | 0.33 | |

Leaks: 0, for every technique on every question, including the intern asking for the salary bands
and the sales rep asking for the Q3 headcount. Every search took 30 to 45 ms. `parent` hands the
model about as much text as `dense` (median ~396 vs ~360 tokens a question), and `small` about 60% of it (~228).

What to read in it:

- **The average lies.** Over every question `dense` looks best (0.42). By kind of question, `hybrid`
  wins three tables and `keyword` one, and `dense` loses badly on ids and two-document questions.
  "Which search is best?" has no answer; "which search is best for *this kind of question*?" does.
- **`small` finds the right document and hands over the wrong piece.** On whole-section questions its
  doc@5 is 1.00 and its Hit@5 is 0.25: a sentence of the week-1 checklist is not the checklist. One
  small chunk reads, in full, `IT helpdesk tickets (October 2026): Fixed.` Read your chunks.
- **`parent` fixes that, and wins nothing here.** It turns `small`'s 0.25 into 1.00 at Hit@5 on
  whole-section questions. But 50 of our 89 sections fit in a single small chunk, and for those
  `parent` returns exactly what `dense` would. Parent-document pays off when sections are long, and
  Acme's are short (275 characters on average). The scoreboard's advice: don't ship it for these documents.
- **Two-document questions are where top-k is weakest.** Hit@1 is 0 by construction (one chunk can't
  hold two documents), and even the best MRR is 0.40: both documents arrive, but late.
- **Every technique was "sure of itself" on S27** ("parental leave in 2027?"): today's policy is very
  close to the question, and it doesn't answer it. A distance can tell "about this topic"; it can't
  tell "answers this question". That is the answer step's job, and `answers.py` checks it.
- **S20, the carry-over question:** every technique ranks the FAQ's stale copy ("up to 5 days") above
  the leave policy ("10 days", edited Monday). An answer from that context is faithful, and wrong.

Rows that need what this laptop didn't have on 12 Nov (a corporate network blocks the Hugging Face
download, and there was no model key): `rerank`, `hybrid_rerank` and `routed` (the cross-encoder),
`hyde` and `multi_query` (a model), and `answers.py`. Without them the scoreboard runs them anyway,
stars them and keeps them out of the winners. The class run used Azure embeddings and
`gpt-4.1-mini`.

## What's new in this checkpoint

| File | What it does |
|------|-------------|
| `app/db/migrations/006_small_chunks.sql` | `chunks.parent_id`, a foreign key to the section, an index |
| `app/rag/children.py` | The second cut: sentence-sized small chunks of each section (lifted from the lab's checkpoint 6) |
| `app/ingest/sync.py` | Builds and writes both cuts in the same run; `CHILD_MAX_CHARS` is part of every content hash |
| `app/rag/store_pg.py` | `search(level="small")`, `count_small()`, `by_ids()` (sections by id, inside the access filter); section searches exclude small chunks |
| `app/rag/retriever.py` | `small` and `parent` |
| `app/evals/scoreboard.py` | The metrics: needs, ready, Hit@1, MRR, doc@5, calm; the winner rule |
| `app/evals/runner.py` | One question, one technique, as the question's own person, timed, LLM calls counted |
| `app/evals/judge.py` | The ghost check understands small chunks |
| `scoreboard.py` | The scoreboard CLI |
| `answers.py` | The answer-level check: correct, retrieval miss, generation miss, made it up |
| `shared/golden/golden_scenarios.json` | 28 questions in 7 scenarios, with needs and facts |
| `tests/test_small_chunks.py`, `tests/test_scoreboard.py` | Both cuts, access on both, the metrics, and a lint on the question set |
| `app/static/` | `small` and `parent` in both strategy menus; "Matched by the small chunk" on a parent result |

Also fixed:
- **A new cut now reaches every document.** Before, a file with the same eTag was "unchanged" even
  after the chunking changed, so a new `PIPELINE_VERSION` (or tonight's `CHILD_MAX_CHARS`) only
  reached files that happened to change. Every chunk now records `pipeline`, and the eTag shortcut
  applies only when it matches (`app/ingest/sync.py`, `pipeline_id()`).
- The UI didn't start after sign-in: `app.js` had a raw line break inside a string in `traceBlock()`, a
  syntax error that stopped the whole script; fixed in 02-platform too.
- `evaluate.py --strategy all` crashed on every strategy after `hybrid`.
- `fake_drive.py reset` failed on Windows when the repo is inside OneDrive (read-only folders);
  fixed in 02-platform too.

## Tests

```bash
docker compose up -d db
pytest checkpoints/03-retrieval/tests -q     # 157 pass, 2 skipped (tonight's exercises: Part 2's and Part 3's), ~2 min
```

`test_scoreboard.py` needs no database and no model: the metrics on hand-made results, and the lint
on the question set.

## Tonight

About an hour, offline (`SOURCE=local`, local embeddings, no key needed for 1 to 3).

1. **Read the scoreboard.** `python scoreboard.py --details`. Find one question where `small` and
   `parent` disagree, and explain it from the chunks: the Search tab, strategy `small`, then `parent`
   (look for "Matched by the small chunk"). Everyone, first.
2. **The price nobody prints.** The `TODO (Lab exercise)` in `app/evals/scoreboard.py`:
   `context_tokens()`, then a `tokens` column. The test is waiting in `tests/test_scoreboard.py`:
   remove its `skip` line, see it fail, make it pass. Which technique is cheapest on the questions it
   gets right?
3. **Move the knob.** `python scoreboard.py --save-baseline`, then set `CHILD_MAX_CHARS=120` in `.env`,
   `python sync.py --apply` (why does it re-embed everything?), and
   `python scoreboard.py --against-baseline`. Then 400. Which scenarios moved, and why?
4. **Stretch: your own question.** Add two questions to `golden_scenarios.json` for a scenario where you
   predict the winner, *before* running anything. Write the needs from the document; the lint will
   tell you if the words aren't there. Were you right?
5. **Stretch, with a key:** `python answers.py --strategies dense,hybrid`. How many wrong answers are
   retrieval misses, and how many are generation misses? What would you fix first?

## Honest limits

- **28 questions are not a benchmark.** One question moves a scenario's Hit@1 by 0.25. The tables are
  for finding *kinds* of failure and arguing about them, not for a leaderboard. A real set grows from
  real questions people asked and the answers they flagged.
- **The evidence check is string matching.** A chunk that says "a pair of reviewers" doesn't meet "two
  reviewers". The words were chosen from the documents to be unambiguous; a paraphrasing corpus would
  need a looser check, or a judge.
- **"Calm" is a threshold on a distance**, and the threshold was set for MiniLM in Part 1. With another
  embedding model the same number means something else: re-tune it before you trust the column.
- **Hit@1 is 0 for two-document questions by construction.** Read their MRR and Hit@5 instead.
- **Small chunks double the embedding bill** (225 vectors instead of 89 here), whether or not a
  strategy reads them. For a corpus where `parent` doesn't win, that is money for nothing.
- **02-platform and 03-retrieval share the database.** After 03's sync, 02's searches would see small
  chunks as if they were sections. Going back to Part 2: `python checkpoints/02-platform/sync.py
  --rebuild --apply` (a fresh index, sections only). A plain `--apply` is not enough: Part 2's sync
  trusts the eTag and keeps the chunks it has.
- **The answer check needs a model, and caches it.** The cache key is the model and the prompt: change
  the model and every answer is written again.
