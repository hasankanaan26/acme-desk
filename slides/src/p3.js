// p3.js — Creating your production application, Part 3: which search wins? (acme-desk, checkpoint 03-retrieval)
//
// Same teaching shape as p2.js: one story (Wednesday we judged retrieval by eye, one question at a
// time; tonight we measure it), three ideas, a picture before any code, at most ~12 lines of code on a
// slide, and a "what you should see" slide after every live step, built from real output
// (instructor-notes/fallbacks/part3/: scoreboard-local.txt and screens/).
// Online: no questions to the room, no quizzes, no polls; the chat is read at the dividers and the break.
// Every number on a slide is real: local MiniLM embeddings, Monday's documents, 12 Nov
// (checkpoints/03-retrieval/README.md, "What you should see"). The reranker, HyDE, multi-query and
// answers.py numbers come from the class machine (part3.md); no slide invents them.
const path = require("path");
const sharp = require("sharp");
const { Deck } = require("./kit");
const S = require("./sef");
const { C } = S;
const fa = require("react-icons/fa");

const CP = "checkpoints/03-retrieval";
const SHOTS = path.join(__dirname, "..", "..", "instructor-notes", "fallbacks", "part3", "screens");
const SHOTS2 = path.join(__dirname, "..", "..", "instructor-notes", "fallbacks", "part2", "screens-rag");
const SRC = "local MiniLM embeddings, Monday's documents, 12 Nov";

// ---------- small local helpers (same look as p2.js) ----------
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

// A cropped screenshot (part3/screens: the Search tab at 1.5x, 1407 px wide)
async function shot(dir, name, left, top, width, height) {
  const buf = await sharp(path.join(dir, name + ".png")).extract({ left, top, width, height }).png().toBuffer();
  return { data: "image/png;base64," + buf.toString("base64"), ratio: width / height };
}

function framed(s, img, o) {
  const h = o.w / img.ratio;
  s.rect({ x: o.x - 0.03, y: o.y - 0.03, w: o.w + 0.06, h: h + 0.06, fill: C.white, line: o.border || C.line, name: `${o.name}-frame` });
  s.image(img.data, { x: o.x, y: o.y, w: o.w, h, name: o.name, alt: o.alt || "" });
  return h;
}

function source(s, text, y = 4.72) {
  s.text(text || SRC, { x: 0.6, y, w: 8.8, h: 0.25, size: 9, italic: true, color: C.gray, name: "source" });
}

