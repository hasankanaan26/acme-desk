# Wednesday, step by step (Part 2, online)

A simpler companion to `part2.md`. Same slides, same demos. Fewer new words, one main idea per
block, and clear notes on what is optional. Use `part2.md` for the exact commands, the numbers and
the "if something breaks" table.

Like Monday: a talk with live demos, no questions to the room, no quizzes, no polls. Students write
in the chat at any time; you read it at fixed points (each divider, the break, the end), so it never
interrupts a demo.

---

## The whole night in three sentences

If students leave able to say these three things, tonight worked:

1. The server decides who you are: you sign in once, and nothing in a request can change it.
2. The database decides what you may read, on every question, and an admin can change it with one click.
3. A conversation follows the same rules on every turn, even what it remembers.

Say these at the start, again after each block, and all three at the end.

## Six words for the chat

Paste this into the chat when the session starts:

```
Six words for tonight:
sign-in    proving who you are, once; then a cookie stands for you
session    the server's record of that sign-in
Principal  who is asking: you, your company, your groups, worked out by the server
access     which groups may read which document (one small table)
tenant     a company; Acme and Globex share one database, never their rows
thread     one conversation, saved in the database
```

Then say: "You'll hear other words tonight. These six are the ones that matter."

Avoid saying argon2id, RLS, RRF or checkpointer unless someone asks in the chat. If you do, add
"that's just the technical name for…" and the plain words.

## 20 minutes before class

Follow `part2.md` section 2. The short version:

- [ ] `pip install -r requirements.txt` and `db.py migrate` if you haven't since Monday.
- [ ] `.env`: `SOURCE=local`, `RETRIEVAL_STRATEGY=hybrid`, `ACME_SEED_PASSWORD` set.
- [ ] The reset: `db.py seed --reset-passwords`, `fake_drive.py reset`, `apply 1`, `2`, `3`, `5` (not 4),
      `sync.py --apply`. In that order.
- [ ] The API on port 8000, the worker in a second terminal.
- [ ] Two browser windows side by side: normal for the intern, private for the admin. Both signed in.
- [ ] Check: the intern's search "salary range senior developer" shows the bands.
- [ ] `fallbacks/part2/` open in the editor. Terminal and editor at 18pt.

Online only:

- [ ] A test screen share: can you read both browser windows side by side at that size? If not, plan
      to switch windows instead, and say which one you're in every time.
- [ ] Notifications off. The call's chat where you can see it while sharing.
- [ ] The six words ready to paste.

---

## Opening: 10 minutes (slides 1 to 5)

**Slide 1.** "Monday the copy stayed true by itself. Today: the copy is true, but not everyone should
see all of it. Right now our intern can read the salary bands. We fix that live, with one click."
Paste the six words.

**Slide 2, the problem.** Tell the story: the intern asks what a Senior Developer earns and gets the
numbers, cited. Then the two cracks, one sentence each: HR shared the bands by mistake; and Part 1
believed whoever the URL said you were.

**Slide 3.** Point at the four boxes, then the one database. "One place to keep it means one place to
protect it." Don't read the table names.

**Slide 4.** 30 seconds. Point at today's card.

**Slide 5.** Read the three questions. "We'll come back to this slide after each one."

Recap: "Tonight's problem: the right person, the wrong document."

---

## Question 1, who is asking? 25 minutes (slides 6 to 11)

Main idea: a badge printed at the door, not one you write yourself.

**Slide 6.** "Before we decide what someone may read, we have to know who they are."

**Slide 7, the badge.** Left: Part 1 believed `user=hr-partner`. Right: the same request today, and
the server ignores it. "If the request can say it, the request can lie about it."

**Slide 8, the cookie.** Walk the four boxes left to right: password once, check the hash, make a
session, every request after that. Then the three flags in one sentence each. Keep it to 6 minutes.

**Slide 9, the Principal.** Point along the chain: cookie, session, person, company, role, groups.
"That's the Principal: who is asking." Read the code. Open `deps.py` only if you're on time.
One line to land: "It's re-read on every request, so an admin's change is live on the next one."

**Slide 10, live.** Before each step, say what it will show. Sign in, My account, the `user=` URL,
the wrong password. If anything breaks, go to slide 11 and teach from it.

**Slide 11.** Read the transcript top to bottom. End with the red box: "The intern is who they say
they are, and they still find the salary bands. That's question 2."

Recap: "The server decides who you are." Then read the chat.

---

## Question 2, what may they read? 30 minutes (slides 12 to 18)

**This is the hardest part of tonight. Slow down here.**

Main idea: access is checked inside the search, by the database.

**Slide 12.** "Now the important part: what they may read, and who enforces it."

**Slide 13, two shortcuts.** A worked example, no code. Card 1: filter after the search: three of the
five slots were salary bands, so the intern gets two results and the forbidden text already left the
database. Card 2: tell the model not to: the text is in its context window. Card 3: filter inside
the search. Read the dark line at the bottom.

