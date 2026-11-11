// p2.js — Creating your production application, Part 2: who may read what (acme-desk, checkpoint 02-platform)
//
// Same teaching shape as p1.js (rewritten 8 Nov, online 9 Nov):
//   one story (the salary bands are readable by every employee; an admin fixes it live, nothing is
//   re-embedded), three questions (who is asking / what may they read / can we talk to it), a picture
//   before any code, at most ~12 lines of code on a slide, and a "what you should see" slide after
//   every live step, built from real screenshots and a real transcript (instructor-notes/fallbacks/part2/).
//   Online: no questions to the room, no quizzes, no polls; the chat is read at the dividers and the break.
//   The dense material (layer table, the worker, RRF, the SSE events) is in Reference.
//   Part A (sign-in, access, companies) was cut on 11 Nov: tonight is retrieval only. The reference
//   slides still document checkpoint 02-platform.
const path = require("path");
const sharp = require("sharp");
const { Deck } = require("./kit");
const S = require("./sef");
const { C } = S;
const fa = require("react-icons/fa");

const CP = "checkpoints/02-platform";
const SHOTS = path.join(__dirname, "..", "..", "instructor-notes", "fallbacks", "part2", "screens");

// ---------- small local helpers (same look as p1.js) ----------
function bubble(s, o) {
  const tone = o.tone || "plain";
  const fill = { bad: C.redSoft, good: C.greenSoft, plain: C.white, ask: C.soft, muted: C.soft }[tone];
  const line = { bad: C.red, good: C.deep, plain: C.line, ask: C.line, muted: C.line }[tone];
  s.roundRect({ x: o.x, y: o.y, w: o.w, h: o.h, fill, line, radius: 0.12, name: `${o.name}-box` });
  const whoColor = { bad: C.redText, good: C.deep, plain: C.gray, ask: C.gray, muted: C.gray }[tone];
  s.text([[{ text: o.who, b: true, size: 9.5, color: whoColor }], [{ text: o.text, size: o.size || 12.5, color: tone === "muted" ? C.gray : C.dark, i: !!o.italic }]],
    { x: o.x + 0.15, y: o.y + 0.06, w: o.w - 0.3, h: o.h - 0.12, valign: "middle", paraSpace: 2, name: `${o.name}-text` });
}

function pill(s, o) {
  S.chip(s, { x: o.x, y: o.y, w: o.w, h: o.h || 0.32, text: o.text, fill: o.fill || C.pale, color: o.color || C.deep, size: o.size || 11, font: o.font || "Consolas", name: o.name });
}

function dot(s, x, y, n, fill, size = 0.36) {
  s.ellipse({ x, y, w: size, h: size, fill: fill || C.deep, name: `dot-${n}-${x.toFixed(2)}-${y.toFixed(2)}` });
  s.text(String(n), { x, y, w: size, h: size, font: "Arial", size: 11, bold: true, color: C.white, align: "center", valign: "middle", name: `dot-n-${n}-${x.toFixed(2)}-${y.toFixed(2)}` });
}

// A cropped screenshot from fallbacks/part2/screens (1920 x 1140, the UI at 1.5x)
async function shot(name, left, top, width, height) {
  const buf = await sharp(path.join(SHOTS, name + ".png")).extract({ left, top, width, height }).png().toBuffer();
  return { data: "image/png;base64," + buf.toString("base64"), ratio: width / height };
}

function framed(s, img, o) {
  const h = o.w / img.ratio;
  s.rect({ x: o.x - 0.03, y: o.y - 0.03, w: o.w + 0.06, h: h + 0.06, fill: C.white, line: o.border || C.line, name: `${o.name}-frame` });
  s.image(img.data, { x: o.x, y: o.y, w: o.w, h, name: o.name, alt: o.alt || "" });
  return h;
}

