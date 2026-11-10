# Tonight, step by step (Part 1, online)

A simpler companion to `part1.md`. Same slides, same demos. The difference: fewer new words, one main
idea per block, and clear notes on what is optional. Use `part1.md` only for the exact commands, the
numbers, and the "if something breaks" table.

The session is online, and it is a talk with live demos: no questions to the room, no quizzes, no
polls. Wherever an older version of this plan asked the room something, you now say the answer
yourself, or walk through a worked example. Students can write in the chat at any time, and you
read it at fixed points (the end of each block and the break), so it never interrupts a demo.

---

## The whole night in three sentences

If students leave able to say these three things, tonight worked:

1. A connector is a plug: one small piece of code that knows how to read one place, like Google Drive.
2. Check the cheap thing first: only pay to re-read a file when it really changed.
3. A timer runs it: nobody has to press a button.

Say these at the start, say them again after each block, and say all three at the end.

## Six words for the chat

Paste this into the chat when the session starts, and pin it if your platform allows. Every time
you use one of the words, say it slowly.

```
Six words for tonight:
index      our saved copy of the documents; the assistant answers from this, not from the files
sync       one run that updates the copy
connector  the code that reads one source (a folder, Google Drive)
label      a short code that changes when a file changes; Google gives it to us for free
plan       what the sync will do to each file, shown before it does anything
tick       one run of the timer
```

Then say: "You'll hear other words tonight. These six are the ones that matter."

Avoid saying eTag, md5Checksum or blue/green unless someone asks in the chat. If you do say one,
add "that's just the technical name for the label".

## 20 minutes before class

Follow the checklist in `part1.md` section 2. The short version:

- [ ] `.env` has `SOURCE=drive` and `SYNC_INTERVAL_SECONDS=0`.
- [ ] Nothing running on port 8000.
- [ ] `drive_admin.py check` says READY (Leave Policy says 5, the Q3 notes are not in the trash).
- [ ] Empty index: `sync.py --wipe`.
- [ ] Tabs open: the Drive folder, the Leave Policy Doc, `/ui#sync`, this file.
- [ ] `fallbacks/part1/` open in the editor. Terminal and editor zoomed to 18pt.
- [ ] Do not press Sync or Run now before class.

Online only:

- [ ] Do a test screen share. Check the terminal at 18pt is readable in the shared view.
- [ ] Notifications off (mail, chat apps, Windows). Close any tab you don't want on screen.
- [ ] The call's chat on a second screen, or in a window you can see while sharing.
- [ ] The six words ready to paste.
- [ ] Decide how you switch between the slides and the terminal (share the whole screen, or switch
      windows) and try it once.

---

## Opening: 10 minutes (slides 1 to 5)

**Step 1. Slide 1.** Say:
"Friday ran short and I owe you the ending. Some of you told me it was getting complicated and hard
to follow. That's fair, so tonight is built differently: three ideas, one at a time, and I'll tell
you clearly which parts are optional. If you get lost, write it in the chat. I'll read the chat at
the end of every block."
Paste the six words into the chat.

**Step 2. Slide 2, the problem.** Tell the story: on Friday HR changed the vacation rule from 5 days
to 10. On Monday an employee asks the assistant, and it says 5.
Then say the answer yourself: "The document is right, so why is the answer wrong? Because the
assistant doesn't read the document. It reads its saved copy, the index, and the copy is old."

**Step 3. Slide 3, the pipeline.** Point with the cursor at the two halves. "The left half makes the
copy. The right half answers questions. Tonight is only about the left half." Say "index" and "sync"
slowly: they're in the chat.
Then point at the dark box: "This is one chunk in the index. Its text says 5 days, and it will keep
saying 5 until something replaces it. That's tonight's problem in five lines." Skip the vector line.

**Step 4. Slide 4.** 30 seconds. Point at tonight's card and move on.

**Step 5. Slide 5.** Read the three questions. "We'll come back to this slide after each one."

Recap before moving on, in one sentence: "Tonight's problem: the copy gets old."

---

## Question 1, how do we read the documents? 25 minutes (slides 6 to 11)

Main idea: a connector is a plug.

**Step 6. Slide 6.** Divider. One sentence: "Our files live in Google Drive. How does our code read them?"

**Step 7. Slide 7.** Use the library picture: the catalogue (what files are there), the book (the
file itself), the borrowing card (who may read it). Don't read the function names out loud.
Then say: "We use the first one on every run. The second one is the expensive one, and question 2
is about avoiding it."

**Step 8. Slide 8, the plug.** Point at the picture: different sources, one socket, and the rest of
the app doesn't care which source it got. Read the 10 lines of code on the slide.
Open `connector.py` at line 58 only if you're on time. Online you can't see faces, so if you're
unsure, skip it.
Read the line at the bottom right: "If your company uses SharePoint, you write one new class.
Nothing else changes."

**Step 9. Slide 9.** Keep it to 2 minutes. "The program that runs at night can't log in as me. It
has its own robot account that can only read one folder. Like a visitor badge that opens one door."
Point at the code strip: "That's the whole sign-in: its own key file, kept out of git, and one
word that matters, READONLY." Then move on.

**Step 10. Slide 10, live.** Run the three commands from `part1.md`. Before each one, say what
it will show. If anything breaks, go straight to slide 11 and teach from it.

**Step 11. Slide 11.** Explain only three lines:
- 18 added: the copy was empty, so everything is new.
- 1 quarantined: a scanned picture with no text in it, so we tell a human.
- 1 skipped: a draft, and drafts must never answer questions.

Then ask the vacation question in the UI (you type it into the assistant): 5 days. "Right, for now."

