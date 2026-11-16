# Live build: make the helpdesk tickets listable (about 8 minutes)

Rehearsed on 16 Nov against `acme_part3` (Monday's documents, local MiniLM, gpt-4.1-mini). Every
output below is real. Two files change, by four lines and one entry; nothing else.

The story: the router logs every list it can't answer. The backlog says people keep asking about
**tickets**. The tickets are already in Postgres, fields and all (the sync stores every CSV row's
columns in `chunks.fields`). What's missing is one decision: may the router list them, and by which
column? Write the test first (two labelled questions), watch it fail, make the one change, watch it pass.

## 0. Before class

- The app running on `acme_part3` (or the main database after `db.py migrate` + `sync.py --apply`).
- Ask the two ticket questions once in the Search tab (strategy `routed`) so the backlog has them,
  or just run step 1: asking is step 1.

## 1. The backlog says "tickets"

Search tab, strategy `routed`, as the intern: **"How many tickets did Maria Garcia report?"**

```
route: aggregation_unindexed: no record set holds 'tickets' -> searched instead, logged as a missing column (decided by the model)
router: Counting tickets reported by Maria Garcia, but no record set holds tickets.
```

Then **"Which tickets did James Wilson open?"** (same route), and in the terminal:

```
python checkpoints/03-retrieval/route_eval.py --misses
```
```
    2  tickets (no record set)                  e.g. "Which tickets did James Wilson open?"
    1  language (PEOPLE-DIRECTORY)              e.g. "Who speaks Spanish?"
```

Say: "Two kinds of gap. Language is a column the directory doesn't have: that's a data change at
HR. Tickets are a whole kind of record we can't list. And they're already in Postgres."

Show it (db-tour.sql, section 7, or):
```sql
SELECT id, fields FROM chunks WHERE doc_id = 'IT-HELPDESK-EXPORT' AND fields IS NOT NULL;
```
Five rows, every column, the contact already redacted.

## 2. Write the test first: two labelled questions

`shared/golden/golden_routes.json`, after R23 (add the comma after R23's line):

```json
    {"id": "R24", "question": "How many tickets did Maria Garcia report?", "route": "aggregation", "source": "IT-HELPDESK-EXPORT", "filters": {"reporter": ["Maria Garcia"]}},
    {"id": "R25", "question": "Which tickets did James Wilson open?", "route": "aggregation", "source": "IT-HELPDESK-EXPORT", "filters": {"reporter": ["James Wilson"]}}
```

```
python checkpoints/03-retrieval/route_eval.py --router llm --details
```
```
  R24  aggregation reporter=Maria Garcia in IT-HELPDESK-EXPORT   WRONG: unindexed (tickets)
  R25  aggregation reporter=James Wilson in IT-HELPDESK-EXPORT   WRONG: unindexed (tickets)
  model: 23/25 right  (2 a list sent to search)
```

Optional, if you want the lint to speak: `pytest checkpoints/03-retrieval/tests/test_router_llm.py -k labelled`
fails with `R24: IT-HELPDESK-EXPORT is not in router.ROUTABLE`.

## 3. The change: one entry

`checkpoints/03-retrieval/app/rag/router.py`, in `ROUTABLE`:

```python
ROUTABLE: dict[str, dict] = {
    "PEOPLE-DIRECTORY": {"about": "the team directory, one row per person",
                         "filters": ("office", "department", "role")},
    "IT-HELPDESK-EXPORT": {"about": "IT helpdesk tickets, one row per ticket",
                           "filters": ("reporter",)},
}
```

Why only `reporter`: it groups tickets (one person, many tickets). `ticket_id` points at one ticket
(pointwise: search finds it), `summary` and `resolution` are free text (search), `contact` is
redacted, and `opened` is a date: equality on a date is rarely what anyone asks ("in October" is a
range). Saying out loud which columns are filters, and why, is the design decision.

```
python checkpoints/03-retrieval/route_eval.py
```
```
  R24  aggregation reporter=Maria Garcia in IT-HELPDESK-EXPORT   WRONG: pointwise     ok
  R25  aggregation reporter=James Wilson in IT-HELPDESK-EXPORT   WRONG: pointwise     ok
  rules: 11/25 right  (7 a list sent to search, ...)
  model: 25/25 right
```

Say: "The model went from 23 to 25. The rules didn't move: they only ever knew the directory. No
prompt edit, no new SQL, no migration: the menu and the lookup already read whatever ROUTABLE says."

## 4. In the app

**Restart the app** (Ctrl+C, `python run_checkpoint.py 03-retrieval`). On this Windows machine the
auto-reload reported "Reloading" and kept serving the old code twice on 16 Nov: don't trust it.

Search tab, `routed`, "How many tickets did Maria Garcia report?":
```
route: aggregation on {'reporter': ['Maria Garcia']} -> 1 matching record(s), all of them (decided by the model)
router lookup: IT-HELPDESK-EXPORT where fields->>'reporter' in ['Maria Garcia']
```
One result: IT-4101, the VPN ticket. The menu the model saw now has a second block:
```
- IT-HELPDESK-EXPORT: IT helpdesk tickets, one row per ticket (5 rows)
    reporter: David Kim, James Wilson, Maria Garcia, Priya Patel, Tom Baker
```

## 5. Tests

```
pytest checkpoints/03-retrieval/tests/test_router_llm.py checkpoints/03-retrieval/tests/test_strategies.py -q
```
43 pass, before and after the change (the router tests pin their own record sets; the route-set
lint reads the real ROUTABLE, so R24/R25 are checked against the tickets' real reporters).

## Undo (to rehearse again)

`git checkout -- checkpoints/03-retrieval/app/rag/router.py shared/golden/golden_routes.json`
(only if those files hold nothing else you want), and delete `checkpoints/03-retrieval/runs/router_misses.jsonl`.

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Still `no record set holds 'tickets'` after step 3 | the app didn't reload | restart it |
| `route: pointwise` for the ticket questions in step 1 | an old prompt in the running app | restart it |
| `model: 23/25` after step 3 | a typo in the doc id (it must match the register: `IT-HELPDESK-EXPORT`) | fix the key; `("reporter")` without the comma is fine, the code accepts a string |
| `no model`: everything says "decided by the rules" | no key / quota | the rules can't list tickets at all: show this file's outputs |