async function build() {
  const I = {};
  const want = {
    users: [fa.FaUsers, C.green], laptop: [fa.FaLaptopCode, C.green], coffee: [fa.FaCoffee, C.green], tools: [fa.FaTools, C.green],
    book: [fa.FaBook, C.green], idG: [fa.FaIdBadge, C.green], lockG: [fa.FaLock, C.green], chatG: [fa.FaComments, C.green],
    id: [fa.FaIdBadge, C.deep], key: [fa.FaKey, C.deep], lock: [fa.FaLock, C.deep],
    db: [fa.FaDatabase, C.deep], building: [fa.FaBuilding, C.deep], chat: [fa.FaComments, C.deep], graph: [fa.FaProjectDiagram, C.deep],
    search: [fa.FaSearch, C.deep], brain: [fa.FaBrain, C.deep], font: [fa.FaFont, C.deep], stream: [fa.FaStream, C.deep],
    hist: [fa.FaHistory, C.deep], eyeSlash: [fa.FaEyeSlash, C.deep], yes: [fa.FaCheckCircle, C.deep], no: [fa.FaTimesCircle, C.redText],
    warn: [fa.FaExclamationTriangle, C.amber], server: [fa.FaServer, C.deep], user: [fa.FaUser, C.deep], shield: [fa.FaShieldAlt, C.deep],
    filter: [fa.FaFilter, C.deep], audit: [fa.FaClipboardList, C.deep], file: [fa.FaFileAlt, C.deep],
    pen: [fa.FaPenFancy, C.redText], userRed: [fa.FaUserSecret, C.redText], robot: [fa.FaRobot, C.deep], sync: [fa.FaSyncAlt, C.deep],
    userCog: [fa.FaUserCog, C.deep],
    searchG: [fa.FaSearch, C.green], driveG: [fa.FaGoogleDrive, C.green],
  };
  for (const [k, [comp, color]] of Object.entries(want)) I[k] = await S.icon(comp, color);

  // real screenshots, cropped to the part that matters
  const P = {
    followup: await shot("09-chat-followup", 786, 350, 1024, 580),
    hidden: await shot("14-chat-hidden", 786, 350, 1024, 420),
    // the lab (RAG weeks checkpoint 6 on port 8001), from fallbacks/part2/screens-rag
    labTop: await shot("../screens-rag/r1-remote-routed", 432, 300, 1380, 460),
    billingDense: await shot("../screens-rag/r4-billing-dense", 432, 1118, 1380, 530),
    billingRerank: await shot("../screens-rag/r3-billing-rerank", 432, 1118, 1380, 530),
  };

  const deck = new Deck({ title: "Part 2: better than top-k", author: "SE Factory", company: "SE Factory",
    subject: "Applied AI Engineering Workshop · Creating your production application · Part 2" });
  let n = 0;
  const num = (s, dark) => S.slideNumber(s, ++n, dark);

  // ---------------------------------------------------------------- 1 Title
  let s = S.darkSlide(deck, {
    section: "Opening", icon: I.users,
    kicker: "CREATING YOUR PRODUCTION APPLICATION  ·  PART 2 OF 4",
    title1: "Finding", title2: "the right passage",
    subtitle: "Fewer Google calls, then five ways to beat plain top-k retrieval",
    detail: "Where plain search misses on our own documents, and five well-known fixes, tried live in a lab.",
    footer: "Google calls  ·  Retrieval",
    notes: `Time: 1 minute. Clock check: 0:00.
Say: "Two parts tonight. Ten minutes on keeping our Google API calls down. Then the rest of the night on retrieval: where plain search misses on our own documents, and five techniques that fix those misses, tried live in a lab."
"If you're lost, write it in the chat. I read the chat at every section break."
Before class: the lab on port 8001 (part2.md, "The lab: start it"), the reranker warmed up with one question.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 2 First: fewer Google calls (Hasan's segment)
  s = S.darkSlide(deck, { section: "Opening", icon: I.driveG, kicker: "FIRST  ·  10 MINUTES", title1: "Fewer calls", title2: "to Google",
    subtitle: "Before anything else: how we keep the number of Google API calls down.",
    footer: "then: better than plain top-k",
    notes: `Time: 10 minutes. Your segment: limiting Google API calls. Clock check: about 0:02.
Put your own talking points and commands here.
When you finish, go to the agenda slide.` });
  num(s, true);

  // ---------------------------------------------------------------- 4 The arc
  s = S.contentSlide(deck, {
    section: "Opening", title: "One app, four sessions",
    subtitle: "Acme Desk, a helpdesk assistant over Acme's documents. Each session adds one layer.",
    takeaway: "Every checkpoint runs offline on your laptop: local folder, local embeddings, Postgres in Docker.",
    notes: `Time: 1 minute. Point at today's card and move on.
Say: "Monday the documents and the sync. Today better retrieval: five ways past plain top-k. Friday we measure it: two ways of cutting the documents, two more techniques, and a scoreboard that says which wins which kind of question. Next Monday we make it safe to ship."
New since Monday for their laptops: Docker for Postgres (docker compose up -d db). Say it once; the README has the three commands.`,
  });
  const parts = [["1", "The source", "Mon 9 Nov", ["read a real Google Drive folder", "notice edits and deletions", "re-sync on a timer"], false],
    ["2", "Beyond top-k", "today", ["fewer Google calls", "where plain top-k misses", "five fixes, tried live"], true],
    ["3", "Retrieval", "Fri 13 Nov", ["two indexes, two ways to chunk", "parent-document and HyDE", "a scoreboard that proves it"], false],
    ["4", "Release", "Mon 16 Nov", ["guardrails on input and output", "evals as a release gate", "kill switch, Docker"], false]];
  parts.forEach(([k, title, when, items, now], i) => {
    const x = 0.6 + i * 2.2;
    S.card(s, { x, y: 1.75, w: 2.1, h: 3.1, num: k, numColor: now ? C.green : C.deep, title, titleSize: 13,
      border: now ? C.deep : undefined, fill: now ? C.pale : C.white,
      body: [{ runs: [{ text: when, b: true, color: now ? C.deep : C.gray }] }, ...items.map(t => ({ runs: t, bullet: true }))], bodySize: 11.5, paraSpace: 4, name: `arc-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 4 Today in three parts
  s = S.contentSlide(deck, {
    section: "Opening", title: "Today in two parts",
    subtitle: "A short warm-up, then the rest of the night on retrieval.",
    takeaway: "Most of tonight: five ways to find better passages than plain top-k, tried live.",
    notes: `Time: 1 minute. The map. Come back to it at each divider.
Say: "Ten minutes on Google calls, done. The rest of the night: plain top-k misses things, and there are five well-known fixes. We'll try them in a lab, on our own documents."
Timing, for you: retrieval from 0:15, the break at about 0:50 (before the lab demo), retrieval ends about 1:20, wrap by 1:30.`,
  });
  const qs = [["1", "Fewer Google calls", "How we keep the number of Drive API calls down.", "the warm-up", "10 min"],
    ["2", "Better than top-k", "Multi-query, reranking, contextual retrieval, routers, agentic RAG.", "one question, several strategies, in a lab", "55 min"]];
  qs.forEach(([k, q, idea, demo, mins], i) => {
    const x = 0.6 + i * 4.45;
    const main = i === 1;
    s.rect({ x, y: 1.6, w: 4.3, h: 3.3, fill: main ? C.pale : C.white, line: main ? C.deep : C.line, name: `q-${i}` });
    dot(s, x + 0.2, 1.78, k, C.deep, 0.5);
    pill(s, { x: x + 3.3, y: 1.87, w: 0.8, h: 0.3, text: mins, font: "Calibri", size: 10, fill: C.soft, color: C.gray, name: `q-time-${i}` });
    s.text(q, { x: x + 0.2, y: 2.4, w: 3.9, h: 0.8, font: "Arial", size: 15.5, bold: true, color: C.dark, valign: "top", name: `q-q-${i}` });
    s.text([[{ text: "THE IDEA", b: true, size: 9, color: C.deep, charSpacing: 0.5 }], [{ text: idea, size: 11.5, color: C.slate }]],
      { x: x + 0.2, y: 3.1, w: 3.9, h: 0.95, paraSpace: 2, name: `q-idea-${i}` });
    s.text([[{ text: "YOU WILL SEE", b: true, size: 9, color: C.deep, charSpacing: 0.5 }], [{ text: demo, size: 11.5, color: C.slate }]],
      { x: x + 0.2, y: 4.15, w: 3.9, h: 0.65, paraSpace: 2, name: `q-demo-${i}` });
  });
  num(s);

  // ================================================================ RETRIEVAL (55 min + the break)
  // ---------------------------------------------------------------- divider
  s = S.darkSlide(deck, { section: "Retrieval", icon: I.searchG, kicker: "MOST OF TONIGHT  ·  55 MINUTES", title1: "Better than", title2: "plain top-k",
    subtitle: "Five techniques. Each fixes one kind of miss, and each has a price.",
    footer: "multi-query  ·  reranking  ·  contextual retrieval  ·  routers  ·  agentic RAG",
    notes: `Time: 30 seconds. Clock check: about 0:15. The lab must be running on port 8001 (part2.md, "The lab: start it").
Say: "Now the main part: does the search find the right passage at all? Plain top-k misses in a few typical ways. Each technique tonight fixes one of them, and costs something."` });
  num(s, true);

  // ---------------------------------------------------------------- how plain top-k works (explainer)
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "How plain top-k works, step by step",
    subtitle: "Every chunk became a vector once, at index time. At question time: embed, measure, cut.",
    takeaway: "The answer was in our documents. It ranked 5th, 0.08 too far away to make the cut.",
    notes: `Time: 3 minutes. The baseline every technique tonight improves on. Go slowly: everything else builds on this picture.
Left: "Three steps. One: the question becomes a vector, 1,536 numbers from text-embedding-3-small. Two: we measure its distance to every chunk's vector. Zero means the same meaning, two means unrelated. Three: we keep the k closest, three in the lab, and only those go into the prompt."
Right, the real list for the billing question: "The closest chunk is the coding standards' code review rule: 'at least one reviewer'. Close in meaning, wrong for billing code. Second, the service catalog's billing-api entry: it says 'billing', nothing about reviewers. The handbook, which says billing code needs two reviewers, is fifth: 1.47 against 1.40 for number three. It misses the cut, so the model never sees it, and answers 'at least one'."
"Keep this list in mind. Every technique tonight changes one of the three steps: what we search with, how we order, or whether we search at all."
Numbers: GET /retrieve, strategy dense, k 5, user intern, 11 Nov.`,
  });
  const tkSteps = [["Embed the question", "the text becomes a vector: 1,536 numbers (text-embedding-3-small)"],
    ["Measure every chunk", "distance from the question's vector: 0 = same meaning, 2 = unrelated"],
    ["Keep the k closest", "only these reach the LLM: k = 3 in the lab"]];
  tkSteps.forEach(([t, d], i) => {
    const y = 1.6 + i * 1.02;
    dot(s, 0.6, y + 0.1, i + 1);
    s.text([[{ text: t, b: true, size: 13, color: C.dark }], [{ text: d, size: 11, color: C.slate }]], { x: 1.1, y, w: 2.95, h: 0.9, valign: "top", paraSpace: 2, name: `tk-step-${i}` });
  });
  s.text([[{ text: "\"How many reviewers does a change to the billing code need?\"", b: true, size: 11, color: C.dark }], [{ text: "plain search, top 5 by distance (shorter bar = closer)", size: 9.5, i: true, color: C.gray }]],
    { x: 4.3, y: 1.5, w: 5.1, h: 0.5, paraSpace: 1, name: "tk-q" });
  const tkRows = [["1.03", "Coding Standards · Code Review", "\"…at least one reviewer\"", false],
    ["1.29", "Service Catalog · billing-api", "says \"billing\", nothing on reviews", false],
    ["1.40", "Coding Standards · Documentation", "", false],
    ["1.44", "Coding Standards · Testing", "", false],
    ["1.47", "Engineering Handbook · Page 1", "\"…billing … needs two reviewers\"", true]];
  tkRows.forEach(([d, label, quote, answer], i) => {
    const y = 2.1 + i * 0.5 + (i >= 3 ? 0.18 : 0);
    const out = i >= 3;
    const barW = (parseFloat(d) / 1.5) * 1.35;
    s.rect({ x: 4.3, y, w: 5.1, h: 0.42, fill: answer ? C.redSoft : C.white, line: answer ? C.red : C.line, name: `tk-row-${i}` });
    s.text(`#${i + 1}`, { x: 4.35, y, w: 0.35, h: 0.42, size: 10, bold: true, color: out ? C.gray : C.dark, valign: "middle", name: `tk-rank-${i}` });
    s.rect({ x: 4.72, y: y + 0.13, w: barW, h: 0.16, fill: out ? C.line : C.teal, name: `tk-bar-${i}` });
    s.text(d, { x: 4.72 + barW + 0.04, y, w: 0.42, h: 0.42, size: 9.5, font: "Consolas", color: C.slate, valign: "middle", name: `tk-d-${i}` });
    s.text([[{ text: label, size: 10, b: answer, color: answer ? C.redText : (out ? C.gray : C.dark) }], ...(quote ? [[{ text: quote, size: 9, i: true, color: answer ? C.redText : C.gray }]] : [])],
      { x: 6.7, y, w: 2.65, h: 0.42, valign: "middle", paraSpace: 0, name: `tk-label-${i}` });
  });
  s.line({ x: 4.3, y: 3.65, w: 1.85, h: 0, color: C.red, width: 1.5, dash: "dash", name: "tk-cut" });
  s.text("k = 3: the cut. Nothing below reaches the model.", { x: 6.2, y: 3.55, w: 3.2, h: 0.2, size: 9, bold: true, color: C.redText, valign: "middle", name: "tk-cut-t" });
  num(s);

  // ---------------------------------------------------------------- where top-k misses
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Where plain top-k misses, on our own documents",
    subtitle: "Plain search: embed the question, take the closest chunks (3 in the lab). Real results on the Acme documents.",
    takeaway: "Each miss has a different cause, so each needs a different fix. That's the rest of tonight.",
    notes: `Time: 4 minutes. The map for the night. One row at a time, then "each row is one of the next slides".
Row 1: "The handbook says two reviewers. Plain search ranked the handbook fifth, behind the coding standards and the service catalog; with three chunks in the prompt, the model answered 'at least one', citing the coding standards. Grounded, and wrong."
Row 2: "Who works remotely? Chunks of the remote-work POLICY. The answer is three rows of the team directory. k is a budget: no search technique fixes a list question."
Row 3: "A chunk that says 'up to $50 per person' doesn't say which policy or which year. We have three answers in our documents: $50, $75, $90."
Row 4: "'My first two weeks: office or home?' The rule is 'new employees must work on-site for their first 2 weeks', under Eligibility. None of the question's words are in it. Plain search ranks it 10th and the model says the documents don't specify."
Row 5: "'Who do I page when the billing service is down?' The catalog says billing-api is owned by Team Falcon. Falcon's pager is in the On-call Guide, which never mentions billing. One search can't connect them: plain search brings back another team's pager."
Numbers from the RAG weeks' checkpoint 6 (same Acme documents, Azure text-embedding-3-small), re-measured 11 Nov.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [3.0, 2.75, 1.75, 1.3], rowH: 0.56, headH: 0.32, size: 10, headSize: 10,
    header: ["The question", "What plain top-5 did", "Why", "The fix"],
    rows: [["How many reviewers does a change to the billing code need?", { text: "Handbook ranked #5, outside the top 3. Answered \"at least one\": wrong", color: C.redText }, "the fact is buried in a long page", { text: "reranking", b: true, color: C.deep }],
      ["Who works remotely?", { text: "the remote-work policy, no people", color: C.redText }, "the answer is a list; k = 5 is a budget", { text: "a router", b: true, color: C.deep }],
      [{ text: "\"Team meals and events: up to $50 per person.\"", i: true }, { text: "Which policy? Which year? The chunk can't say", color: C.redText }, "chunking cut the context off", { text: "contextual retrieval", b: true, color: C.deep }],
      ["My first two weeks: office or home?", { text: "\"The documents do not specify.\" The on-site rule ranked #10", color: C.redText }, "your words aren't the policy's words", { text: "multi-query", b: true, color: C.deep }],
      ["Who do I page when the billing service is down?", { text: "\"Owned by Team Falcon\", then another team's pager", color: C.redText }, "the 2nd search needs the 1st answer", { text: "agentic RAG", b: true, color: C.deep }]] });
  num(s);

  // ---------------------------------------------------------------- the lab
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "The lab: nine strategies behind one dropdown",
    subtitle: "The RAG weeks' checkpoint 6 app, on the same Acme documents. Pick a strategy, ask, compare the sources.",
    takeaway: "We reuse it as it is. Every strategy runs inside the same access filter, behind one function: run(strategy, question, user).",
    notes: `Time: 3 minutes. Show it, don't teach it.
Say: "This is the app from the RAG weeks, checkpoint 6. Same Acme documents. In the Ask tab, under Options, there's a dropdown with nine strategies. Pick one, ask, and look at the sources it found and the answer the model wrote from them."
Two settings for tonight: leave top_k at 3 (the default), and set "Doc type filter: off". With the filter on, dense first asks an LLM which kind of document to search, which hides the plain-search misses we want to see.
For the trace (the rewrites, the timings), /docs, GET /retrieve, any strategy.
Start it during the break, from the rag-week-bootcamp folder (PowerShell):
.venv\\Scripts\\python -m uvicorn app.main:app --port 8001 --app-dir checkpoints/checkpoint-6-advanced-retrieval
The index is built with Azure embeddings (text-embedding-3-small, rebuilt 11 Nov), the LLM is Azure gpt-4.1-mini, both from the repo's .env. Don't set EMBEDDING_PROVIDER=local: the index and the question would be embedded by different models.`,
  });
  framed(s, P.labTop, { x: 0.6, y: 1.6, w: 4.85, name: "lab-img", alt: "The lab's Ask tab: the question, the strategy dropdown, top_k and the doc type filter" });
  S.code(s, { x: 5.65, y: 1.6, w: 3.75, h: 1.75, label: "START IT  ·  FROM rag-week-bootcamp", size: 8.5, lines: [
    "cd checkpoints\\checkpoint-6-advanced-retrieval",
    "..\\..\\.venv\\Scripts\\python -m uvicorn `",
    "    app.main:app --port 8001",
    { text: "# Azure embeddings + gpt-4.1-mini, from .env", color: C.mintText }] });
  s.text([[{ text: "http://localhost:8001/ui", b: true, font: "Consolas", size: 11, color: C.deep }], [{ text: "Ask (RAG) · \"Tonight's demo\" buttons: one click sets the strategy, top_k and filter", size: 10.5, color: C.slate }],
    [{ text: "http://localhost:8001/docs", b: true, font: "Consolas", size: 11, color: C.deep }], [{ text: "GET /retrieve: the chunks and the trace", size: 10.5, color: C.slate }]],
    { x: 5.65, y: 3.45, w: 3.75, h: 1.45, paraSpace: 3, valign: "top", name: "lab-urls" });
  num(s);

  // ---------------------------------------------------------------- multi-query
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Multi-query: ask it several ways, merge the lists",
    subtitle: "An LLM rewrites the question three ways. Search with all four, inside your access, and fuse the lists by rank.",
    takeaway: "Helps when people ask vaguely or ask two things at once. Costs an LLM call before every search.",
    notes: `Time: 4 minutes (the worked example is the next slide).
Left, top to bottom: "'My first two weeks: office or home?' The rule that answers it says 'New employees must work on-site for their first 2 weeks.' No shared words: plain search ranks it 10th and answers 'the documents do not specify'. The model writes three rewrites, the real ones from the lab: 'report to the office', 'work location for the first 14 days'. Those land on the rule. Four searches, each one inside the user's access filter. Then Reciprocal Rank Fusion: each chunk gets 1 over 60 plus its rank, from every list it appears in, added up. A chunk that several rewrites agree on rises."
Right, honestly: "On our 24 questions it did slightly WORSE than plain search, for one LLM call and four extra seconds. On the billing question plain search had the handbook at #5; multi-query pushed it out of the top 5 entirely: four ways of saying the same words pile up votes for the same wrong chunks. Rewrites fix vocabulary, not ranking."
When it earns its keep: users who write the way they talk, product names with synonyms, big corpora where one half of a two-part question gets crowded out.`,
  });
  bubble(s, { x: 0.6, y: 1.55, w: 5.2, h: 0.74, who: "THE QUESTION", text: "My first two weeks: office or home?", tone: "ask", size: 12, name: "mq-q" });
  const rewrites = ["Where will I be working during my initial two weeks, at the office or remotely?",
    "Is my work location for the first 14 days in the office or from home?",
    "Do I need to report to the office or work from home for my first two weeks?"];
  rewrites.forEach((t, i) => {
    const y = 2.4 + i * 0.48;
    s.rect({ x: 0.85, y, w: 4.95, h: 0.42, fill: C.white, line: C.line, name: `mq-rw-${i}` });
    s.text([[{ text: `rewrite ${i + 1}  `, b: true, size: 9, color: C.deep }, { text: t, size: 9.5, color: C.slate }]], { x: 0.95, y, w: 4.8, h: 0.42, valign: "middle", name: `mq-rw-t-${i}` });
  });
  s.rect({ x: 0.6, y: 3.9, w: 5.2, h: 0.9, fill: C.pale, name: "mq-fuse" });
  s.text([[{ text: "4 searches → fuse by rank → top 3", b: true, size: 12, color: C.deep }], [{ text: "the on-site rule: #10 for the question, #1 or #2 for every rewrite, #3 fused", size: 10.5, color: C.slate }]],
    { x: 0.75, y: 3.9, w: 4.95, h: 0.9, valign: "middle", paraSpace: 2, name: "mq-fuse-t" });
  S.table(s, { x: 6.05, y: 1.55, cols: [1.15, 0.7, 0.7, 0.8], rowH: 0.46, headH: 0.32, size: 10.5, align: "center",
    header: ["24 questions", "Hit@5", "MRR", "Time"],
    rows: [[{ text: "plain", b: true, color: C.dark }, "0.92", "0.76", "0.9 s"],
      [{ text: "multi-query", b: true, color: C.deep }, { text: "0.88", color: C.redText }, "0.79", { text: "5.3 s", color: C.redText }]] });
  s.text([[{ text: "This question: ", b: true, color: C.dark }, { text: "plain \"does not specify\"; multi-query \"on-site for your first two weeks\". " }, { text: "Overall: ", b: true, color: C.dark }, { text: "+1 LLM call, and the billing handbook fell out of the top 5." }]],
    { x: 6.05, y: 2.95, w: 3.35, h: 1.0, size: 11, color: C.slate, name: "mq-note" });
  s.text("measured 11 Nov, checkpoint 6, Azure embeddings", { x: 6.05, y: 4.45, w: 3.35, h: 0.35, size: 9, italic: true, color: C.gray, name: "mq-src" });
  num(s);

  // ---------------------------------------------------------------- RRF by hand (explainer)
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Merging four lists, worked by hand",
    subtitle: "Reciprocal Rank Fusion: a chunk earns 1 / (60 + rank) from every list it appears in. Add it up.",
    takeaway: "The rule ranked 10th for your words and 1st or 2nd for every rewrite. Fusion carried it into the top 3.",
    notes: `Time: 3 minutes. The mechanics behind multi-query, with the real lists.
"Four searches, four ranked lists: the original question and the three rewrites. These are the real ranks from the lab, top 20 each."
Row 3, the answer, slowly, with the box underneath: "The Eligibility rule: 10th for the original question, then 1st, 2nd, 2nd for the rewrites. One over 70, plus one over 61, plus one over 62, plus one over 62. 0.0629: third, inside the top 3 the model reads."
Row 1: "In-Office Days, about hybrid work, near the top of every list: 0.0653. Relevant-sounding, not the answer. Fusion doesn't know what's right; it knows what the searches agree on."
Row 4: "Before Your First Day: good in one list, weak in the others. 0.0609, out."
"Why 60? It's the constant from the original paper (Cormack and others, 2009). It flattens the top: being 1st instead of 2nd is worth little, being in every list is worth a lot. And we never compare raw distances from different searches, only ranks, so the lists don't need to be on the same scale."
"The final order is exactly what the lab's multi_query returns: button 6 in the demo."
If asked: the same fusion merges vector search and keyword search in 'hybrid'.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [3.2, 0.95, 0.95, 0.95, 0.95, 0.9, 0.9], rowH: 0.44, headH: 0.5, size: 10.5, headSize: 9.5, align: "center",
    header: ["chunk", "original", "rewrite 1", "rewrite 2", "rewrite 3", "score", "final"],
    rows: [[{ text: "Remote Work · In-Office Days", color: C.dark }, "1", "2", "1", "1", { text: "0.0653", font: "Consolas" }, "#1"],
      [{ text: "Onboarding Checklist · Week 1", color: C.dark }, "2", "3", "6", "3", { text: "0.0630", font: "Consolas" }, "#2"],
      [{ text: "Remote Work · Eligibility (the answer)", b: true, color: C.deep }, { text: "10", b: true, color: C.redText }, { text: "1", b: true, color: C.deep }, { text: "2", b: true, color: C.deep }, { text: "2", b: true, color: C.deep }, { text: "0.0629", b: true, color: C.deep, font: "Consolas" }, { text: "#3", b: true, color: C.deep }],
      [{ text: "Onboarding Guide · Before Your First Day", color: C.gray }, "6", "5", "3", "9", { text: "0.0609", font: "Consolas", color: C.gray }, { text: "#4: out", color: C.gray }]] });
  s.text("rank of each chunk in each of the four searches (top 20), from the lab, 11 Nov", { x: 0.6, y: 3.82, w: 8.8, h: 0.25, size: 9, italic: true, color: C.gray, name: "rrf-src" });
  s.rect({ x: 0.6, y: 4.15, w: 4.3, h: 0.75, fill: C.pale, name: "rrf-1" });
  s.text([[{ text: "#3  ", b: true, size: 11, color: C.deep }, { text: "1/70 + 1/61 + 1/62 + 1/62", size: 11, font: "Consolas", color: C.dark }], [{ text: "= 0.0629: the rewrites outvote the question's own wording", size: 10, color: C.slate }]],
    { x: 0.75, y: 4.15, w: 4.1, h: 0.75, valign: "middle", paraSpace: 1, name: "rrf-1-t" });
  s.rect({ x: 5.1, y: 4.15, w: 4.3, h: 0.75, fill: C.white, line: C.line, name: "rrf-2" });
  s.text([[{ text: "#1  ", b: true, size: 11, color: C.dark }, { text: "1/61 + 1/62 + 1/61 + 1/61", size: 11, font: "Consolas", color: C.dark }], [{ text: "= 0.0653: on topic everywhere, but not the answer", size: 10, color: C.slate }]],
    { x: 5.25, y: 4.15, w: 4.1, h: 0.75, valign: "middle", paraSpace: 1, name: "rrf-2-t" });
  num(s);

  // ---------------------------------------------------------------- why the handbook ranked 5th (explainer)
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Why the handbook ranked 5th",
    subtitle: "One chunk, four topics, one vector. Vector search compares averages; a reranker reads the words.",
    takeaway: "Vector search reads a summary of each chunk. A reranker reads the chunk with your question in hand.",
    notes: `Time: 3 minutes. Sets up the next slide: WHY a second reader helps.
