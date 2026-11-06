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

Friday's promises, one line each, and where they land: *fill in*.

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
- [ ] The live slice prepared: in `app/ingest/scheduler.py`, cut the bodies of `_loop()` and `tick()`
      down to `...`; the complete module is `fallbacks/part1/scheduler_complete.py`.
- [ ] Do not press Sync, Run now, or start the API with the timer on before class: the opening dry run
      must say "add 18", not "unchanged".

---

## 3. Run of show (2 hours)

| Block | Min | Content | Live | Expect |
|---|---|---|---|---|
| Opening | 10 | The closeout (above). The arc on one slide. "Same story as Friday, real source." | `python checkpoints/01-source/drive_admin.py tree` | 7 folders, 20 files, each with `md5 …` or `v7 (native, exported)`. Fallback `tree.txt` |
| 1 Connect | 30 | The three questions (slide). `app/ingest/connector.py`: the `Connector` protocol, the SharePoint vs Drive table in the header, `make_connector()`. `app/ingest/connector_drive.py`: `_children` (one `files.list` per folder), `_identity` (md5 or version), `fetch` (download or export). Then the first sync. | `python checkpoints/01-source/sync.py --source drive`, then `--source drive --apply`. In `/ui`: "How many unused vacation days can I roll over?" | Dry run: add 18, quarantine 1, skip 1; 88 chunks, ~6,174 tokens (*rehearsed*). Apply: 88 chunks, smoke check ok, LIVE, 15 to 25 s with Azure. The answer: 5 days. Fallback `first-sync.txt` |
| 2 Sync on a schedule | 30 | Why a job, not a button (slide: cron, worker, webhook). Live-code `_loop()` and `tick()`. Restart the API with the timer on. The Scheduler card counts down. Now the edit and the deletion, in Drive, as the owner. | `SYNC_INTERVAL_SECONDS=60 python run_checkpoint.py 01-source`. In Drive: edit the Leave Policy Doc, carry-over 5 → 10; trash `leadership/q3-planning-notes.md`. Wait for the tick or press Run now. Ask the carry-over question again. Ask "how many backend developers are we hiring?" as `finance-lead`. | Tick: change 1 (HR-LEAVE), remove 1 (LEAD-Q3-NOTES), quarantine 1, skip 1, unchanged 16. Carry-over: 10 days. Hiring: no information. Fallbacks: `POST /sync/now`; local mode `fake_drive.py apply 2` then `apply 3`; `monday-plan.json` + screenshots |
| Break | 10 | | | |
| 3 Signals | 30 | Two fingerprints (slide). `GET /sync/explain?doc_id=HR-LEAVE` in the Sync tab: both eTags, both hashes, the chunk diff. A `touch` for real: upload a new version of the wiki page with a changed footer (`shared/data/events/files/wiki-vector-database.html`, Manage versions → Upload new version). `drive_admin.py permissions hr/salary-bands-2026.md` next to the register. One slide each: the Changes API as Graph's `/delta`, push notifications, the local fallback and the tests. | the explain panel; `drive_admin.py token`, edit, `drive_admin.py changes <token>` | Explain: eTag index ≠ source, hash index ≠ source, the diff shows `5` → `10`. The footer upload: `touch`, no embedding. `changes`: one record for the Doc. Fallbacks: `explain-hr-leave.json`, `changes.txt` |
| Wrap | 10 | Tonight's four exercises (README). Wednesday: a face on this index: chat, identity from a token, hybrid retrieval. | | |

### The live slice

`_loop()` and `tick()` in `app/ingest/scheduler.py`, about 20 lines. Type them in this order and say
what each line is for:

```python
def tick() -> dict:
    started = time.perf_counter()
    try:
        report = run_locked(lambda: run_sync(apply=True))         # the SAME run_sync as the button
        _state["last_summary"] = {"counts": report["counts"], "chunks_in_index": report.get("chunks_in_index"),
                                  "warnings": len(report.get("warnings", [])), "report_file": report.get("report_file")}
        _state["last_error"] = None
    except Exception as exc:                                        # a scheduler outlives one bad run
        _state["errors"] += 1
        _state["last_error"] = f"{type(exc).__name__}: {exc}"
    _state["runs"] += 1
    _state["last_run"] = _stamp()
    _state["last_seconds"] = round(time.perf_counter() - started, 2)
    return status()


def _loop(interval: float) -> None:
    _state["next_run"] = _stamp(datetime.now() + timedelta(seconds=interval))
    while not _stop.wait(interval):                                  # wait() returns True when stop() is called
        if not _state["paused"]:
            tick()
        _state["next_run"] = _stamp(datetime.now() + timedelta(seconds=interval))
```

If typing goes wrong: copy `fallbacks/part1/scheduler_complete.py` over the module and restart.

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
