# Friday, step by step (Part 3, online)

A simpler companion to `part3.md`. Same slides, same demo, one main idea per block. Use `part3.md`
for the exact commands, the numbers and the "if something breaks" table.

Wednesday was retrieval by eye, in the lab. Tonight is the same idea on Acme Desk itself, measured: two
cuts of the documents, two more techniques, and a scoreboard. Since 15 Nov it opens with lists and
routing (the router slides Wednesday's deck had and the class never saw), and the router is measured
next to the scoreboard. The night runs about 1 h 50, or about 1 h 35 with the cuts at the end.

Like Monday and Wednesday: a talk with a live demo, no questions to the room, no quizzes, no polls.
Students write in the chat at any time; you read it at fixed points (the dividers, the break, the end).

---

## The whole night in three sentences

1. Measure by kind of question: no technique wins every kind, and the average hides it.
2. Measure what the model needs, what it costs, and leaks at zero.
3. Correct, not only faithful: tell a retrieval miss from a generation miss.

Say these at the start, after the break, and all three at the end. Before the first one, the night
opens with a fourth, shorter idea: **some questions want a list, so decide the question's shape
before you search.**

## Nine words for the chat

```
Nine words for tonight:
aggregation   a question whose answer is every matching record ("who works remotely?")
router        one decision before the search: which path does this question take?
small chunk   a sentence or two of a section, searched on its own
parent        search the small chunks, hand the model their whole section
HyDE          search with an answer the model made up
need          the words the answer can't do without, from the right document
Hit@1         the first result alone holds everything the answer needs
leak          a result from a document this person may not read (must be 0)
faithful      the answer agrees with its context (it can still be wrong)
```

Avoid saying MRR, RRF or cross-encoder unless someone asks. If you do, add "that's the technical
name for…" and the plain words: "how high the right answer usually ranks".

## 15 minutes before class

Follow `part3.md` section 2. The short version:

- [ ] This morning's four commands done; `scoreboard-class.txt` and `answers-class.txt` saved.
- [ ] Acme Desk on port 8000, local embeddings (`/health`), signed in as the intern, Search tab, top_k 3.
- [ ] One scoreboard run in the terminal (loads the reranker).
- [ ] `fallbacks/part3/` open. Terminal and editor at 18pt.
- [ ] A model key in `.env`; `route_eval.py` run once (caches the router's answers); Search tab,
      `routed`, "Who works remotely?": the trace says "decided by the model".
- [ ] Online: a test share, notifications off, the nine words ready to paste.

---

## Opening: 6 minutes (slides 1 to 4)

**Slide 1.** "Wednesday we looked. Tonight we measure." Paste the nine words.

**Slide 2.** 30 seconds on the arc: the source, retrieval by eye, measured retrieval, shipping it.

**Slide 3.** The three sentences.

**Slide 4, Wednesday by eye.** The billing question: dense said "at least one reviewer", rerank said
"two". "That was one question. Does it hold for the next twenty-eight? Let's find out. But first, one
kind of question no ranking can fix."

---

## Lists and routing: 15 minutes (slides 5 to 12)

Main idea: some questions want every matching record, and top-k can never return that. Decide the
question's shape first, then take the right path. That decision is a router.

**Slide 6, why search can't list.** "Who works remotely?" Plain search returns the remote-work policy
and the FAQ: text *about* remote work. The answer is three rows of the team directory, office = Remote.
"Search answers 'which passage is about this?'. A list asks 'which rows match this?'."

**Slide 7, the shape of the question.** Pointwise: the answer is in a passage, so search. Aggregation:
the answer is every matching record, so look them up, every match, no k. Unindexed: a list about
something the directory doesn't store ("who speaks Spanish?"), so search, and write the question down.
"Top-k is a budget: if the answer is 30 people, top 5 can never hold it." A router decides once; an
agent loops. Tonight is a router.

**Slide 8, version one: rules.** Three checks: asks for a group (who, list, how many), talks about
belonging (work, office, team), names a value that's really in the directory. All three: look the rows
up. Free, instant, testable. "And it reads words, not meaning."

**Slide 9, the rules' misses.** Read two rows aloud: "Show me all remote staff" (no who / list: sent to
search) and "Who do I talk to on the Engineering team about a deploy?" (who + team + Engineering: every
engineer, not a contact). 11 of 23 right. "Adding words to the regex breaks other questions. It needs
something that reads meaning."

**Slide 10, version two: a plan, checked by code.** Four boxes: a menu from the data, the model writes
a plan, code checks it, code runs it. Stress the checks: a column the directory lacks, a value no row
has ("London" means search, never an empty list), "remote" becomes "Remote", and no model means the
rules decide. "The model reads the question; code decides what runs."

**Slide 11, live.** `part3.md`, "The live demo, exactly", step 0: dense vs routed on "Who works
remotely?", then "Show me all remote staff", then the deploy question. Open the trace each time.

**Slide 12, the trace.** "Every route says who decided it and why. Part C measures how often it's right."

Recap: lists need a lookup; decide the shape first; a model's plan, checked by code. Read the chat.

---

## Two cuts of the same documents: 20 minutes (slides 13 to 18)

Main idea: how you cut the documents decides what search can find, and you can keep two cuts.

**Slide 14, sections vs small chunks.** The Week 1 checklist as one section, and as its small chunks.
Point at what each small chunk lost: the heading "Week 1".

**Slide 15, the trade-off.** Small: precise, little context. Section: context, but its vector is an
average of everything in it.

**Slide 16, match small, return big.** Follow the arrows. The one thing to stress: the sections are
fetched by a second query, and it goes through the access filter again. "Better search never means
more access."

**Slide 17, built by the sync.** The lab built small chunks while you asked a question. Here the API
can't write the index, and that's on purpose: the worker writes both cuts in the same transaction, so
they can't drift apart. Read the dozen lines only if the chat asks.

**Slide 18, read your chunks.** "IT helpdesk tickets (October 2026): Fixed." is a real small chunk.
Then the numbers: 89 sections, 275 characters on average, and 50 of them fit in one small chunk. "Keep
that number: it explains a surprise after the break."

Recap: two cuts, one sync, one filter. Read the chat.

---

## HyDE: 4 minutes (slide 19)

**Slide 19.** A question doesn't look like its answer, so the model writes a fake answer and we search
with that. The price: one model call before every search. The trap: the distance is to the fake
answer, so it looks surer than it is. "We'll see whether it's worth it on the scoreboard."

---

## A scoreboard you can trust: 20 minutes (slides 20 to 25)

Main idea: decide what "right" means before you look at any result.

**Slide 21, too kind.** "Right document in the top 5" gives `small` full marks on the checklist
question, and it handed over one sentence of a five-item list. So we count the words the answer needs.

**Slide 22, one question.** Read S09 aloud: a person, a question, what the context needs, what the
answer must say. The person matters: every question is asked as a real account.

**Slide 23, seven kinds.** One example each. Pause on *unanswerable*: there, the right answer is "I
don't know", and the intern asking for the salary bands must get nothing.

**Slide 24, the numbers in plain words.** Hit@1: the first result is enough. The "how high" number.
Calm: on a question nothing answers, the search doesn't look sure. Then the cost columns and leaks.

**Slide 25, freeze it and lint it.** Two rules: never change a question because a technique missed it,
and a test checks every needed word really is in its document. "A test set that rots measures the
wrong thing with confidence."

Recap: needs, not documents; seven kinds; frozen. Read the chat.

---

## Break: 10 minutes (slide 26)

Read the chat. Run `scoreboard.py` once in the terminal. Check the intern is still signed in.

---

## Live: the scoreboard, small vs parent: 16 minutes (slides 27 to 31)

**Slide 27, live.** Run the scoreboard (`part3.md`, "The live demo, exactly", step 1). Read three
tables, not seven: casual, identifier, whole-section. Then "Who wins what", then "Leaks: 0".

**Slide 28.** The grid, if the run was slow or you want it bigger.

**Slide 29, the average lies.** Over every question, dense looks best. Table by table, hybrid wins
three and keyword one. "Which search is best? Wrong question. Best for which kind of question?"

**Slide 30, live in the browser.** Steps 2.1 to 2.4 in `part3.md`: the first-week question with `small`
then `parent` (one sentence vs the whole list, and "Matched by the small chunk"), then the billing
question with `dense` then `parent` (the handbook comes back, matched by "two reviewers").

**Slide 31, why parent wins nothing here.** Back to slide 18's number: most of Acme's sections already
fit in one small chunk, so parent returns what dense returns. It does help when a section is long (the
handbook page). "The scoreboard's advice for these documents: don't pay for it. For your documents,
measure."

Recap: the first sentence of the night. Read the chat.

---

## Live: the router, measured: 5 minutes (slides 32 to 33)

Main idea: the router is a decision, so it gets its own frozen test set, like the scoreboard.

**Slide 32, live.** `part3.md`, step 2b: `route_eval.py --details`. 23 questions labelled with their
route before either router ran. Read the two summary lines: rules 11 of 23, the model 22 of 23.

**Slide 33, the numbers.** The rules make both expensive mistakes (5 lists sent to search, 4 passages
turned into lists); the model makes neither. Its one miss, R22 ("Who joined the company this year?"):
its own reason says the directory has no start date, and it still said pointwise. "Don't edit the
prompt to fix R22: tune to the set and it stops measuring anything. Add questions instead." The price:
one model call before every search, about 1.4 s here. "Is 22 out of 23 worth that? Same question as the
scoreboard: quality, then cost."

---

## Correct, not only faithful: 9 minutes (slides 34 to 37)

**Slide 35, the stale FAQ.** Every technique ranks the FAQ's "up to 5 days" above the policy's "10
days" (changed Monday). An answer built on it is perfectly faithful to its context, and wrong.

**Slide 36, whose fault.** Retrieval miss: the context never had the facts, no prompt could fix it.
Generation miss: it had them and the model fumbled. Read this morning's counts from
`answers-class.txt` (`part3.md`, section 4). Fix the kind you have most of first.

**Slide 37, sure of itself.** "Parental leave in 2027?" Every technique finds today's policy at high
confidence. A distance can say "about this topic"; it can't say "answers this question".

---

## Wrap: 5 minutes (slides 38 to 40)

**Slide 38.** The three sentences, one per card.

**Slide 39, tonight.** "One and two for everyone, three if you have time; four and five are stretch."

**Slide 40, Monday.** "Monday we make it safe to ship, and the scoreboard you saved tonight becomes
the gate: if a change makes a table worse, it doesn't ship." Post "pull the repo Monday morning" in
the chat. Read the chat one last time.

---

## If you're running late

Cut in this order:

1. Slide 19: one sentence ("search with a fake answer; costs a call; looks surer than it is").
2. Slide 30, steps 3 and 4 (billing): say it, show the screenshot.
3. Slide 17: skip the code.
4. Slide 37.

Never cut routing's first live steps (slide 11, steps 1 and 2), the scoreboard (27 to 29), small vs
parent on the first-week question (30, steps 1 and 2), the router's numbers (33), or the stale FAQ (35).

To finish near 1 h 35 instead of 1 h 50, take all four cuts above and also skip the grid (28) when the
live scoreboard was readable.

## If a demo breaks

Don't debug on the shared screen for more than 60 seconds. Say "here's what it would show", go to the
next slide (real output), and fix it at the break. If you need to look at something private, stop
sharing first.