Left: "This is the real chunk the handbook answer lives in. 905 characters about code review, deployments, incidents. The sentence we need is one line in the middle. The embedding model turns the whole chunk into ONE vector, so that vector means 'how engineering works', roughly the average of four topics. The coding-standards chunk is only about code review, so it's closer to our question about reviewers."
Right: "Two ways to score a chunk. Vector search, a bi-encoder: the question and the chunk are turned into vectors separately (the chunk long ago, at index time) and compared. Fast: one embedding call per question, whatever the corpus size. But it never sees the two texts together."
"A cross-encoder reads the question and the chunk as ONE input and returns one score. It sees 'billing' in the question and 'billing' in the chunk, in the same breath. Much better, much slower: one model run per chunk. So we only run it on the top 20 that vector search found."
Analogy if it helps: the librarian who reads only the back covers, then a reader who opens the 20 best books at the page you asked about.`,
  });
  s.rect({ x: 0.6, y: 1.55, w: 4.6, h: 3.35, fill: C.white, line: C.line, name: "hb-box" });
  s.text([[{ text: "ENGINEERING HANDBOOK · PAGE 1   ", b: true, size: 9, color: C.gray, charSpacing: 0.5 }, { text: "905 characters", size: 9, i: true, color: C.gray }],
    [{ text: "Acme Corporation builds and operates software… This handbook describes how the engineering team works…", size: 10, color: C.gray }],
    [{ text: "Code review. Every change must be reviewed by at least one other engineer before it is merged… ", size: 10, color: C.gray },
      { text: "A change that touches billing or authentication needs two reviewers.", size: 10.5, b: true, color: C.deep }],
    [{ text: "Deployments. The team deploys to production several times per day…", size: 10, color: C.gray }],
    [{ text: "Production incidents. When a service breaks in production, the on-call engineer opens an incident…", size: 10, color: C.gray }]],
    { x: 0.75, y: 1.62, w: 4.3, h: 2.55, valign: "top", paraSpace: 6, name: "hb-text" });
  pill(s, { x: 0.75, y: 4.35, w: 4.3, h: 0.38, text: "4 topics  →  1 vector  →  \"how engineering works\"", font: "Calibri", size: 10.5, fill: C.amberSoft, color: C.amberDeep, name: "hb-avg" });
  S.card(s, { x: 5.45, y: 1.55, w: 3.95, h: 1.6, title: "Vector search (bi-encoder)", titleSize: 12.5, icon: I.search, iconInline: true,
    body: [{ runs: "question → vector; chunk → vector, made separately", bullet: true }, { runs: "compare the two: fast, any corpus size", bullet: true }, { runs: [{ text: "never sees the two texts together", b: true, color: C.redText }], bullet: true }], bodySize: 10.5, paraSpace: 2, name: "hb-bi" });
  S.card(s, { x: 5.45, y: 3.3, w: 3.95, h: 1.6, title: "Reranker (cross-encoder)", titleSize: 12.5, icon: I.brain, iconInline: true, border: C.deep, fill: C.pale,
    body: [{ runs: "reads (question + chunk) as one input, gives one score", bullet: true }, { runs: [{ text: "sees \"billing\" in both", b: true, color: C.deep }], bullet: true }, { runs: "slow: one run per chunk, so only the top 20", bullet: true }], bodySize: 10.5, paraSpace: 2, name: "hb-cross" });
  num(s);

  // ---------------------------------------------------------------- reranking
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Reranking: a slower, better reader for the top 20",
    subtitle: "Fast search finds 20 candidates. A cross-encoder reads the question with each one, and re-orders them.",
    takeaway: "The best value of the five on our documents: no LLM call and the biggest jump in ranking. The price is latency.",
    notes: `Time: 4 minutes (the "why" was the previous slide). The most useful technique tonight.
Left: "Vector search never reads the question and the chunk together: it compares two lists of numbers made separately. Fast, and a bit blind. A cross-encoder is a small model that takes the question and one chunk as ONE input and gives back one score: how well this chunk answers this question. Too slow for 89 chunks on every question, fine for 20. So: search wide and fast, then rerank."
Right: "The billing question. Plain top 5: coding standards and the service catalog, then the handbook at #5. With three chunks in the prompt, the model never sees it. Reranked: the handbook first. The reranker read the candidates and moved the right one up."
Numbers: "MRR 0.76 to 0.90 on our 24 questions. No LLM call: ms-marco-MiniLM-L-6-v2, about 90 MB, runs on the CPU. About 0.6 seconds extra per question on a laptop."
If asked about the regression drill: with only 5 candidates instead of 20, rerank loses this question again. The candidate count matters.`,
  });
  const steps = [["Search wide and fast", "top 20 by vectors: the question and a chunk are never read together"], ["Read each pair", "a cross-encoder takes (question, chunk) as one input, gives one score"], ["Keep the best 5", "the order the model will see"]];
  steps.forEach(([t, d], i) => {
    const y = 1.6 + i * 0.95;
    dot(s, 0.6, y + 0.12, i + 1);
    s.text([[{ text: t, b: true, size: 12.5, color: C.dark }], [{ text: d, size: 10.5, color: C.slate }]], { x: 1.1, y, w: 3.5, h: 0.85, valign: "top", paraSpace: 2, name: `rr-step-${i}` });
  });
  s.text([[{ text: "MRR 0.76 → 0.90", b: true, size: 13, color: C.deep }], [{ text: "no LLM call · ~0.6 s extra on a laptop CPU", size: 10.5, color: C.slate }], [{ text: "ms-marco-MiniLM-L-6-v2, ~90 MB", size: 10, color: C.gray, font: "Consolas" }]],
    { x: 0.6, y: 4.15, w: 4.0, h: 0.8, paraSpace: 1, name: "rr-num" });
  S.table(s, { x: 4.85, y: 1.55, cols: [0.35, 2.15, 2.05], rowH: 0.42, headH: 0.32, size: 9.5, headSize: 10,
    header: ["#", "plain top 5", "reranked"],
    rows: [["1", "Coding Standards · Code Review", { text: "Engineering Handbook · Page 1", b: true, color: C.deep }],
      ["2", "Service Catalog · billing-api", "Coding Standards · Code Review"],
      ["3", "Coding Standards · Documentation", "Coding Standards · Testing"],
      ["4", "Coding Standards · Testing", { text: "Service Catalog · billing-api", color: C.gray }],
      ["5", { text: "Engineering Handbook · Page 1", b: true, color: C.redText }, { text: "Expense 2026 · Software", color: C.gray }]] });
  s.text([[{ text: "\"How many reviewers does a change to the billing code need?\" ", i: true, color: C.dark }, { text: "Plain: the handbook at #5, outside a top 3; answer \"at least one\". Reranked: #1, \"two reviewers\".", color: C.slate }]],
    { x: 4.85, y: 4.0, w: 4.55, h: 0.85, size: 10.5, name: "rr-q" });
  num(s);

  // ---------------------------------------------------------------- contextual retrieval
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Contextual retrieval: give chunks their context",
    subtitle: "A chunk cut out of a document forgets which document it came from. Put that back before you embed it.",
    takeaway: "Not in the lab: our header is the free version. The LLM version costs one call per chunk, at index time.",
    notes: `Time: 5 minutes. A chunking idea, done at index time, not at question time.
