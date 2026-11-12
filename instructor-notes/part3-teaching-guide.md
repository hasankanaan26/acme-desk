# Friday, step by step (Part 3, online)

A simpler companion to `part3.md`. Same slides, same demo, one main idea per block. Use `part3.md`
for the exact commands, the numbers and the "if something breaks" table.

Wednesday was retrieval by eye, in the lab. Tonight is the same idea on Acme Desk itself, measured: two
cuts of the documents, two more techniques, and a scoreboard. The night runs about 1 h 30.

Like Monday and Wednesday: a talk with a live demo, no questions to the room, no quizzes, no polls.
Students write in the chat at any time; you read it at fixed points (the dividers, the break, the end).

---

## The whole night in three sentences

1. Measure by kind of question: no technique wins every kind, and the average hides it.
2. Measure what the model needs, what it costs, and leaks at zero.
3. Correct, not only faithful: tell a retrieval miss from a generation miss.

Say these at the start, after the break, and all three at the end.

## Seven words for the chat

```
Seven words for tonight:
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
- [ ] Online: a test share, notifications off, the seven words ready to paste.

---

## Opening: 6 minutes (slides 1 to 4)

**Slide 1.** "Wednesday we looked. Tonight we measure." Paste the seven words.

**Slide 2.** 30 seconds on the arc: the source, retrieval by eye, measured retrieval, shipping it.

**Slide 3.** The three sentences.

**Slide 4, Wednesday by eye.** The billing question: dense said "at least one reviewer", rerank said
"two". "That was one question. Does it hold for the next twenty-eight? Let's find out."

---

## Two cuts of the same documents: 20 minutes (slides 5 to 10)

Main idea: how you cut the documents decides what search can find, and you can keep two cuts.

**Slide 6, sections vs small chunks.** The Week 1 checklist as one section, and as its small chunks.
Point at what each small chunk lost: the heading "Week 1".

**Slide 7, the trade-off.** Small: precise, little context. Section: context, but its vector is an
average of everything in it.

**Slide 8, match small, return big.** Follow the arrows. The one thing to stress: the sections are
fetched by a second query, and it goes through the access filter again. "Better search never means
more access."

**Slide 9, built by the sync.** The lab built small chunks while you asked a question. Here the API
can't write the index, and that's on purpose: the worker writes both cuts in the same transaction, so
they can't drift apart. Read the dozen lines only if the chat asks.

**Slide 10, read your chunks.** "IT helpdesk tickets (October 2026): Fixed." is a real small chunk.
Then the numbers: 89 sections, 275 characters on average, and 50 of them fit in one small chunk. "Keep
that number: it explains a surprise after the break."

Recap: two cuts, one sync, one filter. Read the chat.

---

## HyDE: 4 minutes (slide 11)

**Slide 11.** A question doesn't look like its answer, so the model writes a fake answer and we search
with that. The price: one model call before every search. The trap: the distance is to the fake
answer, so it looks surer than it is. "We'll see whether it's worth it on the scoreboard."

---

## A scoreboard you can trust: 20 minutes (slides 12 to 17)

Main idea: decide what "right" means before you look at any result.

**Slide 13, too kind.** "Right document in the top 5" gives `small` full marks on the checklist
question, and it handed over one sentence of a five-item list. So we count the words the answer needs.

**Slide 14, one question.** Read S09 aloud: a person, a question, what the context needs, what the
answer must say. The person matters: every question is asked as a real account.

**Slide 15, seven kinds.** One example each. Pause on *unanswerable*: there, the right answer is "I
don't know", and the intern asking for the salary bands must get nothing.

**Slide 16, the numbers in plain words.** Hit@1: the first result is enough. The "how high" number.
Calm: on a question nothing answers, the search doesn't look sure. Then the cost columns and leaks.

**Slide 17, freeze it and lint it.** Two rules: never change a question because a technique missed it,
and a test checks every needed word really is in its document. "A test set that rots measures the
wrong thing with confidence."

Recap: needs, not documents; seven kinds; frozen. Read the chat.

---

## Break: 10 minutes (slide 18)

Read the chat. Run `scoreboard.py` once in the terminal. Check the intern is still signed in.

---

## Live: the scoreboard, small vs parent: 16 minutes (slides 19 to 23)

**Slide 19, live.** Run the scoreboard (`part3.md`, "The live demo, exactly", step 1). Read three
tables, not seven: casual, identifier, whole-section. Then "Who wins what", then "Leaks: 0".

**Slide 20.** The grid, if the run was slow or you want it bigger.

**Slide 21, the average lies.** Over every question, dense looks best. Table by table, hybrid wins
three and keyword one. "Which search is best? Wrong question. Best for which kind of question?"

**Slide 22, live in the browser.** Steps 2.1 to 2.4 in `part3.md`: the first-week question with `small`
then `parent` (one sentence vs the whole list, and "Matched by the small chunk"), then the billing
question with `dense` then `parent` (the handbook comes back, matched by "two reviewers").

**Slide 23, why parent wins nothing here.** Back to slide 10's number: most of Acme's sections already
fit in one small chunk, so parent returns what dense returns. It does help when a section is long (the
handbook page). "The scoreboard's advice for these documents: don't pay for it. For your documents,
measure."

Recap: the first sentence of the night. Read the chat.

---

## Correct, not only faithful: 9 minutes (slides 24 to 27)

**Slide 25, the stale FAQ.** Every technique ranks the FAQ's "up to 5 days" above the policy's "10
days" (changed Monday). An answer built on it is perfectly faithful to its context, and wrong.

**Slide 26, whose fault.** Retrieval miss: the context never had the facts, no prompt could fix it.
Generation miss: it had them and the model fumbled. Read this morning's counts from
`answers-class.txt` (`part3.md`, section 4). Fix the kind you have most of first.

**Slide 27, sure of itself.** "Parental leave in 2027?" Every technique finds today's policy at high
confidence. A distance can say "about this topic"; it can't say "answers this question".

---

## Wrap: 5 minutes (slides 28 to 30)

**Slide 28.** The three sentences, one per card.

**Slide 29, tonight.** "One and two for everyone, three if you have time; four and five are stretch."

**Slide 30, Monday.** "Monday we make it safe to ship, and the scoreboard you saved tonight becomes
the gate: if a change makes a table worse, it doesn't ship." Post "pull the repo Monday morning" in
the chat. Read the chat one last time.

---

## If you're running late

Cut in this order:

1. Slide 11: one sentence ("search with a fake answer; costs a call; looks surer than it is").
2. Slide 22, steps 3 and 4 (billing): say it, show the screenshot.
3. Slide 9: skip the code.
4. Slide 27.

Never cut the scoreboard (19 to 21), small vs parent on the first-week question (22, steps 1 and 2),
or the stale FAQ (25).

## If a demo breaks

Don't debug on the shared screen for more than 60 seconds. Say "here's what it would show", go to the
next slide (real output), and fix it at the break. If you need to look at something private, stop
sharing first.
