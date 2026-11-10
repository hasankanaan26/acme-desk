# Part 1 run sheet: a real document source (Mon 9 Nov)

Companion for Session 9, the first of the four "Creating your production application" sessions.
Setup, the order of commands, what to expect, and what to do when something breaks. Numbers marked
*rehearsed* come from the Session 8 rehearsal with Azure embeddings (6 Nov) and do not depend on the
source; numbers marked *fill in* come from Saturday's Drive run.

- Code: `checkpoints/01-source/` (run every script from the repo root)
- Deck: `slides/part1-source.pptx`
- Fallbacks: `instructor-notes/fallbacks/part1/`
- Google setup: `docs/drive-setup.md`

---

## 1. The point

Friday's pipeline, on a real source, on a timer. Three ideas, one each per block:

1. A connector is an interface, not a library. Two connectors, four methods, zero changes in `sync.py`.
2. A scheduled sync keeps the index true to a source that people edit. Nobody types a command; the
   index follows the source.
3. The source gives you the change signal for free (Drive's `md5Checksum` or `version`, SharePoint's
   eTag). The content hash costs a download and a parse, and is the only thing that decides whether
   embedding money is spent.

Line to leave them with: the demo was edit, trash, wait. Everything else was already there on Friday.

### The opening, 3 minutes, then move

"Friday ran short, for a family reason I had to attend to. I owe you the ending, and I'd rather give
you a better one than a repeat: the same pipeline, on a real document source, on a schedule, today.
The remaining four sessions build one production app on it. The capstone is cancelled so nothing
competes for your evenings. Here is the plan." Then the arc slide, then `drive_admin.py tree`.

---

## 2. Before class (20 minutes)

`.env` for the session:

```
SOURCE=drive
EMBEDDING_PROVIDER=azure            # what the index is built with; local works too
SYNC_INTERVAL_SECONDS=0             # off for the opening; 60 from block 2
```

- [ ] Nothing on port 8000 (`Get-NetTCPConnection -LocalPort 8000 -State Listen`); stop the old
      server and its reload worker.
- [ ] `python checkpoints/01-source/drive_admin.py check` says READY. If the Q3 notes are missing,
      restore them from the Drive trash. If the Leave Policy Doc still says 10 days, put it back to 5.
- [ ] No index: `python checkpoints/01-source/sync.py --wipe`.
      `http://localhost:8000/health` shows `"live_index": null`, `"source": "drive"`.
- [ ] Browser tabs: the Drive folder, the Leave Policy Doc, `/ui#sync`, this file.
- [ ] `instructor-notes/fallbacks/part1/` open in the editor.
- [ ] Editor and terminal zoomed to 18pt+. `connector.py`, `sync.py` and `scheduler.py` open in tabs.
      Nothing is typed live today: the code is read, not written (see "Introducing the code" below).
- [ ] Do not press Sync, Run now, or start the API with the timer on before class: the opening dry run
      must say "add 18", not "unchanged".

---

## 3. Run of show (2 hours)

The deck is built around three questions, and it does not assume Friday was finished. Every idea gets
a picture, then at most ~12 lines of code, then something running. Each live slide is followed by a
"what you should see" slide: if a demo fails, move to that slide and keep teaching.

The session is online and has no questions to the room, no quizzes and no polls: every former "ask"
is now said by the instructor or shown as a worked example. Read the chat at the end of each block
and at the break.

| Block | Slides | Min | Ends by | Live | Expect |
|---|---|---|---|---|---|
| Opening | 1–5 | 10 | 0:10 | none | the problem (5 vs 10 days), the pipeline recap, the arc, the three questions |
| Q1 Read | 6–11 | 25 | 0:35 | `drive_admin.py tree`, `sync.py --source drive`, `--apply`, the carry-over question | add 18, quarantine 1, skip 1; 88 chunks; 5 days. Fallback `first-sync.txt` |
| Q2 Notice | 12–17 | 30 | 1:05 | none: the lazy fix, label-then-text-then-pay, the ladder, six worked cases, `build_plan()` read on screen | rows 1 and 2 of the worked cases (change, remove) are Monday's two edits |
| Break | 18 | 10 | 1:15 | start the API with `SYNC_INTERVAL_SECONDS=60` now, so it is warm | the Scheduler card counts down |
| Q3 Repeat | 19–24 | 30 | 1:45 | say what should happen, then edit the Doc 5 → 10, trash the Q3 notes, wait for the tick (or Run now), ask the assistant again | change 1, remove 1, quarantine 1, skip 1, unchanged 16; 10 days; hiring: no information. Plan B: `fake_drive.py apply 2`, `apply 3` |
| Wrap | 25–28 | 10 | 1:55 | none | three ideas, limits, tonight, Wednesday |

If you are more than 10 minutes behind at the break: cut slide 20 (three ways to run a job) to one
sentence, and show slide 17 (the code) for one minute without opening `sync.py`. The Signals
material (the explain panel, permissions 403, delta feeds) is now in the Reference appendix: show it
only if there is time at the end.

**Demo rule:** never debug in front of the room for more than 60 seconds. Say "here's what it does",
go to the next slide (it shows the output), and fix it at the break.

### Introducing the code

Three code moments, one per question, and nothing typed live. The same four steps each time:

1. **Picture first.** The concept slide (the plug, the ladder, the timer) is already on screen.
2. **Say what it must do.** One sentence, before the code appears. They already know it from the picture.
3. **The slide snippet.** At most 12 simplified lines, read top to bottom, each line mapped to the picture.
4. **The real file, one function only.** Zoomed in, Ctrl+G to the line, read the one comment that matters,
   close it. Don't scroll the file, don't explain syntax, don't open a second file.

