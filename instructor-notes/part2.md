# Part 2 run sheet: who may read what (Wed 11 Nov)

Companion for the second of the four "Creating your production application" sessions. Setup, the
order of commands, what to expect, and what to do when something breaks. Every number here comes from
the rehearsal on 10 Nov (a separate database, `acme_rehearsal`, Azure embeddings, `gpt-4.1-mini`),
recorded in `fallbacks/part2/demo-transcript.txt`.

- Code: `checkpoints/02-platform/` (run every script from the repo root)
- Deck: `slides/part2-platform.pptx` (source `slides/src/p2.js`, 40 slides: 32 presented, 8 reference)
- Step-by-step version: `part2-teaching-guide.md`
- Fallbacks: `instructor-notes/fallbacks/part2/` (15 screenshots, the transcript, the raw stream, the exercise solution)

---

## 1. The point

Monday the copy of the documents learned to stay true. Today: who may read which part of it, enforced
where it can't be forgotten. Three ideas, one per block:

1. The server decides who you are. Sign in once; a cookie stands for you; identity, company and
   groups are looked up on every request, never read from it.
2. The database decides what you may read. Access is a JOIN inside the search, live; Row-Level
   Security keeps companies apart; each process has its own database role.
3. A conversation keeps the rules. Every chat turn re-checks who you are and what you may read,
   including what its own memory may show.

Line to leave them with: one click fixed a leak, nothing was re-embedded, and the chat forgot what
the intern was no longer allowed to know.

### The opening, 2 minutes, then move

"Monday the copy stayed true by itself. Today the copy is true, but not everyone should see all of
it. Right now our intern can read the salary bands. We fix that live, with one click, and nothing gets
re-embedded." Then slide 2.

---

## 2. Before class (20 minutes)

