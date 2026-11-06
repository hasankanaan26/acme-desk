# Part 1 — The source

## Objective

Run the Session 8 ingestion pipeline against a real document source, on a schedule. Edit a file in
Google Drive, trash another, and watch the next tick plan `change` and `remove` without anyone
typing a command.

## What's covered

- **Two connectors, one interface:** a source answers three questions (what exists, give me the bytes,
  what do you know about it). `LocalFolderConnector` plays the library offline; `DriveConnector` reads a
  real Google Drive folder through a service account. `sync.py` cannot tell them apart.
- **Change signals from the source:** Drive hands out an `md5Checksum` per upload and a `version` per
  native Doc; the local folder computes the same MD5. Unchanged files are never downloaded.
- **The scheduler:** the same sync, on a timer inside the API. One lock, so a manual run and a tick never
  overlap. `GET /sync/status`, `POST /sync/now`, pause and resume.
- **The SharePoint equivalents:** every Drive call next to its Microsoft Graph twin
  (`docs/sharepoint-mapping.md`).
- Everything from Session 8, unchanged: format-aware parsers, the register, permission and freshness
  filters inside the vector search, PII redaction, blue/green rebuilds, the leak / stale / ghost evaluation.

## The scenario

`shared/data/sites/` is Acme's document library on Friday: 20 files in 7 sites, a register
(`shared/data/register.json`) and five users (`shared/data/identities.json`). Over the weekend five
things happen (`shared/data/events/events.json`):

1. Finance publishes the 2026 Expense Policy. The 2023 policy and its 2024 update become superseded.
2. HR edits the Leave Policy. Carry-over goes from 5 to 10 days; two sections move out.
3. Legal withdraws the Q3 planning notes. The file is deleted.
4. HR fixes the salary bands, which had been shared with every employee. Not one word changes.
5. Someone edits the wiki page footer. The article does not change.

With `SOURCE=drive` the same files sit in a Drive folder and you make the changes by hand in the Drive
UI. With `SOURCE=local`, `fake_drive.py` plays Drive: it copies the seed to `workspace/local-drive/` and
replays the events.

## What's new in this checkpoint

| File | What it does |
|------|-------------|
| `app/ingest/connector.py` | `Connector` (the interface), `LocalFolderConnector`, `make_connector()`; `etag_of()` is now MD5 |
| `app/ingest/connector_drive.py` | `DriveConnector`: `files.list` per folder, `get_media` / `export_media`, the register, `webViewLink` citations |
| `app/ingest/scheduler.py` | The timer: `start()`, `tick()`, `pause()`, `resume()`, `status()`, and the lock every sync takes |
| `app/routers/sync.py` | Adds `GET /sync/status`, `POST /sync/now`, `/sync/pause`, `/sync/resume` |
| `app/routers/source_events.py` | The weekend's events as buttons (local mode only) |
| `app/main.py` | Starts and stops the scheduler with the app; `/health` shows the source and the scheduler |
| `scheduler.py` | The timer in a terminal: `--interval 20`, `--source drive` |
| `drive_admin.py` | `tree`, `check`, `fetch`, `permissions`, `token`, `changes`: see the folder the way the sync does |
| `fake_drive.py` | Plays Drive offline: `reset`, `events`, `apply 2`, `apply all`, `status` |
| `sync.py` | The job: dry run by default, `--apply`, `--rebuild`, `--rollback`, `--source drive`, `--wipe` |
| `evaluate.py` | The golden set (`shared/golden/golden_qa.json`) against the live index. No LLM calls |
| `app/static/*` | The Sync tab gains the scheduler card; works against Drive or the local folder |
| `tests/test_connector_drive.py` | The Drive connector against a fake Drive API; plans match the local connector |
| `tests/test_scheduler.py` | Ticks, failures, pause, the lock |

Diff it against the Session 8 checkpoint:

```bash
git diff --no-index ../rag-week-bootcamp/checkpoints/checkpoint-5-production-ingestion checkpoints/01-source
```

## How to run

Offline, the way students run it (`SOURCE=local` in `.env`, the default):

```bash
python warmup.py                                          # once, at home: downloads the embedding model
python checkpoints/01-source/fake_drive.py reset          # Friday
python checkpoints/01-source/sync.py                      # dry run: add 18, quarantine 1, skip 1
python checkpoints/01-source/sync.py --apply              # build the live index
python checkpoints/01-source/scheduler.py --interval 20   # in a second terminal: a tick every 20 s
python checkpoints/01-source/fake_drive.py apply 2        # HR edits the Leave Policy: the next tick plans "change"
python checkpoints/01-source/fake_drive.py apply 3        # Legal deletes the Q3 notes: "remove"
```

Against Google Drive (`docs/drive-setup.md`, then `SOURCE=drive`):

```bash
python checkpoints/01-source/drive_admin.py check         # READY for class
python checkpoints/01-source/sync.py --source drive
python checkpoints/01-source/sync.py --source drive --apply
SYNC_INTERVAL_SECONDS=60 python run_checkpoint.py 01-source   # the API, with the timer on
# edit a Doc in Drive, trash a file, watch http://localhost:8000/ui#sync
```

The API and the browser workbench:

```bash
python run_checkpoint.py 01-source
# http://localhost:8000/ui       Sync tab: the scheduler card, the plan, eTag vs content hash
# http://localhost:8000/docs     GET /sync/status, POST /sync/now, GET /documents, GET /search?user=...
# http://localhost:8000/health   source, live index, scheduler
```

## What you should see

The first sync, either source:

```
 + add        COMPANY-FAQ              new: 5 chunk(s) from the markdown parser
 ...
 ! quarantine ENG-INCIDENT-REPORT      1 page(s), 0 characters of text: a scan. Queued for OCR, not indexed.
 . skip       HR-PARENTAL-2027-DRAFT   status is draft: never indexed
Counts: add 18, quarantine 1, skip 1
```

After the Leave Policy edit and the Q3 deletion, one tick later:

```
 ~ change     HR-LEAVE                 text changed: 4 old chunk(s) out, 4 new in
 - remove     LEAD-Q3-NOTES            in the register but leadership/q3-planning-notes.md is not in the source
Counts: change 1, remove 1, quarantine 1, skip 1, unchanged 16
```

"How many unused vacation days can I roll over?" answers 5 before the tick and 10 after it.

## Tests

Offline, with a fake embedder, a fake Drive API and temp folders (your index, `.env` and Drive are not touched):

```bash
pytest checkpoints/01-source/tests -q
```

## Tonight

1. Run `scheduler.py --interval 20` in one terminal and replay `fake_drive.py apply 1` to `apply 5`
   one at a time in another. Write down the action the tick planned for each event.
2. Finish the `TODO (Lab exercise)` in `app/ingest/scheduler.py`: fingerprint the listing (sha256 of
   the sorted `path|etag` lines) and skip the sync when it equals the last tick's. Watch `skipped`
   climb in `GET /sync/status`.
3. Add a test to `tests/test_connector_drive.py`: a Google Form in the fake listing must be skipped.
   See it fail first, then pass.
4. Stretch: `POST /sync/pause`, apply an event, `POST /sync/resume`. When does the plan show up?