| Slide | File | Go to | The one thing to point at |
|---|---|---|---|
| 8 | `app/ingest/connector.py` | line 58 (`class Connector`), then 112 (`make_connector`) | four method names; `SOURCE` read from `.env` |
| 17 | `app/ingest/sync.py` | line 167 (`build_plan`), then 201 | the comment "Cheapest check first", then the first `fetch()` at line 212 |
| 21 | `app/ingest/scheduler.py` | line 75 (`tick`), then 102 (`_loop`) | the same `run_sync(apply=True)`; the `except` that counts instead of crashing; then `GET /sync/status` |

Students write code tonight (the exercises), not during class.

### Where each Session 8 idea reappears

| Friday | Today |
|---|---|
| `sharepoint.py apply 2` edits the Leave Policy | you edit the Google Doc |
| `sharepoint.py apply 3` deletes the Q3 notes | you trash the file |
| `sharepoint.py apply 5` touches the footer | you upload a new version of the wiki page |
| `python sync.py --apply` | the tick |
| the eTag was our SHA-256 | the eTag is Drive's md5Checksum, and our MD5 matches it |

---

## 4. Numbers

Plan counts do not depend on the embedding model or the source.

| Step | Output |
|---|---|
| Friday dry run | add 18, quarantine 1 (the scan), skip 1 (the draft); 88 chunks, ~6,174 tokens, $0.0001 (*rehearsed*) |
| Friday apply | 88 chunks, smoke check ok, LIVE; 15 to 25 s with Azure, about 5 s local (*rehearsed*) |
| After the edit and the trash | change 1, remove 1, quarantine 1, skip 1, unchanged 16 |
| Index after the tick | 82 chunks (measured in local mode on 6 Nov; counts do not depend on the embedder) |
| Footer upload | touch 1, unchanged 17; 0 chunks to embed |

Searches, after the tick:

| Question | As | Expect |
|---|---|---|
| How many unused vacation days can I roll over? | intern | 10 days (5 before the tick) |
| How many backend developers are we hiring? | finance-lead | no information (the notes are gone) |
| salary range for a senior developer | intern | the 2026 bands: on Friday they were mis-shared with every employee (the register says `employees`) |
| same, after you set `allowed_groups` to `hr, managers` in `shared/data/register.json` and a tick runs (`relabel`, nothing embedded) | intern | nothing about salaries. Only if block 3 has time; `git checkout shared/data/register.json` afterwards |

---

## 5. Fallbacks to have in `fallbacks/part1/` (made on Saturday)

`tree.txt`, `first-sync.txt` (dry run and apply), `monday-plan.json` (the tick's plan), `explain-hr-leave.json`,
`changes.txt`, `scheduler_complete.py`, and screenshots of the Scheduler card before and after the tick,
the Drive edit, and the two answers.

Plan B, if Drive is down or the connector misbehaves: `.env` back to `SOURCE=local`, restart the API,
`fake_drive.py reset`, `sync.py --apply`, then `fake_drive.py apply 2` and `apply 3` in place of the
Drive edits. Every number in section 4 is the same.

---

## 6. If something breaks

| Symptom | Cause | Fix |
|---|---|---|
| `drive_admin.py check` lists a MISSING file | trashed after a rehearsal, or renamed | restore from the Drive trash; names must match the register's paths |
| `404 File not found` on the root folder | not shared with the service account, or a wrong id | `docs/drive-setup.md` steps 4 and 5 |
| The tick plans `remove` + `skip` for the same document | the file was renamed in Drive: the old path is gone, the new one has no register entry | rename it back; this is a good aside about fail-closed |
| The Doc edit shows as `unchanged` | the Doc's `version` did not move yet; Drive is lazy about it for a few seconds | wait one more tick, or press Run now |
| The Doc export has no headings | markdown export mangled it | `DRIVE_DOC_EXPORT=html`, restart; or plan B |
| Tick FAILED in the card | Drive API error, quota, network | the index is untouched; press Run now; if it repeats, plan B |
| Browser shows an old checkpoint at 8000 | an old server or its reload worker | stop the PID, restart |
| `sync.py` stops: "Vectors from two models cannot share an index" | `EMBEDDING_PROVIDER` changed since the index was built | `sync.py --rebuild --apply`, or set it back |
| The scheduler card says `off` | the API was started with `SYNC_INTERVAL_SECONDS=0` | restart with 60; the card picks it up |
| "No relevant documents" for everything | no live index yet | `sync.py --apply` or Run now |
| Anything else | | `sync.py --wipe`, restore Drive, start the block again |

---

## 7. Honest answers

- A normal tick writes into the live index in place; only `--rebuild` is blue/green. Embedding failures
  are safe (embed first, write last); a store failure between delete and insert would lose one document
  until the next tick.
- The register is a local file. In production the permission list comes from the source
  (`permissions.list`, Graph's `/permissions`) and groups resolve in the identity provider; that mapping
  is the exercise `drive_admin.py permissions` points at.
- The scheduler is a thread in one process. Two API processes would be two schedulers; the lock is
  per process. Production runs the tick in one worker, or as a queue job.
- Each tick lists the whole folder (8 calls). The Changes API with a saved token is the fix for a large
  drive; it is tonight's stretch and the Wednesday opener if someone did it.
- Rollback still has no test.