Top box: "This is a real line from our documents. On its own, it's useless: we have three expense policies, with $50, $75 and $90."
Middle: "Since the RAG weeks, our chunker puts the document title and the section heading in front of every chunk, and embeds that. It's a rule: free, instant, and it's why our version questions work."
Bottom: "Anthropic's contextual retrieval does the same with an LLM: for every chunk, give the model the whole document and the chunk, ask for one or two sentences that place the chunk in its document, and prepend that. The example text here is the kind of sentence it writes, not a real output."
Right: "Anthropic's own numbers, on their test sets, top 20 chunks: failed retrievals down 35% with contextual embeddings, 49% adding contextual keyword search, 67% adding a reranker on top." Source: Anthropic, "Introducing Contextual Retrieval", September 2024.
Cost: one LLM call per chunk at index time (89 chunks here: cheap), prompt caching makes the repeated document cheap, and you redo it when a document changes. It shines when documents are long and sections don't name their subject.`,
  });
  const ctx = [["The chunk alone", "Team meals and events: up to $50 per person.", "Which policy? Which year? We have three answers: $50, $75, $90.", C.redText, C.redSoft],
    ["With a header (our chunker, free)", "Expense Policy (2023 edition) > Team Events\nTeam meals and events: up to $50 per person.", "a rule: title and heading, in every chunk since the RAG weeks", C.deep, C.white],
    ["With LLM-written context (Anthropic, 2024)", "From Acme's 2023 expense policy, the team events section; later raised in 2024 and 2026.\nTeam meals and events: up to $50 per person.", "an illustration of what the LLM writes, not a real output", C.deep, C.pale]];
  ctx.forEach(([t, code, note, col, fill], i) => {
    const y = 1.55 + i * 1.12;
    s.rect({ x: 0.6, y, w: 5.6, h: 1.02, fill, line: i === 0 ? C.red : C.line, name: `ctx-${i}` });
    s.text([[{ text: t, b: true, size: 11, color: col }], ...code.split("\n").map((l, j) => [{ text: l, size: 10, font: "Consolas", color: j === 0 && i > 0 ? C.deep : C.dark }]), [{ text: note, size: 9.5, i: true, color: C.gray }]],
      { x: 0.75, y, w: 5.35, h: 1.02, valign: "middle", paraSpace: 1, name: `ctx-t-${i}` });
  });
  S.table(s, { x: 6.45, y: 1.55, cols: [2.05, 0.9], rowH: 0.48, headH: 0.32, size: 10, align: "center",
    header: ["Anthropic's tests, top 20", "failures"],
    rows: [[{ text: "contextual embeddings", color: C.dark }, { text: "−35%", b: true, color: C.deep }],
      [{ text: "+ contextual keyword search", color: C.dark }, { text: "−49%", b: true, color: C.deep }],
      [{ text: "+ a reranker", color: C.dark }, { text: "−67%", b: true, color: C.deep }]] });
  s.text([[{ text: "Cost: ", b: true, color: C.dark }, { text: "1 LLM call per chunk at index time (89 here), redone when a document changes." }]],
    { x: 6.45, y: 3.45, w: 2.95, h: 0.8, size: 10.5, color: C.slate, name: "ctx-cost" });
  s.text("Anthropic, \"Introducing Contextual Retrieval\", Sep 2024", { x: 6.45, y: 4.4, w: 2.95, h: 0.4, size: 9, italic: true, color: C.gray, name: "ctx-src" });
  num(s);

  // ---------------------------------------------------------------- why search can't list (explainer)
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Why search can't answer \"who works remotely?\"",
    subtitle: "Search finds text that is about your question. This question wants every row that matches a value.",
    takeaway: "Search answers \"which passage is about this?\". A list asks \"which rows match this?\". Different question, different tool.",
    notes: `Time: 3 minutes. Sets up routers: the miss here is not a ranking problem, so no ranking trick fixes it.
Left: "What plain search returns for 'Who works remotely?': the FAQ on working from another country, and two sections of the remote-work policy. All about remote work. Exactly what similarity search is for, and useless here."
"A directory row says 'office: Remote' once, among a name, a role and an email. As a vector it's 'a person record', not 'remote work', so it's far from the question."
Right: "The answer is three rows of the team directory. That's a filter: office equals Remote. A filter is exact and returns every match, three or three hundred. Top-k returns the k nearest, whatever they are, and never more than k."
"So the fix isn't a better ranking. It's noticing the question is a list, and taking a different path. That's a router: next slide."`,
  });
  bubble(s, { x: 0.6, y: 1.55, w: 4.3, h: 0.55, who: "THE QUESTION", text: "Who works remotely?", tone: "ask", size: 12, name: "ls-q" });
  s.text([[{ text: "Plain search, top 3: all about remote work, no people", b: true, size: 10.5, color: C.redText }]], { x: 0.6, y: 2.2, w: 4.3, h: 0.3, name: "ls-dense-h" });
  [["0.87", "Company FAQ · Can I work from another country?"], ["0.91", "Remote Work Guidelines · Eligibility"], ["1.02", "Remote Work Guidelines · In-Office Days"]].forEach(([d, t], i) => {
    const y = 2.55 + i * 0.44;
    s.rect({ x: 0.6, y, w: 4.3, h: 0.38, fill: C.white, line: C.line, name: `ls-d-${i}` });
    s.text([[{ text: `#${i + 1}  `, b: true, size: 10, color: C.dark }, { text: d + "  ", size: 9.5, font: "Consolas", color: C.gray }, { text: t, size: 10, color: C.dark }]], { x: 0.7, y, w: 4.15, h: 0.38, valign: "middle", name: `ls-d-t-${i}` });
  });
  s.rect({ x: 0.6, y: 3.95, w: 4.3, h: 0.95, fill: C.soft, name: "ls-row" });
  s.text([[{ text: "A directory row, as the search sees it", b: true, size: 10, color: C.dark }], [{ text: "name: Maria Garcia; role: Frontend Developer; department: Engineering; office: Remote; email: …", size: 9.5, font: "Consolas", color: C.slate }]],
    { x: 0.75, y: 3.95, w: 4.05, h: 0.95, valign: "middle", paraSpace: 2, name: "ls-row-t" });
  const people = [["Sarah Chen", "San Francisco"], ["James Wilson", "San Francisco"], ["Maria Garcia", "Remote"], ["David Kim", "New York"], ["Emily Johnson", "San Francisco"], ["Michael Brown", "Remote"],
    ["Lisa Wang", "New York"], ["Robert Taylor", "San Francisco"], ["Jennifer Lee", "San Francisco"], ["Ahmed Hassan", "Remote"], ["Rachel Adams", "New York"], ["Tom Martinez", "San Francisco"]];
  S.table(s, { x: 5.15, y: 1.55, cols: [2.15, 2.1], rowH: 0.235, headH: 0.3, size: 9.5, headSize: 9.5,
    header: ["team-directory.csv · name", "office"],
    rows: people.map(([nm, off]) => off === "Remote"
      ? [{ text: nm, b: true, color: C.deep, fill: C.greenSoft, size: 9.5 }, { text: off, b: true, color: C.deep, fill: C.greenSoft, size: 9.5 }]
      : [{ text: nm, color: C.gray, size: 9.5 }, { text: off, color: C.gray, size: 9.5 }]) });
  s.text([[{ text: "office = Remote  →  3 of 12 rows. ", b: true, color: C.deep }, { text: "Exact, and every match: no k.", color: C.slate }]],
    { x: 5.15, y: 4.7, w: 4.25, h: 0.3, size: 10.5, name: "ls-filter" });
  num(s);

  // ---------------------------------------------------------------- routers
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Routers: send each question down the right path",
    subtitle: "Top-k is a budget. When the answer is a list of rows, no search technique fixes it: look the rows up.",
    takeaway: "One decision before the search. Rules are free and testable; a small LLM call when rules can't tell.",
    notes: `Time: 3 minutes (the "why" was the previous slide).
Left: "Before searching, decide what SHAPE the question has. Pointwise: the answer lives in one or two places, so search, hybrid plus rerank. Aggregation: 'who works in', 'how many', 'list everyone': the answer is a set of rows, so look them up in the records, every match, no k."
"In the lab the classifier is two regular expressions. Free, instant, and you can write a test for it. When rules can't tell, one small LLM call can classify; that's still a router, not an agent: one decision, then code runs the path."
Right: "Who works remotely? Plain, multi-query, rerank: the chunks are the remote-work policy and the FAQ, because that's what 'remotely' is most similar to. Routed: the three people in the team directory whose office is Remote, in under 30 milliseconds, no LLM call."
Numbers: list questions 0.67 to 1.00; overall Hit@5 1.00, MRR 0.98, the best of the nine.
Link to history-rag if asked: same idea at scale, an entity table built once at index time, and a fallback that logs the questions it couldn't route.`,
  });
  bubble(s, { x: 0.6, y: 1.55, w: 4.3, h: 0.55, who: "THE QUESTION", text: "Who works remotely?", tone: "ask", size: 12, name: "rt-q" });
  s.rect({ x: 1.6, y: 2.3, w: 2.3, h: 0.5, fill: C.dark, name: "rt-cls" });
  s.text("classify: which shape?", { x: 1.6, y: 2.3, w: 2.3, h: 0.5, size: 11.5, bold: true, color: C.white, align: "center", valign: "middle", name: "rt-cls-t" });
  S.arrow(s, 2.2, 2.82, 1.4, 3.2, C.gray, 1.5);
  S.arrow(s, 3.3, 2.82, 4.1, 3.2, C.gray, 1.5);
  s.rect({ x: 0.6, y: 3.22, w: 2.05, h: 0.95, fill: C.white, line: C.line, name: "rt-pt" });
  s.text([[{ text: "pointwise", b: true, size: 11.5, color: C.dark, font: "Consolas" }], [{ text: "search: hybrid + rerank", size: 10, color: C.slate }]], { x: 0.7, y: 3.22, w: 1.9, h: 0.95, valign: "middle", paraSpace: 2, name: "rt-pt-t" });
  s.rect({ x: 2.85, y: 3.22, w: 2.05, h: 0.95, fill: C.pale, line: C.deep, name: "rt-ag" });
  s.text([[{ text: "a list", b: true, size: 11.5, color: C.deep, font: "Consolas" }], [{ text: "look up the records: every match, no k", size: 10, color: C.slate }]], { x: 2.95, y: 3.22, w: 1.9, h: 0.95, valign: "middle", paraSpace: 2, name: "rt-ag-t" });
  s.text([[{ text: "who|list|how many|everyone", font: "Consolas", size: 9.5, color: C.deep }, { text: "  + work|based|office|team: two rules in the lab", size: 9.5, color: C.gray }]],
    { x: 0.6, y: 4.3, w: 4.3, h: 0.5, name: "rt-rule" });
  S.table(s, { x: 5.15, y: 1.55, cols: [1.25, 3.0], rowH: 0.5, headH: 0.32, size: 10,
    header: ["strategy", "\"Who works remotely?\": top 5"],
    rows: [[{ text: "plain", b: true }, { text: "FAQ, remote-work policy ×4", color: C.redText }],
      [{ text: "multi-query", b: true }, { text: "FAQ, remote-work policy ×4", color: C.redText }],
      [{ text: "rerank", b: true }, { text: "FAQ, remote-work policy ×4", color: C.redText }],
      [{ text: "routed", b: true, color: C.deep }, { text: "Maria Garcia, Michael Brown, Ahmed Hassan · 28 ms", b: true, color: C.deep }]] });
  s.text([[{ text: "List questions: Hit@5 0.67 → 1.00. ", b: true, color: C.dark }, { text: "Overall the best of the nine: Hit@5 1.00, MRR 0.98." }]],
    { x: 5.15, y: 4.2, w: 4.25, h: 0.6, size: 10.5, color: C.slate, name: "rt-num" });
  num(s);

  // ---------------------------------------------------------------- 19 break
  s = S.darkSlide(deck, { section: "Break", icon: I.coffee, kicker: "10 MINUTES", title1: "Break",
    subtitle: "When we come back: the same techniques, live in the lab.",
    footer: "then: the lab, live",
    notes: `Clock check: about 0:50. More than 10 minutes behind: after the break, show agentic RAG from its slide only, and skip step 4 of the lab demo.
Read the chat now and answer what came in so far.
During the break: check the lab is up (start it if not). From the rag-week-bootcamp folder (PowerShell):
.venv\\Scripts\\python -m uvicorn app.main:app --port 8001 --app-dir checkpoints/checkpoint-6-advanced-retrieval
Then http://localhost:8001/ui, Ask (RAG), Options: leave top_k at 3, Doc type filter off. Ask one question to warm the reranker up (the first rerank loads the model, a few seconds).` });
  num(s, true);

  // ---------------------------------------------------------------- LIVE B
  s = S.liveSlide(deck, {
    section: "Retrieval", icon: I.laptop, kicker: "LIVE  ·  THE LAB, PORT 8001",
    title1: "Same question,", title2: "different strategies",
    steps: ["Button 1, dense, the billing question: \"at least one\", from the coding standards",
      "Button 2, rerank, same question: \"two reviewers\", the Engineering Handbook first",
      "Buttons 3 and 4, \"Who works remotely?\": dense gives the policy; routed gives three people",
      "Buttons 5 and 6, first two weeks: dense \"not specified\", multi_query \"on-site\". 7 and 8: two hops"],
    command: "http://localhost:8001/ui  ·  Ask (RAG)  ·  \"Tonight's demo\" buttons set every option",
    notes: `Time: 10 minutes. Say what you'll pick before each click.
The Ask (RAG) tab has a "Tonight's demo" row. Each button sets user intern, today's documents, Doc type filter off, the strategy and top_k, asks, and shows the retrieval trace under the answer. Hover a button to see what to expect (the room doesn't see the tooltip). Ctrl+F5 once if the buttons don't show.
1) Button 1, dense: "How many reviewers does a change to the billing code need?" Expect: "at least one reviewer", citing Coding Standards. Sources: three coding-standards chunks; the handbook is #4, just outside. Point back at the "How plain top-k works" slide.
2) Button 2, rerank, same question. Expect: "two reviewers", Engineering Handbook #1. Say: "Same documents, same model. The reranker read the candidates and moved the right one up."
3) Button 3, "Who works remotely?" with dense: the remote-work policy. Then button 4, routed: Maria Garcia, Michael Brown, Ahmed Hassan; the trace says "aggregation on office = Remote, 3 records".
4) Buttons 5 and 6, "My first two weeks: office or home?" (top_k 3). Button 5, dense: "the documents do not specify". Button 6, multi_query: "you must work on-site for your first two weeks"; the trace shows the three rewrites, and the Eligibility rule is #3. About 5 seconds. This is the "worked by hand" slide, live.
5) If on time: buttons 7 and 8, the agent's two searches by hand. Button 7, "Who do I page when the billing service is down?": "owned by Team Falcon" but no pager; the On-call section it found is Team Quartz. Button 8, "How do I page Team Falcon?": falcon-primary, #1. Say: "An agent is a loop that does button 8 for you, after reading button 7."
Optional: the dashed "+ Billing reviewers, multi_query": the handbook drops out of the top 5 (multi-query is not always better).
If the lab won't start: the next slide has the screenshots. Fallback: instructor-notes/fallbacks/part2/screens-rag.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- what you should see (lab)
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "What you should see",
    subtitle: "The billing question with 3 chunks, plain search against reranked. Same documents, same model.",
    takeaway: "Plain search was grounded and wrong. Reranking found the page that answers it.",
    notes: `Time: 2 minutes. The safety net for the lab demo.
Left: "The answer cites a real document, and it's wrong: the coding standards say at least one reviewer, the handbook says two for billing code." Right: "Reranked: the handbook first, the right answer."
And for "Who works remotely?": dense answers from the policy, routed lists Maria Garcia, Michael Brown and Ahmed Hassan.`,
  });
  s.text([[{ text: "PLAIN  ", b: true, color: C.redText, size: 10 }, { text: "\"at least one reviewer\"", color: C.gray, size: 10.5 }]], { x: 0.6, y: 1.5, w: 4.3, h: 0.28, valign: "middle", name: "wb-l" });
  framed(s, P.billingDense, { x: 0.6, y: 1.85, w: 4.3, border: C.red, name: "wb-dense", alt: "Dense: the answer says at least one reviewer, no handbook in the sources" });
  s.text([[{ text: "RERANKED  ", b: true, color: C.deep, size: 10 }, { text: "\"two reviewers\", the handbook first", color: C.gray, size: 10.5 }]], { x: 5.1, y: 1.5, w: 4.3, h: 0.28, valign: "middle", name: "wb-r" });
  framed(s, P.billingRerank, { x: 5.1, y: 1.85, w: 4.3, border: C.deep, name: "wb-rerank", alt: "Rerank: the answer says two reviewers, Engineering Handbook first" });
  s.rect({ x: 0.6, y: 3.75, w: 8.8, h: 0.95, fill: C.pale, name: "wb-route" });
  s.text([[{ text: "And \"Who works remotely?\"  ", b: true, color: C.dark }, { text: "dense answers from the remote-work policy. ", color: C.redText },
    { text: "routed lists Maria Garcia, Michael Brown and Ahmed Hassan, from the team directory.", b: true, color: C.deep }]],
    { x: 0.75, y: 3.75, w: 8.5, h: 0.95, size: 12, valign: "middle", name: "wb-route-t" });
  num(s);

  // ---------------------------------------------------------------- a question that needs two searches (explainer)
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "A question that needs two searches",
    subtitle: "You can't search for the team's pager until you've read which team owns the service. Real searches in the lab.",
    takeaway: "The second search uses a word, Falcon, that only the first result contained. That's what an agent's loop is for.",
    notes: `Time: 3 minutes. Motivates the agent with a real two-hop question on our documents.
The question: "Who do I page when the billing service is down?"
Left, one search (real, top 3): "Every strategy finds the service catalog: billing-api is owned by Team Falcon. But Falcon's pager lives in the On-call Guide, and that page never says 'billing'. Ten team sections look alike to a search, so plain search brings back whichever is closest: Team Quartz. The model answers: owned by Team Falcon, no pager for them in the context." Rerank, multi-query and the router all stop at the same place.
Right, the agent's path, run by hand in the lab (buttons 7 and 8): "Search one, the question: read 'Team Falcon'. Search two, 'How do I page Team Falcon?': the Falcon section, number one, PagerDuty falcon-primary. Answer."
"Nothing clever: the second search needed a word that wasn't in the question. A fixed pipeline searches once with your words. An agent reads, then decides what to search next."
Documents: Service Catalog and On-call Guide, added 11 Nov (data/enterprise event 6).`,
  });
  bubble(s, { x: 0.6, y: 1.5, w: 8.8, h: 0.55, who: "THE QUESTION", text: "Who do I page when the billing service is down?", tone: "ask", size: 12, name: "hop-q" });
  s.rect({ x: 0.6, y: 2.2, w: 4.3, h: 2.7, fill: C.white, line: C.line, name: "hop-one" });
  s.text("One search (every strategy, top 3)", { x: 0.75, y: 2.27, w: 4.0, h: 0.35, size: 12, bold: true, font: "Arial", color: C.dark, valign: "middle", name: "hop-one-t" });
  s.text([[{ text: "RETRIEVED", b: true, size: 8.5, color: C.gray, charSpacing: 0.5 }],
    [{ text: "#1 Service Catalog · billing-api: ", size: 10.5, color: C.dark }, { text: "Owner: Team Falcon", size: 10.5, b: true, color: C.deep }],
    [{ text: "#2 FAQ · Who do I contact about IT issues?", size: 10.5, color: C.dark }],
    [{ text: "#3 On-call Guide · Team Quartz", size: 10.5, b: true, color: C.redText }, { text: "  (the wrong team)", size: 10, i: true, color: C.redText }]],
    { x: 0.75, y: 2.65, w: 4.05, h: 1.1, valign: "top", paraSpace: 2, name: "hop-one-r" });
  s.text([[{ text: "ANSWERED", b: true, size: 8.5, color: C.gray, charSpacing: 0.5 }], [{ text: "\"The billing service is owned by Team Falcon… The context does not specify a pager or on-call contact for Team Falcon.\"", size: 10.5, i: true, color: C.redText }]],
    { x: 0.75, y: 3.78, w: 4.05, h: 0.75, valign: "top", paraSpace: 1, name: "hop-one-a" });
  pill(s, { x: 0.75, y: 4.48, w: 4.0, h: 0.32, text: "half: the team, not its pager", font: "Calibri", size: 10.5, fill: C.redSoft, color: C.redText, name: "hop-half" });
  s.rect({ x: 5.1, y: 2.2, w: 4.3, h: 2.7, fill: C.pale, line: C.deep, name: "hop-two" });
  s.text("The agent's path (run by hand in the lab)", { x: 5.25, y: 2.27, w: 4.05, h: 0.35, size: 12, bold: true, font: "Arial", color: C.deep, valign: "middle", name: "hop-two-t" });
  [["search(\"Who do I page when the billing service is down?\")", "→ read: billing-api is owned by Team Falcon"],
    ["search(\"How do I page Team Falcon?\")", "→ On-call Guide · Team Falcon, #1"],
    ["enough: answer", "→ page falcon-primary; Slack #falcon-oncall"]].forEach(([call, res], i) => {
    const y = 2.72 + i * 0.7;
    dot(s, 5.25, y + 0.04, i + 1, C.deep, 0.3);
    s.text([[{ text: call, size: 9.5, font: "Consolas", color: C.dark }], [{ text: res, size: 10.5, b: i === 2, color: C.deep }]], { x: 5.65, y, w: 3.7, h: 0.64, valign: "top", paraSpace: 1, name: `hop-step-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- agentic RAG
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Agentic RAG: the model decides when to search",
    subtitle: "A router decides once. An agent loops (search, read, decide) until it has enough or hits its budget.",
    takeaway: "Worth it for multi-hop questions. Slower, dearer and less predictable. Code still owns the tools, their arguments and the budget.",
    notes: `Time: 4 minutes. You've seen agents and tool calls before: the point here is RAG as a tool.
Left: "The model gets read-only search tools: search by meaning, search by words, look up records, read one chunk and its neighbours. It decides, turn by turn, what to search and when it has enough. Code decides which tools exist, what arguments they accept, and when to stop: six turns, twelve tool calls, then one last turn with the tools off."
Right: "From the history-rag project, a different corpus: 40 history books. Six kinds of question, three runs each. Plain top-5 passed 3 of 6, the router 5, the agent all 6. The agent was the only design to pass the two-hop question: 'did the son of the king who conquered Karr Vael ever invade anyone?' You can't search for the son until you've read who the king was."
"The price: up to 20 times the cost of plain RAG on questions both passed, and a path that changed between runs: 3 to 6 searches on the same unanswerable question."
For Acme: every tool would search as the signed-in person, inside the access filter, exactly like tonight's strategies.
Optional demo (needs the history-rag .env): python agent.py "Did the son of the king who conquered Karr Vael ever invade anyone?" from Documents/history-rag; it prints each step.`,
  });
  const loop = [["The model", "decides: search? which tool? enough?", I.robot], ["A tool, as you", "search_chunks · keyword_search · query_facts · read_chunk", I.search], ["The result", "back into the conversation; loop", I.hist]];
  loop.forEach(([t, d, ic], i) => {
    const y = 1.55 + i * 0.86;
    s.rect({ x: 0.6, y, w: 4.3, h: 0.74, fill: i === 0 ? C.pale : C.white, line: i === 0 ? C.deep : C.line, name: `ag-${i}` });
    s.image(ic, { x: 0.75, y: y + 0.2, w: 0.32, h: 0.32, name: `ag-icon-${i}` });
    s.text([[{ text: t, b: true, size: 12, color: C.dark }], [{ text: d, size: 9.5, color: C.slate, font: i === 1 ? "Consolas" : "Calibri" }]], { x: 1.2, y, w: 3.6, h: 0.74, valign: "middle", paraSpace: 1, name: `ag-t-${i}` });
  });
  ["max 6 turns", "max 12 tool calls", "then tools off"].forEach((t, i) => pill(s, { x: 0.6 + i * 1.45, y: 4.2, w: 1.35, h: 0.32, text: t, fill: C.amberSoft || C.soft, color: C.amberDeep, size: 9.5, font: "Calibri", name: `ag-b-${i}` }));
  S.table(s, { x: 5.15, y: 1.55, cols: [1.65, 1.2, 1.4], rowH: 0.48, headH: 0.32, size: 10.5, align: "center",
    header: ["6 kinds of question", "passed", "two-hop?"],
    rows: [[{ text: "plain top-5", b: true }, "3 / 6", { text: "no", color: C.redText }],
      [{ text: "router", b: true }, "5 / 6", { text: "no", color: C.redText }],
      [{ text: "agent", b: true, color: C.deep }, { text: "6 / 6", b: true, color: C.deep }, { text: "yes", b: true, color: C.deep }]] });
  s.text([[{ text: "The price: ", b: true, color: C.dark }, { text: "up to 20× plain RAG's cost on questions both passed; 3 to 6 searches on the same question, changing between runs." }]],
    { x: 5.15, y: 3.45, w: 4.25, h: 0.8, size: 10.5, color: C.slate, name: "ag-price" });
  s.text("history-rag, ladder.py, 4 Nov 2026: 40 history books, gpt-4.1-mini, 3 runs", { x: 5.15, y: 4.3, w: 4.25, h: 0.4, size: 9, italic: true, color: C.gray, name: "ag-src" });
  num(s);

  // ---------------------------------------------------------------- which one, when
  s = S.contentSlide(deck, {
    section: "Retrieval", title: "Which one, when?",
    subtitle: "Each fixes one kind of miss. Pay for it only when you've seen that miss.",
    takeaway: "Start with reranking and a router. Add the rest when a measured miss calls for it. Friday we measure.",
    notes: `Time: 3 minutes. Read the "fixes" column, then the "on our documents" column.
Then the bottom line, slowly: "None of these is allowed around the access filter. A reranker only re-orders what you may read. Each rewrite searches as you. An agent's tools act as you. Better retrieval never means more access."`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.65, 2.4, 2.35, 2.4], rowH: 0.44, headH: 0.32, size: 10, headSize: 10,
    header: ["Technique", "Fixes", "Costs", "On our documents"],
    rows: [[{ text: "Multi-query", b: true }, "vague or two-part questions", "1 LLM call, ~4 s extra", { text: "won \"first two weeks\"; worse overall (Hit@5 0.92 → 0.88)", color: C.redText }],
      [{ text: "Reranking", b: true, color: C.deep }, "the right chunk ranked too low", "~0.6 s CPU, no LLM call", { text: "the biggest gain (MRR 0.76 → 0.90)", b: true, color: C.deep }],
      [{ text: "Contextual retrieval", b: true }, "chunks that lost their document", "1 LLM call per chunk, at index time", "the free header already helps"],
      [{ text: "Router", b: true, color: C.deep }, "lists and counts", "a classifier: rules are free", { text: "lists 0.67 → 1.00", b: true, color: C.deep }],
      [{ text: "Agentic RAG", b: true }, "multi-hop questions", "many LLM calls, up to 20×", "the only fix for \"who do I page for billing?\""]] });
  s.rect({ x: 0.6, y: 4.25, w: 8.8, h: 0.62, fill: C.pale, line: C.deep, name: "when-acl" });
  s.text([[{ text: "All five run inside the access filter. ", b: true, color: C.deep }, { text: "A reranker re-orders only what you may read; each rewrite searches as you; an agent's tools act as you.", color: C.dark }]],
    { x: 0.75, y: 4.25, w: 8.55, h: 0.62, size: 11, valign: "middle", name: "when-acl-t" });
  num(s);

  // ================================================================ WRAP (10 min)
  // ---------------------------------------------------------------- three ideas
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Three ideas to take home",
    subtitle: "All three from the lab.",
    notes: `Time: 3 minutes. Clock check: about 1:20.
One sentence per card, pointing at it.`,
  });
  const ideas = [["1", "Pick the fix by the kind of miss", "Buried fact: rerank. A list: route it. Lost context: add it back. Two hops: let an agent search again.", I.search],
    ["2", "Every fix has a price", "An LLM call, a second or two, a path that changes between runs. Pay only for a miss you have seen.", I.hist],
    ["3", "Better search, never more access", "Every technique searches as you, inside the access filter. A reranker only re-orders what you may read.", I.lock]];
  ideas.forEach(([k, t, d, ic], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.3, fill: C.white, line: C.line, name: `idea-${i}` });
    s.ellipse({ x: x + 0.22, y: 1.82, w: 0.7, h: 0.7, fill: C.pale, name: `idea-dot-${i}` });
    s.image(ic, { x: x + 0.39, y: 1.99, w: 0.36, h: 0.36, name: `idea-icon-${i}` });
    s.text(k, { x: x + 2.1, y: 1.82, w: 0.55, h: 0.7, font: "Arial", size: 30, bold: true, color: C.line, align: "right", valign: "middle", name: `idea-n-${i}` });
    s.text(t, { x: x + 0.22, y: 2.72, w: 2.45, h: 0.75, font: "Arial", size: 16, bold: true, color: C.dark, name: `idea-t-${i}` });
    s.text(d, { x: x + 0.22, y: 3.5, w: 2.45, h: 1.3, size: 12.5, color: C.slate, name: `idea-d-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- tonight
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Tonight",
    subtitle: "All in the lab, on port 8001. About an hour.",
    takeaway: "Each exercise ends in something you can show: a pair of answers, a router rule, a table.",
    notes: `Time: 2 minutes.
Say: "One and two: find where the techniques help and where they don't, and teach the router one new question. Three is for anyone who finishes early, and it's a preview of Friday."
Lab setup for their laptops: from rag-week-bootcamp, Azure keys in .env (EMBEDDING_PROVIDER=azure), python warmup.py once (the reranker, ~90 MB), sharepoint.py apply all, sync.py --rebuild --apply, then the uvicorn line on the lab slide.
Exercise 2 is checkpoint 6's own exercise 3: the router in app/rag/router.py.`,
  });
  const ex = [["Where rerank helps", "In the lab: one question where rerank beats dense, and one where it changes nothing. Say why, in one line each."],
    ["A new router rule", "Make \"Which teams grew from Q2 to Q3?\" go to a lookup over the Excel sheet (app/rag/router.py)."],
    ["Stretch: what it costs", "GET /retrieve shows ms and llm_calls. Five questions × four strategies: a small table of time and calls."]];
  ex.forEach(([t, d], i) => {
    S.card(s, { x: 0.6 + i * 2.97, y: 1.6, w: 2.85, h: 2.3, num: i + 1, title: t, titleSize: 13.5, body: d, bodySize: 11.5, name: `ex-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 30 Friday
  s = S.darkSlide(deck, { section: "Wrap", icon: I.search, kicker: "FRIDAY  ·  PART 3 OF 4", title1: "Which search", title2: "wins?",
    subtitle: "The same documents, cut two ways. Two more techniques. One scoreboard.",
    detail: "Tonight you saw five techniques by eye. Friday: two indexes chunked differently, parent-document and HyDE, and a scoreboard that measures all of them on the same questions: hits, cost, and leaks at zero.",
    footer: "Fri 13 Nov",
    notes: `Say: "Tonight we looked at the techniques one question at a time, by eye. Friday we measure them: the same documents cut two ways, two more techniques, parent-document and HyDE, and a scoreboard that says which wins which kind of question, and what it costs. Every one runs inside the access filter."
Remind them to pull the repo Friday morning (post it in the chat).
Read the chat one last time and answer what's there before you end the call.` });
  num(s, true);

  // ================================================================ REFERENCE (for the students' copy; not presented)
  s = S.darkSlide(deck, { section: "Reference", icon: I.book, kicker: "REFERENCE", title1: "For after class",
    subtitle: "Not presented. Read these with the code open.",
    detail: "Commands  ·  the security model, layer by layer  ·  the worker  ·  hybrid retrieval  ·  the chat's API  ·  the graph in code  ·  streaming",
    notes: `Not presented. If someone asks a detail question in the chat, jump here.` });
  num(s, true);

  // ---------------------------------------------------------------- R commands
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the commands",
    subtitle: "From the repository root. Postgres runs in Docker on port 5433.",
    notes: `The same commands as ${CP}/README.md, "Run it".`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 8.8, h: 3.45, label: "ONCE, THEN EVERY CLASS", size: 10.5, lines: [
    { text: "docker compose up -d db                                  # Postgres 17 + pgvector", color: C.codeText },
    { text: "python checkpoints/02-platform/db.py migrate             # the schema, roles, policies, the chat's tables", color: C.codeText },
    { text: "python checkpoints/02-platform/db.py seed                # Acme: 6 accounts (ACME_SEED_PASSWORD in .env)", color: C.codeText },
    { text: "python checkpoints/02-platform/fake_drive.py reset       # Friday's files (offline)", color: C.codeText },
    { text: "python checkpoints/02-platform/fake_drive.py apply 1     # ... and 2, 3, 5: Monday's documents", color: C.codeText },
    { text: "python checkpoints/02-platform/sync.py --apply           # the index", color: C.codeText },
    { text: "python run_checkpoint.py 02-platform                     # http://localhost:8000 -> sign in", color: C.green },
    { text: "python checkpoints/02-platform/worker.py --interval 60   # a second terminal: the worker", color: C.codeText },
    { text: "", color: C.codeText },
    { text: "python checkpoints/02-platform/db.py status              # tenants, index, last sync, live workers", color: C.mintText },
    { text: "python checkpoints/02-platform/evaluate.py --strategy all", color: C.mintText },
    { text: "pytest checkpoints/02-platform/tests -q                  # 88 tests on a throwaway database", color: C.mintText }] });
  num(s);

  // ---------------------------------------------------------------- R the security model
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the security model, layer by layer",
    subtitle: "Each layer stops something the others can't. None of them is the model's job.",
    notes: `The same table as the README's "The security model, layer by layer", plus the chat's two rows.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.55, 3.85, 3.4], rowH: 0.42, headH: 0.32, size: 9.5, headSize: 10,
    header: ["Layer", "What enforces it", "What it stops"],
    rows: [[{ text: "Who you are", b: true, color: C.dark }, "the session cookie → sessions → users (app/auth/)", "?user=hr-partner: there is no such parameter"],
      [{ text: "What you read", b: true, color: C.dark }, "EXISTS (document_acl ⨝ your groups) inside the search", "a forbidden chunk taking a top-k slot, or reaching the model"],
      [{ text: "Which company", b: true, color: C.dark }, "Row-Level Security on every tenant table (002_security.sql)", "a missing WHERE tenant_id in Python leaking another company"],
      [{ text: "Each process", b: true, color: C.dark }, "three database roles with exact grants", "a web bug corrupting the index; a worker bug leaking hashes"],
      [{ text: "Who changed what", b: true, color: C.dark }, "audit_log, written in the same transaction as the change", "\"who gave the intern the salary bands?\""],
      [{ text: "Other sites", b: true, color: C.dark }, "SameSite=Lax + the X-Acme-Request header on every write", "another site making your browser post here"],
      [{ text: "Whose chat", b: true, color: C.dark }, "chat_threads policy + a policy on LangGraph's checkpoint tables", "reading someone's thread, even with its id"],
      [{ text: "What it remembers", b: true, color: C.dark }, "each turn re-checks the documents earlier answers used", "an answer from before an access change leaking into the next"]] });
  num(s);

  // ---------------------------------------------------------------- R Monday's state, in one place
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: Monday's four places for state",
    subtitle: "Two JSON files, a ChromaDB folder and the API's memory. Today all of it moves into one database.",
    takeaway: "One place to keep it means one place to protect it. The files themselves stay in Drive.",
    notes: `Not presented (reference). A recap with one new idea: why Postgres.
Point at the four boxes on the left: "Who is who was a JSON file. Who may read what was another JSON file. The chunks were a ChromaDB folder. The timer lived in the API's memory. Four places, and you can't put a lock on a JSON file that says 'only HR may change this line'."
Then the right: "Today everything except the documents moves into Postgres, with pgvector for the vectors. Not because Postgres is fashionable: because one database can enforce rules in one place. People, access, companies, and later the chat's memory."
Don't read the table names. Point at the five groups.`,
  });
  const before = [["identities.json", "who is who"], ["register.json", "who may read what"], ["chroma_data/", "the chunks and vectors"], ["the API's memory", "the timer, the last sync"]];
  before.forEach(([t, d], i) => {
    const y = 1.6 + i * 0.84;
    s.rect({ x: 0.6, y, w: 2.7, h: 0.72, fill: C.white, line: C.line, name: `old-${i}` });
    s.text([[{ text: t, b: true, size: 12, color: C.dark, font: "Consolas" }], [{ text: d, size: 10.5, color: C.gray }]],
      { x: 0.75, y: y + 0.04, w: 2.45, h: 0.64, valign: "middle", paraSpace: 2, name: `old-t-${i}` });
    S.arrow(s, 3.35, y + 0.36, 3.85, 2.95, C.gray, 1.25);
  });
  s.rect({ x: 3.9, y: 1.6, w: 5.5, h: 3.3, fill: C.pale, line: C.deep, name: "pg" });
  s.image(I.db, { x: 4.1, y: 1.75, w: 0.4, h: 0.4, name: "pg-icon" });
  s.text([[{ text: "Postgres + pgvector", b: true, size: 15, color: C.deep, font: "Arial" }], [{ text: "one database, three roles, Row-Level Security", size: 10.5, color: C.slate }]],
    { x: 4.6, y: 1.7, w: 4.6, h: 0.55, valign: "middle", paraSpace: 1, name: "pg-t" });
  const groupsPg = [["People", "users · memberships · groups"], ["Access", "documents · document_acl"], ["The index", "chunks (text + vector) · search_indexes"],
    ["Running it", "sessions · sync_runs · workers · audit_log"], ["The chat", "chat_threads · LangGraph's checkpoints"]];
  groupsPg.forEach(([t, d], i) => {
    const y = 2.4 + i * 0.48;
    s.rect({ x: 4.1, y, w: 5.1, h: 0.42, fill: C.white, line: C.line, name: `pg-row-${i}` });
    s.text([[{ text: t + "   ", b: true, color: C.dark }, { text: d, color: C.slate, font: "Consolas", size: 10 }]],
      { x: 4.22, y, w: 4.9, h: 0.42, size: 11.5, valign: "middle", name: `pg-row-t-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- R two shortcuts that fail
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: two shortcuts that fail",
    subtitle: "Where you check access decides whether forbidden text ever leaves the database.",
    takeaway: "A prompt is not access control. If the text reaches the model, it can reach the user.",
    notes: `Not presented (reference). A worked example, no code.
Card 1: "Search first, then throw away what they can't read. Sounds fine. But the search returned the top 5, and 3 of them were salary bands: we saw it a minute ago. Throw them away and the intern gets two results, and with a stricter question, none. Worse, the forbidden text already left the database, so it's in our logs, our memory, maybe our cache."
Card 2: "Give the model everything and tell it 'don't reveal salaries'. The text is in its context window. One clever question and it's out. A prompt is a request, not a lock."
Card 3: "Filter inside the search. The database only ever considers chunks this person may read. Forbidden chunks never compete for the 5 slots and never leave the database. That's what we built."`,
  });
  const ways = [["Filter after the search", false, ["the top 5 come back: 3 are salary bands", "drop them: the intern gets 2 results", "the forbidden text already left the DB"]],
    ["Tell the model not to", false, ["\"never reveal salaries\" in the prompt", "the text is in its context window", "one clever question and it's out"]],
    ["Filter inside the search", true, ["only readable chunks compete", "the top 5 are 5 the intern may read", "forbidden text never leaves the DB"]]];
  ways.forEach(([t, ok, items], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.3, fill: ok ? C.pale : C.white, line: ok ? C.deep : C.line, name: `way-${i}` });
    s.image(ok ? I.yes : I.no, { x: x + 0.2, y: 1.8, w: 0.38, h: 0.38, name: `way-icon-${i}` });
    s.text(t, { x: x + 0.2, y: 2.3, w: 2.5, h: 0.6, font: "Arial", size: 15, bold: true, color: ok ? C.deep : C.dark, name: `way-t-${i}` });
    // five result slots
    for (let k = 0; k < 5; k++) {
      const bad = i < 2 && [0, 2, 3].includes(k);   // the real run: bands at #1, #3, #4
      s.rect({ x: x + 0.2 + k * 0.5, y: 3.0, w: 0.42, h: 0.28, fill: bad ? C.redSoft : C.greenSoft, line: bad ? C.red : C.deep, name: `slot-${i}-${k}` });
      if (i === 0 && bad) s.line({ x: x + 0.2 + k * 0.5, y: 3.0, w: 0.42, h: 0.28, color: C.red, width: 1, name: `slot-x-${i}-${k}` });
    }
    s.text(items.map(z => ({ runs: z, bullet: true })), { x: x + 0.2, y: 3.45, w: 2.5, h: 1.35, size: 11.5, color: C.slate, paraSpace: 3, bulletIndent: 12, name: `way-body-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- R three keys, three doors
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: three keys, three doors",
    subtitle: "The API and the sync no longer share a key. Each process connects as its own database role.",
    takeaway: "A bug in a web route can't corrupt the index. A bug in the sync can't leak a password hash.",
    notes: `Not presented (reference). Least privilege, applied to the database.
Say: "Monday's honest limit: one process, one timer, one set of rights. Today the sync is its own process, the worker, and it connects with its own key."
Walk the three rows: "The owner changes the schema. It's used by one script, db.py, and never by a running process. The API, acme_app, reads chunks and manages people, and it cannot write a single chunk. The worker, acme_sync, writes the index, and it cannot read people, passwords, sessions, groups or conversations. Not 'doesn't': cannot. The database refuses."
Then: "Why bother? Because bugs happen. If a web route has a bug, the worst it can do is limited by its key. Same for the worker."
The worker's details (a lock so two workers never sync the same company at once, Run now over NOTIFY) are in Reference. Don't go there unless the chat asks.`,
  });
  S.table(s, { x: 0.6, y: 1.6, cols: [1.9, 1.7, 2.6, 2.6], rowH: 0.62, headH: 0.36, size: 11,
    header: ["Who connects", "As role", "Can", "Cannot"],
    rows: [[{ text: "db.py (you, once)", b: true, color: C.dark }, { text: "owner", font: "Consolas" }, "change the schema, seed", { text: "is never used by a running process", color: C.gray }],
      [{ text: "the API", b: true, color: C.dark }, { text: "acme_app", font: "Consolas", color: C.deep, b: true }, "read chunks, manage people, groups, access, chats", { text: "write a chunk or an index", color: C.redText, b: true }],
      [{ text: "the worker", b: true, color: C.dark }, { text: "acme_sync", font: "Consolas", color: C.deep, b: true }, "write chunks and indexes, read the register", { text: "read people, passwords, sessions, chats", color: C.redText, b: true }]] });
  s.rect({ x: 0.6, y: 3.85, w: 8.8, h: 1.05, fill: C.white, line: C.deep, name: "monday-gap" });
  s.image(I.sync, { x: 0.8, y: 4.13, w: 0.45, h: 0.45, name: "monday-gap-icon" });
  s.text([[{ text: "Monday's gap, closed: ", b: true, color: C.deep }, { text: "\"one process, one timer\". The sync is now its own process (python worker.py) with its own key. Any number of workers can run; a Postgres lock makes sure only one syncs a company at a time.", color: C.slate }]],
    { x: 1.45, y: 3.9, w: 7.8, h: 0.95, size: 12, valign: "middle", name: "monday-gap-t" });
  num(s);

  // ---------------------------------------------------------------- R the worker
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the worker",
    subtitle: "python worker.py: syncs every company on a timer and on Run now, as acme_sync.",
    notes: `${CP}/app/ingest/worker.py. The API can't sync (no grant on chunks); it can only insert a sync_requests row and NOTIFY.`,
  });
  const work = [["One company at a time", "a Postgres advisory lock per tenant: two workers never sync the same company at once; the second one skips", I.lock],
    ["Every run recorded", "sync_runs: trigger, who asked, counts, the full plan, the error if any; the Sync tab reads it", I.audit],
    ["Run now, without the API syncing", "the API inserts a sync_requests row and NOTIFYs; the worker wakes, picks it up, runs", I.bell || I.sync],
    ["Alive or not", "a heartbeat in workers every tick; the Sync tab says offline after two minutes of silence", I.server]];
  work.forEach(([t, d, ic], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.55 + row * 1.72, w: 4.3, h: 1.6, title: t, titleSize: 13, icon: ic, iconInline: true, body: d, bodySize: 11.5, name: `work-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- R two ways to find a passage
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: two ways to find a passage (hybrid)",
    subtitle: "By meaning (pgvector) and by words (Postgres full-text), each inside the access filter, fused by rank.",
    takeaway: "Words rescue exact names and codes that meaning misses. Both run inside the filter: fusing can't let a forbidden chunk in.",
    notes: `Not presented (reference). Hybrid retrieval, honestly.
Left: "Meaning search is what we've used since week 3: close vectors. It's good at 'how many days can I carry over' versus 'unused vacation'. It's bad at exact things: a product name, a code, an acronym. Words search is the opposite. Postgres has had it for 20 years: the tsv column was in our schema since this morning."
"We run both, each inside the same access filter, and fuse the two lists by RANK, not by score: a vector distance and a text score aren't on the same scale, a rank is a rank. That's Reciprocal Rank Fusion: 1 over 60 plus your rank, from each list, added up."
The table: "One word, 'Copilot'. By meaning: five unrelated chunks; the expense policy isn't in the top five. By words: exactly one hit, the line in the 2026 expense policy. Hybrid: it's second, so the model sees it."
The numbers: "On our 31 golden questions, meaning alone already finds the right document every time; hybrid ranks it a bit higher. Words alone misses one: 'CI/CD', which isn't spelled that way in the docs. And zero leaks for all three: the filter is inside both."
Don't oversell it: on 89 chunks of well-written policy, meaning does most of the work.`,
  });
  S.table(s, { x: 0.6, y: 1.6, cols: [1.5, 3.0], rowH: 0.5, headH: 0.34, size: 10.5,
    header: [{ text: "\"Copilot\"" }, "Top 5 (Monday's documents)"],
    rows: [[{ text: "by meaning", b: true, color: C.dark }, { text: "handbook, onboarding, directory… not the expense policy", color: C.redText }],
      [{ text: "by words", b: true, color: C.dark }, { text: "Expense Policy 2026 · Software and AI Tools: the only hit", color: C.deep }],
      [{ text: "hybrid", b: true, color: C.deep }, { text: "#2: the expense policy, in front of the model", color: C.deep, b: true }]] });
  S.code(s, { x: 0.6, y: 3.55, w: 4.5, h: 1.4, label: "app/rag/retriever.py  ·  fuse()  ·  line 94", size: 10.5, lines: [
    "for name, results in ranked.items():",
    "    for rank, chunk in enumerate(results, 1):",
    { text: "        score[chunk] += 1 / (60 + rank)", color: C.green, b: true },
    "return sorted(score, highest first)[:top_k]"] });
  S.table(s, { x: 5.4, y: 1.6, cols: [1.4, 0.85, 0.85, 0.9], rowH: 0.48, headH: 0.34, size: 11, align: "center",
    header: ["31 golden questions", "Hit@5", "MRR", "Leaks"],
    rows: [[{ text: "by meaning", b: true, color: C.dark }, "1.00", "0.91", "0"],
      [{ text: "by words", b: true, color: C.dark }, { text: "0.96", color: C.redText }, "0.89", "0"],
      [{ text: "hybrid", b: true, color: C.deep }, { text: "1.00", b: true, color: C.deep }, { text: "0.94", b: true, color: C.deep }, { text: "0", b: true, color: C.deep }]] });
  s.text([[{ text: "Words alone missed one: ", b: true, color: C.dark }, { text: "\"Which tools do we use for CI/CD?\" The documents never spell it that way. Meaning knew." }]],
    { x: 5.4, y: 3.55, w: 4.0, h: 0.75, size: 11, color: C.slate, name: "cicd" });
  s.text("python evaluate.py --strategy all", { x: 5.4, y: 4.4, w: 4.0, h: 0.4, font: "Consolas", size: 11, color: C.deep, valign: "middle", name: "eval-cmd" });
  num(s);

  // ---------------------------------------------------------------- R hybrid in SQL
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the words search",
    subtitle: "Postgres full-text on the same chunks, inside the same filter. The tsv column has a GIN index.",
    notes: `${CP}/app/rag/store_pg.py, keyword_search(). The question becomes an OR of its stemmed words, so a question still matches chunks that share only some of them; ts_rank_cd ranks chunks that match more, closer together, higher.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 8.8, h: 2.55, label: "app/rag/store_pg.py  ·  keyword_search()  ·  simplified", size: 10.5, lines: [
    "WITH words AS (   -- \"How many vacation days can I roll over?\" -> 'vacat' | 'day' | 'roll'",
    "  SELECT to_tsquery('simple', string_agg(quote_literal(w), ' | ')) AS q",
    "  FROM unnest(tsvector_to_array(to_tsvector('english', :question))) AS w)",
    "SELECT c.id, c.text, ts_rank_cd(c.tsv, words.q, 1) AS keyword_rank",
    "FROM chunks c, words",
    "WHERE c.tsv @@ words.q",
    { text: "  AND EXISTS (SELECT 1 FROM document_acl a WHERE ... AND a.group_id = ANY(:my_groups))", color: C.green },
    "ORDER BY keyword_rank DESC LIMIT :k"] });
  s.text([[{ text: "Why OR, not AND: ", b: true, color: C.dark }, { text: "an AND of every word in a question matches almost nothing. " },
    { text: "Why rank, not score: ", b: true, color: C.dark }, { text: "a text rank and a vector distance are on different scales; Reciprocal Rank Fusion only needs positions. " },
    { text: "RETRIEVAL_STRATEGY", font: "Consolas", color: C.deep }, { text: " in .env: dense, keyword or hybrid (the default)." }]],
    { x: 0.6, y: 4.25, w: 8.8, h: 0.75, size: 11.5, color: C.slate, name: "kw-why" });
  num(s);

  // ---------------------------------------------------------------- R from a question to a conversation
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: from a question to a conversation",
    subtitle: "A chat needs four things a search box doesn't. The fourth is the one people forget.",
    takeaway: "Everything we built today has to hold on turn 5, not just on turn 1.",
    notes: `Not presented (reference). Four cards, one sentence each.