**Slide 14, the JOIN.** The key slide. Spend 6 minutes. Left: Part 1 stuck a flag on every chunk,
so changing access meant a sync. Then the SQL: point at the green lines only. "Keep a chunk only if
its document has an access row for one of my groups. Same query as the search. Change a row, and the
next question obeys it." Open `store_pg.py` at line 152 if you're on time.

**Slide 15, walls between companies.** "One table, two companies. Every transaction says which
company it's for, and the database adds that to every query. Forget it: no rows. That's fail closed."

**Slide 16, three keys.** Read the "Cannot" column only. Then the green box: Monday's gap is closed.

**Slide 17, live.** The best moment of the night. Don't rush it. Two windows: intern left, admin
right. Say what you're clicking as you click it: small clicks are hard to see on a shared screen.
1. Intern searches: three of five are the bands.
2. Admin unticks `employees`, ticks `hr` and `managers`, Save. Read the banner: "live now".
3. Intern searches again: gone. "Nobody ran a sync. Nothing was re-embedded."
4. Admin gives the intern `hr`: back. Takes it away: gone. "Same session, nobody signed out."
5. Admin opens the Audit log: both changes, with before and after.

**Slide 18.** Point at before and after, then the audit rows. "Who gave the intern the salary bands,
and when? Now there's an answer."

Recap: "The database decides what you may read." Then read the chat.

---

## Break: 10 minutes (slide 19)

Admin: put the intern back to `employees` and `engineering`. Intern: open the Chat tab, New
conversation. Read the chat. If several people say question 2 was confusing, say slide 14 again in
two sentences when you come back.

---

## Question 3, can we talk to it? 30 minutes (slides 20 to 28)

Main idea: a conversation is a copy too, so it has to follow the rules.

**Slide 20.** "Everything so far was one question, one answer. People ask follow-ups."

**Slide 21.** Four cards, one sentence each. Slow down on the fourth: "the rules hold on every turn,
including what the conversation remembers."

**Slide 22, the workflow.** Trace the four boxes: who is asking, find what you may read, the model
writes, wrap up. Then the yellow branch: "Nothing you may read answers it? We don't even call the
model." End with: "Our code decides every step. Friday, a model chooses: that's an agent."

**Slide 23, the code.** Optional depth. If you're behind, show it for one minute: "the four boxes, as
code." The one point that matters is the right side: who is asking is given to every turn and never
saved. Say it twice.

**Slide 24, memory.** Left: only the owner sees a conversation, even with its id. Right: the three
dots, read slowly. "You'll see this in a minute."

**Slide 25, two ways to search.** Keep it short: meaning and words, each inside the filter, merged by
position. The "Copilot" row is the example. Don't oversell: "on our small set, meaning does most of
the work; words rescue exact names."

**Slide 26.** Optional. One sentence if you're behind: "Streaming is lines of text over one response."

**Slide 27, live.**
1. Intern, team dinner: watch the chips light up and the words arrive. $90.
2. "And for a client dinner?": hover the retrieve chip to show the rewritten question. $150.
3. Admin gives `hr`. Intern, new conversation: the Senior Developer range.
4. Admin takes `hr` away. Intern: "And for a junior?" No information, and the chip says one document
   is no longer theirs. Click the conversation to reopen it: the first answer is hidden.
Say: "Same conversation, same session. The memory followed the admin's click."

If the model is slow or down, the chat says so and still shows the sources. Go to slide 28.

**Slide 28.** Left: follow-ups. Right: the hidden answer. "The model never saw the old numbers."

Recap: "A conversation keeps the rules." Then read the chat.

---

## Wrap: 10 minutes (slides 29 to 32)

**Slide 29.** The three sentences from the top of this guide, one per card.

**Slide 30.** Read the three gaps quickly.

**Slide 31, tonight.** "Exercise 1 is tonight again, on your laptop: everyone, first. Exercise 2 is the
real one: a test is already written and skipped; remove the skip, watch it fail, make it pass.
3 is a test you write. 4 is extra."

**Slide 32.** "Friday: the assistant starts doing things, and every rule from today still applies."
Post "pull the repo on Friday morning" in the chat. Read the chat one last time.

---

## If you're running late

Cut in this order:

1. Slide 26: one sentence.
2. Slide 23: show it for one minute, don't open the files.
3. Slide 16: read only the "Cannot" column.
4. Slide 25: the "Copilot" row only, skip the numbers.
5. Slide 30: skip it.

Never cut slide 14, the Q2 live demo, or the "access lost" half of the Q3 demo.

## If a demo breaks

Don't debug on the shared screen for more than 60 seconds. Say "here's what it would show", go to the
next slide (it has the output, from real screenshots), and fix it at the break. If you need to look at
something private, stop sharing first.