async function build() {
  const I = {};
  const want = {
    users: [fa.FaUsers, C.green], book: [fa.FaBook, C.green], searchG: [fa.FaSearch, C.green], cutG: [fa.FaCut, C.green],
    trophyG: [fa.FaTrophy, C.green], checkG: [fa.FaCheckDouble, C.green], coffee: [fa.FaCoffee, C.green], terminalG: [fa.FaTerminal, C.green],
    shipG: [fa.FaRocket, C.green],
    search: [fa.FaSearch, C.deep], cut: [fa.FaCut, C.deep], ruler: [fa.FaRulerHorizontal, C.deep], lock: [fa.FaLock, C.deep],
    db: [fa.FaDatabase, C.deep], sync: [fa.FaSyncAlt, C.deep], file: [fa.FaFileAlt, C.deep], robot: [fa.FaRobot, C.deep],
    yes: [fa.FaCheckCircle, C.deep], no: [fa.FaTimesCircle, C.redText], warn: [fa.FaExclamationTriangle, C.amber],
    list: [fa.FaListUl, C.deep], scale: [fa.FaBalanceScale, C.deep], eye: [fa.FaEye, C.deep], snow: [fa.FaSnowflake, C.deep],
  };
  for (const [k, [comp, color]] of Object.entries(want)) I[k] = await S.icon(comp, color);

  // real screenshots, cropped to the part that matters
  const P = {
    // Wednesday's lab (RAG weeks checkpoint 6), from fallbacks/part2/screens-rag
    billingDense: await shot(SHOTS2, "r4-billing-dense", 432, 1118, 1380, 530),
    billingRerank: await shot(SHOTS2, "r3-billing-rerank", 432, 1118, 1380, 530),
    // tonight: Acme Desk 03-retrieval, Search tab, as the intern, top 3 (fallbacks/part3/screens)
    weekSmall: await shot(SHOTS, "p1-firstweek-small", 30, 160, 1350, 400),
    weekParent: await shot(SHOTS, "p2-firstweek-parent", 30, 560, 1350, 370),
    billingParent: await shot(SHOTS, "p4-billing-parent", 30, 590, 1350, 160),
  };

  const deck = new Deck({ title: "Part 3: which search wins?", author: "SE Factory", company: "SE Factory",
    subject: "Applied AI Engineering Workshop · Creating your production application · Part 3" });
  let n = 0;
  const num = (s, dark) => S.slideNumber(s, ++n, dark);

  // ================================================================ OPENING (6 min)
  // ---------------------------------------------------------------- 1 Title
  let s = S.darkSlide(deck, {
    section: "Opening", icon: I.users,
    kicker: "CREATING YOUR PRODUCTION APPLICATION  ·  PART 3 OF 4",
    title1: "Which search", title2: "wins?",
    subtitle: "The same documents cut two ways, two more techniques, and a scoreboard",
    detail: "Wednesday we judged retrieval by eye, one question at a time. Tonight we measure it: by kind of question, at what cost, with leaks at zero.",
    footer: "Fri 13 Nov  ·  checkpoint 03-retrieval",
    notes: `Time: 1 minute. Clock check: 0:00.
Say: "Wednesday we tried five retrieval techniques by eye: one question, one dropdown, look at the sources. Tonight we measure. The same Acme documents cut two ways, two more techniques that use the second cut, and a scoreboard that tells us which technique wins which kind of question, what it costs, and that none of them leaks."
"If you're lost, write it in the chat. I read the chat at every section break."
Before class: Postgres up, Monday's index synced with 03 (89 sections + 136 small chunks), the app on port 8000 signed in as the intern, a terminal in the repo root. part3.md, section 2.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 2 Where we are
  s = S.contentSlide(deck, {
    section: "Opening", title: "Where we are",
    subtitle: "Acme Desk, one app over Acme's documents. Each session adds one layer.",
    takeaway: "Tonight runs offline on your laptop: local embeddings, Postgres in Docker, no key needed for the scoreboard.",
    notes: `Time: 1 minute. Point at tonight's card and move on.
Say: "Monday the documents and the sync. Wednesday retrieval, by eye. Tonight we measure it. Next Monday we make it safe to ship, and Monday's release gate reads tonight's scoreboard."
For their laptops: pull the repo, then the four commands on the reference slide "Commands" (migrate, fake_drive reset + apply all, sync, scoreboard).`,
  });
  const parts = [["1", "The source", "Mon 9 Nov", ["a real Google Drive folder", "edits and deletions noticed", "re-synced on a timer"], false],
    ["2", "By eye", "Wed 11 Nov", ["where plain top-k misses", "five fixes, tried live", "one question at a time"], false],
    ["3", "Measure it", "tonight", ["the same documents, cut twice", "parent-document and HyDE", "a scoreboard per kind of question"], true],
    ["4", "Ship it", "Mon 16 Nov", ["guardrails on input and output", "evals as a release gate", "kill switch, Docker"], false]];
  parts.forEach(([k, title, when, items, now], i) => {
    const x = 0.6 + i * 2.2;
    S.card(s, { x, y: 1.75, w: 2.1, h: 3.1, num: k, numColor: now ? C.green : C.deep, title, titleSize: 13,
      border: now ? C.deep : undefined, fill: now ? C.pale : C.white,
      body: [{ runs: [{ text: when, b: true, color: now ? C.deep : C.gray }] }, ...items.map(t => ({ runs: t, bullet: true }))], bodySize: 11.5, paraSpace: 4, name: `arc-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 3 Tonight in three ideas
  s = S.contentSlide(deck, {
    section: "Opening", title: "Tonight in three ideas",
    subtitle: "Say them now, after the break, and at the end.",
    takeaway: "Three parts tonight: two cuts of the documents, a scoreboard you can trust, correct versus faithful.",
    notes: `Time: 2 minutes. One sentence per card.
1: "No technique wins every kind of question. If you average over all questions, you hide that."
2: "We measure what the model actually needs: the words that answer, not just 'the right document somewhere'. And what it costs: model calls, milliseconds. And leaks: zero, for every technique."
3: "An answer can be faithful to its context and still wrong. When it's wrong, we want to know whose fault it is: the search's or the model's."`,
  });
  const ideas = [["1", "Measure by kind of question", "No technique wins every kind. The average across all questions hides it.", I.list],
    ["2", "Measure what the model needs", "The words that answer, not just the document. What it costs. Leaks at zero.", I.ruler],
    ["3", "Correct, not only faithful", "A faithful answer to the wrong context is wrong. Tell a retrieval miss from a generation miss.", I.scale]];
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

  // ---------------------------------------------------------------- 4 Wednesday by eye
  s = S.contentSlide(deck, {
    section: "Opening", title: "Wednesday, by eye",
    subtitle: "\"How many reviewers does a change to the billing code need?\" Same question, two strategies, in the lab.",
    takeaway: "One question proves a technique can help. It doesn't tell you how often, on which questions, or at what price.",
    notes: `Time: 2 minutes. Clock check: about 0:04.
Left: "Plain search, dense: the coding standards' 'at least one reviewer'. Grounded, and wrong for billing code."
Right: "Rerank: the handbook first, 'two reviewers'. Right."
Then the question for tonight: "That was one question. Is rerank better on lists? On ticket ids? On questions nothing answers? Does it cost anything? You can't answer that by looking. You need a set of questions, built so the techniques disagree, and a scoreboard. That's tonight."
Screenshots: the lab, 11 Nov (fallbacks/part2/screens-rag r4 and r3).`,
  });
  s.text([[{ text: "dense", b: true, size: 12, color: C.redText }, { text: "   \"at least one reviewer\" (Coding Standards)", size: 11, color: C.slate }]], { x: 0.6, y: 1.5, w: 4.3, h: 0.3, name: "wed-l" });
  framed(s, P.billingDense, { x: 0.6, y: 1.85, w: 4.3, name: "wed-dense", alt: "The lab, dense: the coding standards first" });
  s.text([[{ text: "rerank", b: true, size: 12, color: C.deep }, { text: "   \"two reviewers\" (Engineering Handbook)", size: 11, color: C.slate }]], { x: 5.1, y: 1.5, w: 4.3, h: 0.3, name: "wed-r" });
  framed(s, P.billingRerank, { x: 5.1, y: 1.85, w: 4.3, name: "wed-rerank", alt: "The lab, rerank: the handbook first" });
  s.rect({ x: 0.6, y: 3.6, w: 8.8, h: 1.25, fill: C.pale, line: C.deep, name: "wed-q" });
  s.text([[{ text: "Tonight's question", b: true, size: 13, color: C.deep }],
    [{ text: "Which technique wins which ", size: 12.5, color: C.dark }, { text: "kind", size: 12.5, b: true, color: C.dark }, { text: " of question, how often, at what cost, and does any of them ever show you a document you may not read?", size: 12.5, color: C.dark }]],
    { x: 0.8, y: 3.6, w: 8.4, h: 1.25, valign: "middle", paraSpace: 3, name: "wed-q-t" });
  num(s);

  // ================================================================ A. TWO CUTS (24 min)
  // ---------------------------------------------------------------- 5 divider
  s = S.darkSlide(deck, { section: "Two cuts", icon: I.cutG, kicker: "PART A  ·  ABOUT 24 MINUTES", title1: "Two cuts of", title2: "the same documents",
    subtitle: "Sections for context, small chunks for precision. Both written by the sync.",
    footer: "sections  ·  small chunks  ·  parent-document  ·  HyDE",
    notes: `Time: 30 seconds. Clock check: about 0:06. Read the chat.
Say: "First: what we store. Until tonight every document was cut one way, into sections. Tonight we add a second cut, and two techniques that use it."` });
  num(s, true);

  // ---------------------------------------------------------------- 6 Sections vs small chunks
  s = S.contentSlide(deck, {
    section: "Two cuts", title: "One section, two small chunks",
    subtitle: "Onboarding checklist, Week 1. The section keeps its heading; each small chunk is a few whole sentences.",
    takeaway: "Both cuts are in the index. Every small chunk knows its section: parent_id = HR-ONBOARDING::000.",
    notes: `Time: 3 minutes. The real rows from the chunks table.
Left: "This is a section, what Parts 1 and 2 stored. 443 characters, five checklist items, and a header line: the document title and the heading, 'Week 1: Getting Started'."
Right: "The second cut: the same text split into whole sentences, up to 220 characters each. Two small chunks. Each starts with the document title only, not the heading. And each remembers its section: parent_id."
"Look at the second one: three of the five items. Ask 'what do I do in my first week?' and a search over small chunks can find this one, and hand the model three items out of five."
Ids: HR-ONBOARDING::000 (the section), ::000#00 and ::000#01 (its small chunks).`,
  });
  s.rect({ x: 0.6, y: 1.55, w: 4.45, h: 3.35, fill: C.white, line: C.deep, name: "sec-box" });
  s.text([[{ text: "SECTION  ·  HR-ONBOARDING::000  ·  443 chars", b: true, size: 9, color: C.deep, charSpacing: 0.5 }],
    [{ text: "New Employee Onboarding Checklist > Week 1: Getting Started", b: true, size: 10.5, color: C.dark }],
    [{ text: "- Collect your laptop and access badge from the IT desk on Floor 2.", size: 10.5, color: C.slate }],
    [{ text: "- Set up your company email and Slack account using the credentials in your welcome packet.", size: 10.5, color: C.slate }],
    [{ text: "- Complete the mandatory security awareness training on the learning portal.", size: 10.5, color: C.slate }],
    [{ text: "- Schedule a 1-on-1 with your direct manager to discuss your first 30-day goals.", size: 10.5, color: C.slate }],
    [{ text: "- Join the #general, #engineering, and #your-team Slack channels.", size: 10.5, color: C.slate }]],
    { x: 0.75, y: 1.62, w: 4.15, h: 3.2, valign: "top", paraSpace: 3, name: "sec-t" });
  const smalls = [["::000#00  ·  190 chars", "New Employee Onboarding Checklist: Collect your laptop and access badge from the IT desk on Floor 2. Set up your company email and Slack account using the credentials in your welcome packet."],
    ["::000#01  ·  252 chars", "New Employee Onboarding Checklist: Complete the mandatory security awareness training on the learning portal. Schedule a 1-on-1 with your direct manager to discuss your first 30-day goals. Join the #general, #engineering, and #your-team Slack channels."]];
  smalls.forEach(([id, t], i) => {
    const y = 1.55 + i * 1.72;
    s.rect({ x: 5.45, y, w: 3.95, h: 1.6, fill: C.soft, line: C.line, name: `sm-${i}` });
    s.text([[{ text: "SMALL CHUNK  " + id, b: true, size: 9, color: C.gray, charSpacing: 0.5 }], [{ text: t, size: 10, color: C.slate }],
      [{ text: "parent_id: HR-ONBOARDING::000", size: 9, font: "Consolas", color: C.deep }]],
      { x: 5.58, y: y + 0.04, w: 3.72, h: 1.52, valign: "top", paraSpace: 3, name: `sm-t-${i}` });
    S.arrow(s, 5.08, 2.4 + i * 1.5, 5.42, y + 0.8, C.deep, 1.25);
  });
  num(s);

  // ---------------------------------------------------------------- 7 Precise vs context
  s = S.contentSlide(deck, {
    section: "Two cuts", title: "Precise, or in context?",
    subtitle: "A vector is one summary of its text. The longer the text, the more it averages.",
    takeaway: "Small chunks find the sentence; sections carry what the sentence needs around it. You want both.",
    notes: `Time: 3 minutes. The trade-off, with one real pair of distances.
Left: "A small chunk's vector is about one or two sentences. 'A change that touches billing or authentication needs two reviewers' is a small chunk, and it's 0.90 from the billing question: close. The same sentence inside its section, the handbook's Page 1, 905 characters about code review, deployments and incidents: 1.46. Not even in the top 5."
Right: "But a small chunk carries little context. The second small chunk on the last slide says 'Complete the security training...' and nothing about week 1: the heading stayed with the section. Ask about week 1, and the small chunk doesn't know it's about week 1."
"So: small for finding, sections for reading. The next slide does both."
Numbers: Search tab, intern, 12 Nov: parent's matched small chunk 0.898; the handbook section by dense: 1.46.`,
  });
  const sides = [["Small chunk", "precise", [["its vector is one or two sentences", false], ["billing question → the handbook sentence: 0.90", true], ["but it loses the heading: \"Complete the security training…\" doesn't say week 1", false]], C.deep],
    ["Section", "in context", [["its vector averages the whole section", false], ["billing question → handbook Page 1 (905 chars): 1.46, not in the top 5", true], ["but it carries the heading and the neighbours: the whole Week 1 list", false]], C.teal]];
  sides.forEach(([t, tag, rows, col], i) => {
    const x = 0.6 + i * 4.45;
    s.rect({ x, y: 1.6, w: 4.3, h: 3.3, fill: C.white, line: C.line, name: `pv-${i}` });
    s.rect({ x, y: 1.6, w: 0.07, h: 3.3, fill: col, name: `pv-edge-${i}` });
    s.text([[{ text: t, b: true, size: 16, color: C.dark, font: "Arial" }, { text: "   " + tag, size: 12, i: true, color: C.gray }]], { x: x + 0.25, y: 1.7, w: 3.9, h: 0.5, valign: "middle", name: `pv-t-${i}` });
    s.text(rows.map(([r, num]) => ({ runs: [{ text: r, b: num, color: num ? C.deep : C.slate }], bullet: true })),
      { x: x + 0.25, y: 2.3, w: 3.9, h: 2.5, size: 12, paraSpace: 8, valign: "top", name: `pv-b-${i}`, bulletIndent: 12 });
  });
  num(s);

  // ---------------------------------------------------------------- 8 Parent-document
  s = S.contentSlide(deck, {
    section: "Two cuts", title: "Parent-document: match small, return big",
    subtitle: "Search the small chunks, return the sections they point to, fetched through the access filter again.",
    takeaway: "The handbook page, invisible to plain search, comes back second, with the sentence that found it.",
    notes: `Time: 4 minutes. The diagram, then the real result under it.
Left to right: "One: the question is embedded, as always. Two: we search the SMALL chunks, 20 deep. Three: each small chunk names its section; we keep the first five distinct ones, in the order their best small chunk ranked. Four: we fetch those sections with a second query, and that query goes through the access filter again."
"Why again? The small chunk is exactly as readable as its section today. 'The ids came from a search I trust' is how a leak starts the day that stops being true. Two lines of SQL; we pay them."
Bottom, the real Search tab, strategy parent, as the intern: "Coding Standards first, then the Engineering Handbook, Page 1, the 905-character page plain search couldn't find. And it says which small chunk picked it: 'A change that touches billing or authentication needs two reviewers.'"
Distances on a parent result are the matched small chunk's, so the confidence means 'how close was the sentence'.`,
  });
  const flow = [["1", "Embed the question", "as always", I.search], ["2", "Search small chunks", "dense, 20 deep", I.cut], ["3", "Keep distinct parents", "first k parent_ids, in rank order", I.list], ["4", "Fetch the sections", "by_ids(), inside the access filter", I.lock]];
  flow.forEach(([k, t, d, ic], i) => {
    const x = 0.6 + i * 2.25;
    s.rect({ x, y: 1.6, w: 1.95, h: 1.35, fill: i === 3 ? C.pale : C.white, line: i === 3 ? C.deep : C.line, name: `pd-${i}` });
    dot(s, x + 0.12, 1.7, k, C.deep, 0.32);
    s.image(ic, { x: x + 1.5, y: 1.7, w: 0.32, h: 0.32, name: `pd-icon-${i}` });
    s.text([[{ text: t, b: true, size: 12, color: C.dark }], [{ text: d, size: 10, color: C.slate, font: i === 3 ? "Consolas" : "Calibri" }]],
      { x: x + 0.12, y: 2.1, w: 1.75, h: 0.8, valign: "top", paraSpace: 2, name: `pd-t-${i}` });
    if (i < 3) S.arrow(s, x + 1.97, 2.27, x + 2.23, 2.27, C.deep, 1.5);
  });
  s.text([[{ text: "Search tab, strategy parent, as the intern: ", b: true, size: 10.5, color: C.dark }, { text: "\"How many reviewers does a change to the billing code need?\"", i: true, size: 10.5, color: C.slate }]],
    { x: 0.6, y: 3.1, w: 8.8, h: 0.3, name: "pd-q" });
  framed(s, P.billingParent, { x: 0.6, y: 3.45, w: 8.8, name: "pd-img", alt: "Search tab, parent: the Engineering Handbook Page 1 at #2, matched by the small chunk about two reviewers" });
  num(s);

  // ---------------------------------------------------------------- 9 Built by the sync
  s = S.contentSlide(deck, {
    section: "Two cuts", title: "Built by the sync, not at question time",
    subtitle: "The worker writes both cuts in one transaction, from the same parsed text. The API can't write either.",
    takeaway: "Sections and small chunks change together, flip together (blue/green) and are deleted together.",
    notes: `Time: 3 minutes. Why this isn't the lab's version.
Left, the rules: "The lab built its small chunks when a question came in, from whatever the index held. Here the API runs as acme_app, which cannot write chunks, on purpose. So the worker, acme_sync, writes both cuts, in the same transaction, from the same parsed text. They can never be out of step."
"A foreign key from the small chunk to its section: a small chunk whose section is gone is impossible. Delete the section, and its small chunks go with it."
Right, the code: "The whole cut, eleven lines. For each section, drop the header line, split the body into whole sentences up to 220 characters, prefix the document title, copy the section's labels, add parent_id. The labels matter: access, status and dates treat a small chunk exactly like its section."
File: ${CP}/app/rag/children.py; the migration: 006_small_chunks.sql.`,
  });
  const rules = [["acme_sync writes both cuts", "one transaction, same parsed text", I.sync],
    ["a foreign key to the section", "no small chunk without its section", I.db],
    ["acme_app can't write chunks", "the lab built them at question time; we can't, and shouldn't", I.lock],
    ["the same labels as the section", "access, status, dates: a relabel reaches both", I.file]];
  rules.forEach(([t, d, ic], i) => {
    const y = 1.55 + i * 0.84;
    s.rect({ x: 0.6, y, w: 3.7, h: 0.74, fill: C.white, line: C.line, name: `bs-${i}` });
    s.image(ic, { x: 0.75, y: y + 0.2, w: 0.32, h: 0.32, name: `bs-icon-${i}` });
    s.text([[{ text: t, b: true, size: 11.5, color: C.dark }], [{ text: d, size: 9.5, color: C.slate }]], { x: 1.2, y, w: 3.05, h: 0.74, valign: "middle", paraSpace: 1, name: `bs-t-${i}` });
  });
  S.code(s, { x: 4.5, y: 1.55, w: 4.9, h: 3.35, label: "app/rag/children.py", size: 9.5, lines: [
    "def small_chunks(sections, title, max_chars):",
    "    small = []",
    "    for section in sections:",
    "        header, _, body = section[\"text\"].partition(\"\\n\")",
    "        for n, sentence in enumerate(",
    "                split_sentences(body or header, max_chars)):",
    "            small.append({",
    "                \"id\": f\"{section['id']}#{n:02d}\",",
    "                \"text\": f\"{title}: {sentence}\",",
    "                \"metadata\": {**section[\"metadata\"],",
    "                             \"parent_id\": section[\"id\"]}})",
    "    return small"] });
  num(s);

  // ---------------------------------------------------------------- 10 Read your chunks
  s = S.contentSlide(deck, {
    section: "Two cuts", title: "Read your chunks",
    subtitle: "Before any metric: what did the cut actually produce, on our documents?",
    takeaway: "Half our sections fit in one small chunk. For those, parent returns exactly what plain search would.",
    notes: `Time: 3 minutes. Numbers from the chunks table after Monday's sync.
Stats: "89 sections, 136 small chunks. Sections average 275 characters. And 50 of the 89 sections fit in ONE small chunk: for those, the small chunk is the section without its heading. Parent-document can't change anything there: it finds the small chunk and returns... the same section plain search would have."
Hold that thought: it predicts the scoreboard. "Acme's documents are short: policies, lists, a CSV. Parent-document pays off when sections are long. We have one long one: the handbook PDF page."
The red box: "And here's a real small chunk, in full: 'IT helpdesk tickets (October 2026): Fixed.' The sentence splitter cut the ticket row after a full stop. No ticket id, no problem, just 'Fixed.' That's what 'a chunk that lost its context' looks like. Nobody would find it by reading the code. You find it by reading your chunks."`,
  });
  const stats = [["89", "sections", "avg 275 characters"], ["136", "small chunks", "up to 220 characters"], ["50 of 89", "sections fit in ONE small chunk", "parent = dense for those"]];
  stats.forEach(([v, l, d], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.55, w: 2.85, h: 1.6, fill: i === 2 ? C.pale : C.white, line: i === 2 ? C.deep : C.line, name: `rc-${i}` });
    S.stat(s, { x: x + 0.2, y: 1.6, w: 2.5, h: 0.7, value: v, size: i === 2 ? 30 : 36, label: l + "\n" + d, labelH: 0.7, labelSize: 11, name: `rc-s-${i}` });
  });
  s.rect({ x: 0.6, y: 3.35, w: 8.8, h: 1.3, fill: C.redSoft, line: C.red, name: "rc-bad" });
  s.text([[{ text: "A REAL SMALL CHUNK, IN FULL  ·  IT-HELPDESK-EXPORT::000#01", b: true, size: 9, color: C.redText, charSpacing: 0.5 }],
    [{ text: "IT helpdesk tickets (October 2026): Fixed.", size: 20, b: true, font: "Consolas", color: C.dark }],
    [{ text: "The splitter cut a ticket row after \"version 6.2.\" Which ticket? Fixed how? The chunk can't say.", size: 11, color: C.slate }]],
    { x: 0.8, y: 3.35, w: 8.4, h: 1.3, valign: "middle", paraSpace: 4, name: "rc-bad-t" });
  source(s, SRC + " · the chunks table after sync.py --apply", 4.75);
  num(s);

  // ---------------------------------------------------------------- 11 HyDE
  s = S.contentSlide(deck, {
    section: "Two cuts", title: "HyDE: search with a made-up answer",
    subtitle: "A question doesn't look like its answer, so search with an answer-shaped passage the model writes.",
    takeaway: "One model call before every search. The made-up passage only steers the search; it is never shown or quoted.",
    notes: `Time: 3 minutes. Clock check: about 0:28.
Steps: "One: the question goes to the model with this prompt, the real one from the code. Two: the model writes three to five sentences in the voice of a company document. It doesn't need to be correct, only shaped like our documents. Three: we embed that passage instead of the question, and search."
The two warnings, slowly: "It costs a model call, a second or more, on EVERY question. And the distance it reports is to the made-up passage, not to your question. A made-up answer looks very like a real document, so HyDE looks surer than it is. Keep that in mind for the questions nothing answers."
"Tonight's laptop numbers have no model, so HyDE's row is starred on the scoreboard: it fell back to plain search. The class machine's numbers are in the notes."
Prompt: app/prompts/query_rewrite.py, HYDE_PROMPT.`,
  });
  const hy = [["1", "The question", "\"Who do I ring if I'm locked out?\""], ["2", "The model writes", "a short passage, in a document's voice"], ["3", "Embed the passage", "and search with it, inside your access"]];
  hy.forEach(([k, t, d], i) => {
    const y = 1.6 + i * 0.95;
    dot(s, 0.6, y + 0.12, k);
    s.text([[{ text: t, b: true, size: 13, color: C.dark }], [{ text: d, size: 11, color: C.slate }]], { x: 1.1, y, w: 3.3, h: 0.85, valign: "top", paraSpace: 2, name: `hy-${i}` });
  });
  S.code(s, { x: 4.6, y: 1.55, w: 4.8, h: 1.75, label: "HYDE_PROMPT  ·  app/prompts/query_rewrite.py", size: 9.5, lines: [
    "Write a short passage (3 to 5 sentences) from an",
    "internal company document (a policy, handbook, FAQ,",
    "ticket or announcement) that would answer the",
    "question below. Write it as the document would, with",
    "concrete specifics. Do not mention the question."] });
  const warns = [["+1 model call, every question", "about a second or more, before the search even starts"], ["looks surer than it is", "the distance is to the made-up passage, not to your question"]];
  warns.forEach(([t, d], i) => {
    const y = 3.45 + i * 0.72;
    s.rect({ x: 4.6, y, w: 4.8, h: 0.62, fill: C.amberSoft, line: C.amber, name: `hw-${i}` });
    s.image(I.warn, { x: 4.72, y: y + 0.15, w: 0.32, h: 0.32, name: `hw-icon-${i}` });
    s.text([[{ text: t, b: true, size: 11.5, color: C.amberDeep }], [{ text: d, size: 10, color: C.slate }]], { x: 5.15, y, w: 4.15, h: 0.62, valign: "middle", paraSpace: 1, name: `hw-t-${i}` });
  });
  num(s);

  // ================================================================ B. A SCOREBOARD YOU CAN TRUST (20 min)
  // ---------------------------------------------------------------- 12 divider
  s = S.darkSlide(deck, { section: "Scoreboard", icon: I.trophyG, kicker: "PART B  ·  ABOUT 20 MINUTES", title1: "A scoreboard", title2: "you can trust",
    subtitle: "Questions built so the techniques disagree. Numbers that say what the model needs.",
    footer: "needs  ·  seven kinds  ·  Hit@1, MRR, calm  ·  cost  ·  leaks",
    notes: `Time: 30 seconds. Clock check: about 0:30. Read the chat.
Say: "Ten techniques now. To compare them we need two things: questions that make them disagree, and numbers that don't flatter them."` });
  num(s, true);

  // ---------------------------------------------------------------- 13 Too kind
  s = S.contentSlide(deck, {
    section: "Scoreboard", title: "\"Right document in the top 5\" is too kind",
    subtitle: "Part 2 asked: did the right document come back? Tonight: did the words the answer needs come back?",
    takeaway: "Same results, two scores. The kind one says small chunks are perfect on lists; the honest one says they fail 3 times out of 4.",
    notes: `Time: 3 minutes. The reason for the new metric.
Left: "Strategy small, on the four whole-section questions: 'what do I do in my first week?', 'what are the rules for code reviews?' and two more. Did the right DOCUMENT come back in the top 5? Every time: 1.00."
"Did the WORDS come back, the whole list the answer needs? Once in four: 0.25. A sentence of the week-1 checklist is not the checklist."
Right: "So each question says what the model needs: a document, plus the words it can't do without. A chunk meets the need when it's from that document and holds every one of those words. We keep Part 2's number too, as doc@5: when doc@5 is high and Hit@5 is low, the search found the document and handed over the wrong piece."
Numbers: scoreboard.py, whole-section table, row small: doc@5 1.00, Hit@5 0.25, Hit@1 0.00.`,
  });
  S.table(s, { x: 0.6, y: 1.6, cols: [2.4, 1.0, 1.0], rowH: 0.62, headH: 0.36, size: 12, align: "center",
    header: ["small, whole-section", "score", ""],
    rows: [[{ text: "right document in the top 5 (doc@5)", color: C.dark }, { text: "1.00", b: true, size: 16, color: C.gray }, { text: "kind", i: true, color: C.gray }],
      [{ text: "the words it needs in the top 5 (Hit@5)", color: C.dark, b: true }, { text: "0.25", b: true, size: 16, color: C.redText }, { text: "honest", i: true, color: C.redText }]] });
  s.rect({ x: 5.2, y: 1.6, w: 4.2, h: 2.7, fill: C.white, line: C.line, name: "tk-need" });
  s.text([[{ text: "A NEED", b: true, size: 9, color: C.deep, charSpacing: 0.5 }],
    [{ text: "one document + the words the answer can't do without", size: 12, color: C.dark }],
    [{ text: "MEETS IT", b: true, size: 9, color: C.deep, charSpacing: 0.5 }],
    [{ text: "a chunk from that document holding every one of the words (case, spaces and punctuation ignored)", size: 12, color: C.dark }],
    [{ text: "doc@5 HIGH, Hit@5 LOW", b: true, size: 9, color: C.redText, charSpacing: 0.5 }],
    [{ text: "found the document, handed over the wrong piece", size: 12, color: C.dark }]],
    { x: 5.4, y: 1.65, w: 3.85, h: 2.6, valign: "top", paraSpace: 4, name: "tk-need-t" });
  source(s, SRC + " · scoreboard.py, whole-section table, 4 questions", 4.45);
  num(s);

  // ---------------------------------------------------------------- 14 One question
  s = S.contentSlide(deck, {
    section: "Scoreboard", title: "A question: person, question, needs, facts",
    subtitle: "shared/golden/golden_scenarios.json, question S09, exactly as stored.",
    takeaway: "needs score the search (no model). facts score the answer (answers.py). Neither needs a judge.",
    notes: `Time: 3 minutes. Walk the JSON top to bottom.
"scenario: the kind of question, 'buried', one sentence inside a section about something else. user: who asks. Every question is asked as its own person's real account, through the same access filter as the app. question: what they type."
"needs: what the context must hold. One need here: the Engineering Handbook, and the words 'two reviewers'. A two-document question has two needs."
"facts: what a correct ANSWER must say. A list is alternatives: 'two' or '2'. answer: a reference answer for people, never scored."
"Both checks are string matching. No model judges anything, so it costs nothing and gives the same result every run."`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 5.6, h: 3.35, label: "QUESTION S09", size: 11, lines: [
    "{\"id\": \"S09\", \"scenario\": \"buried\", \"user\": \"intern\",",
    " \"question\": \"How many reviewers does a change",
    "              to the billing code need?\",",
    " \"needs\": [{\"doc\": \"ENG-HANDBOOK\",",
    "            \"evidence\": [\"two reviewers\"]}],",
    " \"facts\": [[\"two\", \"2\"]],",
    " \"answer\": \"Two: changes that touch billing or",
    "            authentication need two reviewers.\"}"] });
  const parts14 = [["user", "asked as this person's real account, inside the access filter"], ["needs", "what the CONTEXT must hold: scores the search"], ["facts", "what the ANSWER must say: scores the answer"], ["answer", "for people reading the set; never scored"]];
  parts14.forEach(([k, d], i) => {
    const y = 1.55 + i * 0.84;
    pill(s, { x: 6.4, y: y + 0.05, w: 0.95, h: 0.32, text: k, size: 11, name: `oq-k-${i}` });
    s.text(d, { x: 7.45, y, w: 1.95, h: 0.74, size: 10.5, color: C.slate, valign: "top", name: `oq-d-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 15 Seven kinds
  s = S.contentSlide(deck, {
    section: "Scoreboard", title: "Seven kinds of question, built to disagree",
    subtitle: "28 questions, 4 of each kind, written from the documents before any technique ran on them.",
    takeaway: "Each kind is a bet about which technique should win it. The scoreboard settles the bet.",
    notes: `Time: 3 minutes. One row each, with the bet.
casual: "everyday words. Bet: dense, or HyDE." identifier: "an exact ticket id. Bet: keyword, hybrid." buried: "one sentence in a section about something else. Bet: parent, rerank." whole-section: "the answer is a list. Bet: sections, parent; small should lose." lost-context: "the words that place the answer are in the heading. 'Week 4' is only in the heading. Bet: sections, with their header; small should lose." two-docs: "core hours from one policy, the allowance from another. Bet: nobody wins Hit@1: one chunk can't hold two documents." unanswerable: "the intern asking for the salary bands, which they may not read. The right answer is 'I don't know', and zero leaks."`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.45, 2.85, 3.4, 1.1], rowH: 0.43, headH: 0.32, size: 10, headSize: 10,
    header: ["Kind", "What makes it hard", "Example (asked as)", "The bet"],
    rows: [[{ text: "casual", b: true }, "everyday words, not the document's", { text: "\"How fast do I need to get back to people on chat?\" (intern)", i: true }, "dense, HyDE"],
      [{ text: "identifier", b: true }, "an exact id, code or name", { text: "\"How was IT-4112 resolved?\" (intern)", i: true }, "keyword"],
      [{ text: "buried", b: true }, "one sentence in a section about something else", { text: "\"Does a team offsite need anyone's sign-off?\" (intern)", i: true }, "parent"],
      [{ text: "whole-section", b: true }, "the answer is a whole list", { text: "\"What do I need to do in my first week?\" (intern)", i: true }, "sections"],
      [{ text: "lost-context", b: true }, "the placing words are in the heading", { text: "\"What is on my onboarding list for week 4?\" (intern)", i: true }, "sections"],
      [{ text: "two-docs", b: true }, "the answer needs two documents", { text: "\"…core hours, and the home office setup allowance?\" (intern)", i: true }, "nobody"],
      [{ text: "unanswerable", b: true }, "nothing this person may read answers it", { text: "\"Salary range for a senior developer?\" (intern)", i: true }, "\"I don't know\""]] });
  num(s);

  // ---------------------------------------------------------------- 16 Numbers in plain words
  s = S.contentSlide(deck, {
    section: "Scoreboard", title: "The numbers, in plain words",
    subtitle: "One table per kind of question, one row per technique. Six columns.",
    takeaway: "Quality first, then cost. A technique that leaks once wins nothing, however good its other numbers.",
    notes: `Time: 3 minutes. Read the plain-words column only.
"Ready: the position at which the results so far hold everything the question needs. Hit@1: ready at 1, the first result alone is enough. MRR: one over that position, averaged: 1.0, 0.5, 0.33, zero when never."
"Calm, for questions nothing answers: the best result is NOT high confidence, so the answer step gets a warning."
"LLM calls and milliseconds per question: the price. Leaks: questions where any result came from a document this person may not read. It must be zero for every technique."
"The winner rule: best Hit@1, then MRR (or calm), then fewer model calls, then faster. A leak disqualifies."`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.4, 5.2, 2.2], rowH: 0.47, headH: 0.32, size: 11, headSize: 10.5,
    header: ["Number", "In plain words", "Good is"],
    rows: [[{ text: "Hit@1", b: true, color: C.deep }, "the first result alone holds everything the question needs", "1.00"],
      [{ text: "MRR", b: true, color: C.deep }, "1 / the position where the context first holds everything (1, ½, ⅓ … 0)", "1.00"],
      [{ text: "doc@5", b: true }, "the right document somewhere in the top 5 (Part 2's Hit@5)", "read it next to Hit@5"],
      [{ text: "calm", b: true, color: C.deep }, "nothing answers it, and the best result is not high confidence", "1.00"],
      [{ text: "LLM / ms", b: true }, "model calls and milliseconds per question, before the answer", "low"],
      [{ text: "leaks", b: true, color: C.redText }, "questions where a result came from a document this person may not read", { text: "0, always", b: true, color: C.redText }]] });
  num(s);

  // ---------------------------------------------------------------- 17 Freeze it and lint it
  s = S.contentSlide(deck, {
    section: "Scoreboard", title: "Freeze it, and lint it",
    subtitle: "A question set that quietly rots measures the wrong thing, with confidence.",
    takeaway: "Never edit a question because a technique missed it. A test checks every evidence word is really in its document.",
    notes: `Time: 3 minutes. Clock check: about 0:48.
Left, the rules: "Written from the documents before any technique ran. Frozen: you never edit a question because a technique missed it. That's how a test set turns into a mirror of whatever you shipped. You may ADD questions, that's tonight's stretch exercise."
Right, the lint: "tests/test_scoreboard.py rebuilds Monday's documents from the weekend's events, without a database, and checks three things for every need: the document is current, the person asking may read it, and every evidence word is really in it. If HR edits a policy and the words move, this test fails before the scoreboard lies."
"It runs in under a second, no Postgres, no model."`,
  });
  const fr = [["Written first", "from the documents, before any technique ran on them", I.file], ["Frozen", "never edited because a technique missed; add, don't edit", I.snow], ["Linted", "a test checks every need against Monday's documents", I.yes]];
  fr.forEach(([t, d, ic], i) => {
    const y = 1.55 + i * 1.1;
    s.rect({ x: 0.6, y, w: 3.6, h: 0.98, fill: C.white, line: C.line, name: `fz-${i}` });
    s.image(ic, { x: 0.75, y: y + 0.3, w: 0.36, h: 0.36, name: `fz-icon-${i}` });
    s.text([[{ text: t, b: true, size: 13, color: C.dark }], [{ text: d, size: 10.5, color: C.slate }]], { x: 1.25, y, w: 2.9, h: 0.98, valign: "middle", paraSpace: 2, name: `fz-t-${i}` });
  });
  S.code(s, { x: 4.4, y: 1.55, w: 5.0, h: 3.3, label: "tests/test_scoreboard.py", size: 9.5, lines: [
    "def test_every_evidence_string_is_in_its_document_on_monday(q):",
    "    groups = set(IDENTITIES[q[\"user\"]][\"groups\"])",
    "    for need in q[\"needs\"]:",
    "        for doc_id in docs_of(need):",
    "            entry = REGISTER[doc_id]           # Monday's register",
    "            assert entry[\"status\"] == \"current\"",
    "            assert groups & set(entry[\"allowed_groups\"])",
    "            text = monday_text(doc_id)         # parsed + redacted",
    "            for evidence in need[\"evidence\"]:",
    "                assert words(evidence) in text",
    "",
    "# 28 questions, no Postgres, no model, under a second"] });
  num(s);

  // ---------------------------------------------------------------- 18 Break
  s = S.darkSlide(deck, { section: "Scoreboard", icon: I.coffee, kicker: "BREAK  ·  10 MINUTES", title1: "Break", title2: "then the scoreboard, live",
    subtitle: "Pull the repo if you haven't: the four commands are on the reference slide \"Commands\".",
    footer: "back at about 1:00",
    notes: `Time: 10 minutes. Clock check: about 0:50.
During the break: run scoreboard.py once in the terminal so the embedder is warm; open the Search tab as the intern, strategy small. Read the chat and answer what's there.
After the break, say the three ideas again.` });
  num(s, true);

  // ---------------------------------------------------------------- 19 Live: scoreboard.py
  s = S.liveSlide(deck, { section: "Scoreboard", icon: I.terminalG, kicker: "LIVE  ·  THE SCOREBOARD", title1: "scoreboard.py", title2: "one table per kind of question",
    steps: ["Run it: 28 questions × 8 techniques, each as its own person, about 10 seconds",
      "Read one table: whole-section. Find small's row: doc@5 1.00, Hit@5 0.25",
      "Read \"Who wins what\": one winner per kind, and the line under it",
      "Last line: leaks, every technique, every question: 0"],
    command: "python checkpoints/03-retrieval/scoreboard.py",
    notes: `Time: 5 minutes. Clock check: about 1:00. Say the three ideas again first.
Run it in the repo root. It prints seven tables, then "Who wins what", then the leaks line, then the starred note.
Step 2: scroll to whole-section, point at small (doc@5 1.00, Hit@5 0.25) and parent (Hit@5 1.00).
Step 3: "Who wins what": dense, hybrid, keyword, dense, hybrid, hybrid, and a tie on the unanswerable ones.
Step 4: the leaks line: 0. "Ten techniques, 28 questions, and the intern never once got the salary bands."
The starred rows (rerank, hybrid_rerank, routed; with --llm also hyde and multi_query): "no reranker or model on this laptop, so they fell back to plain search; starred rows can't win. The class machine's numbers are in the notes."
Fallback: instructor-notes/fallbacks/part3/scoreboard-local.txt (the same run, with --details).` });
  num(s, true);

  // ---------------------------------------------------------------- 20 What you should see: the grid
  s = S.contentSlide(deck, {
    section: "Scoreboard", title: "What you should see: Hit@1 by kind of question",
    subtitle: "28 questions, top 5, as each question's own person. Green: the winner of that row.",
    takeaway: "Every column has a row it loses. Leaks: 0 for every technique on every question. Every search: 30 to 45 ms.",
    notes: `Time: 4 minutes. Go row by row, quickly; the next slide is the point.
casual: dense 0.75; keyword 0.00: everyday words aren't the document's words.
identifier: keyword and hybrid 0.75; hybrid wins on MRR (0.88). Dense 0.50 on ticket ids.
buried: keyword 0.75: "offsite" and "VP" are rare words. Parent 0.50.
whole-section: dense 0.50; small 0.00.
lost-context: hybrid 0.50.
two-docs: 0 everywhere, by construction: one chunk can't hold two documents. Read MRR: hybrid 0.40, both arrive, but late.
unanswerable (calm): 0.75 for all: three of four calm; S27 "sure of itself" for every technique (slide 27).
Not shown: rerank, hybrid_rerank, routed, HyDE, multi-query: starred on this laptop (no reranker, no model).`,
  });
  const g = [["casual", "0.75", "0.00", "0.00", "0.50", "0.50", 0],
    ["identifier", "0.50", "0.75", "0.75", "0.25", "0.50", 2],
    ["buried", "0.50", "0.75", "0.50", "0.50", "0.50", 1],
    ["whole-section", "0.50", "0.00", "0.25", "0.00", "0.25", 0],
    ["lost-context", "0.25", "0.25", "0.50", "0.25", "0.25", 2],
    ["two-docs  (MRR)", "0.32", "0.33", "0.40", "0.25", "0.33", 2],
    ["unanswerable (calm)", "0.75", "0.75", "0.75", "0.75", "0.75", -1]];
  S.table(s, { x: 0.6, y: 1.55, cols: [2.3, 1.3, 1.3, 1.3, 1.3, 1.3], rowH: 0.37, headH: 0.32, size: 11.5, align: "center",
    header: ["Kind of question", "dense", "keyword", "hybrid", "small", "parent"],
    rows: g.map(([k, ...rest]) => {
      const win = rest[5];
      return [{ text: k, b: true, color: C.dark }, ...rest.slice(0, 5).map((v, i) =>
        (i === win ? { text: v, b: true, color: C.deep, fill: C.greenSoft } : { text: v, color: v === "0.00" ? C.redText : C.slate }))];
    }) });
  source(s, SRC + " · scoreboard.py · two-docs: Hit@1 is 0 for all, MRR shown", 4.55);
  num(s);

  // ---------------------------------------------------------------- 21 The average lies
  s = S.contentSlide(deck, {
    section: "Scoreboard", title: "The average lies",
    subtitle: "Hit@1 over every answerable question, the number you'd put on a slide. Then the tables.",
    takeaway: "\"Which search is best?\" has no answer. \"Which is best for this kind of question?\" does.",
    notes: `Time: 3 minutes. The first big idea, with our numbers.
Left: "Average Hit@1 over all 24 answerable questions. Dense wins: 0.42. If that's the only number you look at, you ship dense and you're done."
Right: "Now the tables. Hybrid wins three kinds: ids, lost context, two documents. Keyword wins one: buried. Dense wins two: casual and whole-section. And dense is the WORST at ids and two documents."
"So the average picks the technique that's never terrible and rarely best. If your users ask about ticket ids all day, the average just told you the wrong thing. Know what kinds of questions your users ask, then read that table."
"And that's idea one."`,
  });
  const avg = [["dense", 0.42], ["hybrid", 0.33], ["parent", 0.33], ["keyword", 0.29], ["small", 0.25]];
  s.text("Hit@1, all 24 answerable questions", { x: 0.6, y: 1.55, w: 4.2, h: 0.3, size: 11, bold: true, color: C.dark, name: "avg-h" });
  avg.forEach(([k, v], i) => {
    const y = 1.95 + i * 0.52;
    s.text(k, { x: 0.6, y, w: 0.9, h: 0.4, size: 12, bold: i === 0, color: C.dark, valign: "middle", name: `avg-k-${i}` });
    s.rect({ x: 1.55, y: y + 0.08, w: v * 6, h: 0.26, fill: i === 0 ? C.deep : C.line, name: `avg-bar-${i}` });
    s.text(v.toFixed(2), { x: 1.6 + v * 6, y, w: 0.6, h: 0.4, size: 11, font: "Consolas", color: C.slate, valign: "middle", name: `avg-v-${i}` });
  });
  s.rect({ x: 5.05, y: 1.55, w: 4.35, h: 3.3, fill: C.white, line: C.line, name: "win-box" });
  s.text("Who wins each kind", { x: 5.25, y: 1.6, w: 4, h: 0.35, size: 11, bold: true, color: C.dark, name: "win-h" });
  const wins = [["casual", "dense"], ["identifier", "hybrid"], ["buried", "keyword"], ["whole-section", "dense"], ["lost-context", "hybrid"], ["two-docs", "hybrid"], ["unanswerable", "a tie"]];
  wins.forEach(([k, w], i) => {
    const y = 2.0 + i * 0.39;
    s.text(k, { x: 5.25, y, w: 1.9, h: 0.34, size: 11, color: C.slate, valign: "middle", name: `win-k-${i}` });
    pill(s, { x: 7.2, y: y + 0.02, w: 1.4, h: 0.3, text: w, size: 10.5, fill: w === "hybrid" ? C.greenSoft : C.soft, color: w === "hybrid" ? C.deep : C.dark, name: `win-w-${i}` });
  });
  s.text([[{ text: SRC, i: true, size: 9, color: C.gray }], [{ text: "winner: best Hit@1, then MRR, then fewer LLM calls, then speed", i: true, size: 9, color: C.gray }]],
    { x: 0.6, y: 4.5, w: 4.3, h: 0.4, paraSpace: 0, name: "source" });
  num(s);

  // ---------------------------------------------------------------- 22 Live: small vs parent
  s = S.contentSlide(deck, {
    section: "Scoreboard", title: "Live: small vs parent on the first-week question",
    subtitle: "\"What do I need to do in my first week?\" Search tab, as the intern, top 3. Look at #2.",
    takeaway: "small hands over three of the five Week 1 items; parent hands over all five, and says which sentence found them.",
    notes: `Time: 4 minutes. LIVE in the Search tab (signed in as the intern, top_k 3): the question, strategy small, Search; then strategy parent, Search. Open result #2 each time.
Left, small: "#1 is Week 3, 'First Contributions': the word 'first'. #2 is a Week 1 small chunk: security training, the 1-on-1, the Slack channels. Three items of five. The laptop and the badge aren't there."
Right, parent: "Same #1, same #2, but #2 is now the whole Week 1 section, five items, and above it: 'Matched by the small chunk: Complete the mandatory security awareness training...'. That's parent-document doing its job: matched small, returned big."
"On the scoreboard: small missed this question, right document, wrong piece. Parent: ready at 2."
Fallback: fallbacks/part3/screens/p1-firstweek-small.png and p2-firstweek-parent.png.`,
  });
  s.text([[{ text: "small", b: true, size: 16, color: C.redText }], [{ text: "#1 Week 3 (the word \"first\")", size: 11, color: C.slate }], [{ text: "#2 a Week 1 fragment: 3 of 5 items, no laptop, no badge", size: 11, color: C.slate }]],
    { x: 0.6, y: 1.6, w: 2.8, h: 1.6, valign: "top", paraSpace: 4, name: "lv-l" });
  framed(s, P.weekSmall, { x: 3.6, y: 1.55, w: 5.8, name: "lv-small", alt: "Search tab, small: #1 Week 3, #2 a Week 1 small chunk" });
  s.text([[{ text: "parent", b: true, size: 16, color: C.deep }], [{ text: "#2 the whole Week 1 section, all 5 items", size: 11, color: C.slate }], [{ text: "and the small chunk that found it", size: 11, color: C.slate }]],
    { x: 0.6, y: 3.42, w: 2.8, h: 1.5, valign: "top", paraSpace: 4, name: "lv-r" });
  framed(s, P.weekParent, { x: 3.6, y: 3.37, w: 5.8, name: "lv-parent", alt: "Search tab, parent: #2 the whole Week 1 section, matched by the small chunk" });
  num(s);

  // ---------------------------------------------------------------- 23 Why parent wins nothing here
  s = S.contentSlide(deck, {
    section: "Scoreboard", title: "So why does parent win nothing here?",
    subtitle: "It fixed small on lists (Hit@5 0.25 → 1.00). It found the billing sentence. And it tops no table.",
    takeaway: "The scoreboard's advice: don't ship parent for these documents. On a corpus of long pages, measure again.",
    notes: `Time: 3 minutes. Clock check: about 1:15. The honest result.
"Remember slide 10: 50 of our 89 sections fit in ONE small chunk. For those, parent finds the small chunk and returns the same section dense would have returned. It can't do better than dense on them, only the same."
"Where a section IS long, parent shines: the handbook page, 905 characters, which dense can't find for the billing question and parent returns second. We have exactly one page like that."
"So the bill: small chunks double the vectors we store, 225 instead of 89, and parent hands the model a bit more text than dense, about 396 tokens a question against 360. For no win on these documents. Don't ship it here."
"On a wiki of long pages, or contracts, the same scoreboard might say the opposite. That's the point: you don't decide by reputation. You measure on your documents."`,
  });
  const pw = [["Where parent helps", I.yes, C.deep, ["whole-section: small's Hit@5 0.25 → parent's 1.00", "the billing sentence in a 905-character PDF page: invisible to dense, #2 for parent"]],
    ["Why it rarely gets the chance", I.warn, C.amberDeep, ["sections average 275 characters", "50 of 89 fit in one small chunk: parent returns what dense returns"]],
    ["What it costs", I.no, C.redText, ["225 vectors instead of 89, on every sync", "~396 tokens a question to the model, vs ~360 for dense (small: ~228)"]]];
  pw.forEach(([t, ic, col, rows], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.0, fill: C.white, line: C.line, name: `pw-${i}` });
    s.image(ic, { x: x + 0.2, y: 1.78, w: 0.36, h: 0.36, name: `pw-icon-${i}` });
    s.text(t, { x: x + 0.65, y: 1.72, w: 2.1, h: 0.5, size: 13, bold: true, color: col, valign: "middle", font: "Arial", name: `pw-t-${i}` });
    s.text(rows.map(r => ({ runs: r, bullet: true })), { x: x + 0.2, y: 2.35, w: 2.5, h: 2.15, size: 11.5, color: C.slate, paraSpace: 8, valign: "top", name: `pw-b-${i}`, bulletIndent: 12 });
  });
  source(s, SRC + " · tokens = characters / 4, median per question, top 5", 4.72);
  num(s);

  // ================================================================ C. CORRECT, NOT ONLY FAITHFUL (10 min)
  // ---------------------------------------------------------------- 24 divider
  s = S.darkSlide(deck, { section: "Correct", icon: I.checkG, kicker: "PART C  ·  ABOUT 10 MINUTES", title1: "Correct,", title2: "not only faithful",
    subtitle: "An answer can stick to its context perfectly, and still be wrong.",
    footer: "faithful and wrong  ·  answers.py  ·  sure of itself",
    notes: `Time: 30 seconds. Clock check: about 1:16. Read the chat.
Say: "So far we scored the search. Now the answer, because that's what the person reads."` });
  num(s, true);

  // ---------------------------------------------------------------- 25 S20
  s = S.contentSlide(deck, {
    section: "Correct", title: "Faithful, and wrong",
    subtitle: "S20, as the intern: \"How many days of unused vacation can I carry over now?\"",
    takeaway: "Every technique ranks the stale copy first. An answer from it is 100% faithful to its context, and wrong.",
    notes: `Time: 3 minutes.
"On Monday HR edited the leave policy: carry-over went from 5 to 10 days. The FAQ quotes the old policy, and nobody updated it. Both are current documents."
"Plain search, dense, top 2: the FAQ first, 0.47, 'up to 5 days'. The leave policy second, 0.81, 'up to a maximum of 10 days'. And it isn't just dense: every technique on the scoreboard ranks the FAQ first."
"Give the model that context and it may well say '5 days'. Ask a judge 'is this answer faithful to the context?' and it says yes: 5 days is right there in the context. Faithful, and wrong."
"That's why the answer check compares the answer with facts a person wrote down, not with the context."
Numbers: Search tab, dense, intern, 12 Nov. Part 1's register warned us: the FAQ depends_on the leave policy, which changed in this sync.`,
  });
  const cf = [["#1", "0.47", "Company FAQ · What happens if I don't use all my vacation days?", "\"Up to 5 days of unused annual leave can be carried over to the next year.\"", true],
    ["#2", "0.81", "Leave Policy · Annual Leave (edited Monday)", "\"Unused leave can be carried over to the next year, up to a maximum of 10 days.\"", false]];
  cf.forEach(([r, d, t, q, stale], i) => {
    const y = 1.6 + i * 1.15;
    s.rect({ x: 0.6, y, w: 8.8, h: 1.0, fill: stale ? C.redSoft : C.white, line: stale ? C.red : C.line, name: `cf-${i}` });
    s.text(r, { x: 0.7, y, w: 0.5, h: 1.0, size: 16, bold: true, color: stale ? C.redText : C.dark, valign: "middle", name: `cf-r-${i}` });
    s.text(d, { x: 1.2, y, w: 0.7, h: 1.0, size: 12, font: "Consolas", color: C.slate, valign: "middle", name: `cf-d-${i}` });
    s.text([[{ text: t, b: true, size: 11.5, color: C.dark }], [{ text: q, i: true, size: 11.5, color: stale ? C.redText : C.deep }]], { x: 2.0, y, w: 7.3, h: 1.0, valign: "middle", paraSpace: 3, name: `cf-t-${i}` });
  });
  bubble(s, { x: 0.6, y: 3.95, w: 4.3, h: 0.75, who: "A FAITHFUL ANSWER TO THIS CONTEXT WOULD SAY", text: "\"You can carry over up to 5 days.\"", tone: "bad", size: 12, name: "cf-a" });
  s.text([[{ text: "faithful to its context? ", color: C.slate }, { text: "yes", b: true, color: C.dark }], [{ text: "correct? ", color: C.slate }, { text: "no: the policy says 10", b: true, color: C.redText }]],
    { x: 5.1, y: 3.95, w: 4.3, h: 0.75, size: 12.5, valign: "middle", paraSpace: 2, name: "cf-v" });
  num(s);

  // ---------------------------------------------------------------- 26 answers.py
  s = S.contentSlide(deck, {
    section: "Correct", title: "answers.py: whose fault is a wrong answer?",
    subtitle: "Retrieve as the person, write the answer exactly as POST /query does, check it against the facts.",
    takeaway: "Fix retrieval misses in the search, generation misses in the prompt. The two need different fixes.",
    notes: `Time: 3 minutes. The four verdicts. The numbers from the class run are in part3.md; read them aloud if you have them, don't put them on a slide.
"Correct: every fact is in the answer, or for a question nothing answers, it says it doesn't know."
"Wrong, and the context never held the facts: a retrieval miss. No prompt in the world fixes that: fix the search."
"Wrong, although the context held every fact: a generation miss. That's the model or the prompt: fix those."
"Made it up: a question nothing answers, answered anyway."
"No LLM judge anywhere. String matching against facts a person wrote: cheap, the same every run, no opinions. It needs a model to WRITE the answers, cached in runs/llm_cache.json, so the second run is free."
Command: python checkpoints/03-retrieval/answers.py --strategies dense,hybrid,parent`,
  });
  const vd = [["correct", "every fact is in the answer; or \"I don't know\" when nothing answers", C.deep, C.greenSoft],
    ["retrieval miss", "wrong, and the context never held the facts: fix the search", C.redText, C.redSoft],
    ["generation miss", "wrong, although the context held every fact: fix the prompt or model", C.amberDeep, C.amberSoft],
    ["made it up", "nothing answers it, and it answered anyway", C.redText, C.redSoft]];
  vd.forEach(([t, d, col, fill], i) => {
    const x = 0.6 + (i % 2) * 4.45, y = 1.6 + Math.floor(i / 2) * 1.35;
    s.rect({ x, y, w: 4.3, h: 1.2, fill, line: C.line, name: `vd-${i}` });
    s.text([[{ text: t, b: true, size: 15, color: col, font: "Consolas" }], [{ text: d, size: 11.5, color: C.slate }]], { x: x + 0.2, y, w: 3.95, h: 1.2, valign: "middle", paraSpace: 3, name: `vd-t-${i}` });
  });
  s.text("python checkpoints/03-retrieval/answers.py --strategies dense,hybrid,parent    # needs a model; cached", { x: 0.6, y: 4.4, w: 8.8, h: 0.3, size: 10.5, font: "Consolas", color: C.deep, name: "vd-cmd" });
  num(s);

  // ---------------------------------------------------------------- 27 Sure of itself
  s = S.contentSlide(deck, {
    section: "Correct", title: "Sure of itself, about the wrong question",
    subtitle: "S27, as hr-partner: \"How many weeks of parental leave will primary caregivers get in 2027?\"",
    takeaway: "A distance can tell \"about this topic\". It can't tell \"answers this question\". That's the answer step's job.",
    notes: `Time: 3 minutes. Clock check: about 1:25.
"Only a draft talks about 2027, 24 weeks, and drafts are never indexed. Today's policy says 16 weeks. So the honest answer is: nothing in force covers 2027; today it's 16."
"Dense's best result: the Leave Policy, Parental Leave, 0.50. High confidence: our threshold is 0.8. And every technique on the scoreboard: high confidence, 'sure of itself'. It IS about parental leave. It just doesn't answer 'in 2027'."
"No retrieval number catches this. The answer step has to read the question and say what's missing. answers.py checks it does."
If someone asks about HyDE: "on questions like this, a made-up answer about 2027 lands even closer to the policy. Its calm column on the class run is in the notes."`,
  });
  s.rect({ x: 0.6, y: 1.6, w: 5.2, h: 1.55, fill: C.white, line: C.line, name: "st-r" });
  s.text([[{ text: "dense #1  ·  0.50  ·  high confidence (≤ 0.8)", b: true, size: 10, color: C.deep, charSpacing: 0.3 }],
    [{ text: "Leave Policy > Parental Leave", b: true, size: 12, color: C.dark }],
    [{ text: "\"Primary caregivers receive 16 weeks of paid parental leave.\"", i: true, size: 12, color: C.slate }]],
    { x: 0.8, y: 1.6, w: 4.9, h: 1.55, valign: "middle", paraSpace: 3, name: "st-r-t" });
  s.rect({ x: 0.6, y: 3.3, w: 5.2, h: 1.4, fill: C.soft, line: C.line, name: "st-d" });
  s.text([[{ text: "THE ONLY DOCUMENT ABOUT 2027", b: true, size: 9, color: C.gray, charSpacing: 0.5 }],
    [{ text: "Parental Leave Policy 2027 (draft): 24 weeks", size: 12, color: C.dark }],
    [{ text: "status draft: never indexed, for anyone", size: 11, i: true, color: C.gray }]],
    { x: 0.8, y: 3.3, w: 4.9, h: 1.4, valign: "middle", paraSpace: 3, name: "st-d-t" });
  s.rect({ x: 6.0, y: 1.6, w: 3.4, h: 3.1, fill: C.amberSoft, line: C.amber, name: "st-all" });
  s.image(I.warn, { x: 6.2, y: 1.8, w: 0.4, h: 0.4, name: "st-icon" });
  s.text([[{ text: "every technique", b: true, size: 14, color: C.amberDeep }], [{ text: "\"sure of itself\" on S27", size: 12.5, color: C.dark }],
    [{ text: "about the topic: yes", size: 12, color: C.slate }], [{ text: "answers \"in 2027\": no", size: 12, b: true, color: C.redText }]],
    { x: 6.2, y: 2.3, w: 3.05, h: 2.3, valign: "top", paraSpace: 6, name: "st-all-t" });
  source(s, SRC + " · scoreboard.py --details, S27", 4.8);
  num(s);

  // ================================================================ WRAP (5 min)
  // ---------------------------------------------------------------- 28 three ideas
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Three ideas to take home",
    subtitle: "All three from tonight's scoreboard.",
    notes: `Time: 2 minutes. Clock check: about 1:26. One sentence per card, pointing at it.`,
  });
  const ideas2 = [["1", "Measure by kind of question", "Dense tops the average; hybrid wins three tables, keyword one. The average hides who wins what.", I.list],
    ["2", "Measure what the model needs", "The words, not the document: small found the document every time and the list once in four. Leaks: 0.", I.ruler],
    ["3", "Correct, not only faithful", "\"5 days\" from the stale FAQ is faithful and wrong. Tell a retrieval miss from a generation miss.", I.scale]];
  ideas2.forEach(([k, t, d, ic], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.3, fill: C.white, line: C.line, name: `idea2-${i}` });
    s.ellipse({ x: x + 0.22, y: 1.82, w: 0.7, h: 0.7, fill: C.pale, name: `idea2-dot-${i}` });
    s.image(ic, { x: x + 0.39, y: 1.99, w: 0.36, h: 0.36, name: `idea2-icon-${i}` });
    s.text(k, { x: x + 2.1, y: 1.82, w: 0.55, h: 0.7, font: "Arial", size: 30, bold: true, color: C.line, align: "right", valign: "middle", name: `idea2-n-${i}` });
    s.text(t, { x: x + 0.22, y: 2.72, w: 2.45, h: 0.75, font: "Arial", size: 16, bold: true, color: C.dark, name: `idea2-t-${i}` });
    s.text(d, { x: x + 0.22, y: 3.5, w: 2.45, h: 1.3, size: 12, color: C.slate, name: `idea2-d-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 29 Tonight
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Tonight",
    subtitle: "About an hour, offline. 1 to 3 need no key. All in checkpoints/03-retrieval/README.md.",
    takeaway: "Each exercise ends in something you can show: an explanation, a column, a before-and-after.",
    notes: `Time: 2 minutes.
Say: "One, everyone: read the scoreboard and explain one disagreement from the chunks. Two: the price nobody prints, a tokens column, the test is waiting. Three: move the knob, CHILD_MAX_CHARS, and see what moves against a baseline. Four and five are stretch: your own questions, and the answer check if you have a key."
Exercise 2's solution: instructor-notes/fallbacks/part3/solutions/context_tokens.py (don't share it tonight).`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [0.45, 2.3, 6.05], rowH: 0.56, headH: 0.32, size: 11, headSize: 10.5,
    header: ["", "Exercise", "What you do"],
    rows: [[{ text: "1", b: true, color: C.deep, align: "center" }, { text: "Read the scoreboard", b: true }, "scoreboard.py --details: one question where small and parent disagree; explain it from the chunks (Search tab)"],
      [{ text: "2", b: true, color: C.deep, align: "center" }, { text: "The price nobody prints", b: true }, "context_tokens() and a tokens column; the test waits in tests/test_scoreboard.py (remove its skip)"],
      [{ text: "3", b: true, color: C.deep, align: "center" }, { text: "Move the knob", b: true }, "--save-baseline; CHILD_MAX_CHARS=120, sync, --against-baseline; then 400. What moved, and why?"],
      [{ text: "4", b: true, color: C.gray, align: "center" }, { text: "Stretch: your questions", b: true, color: C.gray }, "add two questions where you predict the winner, before running anything. Were you right?"],
      [{ text: "5", b: true, color: C.gray, align: "center" }, { text: "Stretch, with a key", b: true, color: C.gray }, "answers.py --strategies dense,hybrid: retrieval misses vs generation misses. Fix which first?"]] });
  num(s);

  // ---------------------------------------------------------------- 30 Monday
  s = S.darkSlide(deck, { section: "Wrap", icon: I.shipG, kicker: "MONDAY  ·  PART 4 OF 4", title1: "Ship it,", title2: "behind a gate",
    subtitle: "Guardrails, and evals as a release gate. Tonight's scoreboard is one of them.",
    detail: "scoreboard.py --save-baseline freezes tonight's numbers. Monday's release.py compares every change against them: a technique that loses a table, or leaks once, doesn't ship.",
    footer: "Mon 16 Nov",
    notes: `Time: 1 minute. Clock check: about 1:30.
Say: "Tonight we built the measuring stick. Monday it becomes a gate: a change that makes the scoreboard worse, or leaks once, doesn't ship. Plus guardrails on what comes in and goes out, a kill switch, and Docker."
"Pull the repo Monday morning." Read the chat one last time and answer what's there before you end the call.` });
  num(s, true);

  // ================================================================ REFERENCE (for the students' copy; not presented)
  s = S.darkSlide(deck, { section: "Reference", icon: I.book, kicker: "REFERENCE", title1: "For after class",
    subtitle: "Not presented. Read these with the code open.",
    detail: "The metrics  ·  the winner rule  ·  the store  ·  the sync's fix  ·  commands  ·  the regression drill  ·  the class machine",
    notes: `Not presented. If someone asks a detail question in the chat, jump here.` });
  num(s, true);

  // ---------------------------------------------------------------- R metric definitions
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the metrics, exactly",
    subtitle: "app/evals/scoreboard.py. No model is needed to score.",
    notes: `The banner of app/evals/scoreboard.py, as a table.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.3, 7.5], rowH: 0.42, headH: 0.32, size: 10.5, headSize: 10.5,
    header: ["Term", "Definition"],
    rows: [[{ text: "need", b: true }, "one document (or a list of documents, each good enough) + evidence words the answer can't do without"],
      [{ text: "meets", b: true }, "a chunk from that document holding every evidence word: lower case, letters, digits, $ and % only, whole words"],
      [{ text: "ready", b: true }, "the position in the top 5 at which the results so far meet EVERY need (two-document questions have two)"],
      [{ text: "Hit@1 / Hit@5", b: true }, "ready at 1 / ready within 5"],
      [{ text: "MRR", b: true }, "mean of 1 / ready (0 when never ready)"],
      [{ text: "doc@5", b: true }, "every needed document appears in the top 5, words or not (Part 2's Hit@5)"],
      [{ text: "calm", b: true }, "no needs (nothing answers it), and the best distance is above CONFIDENCE_HIGH_THRESHOLD (0.8)"],
      [{ text: "LLM, ms", b: true }, "model calls before the search; wall time, plus the original time of any cached model call"],
      [{ text: "leaks", b: true }, "questions where any result's document is not readable by the asker (app/evals/judge.py)"]] });
  num(s);

  // ---------------------------------------------------------------- R winner rule
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the winner rule, and the starred rows",
    subtitle: "scoreboard.py prints a winner per kind of question. This is all it does.",
    notes: `app/evals/scoreboard.py winner(); scoreboard.py print_scenario().`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 5.4, h: 3.0, label: "app/evals/scoreboard.py", size: 10, lines: [
    "def winner(table):",
    "    def key(item):",
    "        name, s = item",
    "        quality = ((s[\"calm\"] or 0, 0) if s[\"hit@1\"] is None",
    "                   else (s[\"hit@1\"] or 0, s[\"mrr\"] or 0))",
    "        return (-quality[0], -quality[1],",
    "                s[\"llm\"] or 0, s[\"ms\"] or 0, name)",
    "    clean = [(n, s) for n, s in table.items()",
    "             if s[\"leaks\"] == 0]          # a leak disqualifies",
    "    return min(clean, key=key)[0] if clean else None"] });
  s.text([[{ text: "Order: ", b: true, color: C.dark }, { text: "Hit@1 (or calm), then MRR, then fewer LLM calls, then faster, then the name." }],
    [{ text: "Starred: ", b: true, color: C.dark }, { text: "a technique whose trace says its reranker or model was unavailable fell back to plain search. Its row is printed with a *, and it can't win: those are another technique's numbers." }],
    [{ text: "Ties: ", b: true, color: C.dark }, { text: "on equal quality and cost, speed decides; a 2 ms difference can flip the unanswerable winner between runs. Read it as a tie." }]],
    { x: 6.2, y: 1.55, w: 3.2, h: 3.3, size: 10.5, color: C.slate, paraSpace: 8, valign: "top", name: "wr-t" });
  num(s);

  // ---------------------------------------------------------------- R store changes
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the store, and parent in the retriever",
    subtitle: "app/rag/store_pg.py and app/rag/retriever.py. Every query says which cut it reads.",
    notes: `LEVELS is spliced into search(); keyword_search() and records() read sections only. by_ids() is the second query parent makes.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 4.3, h: 3.35, label: "store_pg.py", size: 9, lines: [
    "LEVELS = {\"sections\": sql.SQL(\"c.parent_id IS NULL\"),",
    "          \"small\": sql.SQL(\"c.parent_id IS NOT NULL\")}",
    "",
    "def by_ids(ids, access, collection=None):",
    "    # sections by id, in the order asked,",
    "    # with the SAME filter as search():",
    "    #   c.id = ANY(ids) AND c.parent_id IS NULL",
    "    #   AND status / as_of",
    "    #   AND EXISTS (document_acl ⨝ your groups)",
    "    ...",
    "    return [found[i] for i in ids if i in found]"] });
  S.code(s, { x: 5.1, y: 1.55, w: 4.3, h: 3.35, label: "retriever.py", size: 9, lines: [
    "def _parent(embedding, top_k, depth, access, steps):",
    "    best = {}",
    "    for small in search(embedding, top_k=depth,",
    "                        access=access, level=\"small\"):",
    "        best.setdefault(small[\"parent_id\"], small)",
    "    sections = by_ids(list(best)[:top_k], access)",
    "    return [{**s,",
    "             \"distance\": best[s[\"id\"]][\"distance\"],",
    "             \"matched\": best[s[\"id\"]][\"text\"]}",
    "            for s in sections]"] });
  num(s);

  // ---------------------------------------------------------------- R sync change
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: a new cut reaches every document",
    subtitle: "A bug fixed on the way: before Part 3, same bytes meant \"unchanged\", even after the chunking changed.",
    takeaway: "Change PIPELINE_VERSION or CHILD_MAX_CHARS, and the next sync re-cuts and re-embeds everything, once.",
    notes: `app/ingest/sync.py. Coming from Part 2's database, the first 03 sync plans "change 18" because of this. Going back to Part 2 needs 02's sync.py --rebuild --apply: Part 2's sync still trusts the eTag alone.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 5.4, h: 3.3, label: "app/ingest/sync.py", size: 9.5, lines: [
    "def pipeline_id() -> str:",
    "    return (f\"{PIPELINE_VERSION}|{PARSER_VERSION}|\"",
    "            f\"{SECTION_MAX_CHARS}|{CHILD_MAX_CHARS}\")",
    "",
    "# every chunk's metadata now carries \"pipeline\": pipeline_id()",
    "",
    "# the eTag shortcut: same bytes AND cut the same way",
    "if (old and old.get(\"etag\") == item.etag",
    "        and old.get(\"pipeline\") == pipeline_id()):",
    "    ...   # unchanged or relabel: not even downloaded"] });
  S.table(s, { x: 6.2, y: 1.55, cols: [1.6, 1.6], rowH: 0.62, headH: 0.32, size: 10.5,
    header: ["Before", "After"],
    rows: [["same eTag → \"unchanged\"", "same eTag + same pipeline → \"unchanged\""],
      [{ text: "new cut reached only edited files", color: C.redText }, { text: "new cut reaches all 18", color: C.deep, b: true }],
      ["the worker's gate opened, the sync did nothing", "the gate opens, the sync re-cuts"]] });
  num(s);

  // ---------------------------------------------------------------- R commands
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the commands",
    subtitle: "From the repository root. Postgres runs in Docker on port 5433.",
    notes: `The same commands as ${CP}/README.md, "Run it".`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 8.8, h: 3.45, label: "TONIGHT", size: 10, lines: [
    { text: "docker compose up -d db", color: C.codeText },
    { text: "python checkpoints/03-retrieval/db.py migrate             # adds 006_small_chunks", color: C.codeText },
    { text: "python checkpoints/03-retrieval/db.py seed                # skip if Part 2's accounts exist", color: C.codeText },
    { text: "python checkpoints/03-retrieval/fake_drive.py reset       # Friday's files (offline)", color: C.codeText },
    { text: "python checkpoints/03-retrieval/fake_drive.py apply all   # Monday: all five events", color: C.codeText },
    { text: "python checkpoints/03-retrieval/sync.py --apply           # 89 sections + 136 small chunks", color: C.codeText },
    { text: "python checkpoints/03-retrieval/scoreboard.py             # no model needed", color: C.green },
    { text: "python run_checkpoint.py 03-retrieval                     # Search tab: small / parent", color: C.codeText },
    { text: "", color: C.codeText },
    { text: "python checkpoints/03-retrieval/scoreboard.py --details --llm", color: C.mintText },
    { text: "python checkpoints/03-retrieval/answers.py --strategies dense,hybrid,parent   # needs a model", color: C.mintText },
    { text: "pytest checkpoints/03-retrieval/tests -q                  # 157 pass, 2 skipped", color: C.mintText }] });
  num(s);

  // ---------------------------------------------------------------- R regression drill
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the regression drill",
    subtitle: "Freeze the numbers, move one knob, ask what moved, question by question.",
    takeaway: "Every line --against-baseline prints ends in \"explain this one\". That's the habit Monday's gate automates.",
    notes: `Tonight's exercise 3. On Windows PowerShell set the knob in .env (CHILD_MAX_CHARS=120), not inline.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 5.2, h: 3.3, label: "THE DRILL", size: 10, lines: [
    "python scoreboard.py --save-baseline",
    "",
    "# .env: CHILD_MAX_CHARS=120",
    "python sync.py --apply        # change 18: why?",
    "python scoreboard.py --against-baseline",
    "",
    "# .env: CHILD_MAX_CHARS=400, sync again, compare",
    "",
    "# and back to 220 before Monday"] });
  s.text([[{ text: "What it prints, per technique", b: true, size: 12, color: C.dark }],
    [{ text: "<id>: miss -> HIT@1   explain this one", font: "Consolas", size: 10, color: C.slate }],
    [{ text: "<id>: HIT@1 -> miss   explain this one", font: "Consolas", size: 10, color: C.slate }],
    [{ text: "<id>: calm -> SURE    explain this one", font: "Consolas", size: 10, color: C.slate }],
    [{ text: "<id>: new flags [...]", font: "Consolas", size: 10, color: C.redText }],
    [{ text: "or \"unchanged\". The line formats from scoreboard.py; which ids move depends on the knob.", i: true, size: 9.5, color: C.gray }]],
    { x: 6.0, y: 1.55, w: 3.4, h: 3.3, paraSpace: 6, valign: "top", name: "dr-t" });
  num(s);

  // ---------------------------------------------------------------- R class machine
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: what the starred rows need",
    subtitle: "Tonight's laptop numbers had no cross-encoder and no model. Here is what each starred row needs.",
    takeaway: "Run 03 with EMBEDDING_PROVIDER=local in class, so the live numbers equal these slides and your laptop.",
    notes: `On 12 Nov the build laptop couldn't download the cross-encoder (a corporate network blocks Hugging Face) and had no model key, so rerank, hybrid_rerank, routed, hyde, multi_query and answers.py were starred or skipped. The class machine adds the reranker and Azure gpt-4.1-mini; those numbers are in part3.md, not on any slide.
Recommended live setup: EMBEDDING_PROVIDER=local (the scoreboard numbers on slides 20 to 23 are local MiniLM), LLM_PROVIDER=azure for the starred rows and answers.py.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [2.0, 3.6, 3.2], rowH: 0.48, headH: 0.32, size: 10.5,
    header: ["Starred row", "Needs", "On a laptop without it"],
    rows: [[{ text: "rerank, hybrid_rerank", b: true }, "the cross-encoder (~90 MB from Hugging Face, warmup.py)", "first-stage order, starred"],
      [{ text: "routed", b: true }, "the cross-encoder, for its pointwise path", "lists still route; the rest starred"],
      [{ text: "hyde, multi_query", b: true }, "a model: LLM_PROVIDER and its key (scoreboard.py --llm)", "plain dense, starred"],
      [{ text: "answers.py", b: true }, "a model to write the answers (cached after the first run)", "stops with \"No model\""],
      [{ text: "every other row", b: true, color: C.deep }, { text: "nothing: local MiniLM, Postgres in Docker", color: C.deep }, { text: "the numbers on these slides", color: C.deep }]] });
  num(s);

  return deck;
}

module.exports = { build };

if (require.main === module) {
  (async () => {
    const deck = await build();
    const out = process.argv[2] || ".";
    deck.saveHtml(path.join(out, "p3-preview.html"));
    // The SE Factory theme is applied by the pptx skill's apply_theme.js when PPTX_SKILL points at it.
    await deck.savePptx(path.join(out, "p3.pptx"), process.env.PPTX_SKILL ? S.THEME : undefined);
    console.log(`slides: ${deck.slides.length}`);
  })().catch(e => { console.error(e); process.exit(1); });
}
