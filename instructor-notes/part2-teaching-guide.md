# Wednesday, step by step (Part 2, online)

A simpler companion to `part2.md`. Same slides, same demo, one main idea per block. Use `part2.md`
for the exact commands, the numbers and the "if something breaks" table.

Re-planned on 11 Nov: a 10-minute warm-up on Google API calls, then the rest of the night on
retrieval techniques, tried live in the RAG weeks' checkpoint 6 app (the "lab", port 8001). The
platform block (sign-in, access, companies) was cut; the chat and the platform are in the reference
slides. The night runs about 1 h 30.

Like Monday: a talk with a live demo, no questions to the room, no quizzes, no polls. Students write
in the chat at any time; you read it at fixed points (the divider, the break, the end).

---

## The whole night in three sentences

1. Plain top-k misses in a few typical ways; pick the fix by the kind of miss.
2. Every fix has a price; pay only for a miss you have seen, then measure it.
3. Better search never means more access: every technique searches as you.

Say these at the start, after the break, and all three at the end.

## Six words for the chat

```
Six words for tonight:
top-k        plain search: the k closest chunks to the question
multi-query  ask the question several ways, merge the lists
rerank       a second, slower model that re-orders the top 20
contextual   give each chunk a line about where it came from
router       one decision before the search: which path fits this question
agentic      the model decides when to search again, within a budget
```

Avoid saying RRF, cross-encoder or MRR unless someone asks in the chat. If you do, add "that's just
the technical name for…" and the plain words.

## 15 minutes before class

Follow `part2.md` section 2. The short version:

- [ ] The lab on port 8001 (`part2.md`, "The lab: start it"). Ask one question with `rerank` to load
      the reranker. Options: leave top_k at 3, Doc type filter off. Azure embeddings and LLM, from the lab's .env.
- [ ] Your Google-calls segment ready (slide 2).
- [ ] `fallbacks/part2/screens-rag` open. Terminal and editor at 18pt.
- [ ] Online: a test share, notifications off, the six words ready to paste.

---

## Opening: 3 minutes, then your 10 (slides 1 to 4)

**Slide 1.** "Two parts tonight: Google calls, then finding better passages." Paste the six words.

**Slide 2, your segment.** Ten minutes on limiting Google API calls.

**Slide 3.** 30 seconds: point at today's card and Friday's.

**Slide 4.** The two parts. "Most of tonight is retrieval."

---

## Retrieval, the techniques: 35 minutes (slides 5 to 15)

Main idea: plain search misses in a few typical ways, and each fix has a price. Each technique has a
"how it works" slide with a worked example from the lab, then the evidence slide.

**Slide 6, how plain top-k works.** The baseline, slowly: embed, measure, keep the closest 3. The
real list for the billing question: the handbook is #4, 0.03 past the cut. Everything else builds on it.

**Slide 7, where it misses.** The map for the rest of the night. One row each. Row 1 is the one to
remember: plain search answered the billing question with a real citation, and it was wrong.

**Slide 8, the lab.** Show it, don't teach it: one dropdown, nine strategies. Tonight's demo is one
row of buttons in the Ask tab; each sets every option.

**Slide 9, multi-query.** The three rewrites are real. Be honest: on our documents it did slightly worse
than plain search, for an LLM call and four extra seconds; on the billing question it pushed the
handbook out of the top 5.

**Slide 10, merging four lists by hand.** Reciprocal Rank Fusion with the real ranks. Work row 1 out
loud: 1/62 + 1/63 + 1/62 + 1/61. Core Hours was first twice and still came second: agreement wins.

**Slide 11, why the handbook ranked 4th.** The real chunk: four topics, one vector. Vector search
never reads question and chunk together; a cross-encoder does. That's why reranking helps.

**Slide 12, reranking.** The most useful technique tonight. Search wide and fast, then a small model
reads question and chunk together. The billing question: plain search had the handbook
at #4, outside the 3 chunks the model reads; reranked, it is first, "two reviewers".

**Slide 13, contextual retrieval.** Not in the lab. Our chunker's `title > heading` header is the free
version; Anthropic's version has an LLM write the context, one call per chunk at index time.

**Slide 14, why search can't list.** Search returns text *about* remote work; the answer is 3 of 12
directory rows. A list is a filter, not a ranking problem.

**Slide 15, routers.** "Who works remotely?" Every search technique returns the policy. The router
looks the rows up: three people, in under 30 ms.

---

## Break: 10 minutes (slide 16)

Read the chat. Check the lab is still up at `http://localhost:8001/ui` and click button 2 (rerank)
once so the model is loaded.

---

## Retrieval, live and agents: 20 minutes (slides 17 to 21)

**Slide 17, live.** In the lab, the "Tonight's demo" buttons, in order: 1 dense and 2 rerank (billing),
3 dense and 4 routed ("Who works remotely?"), 5 dense and 6 multi_query ("My first two weeks: office or
home?": "not specified" vs "on-site for your first two weeks"), and if on time 7 and 8, the agent's two
searches by hand (billing pager: "owned by Team Falcon", then "How do I page Team Falcon?").

**Slide 18.** The screenshots, if the lab misbehaves.

**Slide 19, a question that needs two searches.** "Who do I page when the billing service is down?"
One search finds "owned by Team Falcon" plus another team's pager; the second search, "How do I page
Team Falcon?", finds falcon-primary. Real results (buttons 7 and 8).

**Slide 20, agentic RAG.** They've seen agents. The point: search becomes a tool the model calls in a
loop, with a budget. The history-rag numbers: 3, 5, 6 out of 6; the only one to pass the two-hop
question; up to 20× the cost.

**Slide 21, which one, when.** Read the "on our documents" column, then the green box: every technique
runs inside the access filter.

Recap: "Pick the fix by the kind of miss." Read the chat.

---

## Wrap: 10 minutes (slides 22 to 24)

**Slide 22.** The three sentences, one per card.

**Slide 23, tonight.** "One and two are in the lab. Three is extra, and a preview of Friday."

**Slide 24, Friday.** "Tonight by eye; Friday we measure: two indexes, parent-document and HyDE, and a
scoreboard." Post "pull the repo on Friday morning" in the chat. Read the chat one last time.

---

## If you're running late

Cut in this order:

1. Slide 13: the three boxes only, skip Anthropic's numbers.
2. Slide 17, step 4: skip button 5.
3. Slide 10: say the one line ("agreement beats one first place"), skip the arithmetic.
4. Slide 20: the right-hand table only.

Never cut slide 6 (how top-k works), reranking (11, 12), routers (14, 15), or the rerank and router
steps of the lab demo.

## If a demo breaks

Don't debug on the shared screen for more than 60 seconds. Say "here's what it would show", go to the
next slide (real screenshots), and fix it at the break. If you need to look at something private, stop
sharing first.