New since the last pull, on your machine and theirs: `pip install -r requirements.txt` (adds
`langgraph-checkpoint-postgres`) and `db.py migrate` (adds `004_chat` and LangGraph's tables). The
dev database `acme` was migrated on 10 Nov.

`.env` for the session:

```
SOURCE=local                        # the access demo doesn't need Google; see "Drive instead" below
EMBEDDING_PROVIDER=azure            # what the dev index was built with
RETRIEVAL_STRATEGY=hybrid           # your .env says hybrid_rerank: it works (falls back to hybrid), but /health shows a note
ACME_SEED_PASSWORD=<one class password, 12+ characters>
```

The reset, in this order (a seed after the events would put Friday's register back):

```bash
docker compose up -d db
python checkpoints/02-platform/db.py seed --reset-passwords   # personas' groups, Friday's register (bands: employees), the class password
python checkpoints/02-platform/fake_drive.py reset             # Friday's files
python checkpoints/02-platform/fake_drive.py apply 1           # the 2026 expense policy
python checkpoints/02-platform/fake_drive.py apply 2           # Leave Policy v2
python checkpoints/02-platform/fake_drive.py apply 3           # Q3 notes withdrawn
python checkpoints/02-platform/fake_drive.py apply 5           # wiki footer. NOT 4: event 4 is "HR fixes the bands", the admin's live click
python checkpoints/02-platform/sync.py --apply                 # whatever it plans; 89 chunks at the end
```

Then:

- [ ] Nothing on port 8000 (`Get-NetTCPConnection -LocalPort 8000 -State Listen`).
- [ ] `python run_checkpoint.py 02-platform`. `http://localhost:8000/health`: `"retrieval": "hybrid"`,
      `"retrieval_note": null`, the model `gpt-4.1-mini`.
- [ ] Second terminal: `python checkpoints/02-platform/worker.py --interval 60`. `db.py status` shows a
      live worker.
- [ ] Two browser windows side by side: normal (the intern), private (the admin). Both signed in.
- [ ] Intern, Search: "salary range senior developer" returns the bands at #1, #3, #4. If not, see
      section 6, first row.
- [ ] Intern, Chat: empty list (`db.py seed` doesn't clear chats; delete old ones from a rehearsal with
      `docker compose exec db psql -U postgres acme -c "DELETE FROM chat_threads"`).
- [ ] `fallbacks/part2/` open in the editor. Editor and terminal zoomed to 18pt+. These tabs open:
      `app/auth/deps.py`, `app/rag/store_pg.py`, `app/assistant/workflow.py`, `app/assistant/state.py`.
- [ ] Don't sign in with a wrong password while testing: 5 failures lock that email for 15 minutes.

**Drive instead of local:** `SOURCE=drive` works too, but `db.py seed` with `SOURCE=drive` switches the
Acme tenant to the Drive folder. The access demo is identical. The team-dinner answer depends on
whether the 2026 expense policy is in the Drive folder (it isn't, unless you uploaded it): ask the
carry-over question instead.

---

## 3. Run of show (2 hours)

Same shape as Monday: three questions, a picture before any code, at most ~12 lines on a slide,
nothing typed live, a "what you should see" slide after every live step. Online: no questions to the
room; read the chat at each divider, at the break and at the end.

| Block | Slides | Min | Ends by | Live | Expect |
|---|---|---|---|---|---|
| Opening | 1–5 | 10 | 0:10 | none | the leak, Monday's four places → one database, the arc, the three questions |
| Q1 Who | 6–11 | 25 | 0:35 | sign in as the intern; My account; `/search?...&user=hr-partner`; a wrong password, then an unknown email | the Principal on screen; `?user=` ignored; the same 401 message twice. Fallback: transcript section Q1, screens 01–02 |
| Q2 What | 12–18 | 30 | 1:05 | two browsers: intern searches, admin unticks `employees` on the bands, intern searches again; admin gives and takes `hr`; Audit log | bands at #1, #3, #4, then none; back with `hr`; four audit rows. Fallback: screens 03–08 |
| Break | 19 | 10 | 1:15 | admin: intern back to employees + engineering; intern: Chat tab, New conversation | |
| Q3 Talk | 20–28 | 30 | 1:45 | chat: team dinner, client dinner; admin gives `hr`; new chat: salary range; admin takes `hr`; "And for a junior?"; reopen | $90, $150; $120,000 to $155,000; then "I don't have that information" and the first answer hidden. Fallback: screens 09–14 |
| Wrap | 29–32 | 10 | 1:55 | none | three ideas, limits, tonight, Friday |

If you are more than 10 minutes behind at the break: cut slide 26 (streaming is just text) to one
sentence, and show slide 23 (the graph's code) for one minute without opening the files. Never cut
slide 14 (access is a JOIN), the Q2 live demo, or the "access lost" half of the Q3 demo.

**Demo rule:** never debug in front of the room for more than 60 seconds. Say "here's what it does",
go to the next slide (it shows the output), fix it at the break.

### Introducing the code

Three code moments, nothing typed. Picture first, one sentence, the slide snippet, then the real file,
one function, zoomed in, Ctrl+G, read the one comment that matters, close it.

| Slide | File | Go to | The one thing to point at |
|---|---|---|---|
| 9 | `app/auth/deps.py` | line 35 (`get_principal`) | cookie in, Principal out, or 401 |
| 9 | `app/auth/service.py` | line 158 (`principal_for`) | the comment "Re-read on EVERY request" |
| 14 | `app/rag/store_pg.py` | line 134 (`search`), then 152 | the `EXISTS (... document_acl ...)` inside the same query |
| 15 | `app/db/migrations/002_security.sql` | line 46 | the policy loop: `tenant_id = app_tenant()` |
| 23 | `app/assistant/workflow.py` | line 26 (`build`) | four nodes, the conditional edge |
| 23 | `app/assistant/state.py` | lines 26 and 38 | `DeskState` (saved) vs `DeskContext` (given, never saved) |

Students write code tonight (the exercises), not during class.

### The live demos, exactly

**Q1 (slide 10).** `http://localhost:8000/login` → intern → My account. Address bar:
`http://localhost:8000/search?q=salary+range+senior+developer&user=hr-partner` → `"user": "intern@acme.test"`.
Sign out; intern with a wrong password; `nobody@acme.test` with anything: the same message both times.

**Q2 (slide 17).** Intern, Search, "salary range senior developer". Admin, Document access, "Engineering
Salary Bands (2026)": untick `employees`, tick `hr` and `managers`, Save ("live now"). Intern: Search
again. Admin, People, Engineering intern: tick `hr`, Save ("Live on their next question"). Intern:
Search. Admin: untick `hr`, Save. Intern: Search. Admin, Audit log.

Plan B without a browser (PowerShell, from the repo root; `$pw` is the class password):

```powershell
$i = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post http://localhost:8000/auth/login -WebSession $i -ContentType application/json -Headers @{"X-Acme-Request"="1"} -Body (@{email="intern@acme.test"; password=$pw} | ConvertTo-Json)
(Invoke-RestMethod "http://localhost:8000/search?q=salary%20range%20senior%20developer" -WebSession $i).results | Select doc_id, distance
```

**Q3 (slide 27).** Intern, Chat, New conversation: "How much can I spend per person on a team
dinner?", then "And for a client dinner?" (hover the retrieve chip: "Searched for: How much can I
spend per person on a client dinner?"). Admin, People: intern + `hr`. Intern, New conversation: "What
is the salary range for a Senior Developer?". Admin: intern − `hr`. Intern: "And for a junior?". Click
the conversation in the list to reopen it.

---

## 4. Numbers (rehearsed 10 Nov)

| Step | Output |
|---|---|
| Wrong password, and an unknown email | `401 Email or password is wrong.` both times |
| Right password | `200`, `Set-Cookie: acme_session=…; HttpOnly; Max-Age=604800; Path=/; SameSite=lax` |
| `/search?...&user=hr-partner` as the intern | `user: intern@acme.test`, `groups: employees, engineering` |
| `/search` with no cookie | `401 Sign in first.` |
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

---

## 5. Fallbacks (`fallbacks/part2/`)

`screens/01-login.png` to `15-sync-worker.png` (every step of the three demos, taken from the real UI),
`demo-transcript.txt` (every request and answer above), `chat-raw-stream.txt` (the SSE stream of one
turn, slide 26), `solutions/forget_thread.py` (tonight's exercise 2; don't share it tonight).

If the model is down: the chat answers "The AI model is not available right now…" and shows the
sources. Nothing is a 500. Teach the Q3 demo from screens 09–14.

---

## 6. If something breaks

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
| Anything else | | the reset in section 2, then start the block again |

---

## 7. Honest answers

- **Why move off ChromaDB?** Not because Chroma is bad: because access, people, companies and the
  index now need one place that enforces rules. ChromaDB can't JOIN a permissions table or hold a
  Row-Level Security policy.
- **Why sessions and not JWTs?** A server-side session can be ended instantly (a password change
  ends every other session; removing someone ends theirs). A JWT is valid until it expires unless you
  keep a denylist, which is a session table again. Its groups are also frozen at sign-in, and we
  re-read them on every request anyway, so a JWT would save nothing here. Where a JWT does belong:
  SSO (verify Google's or Entra's ID token, then create the same session) and service-to-service
  tokens. Library: PyJWT (`pip install "pyjwt[crypto]"`, `PyJWKClient` for the provider's keys);
  always pass `algorithms=[...]`, audience and issuer. Not python-jose (barely maintained); Authlib
  only for a full OAuth client or encrypted tokens. Reference slide "sessions or JWTs?".
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
  and streaming come with it, and Friday's tools and approvals run on the same graph.
- **Isn't the intern's title list a leak?** Members don't even see titles they can't read
  (`test_members_do_not_even_see_titles_they_cannot_read`).
- **The register is still in our database, not Drive's sharing.** Yes; reading Drive's sharing needs a
  second, admin-approved identity (Part 1, Reference). Groups typed in by an admin are the same gap.
