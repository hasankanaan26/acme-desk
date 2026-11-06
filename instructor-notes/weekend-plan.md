# Weekend plan: Fri 6 Nov evening to Mon 9 Nov

Stop when tired. Everything in the "could" lists can wait; every demo has a saved fallback in `instructor-notes/fallbacks/`.

## Fri 6 Nov to Sun 8 Nov

| When | Task | Est. | Done when |
|---|---|---|---|
| Fri eve | New repo, venv, `pip install`; checkpoint 5 copied to `checkpoints/01-source`; config, connector factory and scheduler in; `pytest checkpoints/01-source/tests -q` green | 75 min | 24 lifted tests + the new connector and scheduler tests pass |
| Fri eve | Google Cloud: project, Drive and Sheets APIs, service account, key, folder tree, share, folder id (`docs/drive-setup.md` steps 1 to 6) | 35 min | `drive_admin.py check` says READY |
| Sat AM | First Drive sync: `sync.py --source drive`, then `--apply`; compare chunk counts with local | 1 h | the same counts on both sources |
| Sat AM | The edit demo decision: native Doc export vs "Upload new version" (`docs/drive-setup.md` step 7) | 45 min | one method chosen and rehearsed once |
| Sat PM | API with `SYNC_INTERVAL_SECONDS=60`; do the edit and the trash for real; save plan JSONs and screenshots to `instructor-notes/fallbacks/part1/` | 1.5 h | the Monday demo rehearsed end to end |
| Sun AM | `instructor-notes/part1.md` finished with real numbers; README, CHECKPOINTS.md | 1.5 h | notes |
| Sun AM | `slides/src/p1.js` (reuse 5 slides from `s08.js`, write about 10) | 2 h | `slides/part1-source.pptx` |
| Sun PM | Two full rehearsals from a clean state (`sync.py --wipe`, restore the Doc text, untrash the file); push public; send the student message | 1.5 h | ready |

## Sun 21:00 decision

Drive connector working end to end?

- Yes: Monday as planned.
- No: Monday runs `SOURCE=local` with the scheduler on; `fake_drive.py apply 2` and `apply 3` play the edit and the deletion. The Drive slides move to Wednesday's first block (20 minutes) and Wednesday's streaming block shrinks.

Minimum viable Monday: the environment proven, 01-source in local mode with the scheduler, Drive listing and fetch of uploaded files, the run sheet. The native-Doc edit and the Changes API demo are stretch.

## Build windows after Monday

| Window | Must | Should | Could |
|---|---|---|---|
| Mon night + Tue (02) | `llm.py` lift, `auth.py`, `DeskState` + nodes + `workflow.py`, `store/events/obslog` lift, `/chat` + SSE, one-page `chat.html/js`, cp6 strategies copied, `test_auth`, `test_graph_chat`, run sheet, `p2.js` | thread list, trace panel, `/conversations`, HyDE cached | approvals-ready schema |
| Wed night + Thu (03) | `registry.py`, `policy.py`, `backend_local.py`, `audit.py`, workflow `plan / check_policy / await_approval / execute`, `/approvals`, approval card, `test_policy`, `test_approval_resume`, `test_idempotency`, run sheet, `p3.js` | `backend_sheets.py` + the Sheet, `agent.py`, `agent_unbounded.py` | approvals page |
| Fri night + Sat/Sun (04) | planted doc + Drive upload, three guards + `tool_policy_check`, `golden_tools.json` + `tool_evals.py`, `evaluate.py`, `release.py` + thresholds, kill switch, one-page runbook, run sheet, `p4.js`, fallbacks | `dashboard.py`, compose tested, `chaos.md` | judge calibration table |

## 20 minutes before every class

Port 8000 free. `.env` provider and `EMBEDDING_PROVIDER` match the live index (`/health` shows `live_index_built_with`). `drive_admin.py check` green. Doc text restored and the Q3 notes untrashed (Part 1). `SYNC_INTERVAL_SECONDS=60` only for Part 1; otherwise 0 and use Run now. Sheet open and shared (Part 3). Judge cache present (Part 4). The fallbacks folder open in the editor. A second terminal tailing `runs/acme.jsonl`.