1) "Follow-ups. 'And for a client dinner?' means nothing to a search engine. Something has to turn it into a full question first."
2) "Memory. The conversation has to survive a restart, a second server, a deploy. So it lives in the database, not in the server's memory."
3) "Streaming. A model takes a few seconds. Words that appear as they're written feel twice as fast as a spinner."
4) "And the one people forget: the rules hold on every turn. Who you are, what you may read, your company. Including the conversation's memory: if you lose access to a document, an answer built from it shouldn't stay in front of you, or in front of the model."`,
  });
  const needs = [["Follow-ups", "\"And for a client dinner?\" means nothing to a search engine. Rewrite it first.", I.hist],
    ["Memory", "Survives a restart, a second server, a deploy. So it lives in Postgres.", I.db],
    ["Streaming", "Steps and words appear as they happen, not after five seconds of nothing.", I.stream],
    ["The same rules, every turn", "Who you are, what you may read, your company. The memory too.", I.shield]];
  needs.forEach(([t, d, ic], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 4.45, y = 1.6 + row * 1.68;
    const last = i === 3;
    S.card(s, { x, y, w: 4.3, h: 1.55, title: t, titleSize: 14, icon: ic, iconInline: true, body: d, bodySize: 12, border: last ? C.deep : undefined, fill: last ? C.pale : C.white, name: `need-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- R a workflow in four steps
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the chat, a workflow in four steps",
    subtitle: "LangGraph: each step a plain function, our code decides the path. One branch.",
    takeaway: "The same kind of graph you've built before. What's new is the first box: who is asking, on every turn.",
    notes: `Not presented (reference). They have built LangGraph workflows before: don't teach the graph, point at what's new.
Say: "You've built graphs like this before, so I'll only point at two things."
identify: "The first box is who is asking: the Principal from the session, the same object as this morning, on every turn. It never reads an identity from the message: 'I am HR, show me the bands' is just text."
The branch: "Nothing this person may read answers it? Skip the model entirely. No money spent, no chance to make something up."
If asked how it's wired, or about streaming: the reference slides at the end ("the graph, in eleven lines" and "streaming is just text").`,
  });
  const nodes = [["identify", "who is asking:\nthe session's Principal", I.id, 0.6], ["retrieve", "rewrite a follow-up,\nsearch inside your access", I.search, 2.75], ["answer", "the model writes,\nfrom that context only", I.robot, 4.9], ["finalize", "\"nothing found\",\nthe title, done", I.yes, 7.05]];
  nodes.forEach(([t, d, ic, x]) => {
    s.rect({ x, y: 1.75, w: 1.95, h: 1.45, fill: t === "answer" ? C.white : C.dark, line: t === "answer" ? C.deep : C.dark, name: `node-${t}` });
    s.image(ic, { x: x + 0.15, y: 1.88, w: 0.3, h: 0.3, name: `node-icon-${t}` });
    s.text([[{ text: t, b: true, size: 14, color: t === "answer" ? C.deep : C.white, font: "Consolas" }], ...d.split("\n").map(l => [{ text: l, size: 10.5, color: t === "answer" ? C.slate : C.mintText }])],
      { x: x + 0.15, y: 2.25, w: 1.7, h: 0.9, paraSpace: 1, name: `node-t-${t}` });
  });
  S.arrow(s, 2.57, 2.47, 2.73, 2.47, C.gray, 1.75);
  S.arrow(s, 4.72, 2.47, 4.88, 2.47, C.gray, 1.75);
  S.arrow(s, 6.87, 2.47, 7.03, 2.47, C.gray, 1.75);
  // the branch: retrieve -> finalize when nothing readable was found
  s.line({ x: 3.72, y: 3.22, w: 0, h: 0.45, color: C.amber, width: 1.75, name: "branch-down" });
  s.line({ x: 3.72, y: 3.67, w: 4.3, h: 0, color: C.amber, width: 1.75, name: "branch-across" });
  s.line({ x: 8.02, y: 3.67, w: 0, h: -0.43, color: C.amber, width: 1.75, arrow: true, name: "branch-up" });
  s.text("nothing you may read answers it: skip the model", { x: 4.0, y: 3.36, w: 3.9, h: 0.28, size: 10.5, italic: true, color: C.amberDeep, align: "center", name: "branch-label" });
  const props = [["Our code decides the path", "the model is called in one place (and once to rewrite a follow-up)"], ["Saved after every step", "per conversation, in Postgres: that's the memory"], ["Streamed as it happens", "each step when it ends, each word as it's written"]];
  props.forEach(([t, d], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 4.0, w: 2.85, h: 0.95, fill: C.pale, name: `prop-${i}` });
    s.text([[{ text: t, b: true, size: 12, color: C.deep }], [{ text: d, size: 10.5, color: C.slate }]], { x: x + 0.15, y: 4.0, w: 2.6, h: 0.95, valign: "middle", paraSpace: 2, name: `prop-t-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- R the graph in code
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the graph, in eleven lines",
    subtitle: "The four steps from \"a workflow in four steps\", as code. Then the one design decision that matters.",
    takeaway: "Who is asking is given to each turn, never saved in it. Yesterday's groups can't answer today's question.",
    notes: `Not presented (moved out of question 3: they have built LangGraph workflows before). Use it if someone asks in the chat how the chat is wired, or how the Principal reaches each turn.
Left: "Four add_node lines: the four boxes. Then the arrows. add_conditional_edges is the branch: after retrieve, a small function says 'answer' or 'finalize'."
Right, slowly: "The design decision. DeskState is what LangGraph saves after every step: the messages, what the search found. DeskContext is what each turn is GIVEN and never saved: who is asking. The API builds it from the session cookie on every request."
"Why not put the user in the state? Two reasons. Nothing the browser sends can sneak an identity into the graph. And a saved conversation can't carry yesterday's groups into today's question."
Open the real files, zoomed in: ${CP}/app/assistant/workflow.py line 26 (build), then ${CP}/app/assistant/state.py line 26 (DeskState) and 38 (DeskContext). Read the header comment of state.py. Close both.
nodes.py is plain functions; reading it is part of tonight.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 5.2, h: 3.35, label: "app/assistant/workflow.py  ·  line 26", size: 11, lines: [
    "graph = StateGraph(DeskState,",
    "                   context_schema=DeskContext)",
    "graph.add_node(\"identify\", nodes.identify)",
    "graph.add_node(\"retrieve\", nodes.retrieve)",
    "graph.add_node(\"answer\", nodes.answer)",
    "graph.add_node(\"finalize\", nodes.finalize)",
    "graph.add_edge(START, \"identify\")",
    "graph.add_edge(\"identify\", \"retrieve\")",
    { text: "graph.add_conditional_edges(\"retrieve\",", color: C.green },
    { text: "    nodes.after_retrieve, [\"answer\", \"finalize\"])", color: C.green },
    "graph.add_edge(\"answer\", \"finalize\")"] });
  S.card(s, { x: 6.0, y: 1.6, w: 3.4, h: 1.6, title: "DeskState: saved", titleSize: 13, icon: I.db, iconInline: true,
    body: [{ runs: [{ text: "messages", font: "Consolas", size: 10.5, b: true }, { text: "  the conversation", size: 11 }] }, { runs: [{ text: "chunks", font: "Consolas", size: 10.5, b: true }, { text: "  what this turn found", size: 11 }] }, { runs: "after every step, per conversation" }], bodySize: 11, name: "state-card" });
  S.card(s, { x: 6.0, y: 3.35, w: 3.4, h: 1.6, title: "DeskContext: given", titleSize: 13, icon: I.id, iconInline: true, border: C.deep, fill: C.pale,
    body: [{ runs: [{ text: "principal", font: "Consolas", size: 10.5, b: true }, { text: "  from the cookie", size: 11 }] }, { runs: "rebuilt on every request" }, { runs: [{ text: "never saved", b: true, color: C.deep }] }], bodySize: 11, name: "context-card" });
  num(s);

  // ---------------------------------------------------------------- R memory under the same rules
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: chat memory, under the same rules",
    subtitle: "LangGraph saves each conversation in its own tables. We put those tables behind the same kind of policy.",
    takeaway: "A conversation is a copy too. When access changes, the copy has to follow.",
    notes: `Not presented (reference). Two rules, one each side.
Left: "LangGraph's Postgres checkpointer saves the conversation in three tables of its own. They're LangGraph's, not ours: they have a thread id and no company, no person. So we add a policy: a checkpoint row is visible only if its thread is one of YOUR threads, and our chat_threads table only ever shows you your own."
"Result: hand the API someone else's thread id, you get a 404, the same as a made-up id. Ask the database directly, as another person, with the id in hand: zero rows. The tests check both."
Right: "Second rule, the subtle one. Every saved answer records which documents it used. On every turn, before anything else, we ask the database: which of those may this person still read? An answer built on a document you've lost is hidden: from the model's prompt, and from your screen. You'll see it in a minute."
If asked "is it deleted?": no. Hidden, not erased: tonight's exercise is 'forget this conversation'.`,
  });
  s.rect({ x: 0.6, y: 1.6, w: 4.3, h: 3.3, fill: C.white, line: C.line, name: "mem-left" });
  s.text([[{ text: "1  Only its owner sees it", b: true, size: 14, color: C.dark, font: "Arial" }]], { x: 0.8, y: 1.7, w: 4.0, h: 0.42, valign: "middle", name: "mem-left-t" });
  const memRows = [["chat_threads", "one row per conversation: company + person"], ["checkpoints · _blobs · _writes", "LangGraph's tables: visible only through a thread you own"]];
  memRows.forEach(([t, d], i) => {
    const y = 2.2 + i * 0.75;
    s.rect({ x: 0.8, y, w: 3.9, h: 0.65, fill: C.pale, name: `mem-row-${i}` });
    s.text([[{ text: t, b: true, font: "Consolas", size: 10.5, color: C.deep }], [{ text: d, size: 10.5, color: C.slate }]], { x: 0.92, y, w: 3.7, h: 0.65, valign: "middle", paraSpace: 1, name: `mem-row-t-${i}` });
  });
  s.text([[{ text: "Someone else's thread id: ", b: true, color: C.dark }, { text: "404 from the API, zero rows from the database." }]],
    { x: 0.8, y: 3.8, w: 3.9, h: 0.9, size: 12, color: C.slate, valign: "middle", name: "mem-left-r" });
  s.rect({ x: 5.1, y: 1.6, w: 4.3, h: 3.3, fill: C.pale, line: C.deep, name: "mem-right" });
  s.text([[{ text: "2  Access is live, even in memory", b: true, size: 14, color: C.deep, font: "Arial" }]], { x: 5.3, y: 1.7, w: 4.0, h: 0.42, valign: "middle", name: "mem-right-t" });
  const live = ["Every saved answer records the documents it used", "Every turn asks: may this person still read them?", "No: that answer is hidden, from the model and from the screen"];
  live.forEach((t, i) => {
    const y = 2.25 + i * 0.75;
    dot(s, 5.3, y + 0.08, i + 1);
    s.text(t, { x: 5.8, y, w: 3.45, h: 0.6, size: 12, color: C.slate, valign: "middle", name: `live-${i}` });
  });
  pill(s, { x: 5.3, y: 4.45, w: 3.9, h: 0.32, text: "(An earlier answer is hidden here…)", fill: C.white, color: C.gray, size: 10, font: "Calibri", name: "hidden-pill" });
  num(s);

  // ---------------------------------------------------------------- R what you should see
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the chat, follow-ups and hiding",
    subtitle: "A follow-up that works, then an answer that disappears when the access behind it does.",
    takeaway: "Same session, same conversation. The memory obeyed the admin's click on the very next turn.",
    notes: `Not presented (reference). The safety net for the live demo.
Left: "Four chips per answer: the four nodes. The second question was rewritten before the search: that's why it works."
Right: "The first answer was built on the salary bands. The intern lost hr. On the next turn the answer is hidden, and the new answer comes only from what they can read now."
Then read the chat: end of block 3.`,
  });
  s.text([[{ text: "FOLLOW-UPS  ", b: true, color: C.deep, size: 10 }, { text: "$90, then $150: the second question rewritten", color: C.gray, size: 10.5 }]], { x: 0.6, y: 1.55, w: 4.3, h: 0.28, valign: "middle", name: "fu-l" });
  framed(s, P.followup, { x: 0.6, y: 1.9, w: 4.3, border: C.deep, name: "fu-img", alt: "The chat: team dinner $90, then client dinner $150" });
  s.text([[{ text: "ACCESS LOST  ", b: true, color: C.redText, size: 10 }, { text: "the salary answer, hidden on the next turn", color: C.gray, size: 10.5 }]], { x: 5.1, y: 1.55, w: 4.3, h: 0.28, valign: "middle", name: "hid-l" });
  const hh = framed(s, P.hidden, { x: 5.1, y: 1.9, w: 4.3, border: C.red, name: "hid-img", alt: "The earlier salary answer replaced by a hidden note" });
  s.text([[{ text: "The retrieve step said ", color: C.slate }, { text: "1 doc no longer yours", b: true, color: C.redText }, { text: ". The model never saw the old numbers.", color: C.slate }]],
    { x: 5.1, y: 1.9 + hh + 0.15, w: 4.3, h: 0.6, size: 11.5, name: "hid-note" });
  num(s);

  // ---------------------------------------------------------------- R streaming
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: streaming is just text",
    subtitle: "Server-Sent Events: the server keeps the response open and writes a few lines each time something happens.",
    takeaway: "No WebSocket, no framework: lines of text over one HTTP response. The browser draws them as they land.",
    notes: `Not presented (moved out of question 3). If someone asks how the words appear as they're written:
Say: "This is the real stream for 'How much can I spend per person on a team dinner?', copied from the network tab. Each block is an event: a name and some JSON. A step when a node finishes. A token every time the model writes a few characters. Done at the end, with the full answer and its sources."
"The server side is LangGraph's graph.stream with two modes: updates, which gives us each step, and messages, which gives us the model's tokens tagged with the node they came from. We pass on only the answer node's tokens; the follow-up rewrite also uses the model, and nobody needs to see that."
File, if asked: ${CP}/app/routers/chat.py line 121 (ask). Fallback: instructor-notes/fallbacks/part2/chat-raw-stream.txt.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 5.4, h: 3.35, label: "POST /chat/threads/{id}/messages  ·  the response, as it arrives", size: 10.5, lines: [
    { text: "event: step", color: C.green }, { text: "data: {\"node\": \"identify\", \"user\": \"intern@acme.test\"}", color: C.codeText }, "",
    { text: "event: step", color: C.green }, { text: "data: {\"node\": \"retrieve\", \"chunks\": 5, ...}", color: C.codeText }, "",
    { text: "event: token", color: C.amber }, { text: "data: {\"text\": \"You can spend up to $\"}", color: C.codeText }, "",
    { text: "event: token", color: C.amber }, { text: "data: {\"text\": \"90 per person\"}", color: C.codeText }, { text: "...", color: C.mintText }] });
  const sse = [["step", "a node finished: draw a chip", C.green], ["token", "a few characters: append them", C.amberDeep], ["done", "the final answer and its sources", C.deep], ["error", "the turn failed; say so", C.redText]];
  sse.forEach(([e, d, col], i) => {
    const y = 1.6 + i * 0.84;
    s.rect({ x: 6.2, y, w: 3.2, h: 0.72, fill: C.white, line: C.line, name: `sse-${i}` });
    s.text([[{ text: e, b: true, font: "Consolas", size: 12.5, color: col }], [{ text: d, size: 11, color: C.slate }]], { x: 6.35, y, w: 3.0, h: 0.72, valign: "middle", paraSpace: 1, name: `sse-t-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- R the chat's API
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the chat's API",
    subtitle: "app/routers/chat.py. Every route takes the Principal from the session; none takes a user.",
    notes: `DELETE is tonight's exercise 2: it answers 501 until then.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [3.4, 5.4], rowH: 0.48, headH: 0.32, size: 10.5,
    header: ["Route", "What it does"],
    rows: [[{ text: "GET /chat/threads", font: "Consolas" }, "your conversations, newest first; nobody else's, not even for an admin"],
      [{ text: "POST /chat/threads", font: "Consolas" }, "start one: a chat_threads row, owned by you"],
      [{ text: "GET /chat/threads/{id}", font: "Consolas" }, "its messages; an answer built on a document you've lost comes back hidden"],
      [{ text: "POST /chat/threads/{id}/messages", font: "Consolas" }, "ask; the reply streams back as step, token, done (or error) events"],
      [{ text: "DELETE /chat/threads/{id}", font: "Consolas" }, { text: "forget it: tonight's exercise (501 until then)", color: C.amberDeep }]] });
  s.text([[{ text: "Someone else's id, or one that doesn't exist: ", b: true, color: C.dark }, { text: "the same 404, checked before the stream starts. Writes need the X-Acme-Request header like every other write." }]],
    { x: 0.6, y: 4.45, w: 8.8, h: 0.5, size: 11.5, color: C.slate, valign: "middle", name: "chat-api-note" });
  num(s);

  // ---------------------------------------------------------------- R honest limits
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: what this does not do yet",
    subtitle: "Say it before someone asks. Each one is a known gap with a known fix.",
    takeaway: "The checkpoint README lists the rest. A gap you wrote down is a plan; one you didn't is an incident.",
    notes: `Not presented (reference). Read the two, don't defend them.