Recap: "A connector reads one source, always in the same way."
Then read the chat and answer anything that came in.

---

## Question 2, how do we know what changed? 30 minutes (slides 12 to 17)

**This is the hardest part of tonight. Slow down here.** If you have to rush somewhere, don't let it
be here.

Main idea: check the label before you open the box.

**Step 12. Slide 12.** "HR changes one number in one file. What should the next run do?" This is
rhetorical: carry straight on to the next slide.

**Step 13. Slide 13, the lazy fix.** Do the maths out loud yourself: "A real company has 20,000
files. Redo everything every hour and that's 480,000 downloads a day. And how many of those files
changed today? A handful." Then read the dark bar: "What we need is a way to tell that a file
changed, without downloading it."

**Step 14. Slide 14, the parcel.** Spend 6 to 8 minutes here. This is the key idea of the night.
Three steps, cheapest first:
1. Read the label. Free. Same label as last time? Stop.
2. Open the box. Download the file and look at the text. Same text? Stop.
3. Pay. Only now do we embed the new text, and this is the only step that costs money.

The slide is the drawing: trace the three boxes left to right with the cursor as you talk.
Each box has one dark line of code. Read them in order without explaining the syntax: "compare two
labels, compare two texts, pay." The first two come back on slide 17, inside the full ladder.
One worked example to finish: "Someone re-saves a file and only the footer changes. The label
moved, so we open the box. But the text is the same, so we stop at step 2 and pay nothing."

**Step 15. Slide 15, the ladder.** The slide shows seven actions. Make it smaller for them:
"Four of these matter: add, change, remove, unchanged. The other three are special cases: skip is a
draft, quarantine is a scan with no text, touch is a file re-saved with the same text. You don't
need to memorise them."

**Step 16. Slide 16, six real cases.** A worked example, not an exercise. Go down the six rows. For
each one, say the event, then the action, then why, in one sentence. Slow down on two rows:
- Row 3 (footer only): "It looks like a change, and it isn't. One download, zero embedding."
- Row 6 (nobody touched it): "Same label, so we never even download it. That's most files, most days."

End with: "Rows 1 and 2 are what I'll do live after the break: a change and a remove."

**Step 17. Slide 17, the code.** Optional. If you're behind, show the slide for one minute:
"This is the same ladder, written in Python. Read it tonight." Don't open `sync.py`.

Recap: "The cheapest check is the label."

---

## Break: 10 minutes (slide 18)

**Step 18.** Start the API with `SYNC_INTERVAL_SECONDS=60` (command in `part1.md`). Check the
Scheduler card is counting down.

Read the chat. If several messages say the first hour was confusing, slow down the second half and
cut more of the optional parts (see "If you're running late").

---

## Question 3, who runs it at 3 a.m.? 30 minutes (slides 19 to 24)

Main idea: a timer runs the same sync, again and again.

**Step 19. Slide 19.** "So far I typed the command. Who types it at 3 a.m.? Nobody."

**Step 20. Slide 20.** Cut this to one sentence: "There are fancier ways, like queues and webhooks.
Tonight we use a simple timer." Move on. That's one less topic for them to carry.

**Step 21. Slide 21, the timer.** "A tick is the same sync you just saw, run every minute." Point
at three things only: it's the same sync, only one runs at a time, and if a run fails it tries
again next minute. Open `scheduler.py` only if you have time.

**Step 22. Slide 22, live.** This is the best moment of the night. Don't rush it.
1. Say what should happen: "From rows 1 and 2: the Leave Policy will be a change, the Q3 notes a
   remove. Let's see if the tick agrees."
2. Edit the Doc from 5 to 10. Trash the Q3 notes. Say what you're clicking as you do it: on a
   shared screen, small clicks are easy to miss.
3. Wait for the tick, or press Run now.
4. Ask the vacation question again in the UI.

If Drive fails, use Plan B from `part1.md` section 5. The numbers are the same.

**Step 23. Slide 23.** "Two actions out of twenty, and they're exactly the two we expected: change
and remove. Sixteen files weren't even downloaded."

**Step 24. Slide 24.** Close the loop: "Same question as the start of class. Now it says 10. Nobody
typed anything."

Then read the chat.

---

## Wrap: 10 minutes (slides 25 to 28)

**Step 25. Slide 25.** Say the three ideas yourself, one sentence each, pointing at each card.
These are the three sentences from the top of this guide.

**Step 26. Slide 26.** Read the three gaps quickly. Don't explain them in depth.

**Step 27. Slide 27, tonight's exercises.** Be very clear about what's expected:
"Exercise 1 is the one I expect from everyone. It's tonight's class again, on your laptop. Exercises
2 and 3 are if you have time. Exercise 4 is extra."

**Step 28. Slide 28.** One line about Wednesday: "Wednesday: who is allowed to see which document."
Post "pull the repo on Wednesday morning" in the chat. Read the chat one last time and answer what's
there before you end the call.

**After the call (optional).** If you want feedback on the pace, post a short anonymous form in the
group chat afterwards. Nothing happens live.

---

## If you're running late

Cut in this order:

1. Slide 20: one sentence (already in the plan above).
2. Slide 17: show the slide for one minute, don't open the file.
3. Slide 16: say only rows 1, 2 and 3.
4. Slide 26: skip it.
5. Slide 9: one sentence.

Never cut slide 14 or the live demo on slide 22.

## If a demo breaks

Don't debug on the shared screen for more than 60 seconds. Say "here's what it would show", go to
the next slide (it has the output on it), and fix it at the break. If you need to look at something
private while you fix it, stop sharing first.