More in ${CP}/README.md, Honest limits: the users table is global (an admin can learn an email exists elsewhere); a chat turn holds a database connection while the model writes; the chat searches today's documents only (as_of is on Search and Ask).`,
  });
  const gaps = [["Groups typed in by an admin", "A company's groups live in its directory, and Drive has its own sharing.", "Sync groups from the directory; read Drive's permissions with a second, admin-approved identity."],
    ["Hidden is not erased", "A hidden answer stays in the checkpoint tables, readable by the database owner.", "Forget a conversation (tonight), and a retention rule: a policy decision, then a job."]];
  gaps.forEach(([t, what, fix], i) => {
    const x = 0.6 + i * 4.45;
    s.rect({ x, y: 1.6, w: 4.3, h: 3.3, fill: C.white, line: C.line, name: `gap-${i}` });
    s.image(I.warn, { x: x + 0.22, y: 1.8, w: 0.38, h: 0.38, name: `gap-icon-${i}` });
    s.text(t, { x: x + 0.22, y: 2.3, w: 3.85, h: 0.6, font: "Arial", size: 14.5, bold: true, color: C.dark, name: `gap-t-${i}` });
    s.text(what, { x: x + 0.22, y: 2.9, w: 3.85, h: 0.7, size: 12, color: C.slate, name: `gap-what-${i}` });
    s.text([[{ text: "THE FIX", b: true, size: 9, color: C.deep, charSpacing: 0.5 }], [{ text: fix, size: 11.5, color: C.dark }]],
      { x: x + 0.22, y: 3.7, w: 3.85, h: 1.1, paraSpace: 2, name: `gap-fix-${i}` });
  });
  num(s);

  return deck;
}

module.exports = { build };

if (require.main === module) {
  (async () => {
    const deck = await build();
    const out = process.argv[2] || ".";
    deck.saveHtml(path.join(out, "p2-preview.html"));
    // The SE Factory theme is applied by the pptx skill's apply_theme.js when PPTX_SKILL points at it.
    await deck.savePptx(path.join(out, "p2.pptx"), process.env.PPTX_SKILL ? S.THEME : undefined);
    console.log(`slides: ${deck.slides.length}`);
  })().catch(e => { console.error(e); process.exit(1); });
}
