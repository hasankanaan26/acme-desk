// p1.js — Creating your production application, Part 1: when the documents change (acme-desk, checkpoint 01-source)
//
// Teaching shape (rewritten 8 Nov after Session 8 lost the room):
//   one story (HR changes 5 -> 10 on Friday; what does the assistant say on Monday?),
//   three questions (read / notice / repeat), a picture before any code, at most ~12 lines of code
//   on a slide (one-to-five-line snippets on slides 3, 9 and 14 make a word concrete), and a "what you should see" slide after every live step so a failed demo never stops
//   the lesson. Nothing assumes Session 8 was finished.
//   Online delivery (9 Nov): no questions to the room, no quizzes, no polls. Every former "ask" is a
//   statement or a worked example the instructor talks through; the chat is read at section dividers.
//   The dense material (API mappings, auth table, delta feeds, permissions, blue/green) is in Reference.
const path = require("path");
const { Deck } = require("./kit");
const S = require("./sef");
const { C } = S;
const fa = require("react-icons/fa");

const CP = "checkpoints/01-source";

// ---------- small local helpers ----------
function bubble(s, o) {
  const tone = o.tone || "plain";
  const fill = { bad: C.redSoft, good: C.greenSoft, plain: C.white, ask: C.soft }[tone];
  const line = { bad: C.red, good: C.deep, plain: C.line, ask: C.line }[tone];
  s.roundRect({ x: o.x, y: o.y, w: o.w, h: o.h, fill, line, radius: 0.12, name: `${o.name}-box` });
  const whoColor = { bad: C.redText, good: C.deep, plain: C.gray, ask: C.gray }[tone];
  s.text([[{ text: o.who, b: true, size: 9.5, color: whoColor }], [{ text: o.text, size: o.size || 12.5, color: C.dark, i: !!o.italic }]],
    { x: o.x + 0.15, y: o.y + 0.06, w: o.w - 0.3, h: o.h - 0.12, valign: "middle", paraSpace: 2, name: `${o.name}-text` });
}

function pill(s, o) {
  S.chip(s, { x: o.x, y: o.y, w: o.w, h: o.h || 0.32, text: o.text, fill: o.fill || C.pale, color: o.color || C.deep, size: o.size || 11, font: o.font || "Consolas", name: o.name });
}

const ACTION = {
  add: [C.greenSoft, C.deep], change: [C.greenSoft, C.deep], remove: [C.redSoft, C.redText],
  unchanged: [C.line, C.slate], skip: [C.line, C.slate], touch: [C.amberSoft, C.amberDeep], quarantine: [C.amberSoft, C.amberDeep],
};
const COST = { free: ["free", C.line, C.slate], download: ["download", C.amberSoft, C.amberDeep], embed: ["$ embed", C.redSoft, C.redText] };

async function build() {
  const I = {};
  const want = {
    sync: [fa.FaSyncAlt, C.green], coffee: [fa.FaCoffee, C.green], laptop: [fa.FaLaptopCode, C.green], robot: [fa.FaRobot, C.green],
    bulb: [fa.FaLightbulb, C.green], search: [fa.FaSearch, C.green], clockG: [fa.FaClock, C.green], book: [fa.FaBook, C.green],
    file: [fa.FaFileAlt, C.deep], drive: [fa.FaGoogleDrive, C.deep], folder: [fa.FaFolder, C.deep], ms: [fa.FaMicrosoft, C.gray],
    list: [fa.FaListUl, C.deep], download: [fa.FaDownload, C.deep], tag: [fa.FaTags, C.deep], tagOne: [fa.FaTag, C.deep],
    box: [fa.FaBoxOpen, C.deep], coins: [fa.FaCoins, C.redText], user: [fa.FaUser, C.redText], key: [fa.FaKey, C.redText],
    badge: [fa.FaIdBadge, C.deep], no: [fa.FaTimesCircle, C.redText], yes: [fa.FaCheckCircle, C.deep], warn: [fa.FaExclamationTriangle, C.amber],
    pencil: [fa.FaPencilAlt, C.deep], trash: [fa.FaTrashAlt, C.redText], upload: [fa.FaUpload, C.deep], pdf: [fa.FaFilePdf, C.amberDeep],
    plus: [fa.FaPlusCircle, C.deep], clockD: [fa.FaClock, C.deep], server: [fa.FaServer, C.deep], bell: [fa.FaBell, C.deep],
    plug: [fa.FaPlug, C.deep], code: [fa.FaCode, C.deep], users: [fa.FaUsers, C.deep], fingerD: [fa.FaFingerprint, C.deep],
    hist: [fa.FaHistory, C.deep], redo: [fa.FaRedo, C.deep], chat: [fa.FaComments, C.deep], git: [fa.FaCodeBranch, C.deep],
    db: [fa.FaDatabase, C.deep], usersG: [fa.FaUsers, C.green], mail: [fa.FaEnvelope, C.deep], bolt: [fa.FaBolt, C.deep], eye: [fa.FaEye, C.deep],
  };
  for (const [k, [comp, color]] of Object.entries(want)) I[k] = await S.icon(comp, color);

  const deck = new Deck({ title: "Part 1: when the documents change", author: "SE Factory", company: "SE Factory",
    subject: "Applied AI Engineering Workshop · Creating your production application · Part 1" });
  let n = 0;
  const num = (s, dark) => S.slideNumber(s, ++n, dark);

  // ================================================================ OPENING (10 min)
  // ---------------------------------------------------------------- 1 Title
  let s = S.darkSlide(deck, {
    section: "Opening", icon: I.sync,
    kicker: "CREATING YOUR PRODUCTION APPLICATION  ·  PART 1 OF 4",
    title1: "When the", title2: "documents change",
    subtitle: "Keeping an assistant's answers true while people edit the files underneath it",
    detail: "HR changes one number on Friday evening. What does our assistant say on Monday morning?",
    footer: "Read  ·  Notice  ·  Repeat",
    notes: `Time: 2 minutes. Clock check: 0:00.
Say (honest, short): "Friday went badly. Part of that was me having to leave, and part of it was too much code, too fast, and a demo that fought back. I'm changing all three today. Every idea gets a picture before it gets code. There are three short pieces of code all session, a few one-line snippets, and nothing is typed live. If you're lost, write it in the chat. I'll read the chat at every section break."
Then: "The capstone is cancelled. The last four sessions build one app together, and today is the first layer."
Before class: drive_admin.py check says READY; sync.py --wipe; the API is NOT running with the timer on (the first dry run must say add 18).`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 2 The problem in one picture
  s = S.contentSlide(deck, {
    section: "Opening", title: "The problem in one picture",
    subtitle: "Our assistant answers from a copy of the documents, and copies go stale.",
    takeaway: "Today: keep the copy true, cheaply, without anyone pressing a button.",
    notes: `Time: 3 minutes. This slide is the whole session's motivation. Don't rush it.
Say: "On Friday at 17:40, HR changes the carry-over rule in the Leave Policy from 5 days to 10. On Monday at 9:00 an employee asks our assistant. It says 5. It even cites the Leave Policy. Confident, cited, and wrong."
Then say: "The document is right, so why is the answer wrong? Because the assistant doesn't read the document. It reads the index, a copy we made the last time we ingested, and that copy still says 5."
Then: "So today has one job: when somebody edits, deletes or adds a file, the copy follows, by itself, and we only pay for what changed."`,
  });
  // left: the document
  s.rect({ x: 0.6, y: 1.6, w: 3.7, h: 3.2, fill: C.white, line: C.line, name: "doc-box" });
  s.image(I.file, { x: 0.82, y: 1.8, w: 0.42, h: 0.42, name: "doc-icon" });
  s.text([[{ text: "Leave Policy", b: true, size: 15, color: C.dark, font: "Arial" }], [{ text: "a Google Doc, owned by People Operations", size: 10.5, color: C.gray }]],
    { x: 1.38, y: 1.74, w: 2.8, h: 0.56, valign: "middle", name: "doc-title" });
  s.text("Unused days you can carry over:", { x: 0.82, y: 2.55, w: 3.3, h: 0.3, size: 12, color: C.slate, name: "doc-rule" });
  s.text([[{ text: "5", color: C.gray }, { text: "  →  ", color: C.gray, size: 30 }, { text: "10", color: C.deep }]],
    { x: 0.82, y: 2.9, w: 3.3, h: 0.85, font: "Arial", size: 44, bold: true, valign: "middle", name: "doc-change" });
  s.text([[{ text: "Edited by HR, Friday 17:40", b: true, color: C.deep }]], { x: 0.82, y: 3.95, w: 3.3, h: 0.3, size: 11.5, name: "doc-when" });
  s.text("The document is right.", { x: 0.82, y: 4.28, w: 3.3, h: 0.3, size: 11.5, italic: true, color: C.gray, name: "doc-right" });
  // middle: time passes
  s.text("Monday", { x: 4.35, y: 2.75, w: 0.9, h: 0.3, size: 11, bold: true, color: C.gray, align: "center", name: "mid-label" });
  S.arrow(s, 4.4, 3.15, 5.2, 3.15, C.gray, 2);
  // right: the chat
  bubble(s, { x: 5.9, y: 1.6, w: 3.5, h: 0.85, who: "EMPLOYEE, MONDAY 9:00", text: "How many unused vacation days can I roll over?", tone: "ask", name: "q" });
  bubble(s, { x: 5.35, y: 2.6, w: 3.6, h: 0.85, who: "ASSISTANT", text: "You can carry over 5 days.  [Leave Policy]", tone: "bad", name: "a" });
  s.text([[{ text: "Confident, cited, and wrong.", b: true, color: C.redText }], [{ text: "It answers from the index: the copy we made the last time we ingested. That copy still says 5.", color: C.slate }]],
    { x: 5.35, y: 3.6, w: 4.05, h: 1.1, size: 12, paraSpace: 4, name: "a-why" });
  num(s);

  // ---------------------------------------------------------------- 3 Recap: the pipeline you built
  s = S.contentSlide(deck, {
    section: "Opening", title: "The pipeline you already have",
    subtitle: "Two halves. Today is only about the left one.",
    takeaway: "Nothing on the right changes today. If the copy is true, the answers follow.",
    notes: `Time: 2 minutes. A safe recap for anyone Friday lost. Point at each box once.
Say: "This is the RAG pipeline from the first sessions. Left half: we take documents, cut them into chunks, turn each chunk into a vector (embed), and store the vectors: that store is the index. Right half: a question comes in, we retrieve the closest chunks, and the model answers from them."
Then: "The left half ran once, when someone typed a command. Real documents don't sit still. Today the left half learns to run again by itself, and to redo only the files that changed."
Vocabulary, say it out loud: "index" = the store of chunks and vectors. "sync" = one run of the left half. We'll use both words all day.
Point at the code box: "This is one chunk in the index, the Leave Policy's first piece. The text says 5 days, and it will keep saying 5 until something replaces this chunk. The etag is the label we'll meet in question 2. The vector is the numbers retrieval searches; you never read those."`,
  });
  const pipe = [["Documents", "files people edit"], ["Parse + chunk", "text, cut in pieces"], ["Embed", "a vector per chunk"], ["Index", "the stored copy"], ["Retrieve", "closest chunks"], ["Answer", "the model replies"]];
  s.roundRect({ x: 0.6, y: 1.6, w: 5.8, h: 0.42, fill: C.pale, radius: 0.06, name: "half-left" });
  s.text([[{ text: "INGESTION  ", b: true, color: C.deep }, { text: "runs when the documents change", color: C.slate }]], { x: 0.75, y: 1.6, w: 5.5, h: 0.42, size: 11.5, valign: "middle", name: "half-left-t" });
  s.roundRect({ x: 6.6, y: 1.6, w: 2.8, h: 0.42, fill: C.soft, radius: 0.06, name: "half-right" });
  s.text([[{ text: "QUESTION TIME  ", b: true, color: C.gray }, { text: "every question", color: C.gray }]], { x: 6.75, y: 1.6, w: 2.6, h: 0.42, size: 11.5, valign: "middle", name: "half-right-t" });
  pipe.forEach(([t, d], i) => {
    const x = 0.6 + i * 1.5;
    const left = i < 4;
    s.rect({ x, y: 2.25, w: 1.3, h: 1.0, fill: left ? C.deep : C.white, line: left ? C.deep : C.line, name: `pipe-${i}` });
    s.text([[{ text: t, b: true, size: 12.5, color: left ? C.white : C.dark, font: "Arial" }], [{ text: d, size: 10, color: left ? C.mint : C.gray }]],
      { x: x + 0.06, y: 2.25, w: 1.18, h: 1.0, align: "center", valign: "middle", paraSpace: 3, name: `pipe-t-${i}` });
    if (i < 5) S.arrow(s, x + 1.33, 2.75, x + 1.47, 2.75, C.gray, 1.5);
  });
  s.rect({ x: 0.6, y: 3.5, w: 5.8, h: 1.4, fill: C.white, line: C.deep, name: "today-box" });
  s.image(I.bulb, { x: 0.8, y: 3.68, w: 0.4, h: 0.4, name: "today-icon" });
  s.text([[{ text: "Until now: ", b: true, color: C.dark }, { text: "this half ran once, when someone typed a command." }],
    [{ text: "Today: ", b: true, color: C.deep }, { text: "it runs by itself, every minute, and only redoes the files that changed." }]],
    { x: 1.35, y: 3.6, w: 4.9, h: 1.2, size: 12.5, color: C.slate, valign: "middle", paraSpace: 6, name: "today-text" });
  S.code(s, { x: 6.6, y: 3.5, w: 2.8, h: 1.4, label: "ONE CHUNK IN THE INDEX", size: 9.5, name: "chunk", lines: [
    "\"id\":   \"HR-LEAVE::000\",",
    "\"text\": \"...carried over, up to",
    { text: "         a maximum of 5 days.\",", color: C.amber, b: true },
    "\"etag\": \"v7\",",
    "\"vector\": [0.021, -0.113, ...]"] });
  num(s);

  // ---------------------------------------------------------------- 4 The arc
  s = S.contentSlide(deck, {
    section: "Opening", title: "One app, four sessions",
    subtitle: "Acme Desk, a helpdesk assistant over Acme's documents. Each session adds one layer.",
    takeaway: "Every checkpoint runs offline on your laptop. A Google account is only needed on my screen.",
    notes: `Time: 1 minute. Don't read the bullets; point at today's card and move on.
Say: "Four sessions, one application. Today the documents and the job that keeps the index true. Wednesday, sign-in and who may read what. Friday it starts doing things, with real security controls. Next Monday we make it safe to ship."
If asked about the capstone: cancelled, nothing to submit.`,
  });
  const parts = [["1", "The source", "today", ["read a real Google Drive folder", "notice edits and deletions", "re-sync on a timer"], true],
    ["2", "The platform", "Wed 11 Nov", ["sign-in and sessions", "who may read what, live", "Postgres for everything"], false],
    ["3", "Tools, agents", "Fri 13 Nov", ["the assistant takes actions", "approval before every write", "budgets and an audit trail"], false],
    ["4", "Release", "Mon 16 Nov", ["guardrails on input and output", "evals as a release gate", "kill switch, Docker"], false]];
  parts.forEach(([k, title, when, items, now], i) => {
    const x = 0.6 + i * 2.2;
    S.card(s, { x, y: 1.75, w: 2.1, h: 3.1, num: k, numColor: now ? C.green : C.deep, title, titleSize: 13,
      border: now ? C.deep : undefined, fill: now ? C.pale : C.white,
      body: [{ runs: [{ text: when, b: true, color: now ? C.deep : C.gray }] }, ...items.map(t => ({ runs: t, bullet: true }))], bodySize: 11.5, paraSpace: 4, name: `arc-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 5 Today in three questions
  s = S.contentSlide(deck, {
    section: "Opening", title: "Today in three questions",
    subtitle: "Each question gets a picture, then a small piece of code, then something you can see working.",
    takeaway: "If you remember one line per question, today worked.",
    notes: `Time: 2 minutes. This is the map. Come back to it at each section divider ("we're on question 2").
Say: "Three questions. How do we read the documents where they live? How do we know which ones changed, without re-reading, and paying for, everything? And who runs it at three in the morning?"
Timing plan, for you: Q1 ends at 0:35, break at 1:05, Q3 ends at 1:45, wrap by 1:55. If you're more than 10 minutes behind at the break, cut slide 20 (three ways to run a job) to one sentence and show slide 17 (the code) for one minute only.`,
  });
  const qs = [["1", "How do we read the documents?", "A connector: one class that knows where the files live.", "Read a real Google Drive folder", "25 min"],
    ["2", "How do we know what changed?", "Check the cheap fingerprint first. Only pay for text that really changed.", "Six real cases, then the plan", "30 min"],
    ["3", "Who runs it at 3 a.m.?", "A job on a timer, not a person with a button.", "Edit a Doc, trash a file, wait", "30 min"]];
  qs.forEach(([k, q, idea, demo, mins], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.3, fill: C.white, line: C.line, name: `q-${i}` });
    s.ellipse({ x: x + 0.2, y: 1.78, w: 0.5, h: 0.5, fill: C.deep, name: `q-dot-${i}` });
    s.text(k, { x: x + 0.2, y: 1.78, w: 0.5, h: 0.5, font: "Arial", size: 16, bold: true, color: C.white, align: "center", valign: "middle", name: `q-n-${i}` });
    pill(s, { x: x + 1.85, y: 1.87, w: 0.8, h: 0.3, text: mins, font: "Calibri", size: 10, fill: C.soft, color: C.gray, name: `q-time-${i}` });
    s.text(q, { x: x + 0.2, y: 2.4, w: 2.45, h: 0.8, font: "Arial", size: 15, bold: true, color: C.dark, valign: "top", name: `q-q-${i}` });
    s.text([[{ text: "THE IDEA", b: true, size: 9, color: C.deep, charSpacing: 0.5 }], [{ text: idea, size: 11.5, color: C.slate }]],
      { x: x + 0.2, y: 3.25, w: 2.45, h: 0.85, paraSpace: 2, name: `q-idea-${i}` });
    s.text([[{ text: "YOU WILL SEE", b: true, size: 9, color: C.deep, charSpacing: 0.5 }], [{ text: demo, size: 11.5, color: C.slate }]],
      { x: x + 0.2, y: 4.15, w: 2.45, h: 0.65, paraSpace: 2, name: `q-demo-${i}` });
  });
  num(s);

  // ================================================================ Q1 READ (25 min)
  // ---------------------------------------------------------------- 6 divider
  s = S.darkSlide(deck, { section: "1 · Read", icon: I.search, kicker: "QUESTION 1 OF 3  ·  25 MINUTES", title1: "How do we read", title2: "the documents?",
    subtitle: "Where the files live is someone else's system. We need one piece of code that speaks its language.",
    footer: "connector  ·  interface  ·  identity",
    notes: `Time: 30 seconds. Clock check: should be about 0:10.
Say: "Acme's documents don't live in our repo. They live in Google Drive, where HR and Legal edit them. First question: how does our code read them?"` });
  num(s, true);

  // ---------------------------------------------------------------- 7 three questions, in plain words
  s = S.contentSlide(deck, {
    section: "1 · Read", title: "A connector answers three questions",
    subtitle: "Drive, SharePoint, Confluence, S3: different APIs, the same three questions.",
    takeaway: "Think of a librarian: the catalogue, the book itself, and the card that says who may borrow it.",
    notes: `Time: 4 minutes. No code yet: plain words first, function names are just labels at the bottom.
Say: "Whatever the source, our sync asks three things. What's there right now: a list of files, each with a small fingerprint (more on that in question 2). Give me this file: the actual bytes. And what do we know about it: who owns it, who may read it, is it current or a draft. We call that third answer the register."
Analogy: the catalogue, the book, the borrowing card.
Then say: "We call the first one on every run, because every run lists everything. The second one is the expensive one, and we'll spend question 2 learning to avoid it."`,
  });
  const q3 = [["What's there right now?", I.list, "20 files across 7 folders, each with a fingerprint:", "hr/leave-policy  ·  v7", "list_items()"],
    ["Give me this file", I.download, "The actual bytes, so we can read the text:", "hr/leave-policy  →  its text", "fetch(path)"],
    ["What do we know about it?", I.tag, "The register: owner, who may read it, status:", "People Ops  ·  employees  ·  current", "fetch_register()"]];
  q3.forEach(([q, ic, d, ex, fn], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.25, fill: C.white, line: C.line, name: `cq-${i}` });
    s.ellipse({ x: x + 0.2, y: 1.8, w: 0.6, h: 0.6, fill: C.pale, name: `cq-dot-${i}` });
    s.image(ic, { x: x + 0.35, y: 1.95, w: 0.3, h: 0.3, name: `cq-icon-${i}` });
    s.text(`${i + 1}`, { x: x + 2.2, y: 1.8, w: 0.45, h: 0.6, font: "Arial", size: 26, bold: true, color: C.line, align: "right", valign: "middle", name: `cq-n-${i}` });
    s.text(q, { x: x + 0.2, y: 2.55, w: 2.45, h: 0.7, font: "Arial", size: 15, bold: true, color: C.dark, name: `cq-q-${i}` });
    s.text(d, { x: x + 0.2, y: 3.25, w: 2.45, h: 0.5, size: 11.5, color: C.slate, name: `cq-d-${i}` });
    s.text(ex, { x: x + 0.2, y: 3.78, w: 2.45, h: 0.38, size: 11, italic: true, color: C.deep, name: `cq-ex-${i}` });
    pill(s, { x: x + 0.2, y: 4.33, w: 2.45, h: 0.32, text: fn, fill: C.soft, color: C.slate, size: 10.5, name: `cq-fn-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 8 a plug, not a rewrite
  s = S.contentSlide(deck, {
    section: "1 · Read", title: "A plug, not a rewrite",
    subtitle: "Every source is a class with the same four methods. The rest of the app only ever sees those four.",
    takeaway: "Switching from a local folder to Google Drive changed zero lines of sync.py.",
    notes: `Time: 5 minutes. CODE MOMENT 1 of 3 (connector.py).
Picture first: "On the left, two sources. Each gets its own class. They all plug into the same socket: the four methods. To the right of the socket, nothing knows or cares which source it got."
Then the code on the slide: "This is the whole contract. Four method names. In Python this is a Protocol: it just says 'anything with these four methods will do'."
Then open the real file, zoomed in: ${CP}/app/ingest/connector.py, Ctrl+G 58 (class Connector), then line 112 (make_connector). Show it reads SOURCE from .env. Don't open connector_drive.py: say "the Drive one is 200 lines of Google API calls, it answers the same four questions, read it tonight if you're curious."
Point at the bottom-right line: "If your company uses SharePoint, you write one new class with these four methods. Nothing else changes."`,
  });
  const srcBox = (y, ic, t, cls, dashed, nm) => {
    s.rect({ x: 0.6, y, w: 1.75, h: 0.72, fill: dashed ? C.bg : C.white, line: dashed ? C.gray : C.line, name: nm });
    s.image(ic, { x: 0.72, y: y + 0.2, w: 0.32, h: 0.32, name: `${nm}-icon` });
    s.text([[{ text: t, b: true, size: 11.5, color: dashed ? C.gray : C.dark }], [{ text: cls, size: 9, color: C.gray, font: "Consolas" }]],
      { x: 1.1, y: y + 0.06, w: 1.22, h: 0.6, valign: "middle", name: `${nm}-t` });
  };
  srcBox(1.65, I.folder, "A folder", "LocalFolder…", false, "src-local");
  srcBox(2.55, I.drive, "Google Drive", "DriveConnector", false, "src-drive");
  srcBox(3.45, I.ms, "SharePoint", "next: your job", true, "src-sp");
  [2.01, 2.91, 3.81].forEach((y, i) => S.arrow(s, 2.38, y, 2.68, 2.9, i === 2 ? C.line : C.gray, 1.5));
  s.rect({ x: 2.72, y: 2.15, w: 1.25, h: 1.5, fill: C.dark, name: "socket" });
  s.text([[{ text: "Connector", b: true, size: 12.5, color: C.white, font: "Arial" }], [{ text: "4 methods", size: 10.5, color: C.mintText }]],
    { x: 2.72, y: 2.15, w: 1.25, h: 1.5, align: "center", valign: "middle", paraSpace: 3, name: "socket-t" });
  S.arrow(s, 4.0, 2.9, 4.3, 2.9, C.deep, 2);
  s.rect({ x: 4.33, y: 2.15, w: 1.15, h: 1.5, fill: C.pale, line: C.deep, name: "sync-box" });
  s.text([[{ text: "sync.py", b: true, size: 12, color: C.deep, font: "Consolas" }], [{ text: "unchanged", size: 10.5, color: C.deep, i: true }]],
    { x: 4.33, y: 2.15, w: 1.15, h: 1.5, align: "center", valign: "middle", paraSpace: 3, name: "sync-t" });
  s.text("A new source = one new class. Everything right of the socket stays.", { x: 0.6, y: 4.35, w: 4.9, h: 0.5, size: 12, italic: true, color: C.slate, valign: "middle", name: "plug-rule" });
  s.text([[{ text: "SharePoint? ", b: true, color: C.deep }, { text: "One new class, these four methods." }]], { x: 5.75, y: 4.45, w: 3.65, h: 0.4, size: 12, color: C.slate, valign: "middle", name: "plug-sp" });
  S.code(s, { x: 5.75, y: 1.6, w: 3.65, h: 2.75, label: "app/ingest/connector.py  ·  line 58", size: 11, lines: [
    "class Connector(Protocol):",
    "    def list_items(self): ...",
    "    def fetch(self, path): ...",
    "    def fetch_register(self): ...",
    "    def source_url(self, path): ...",
    "",
    "def make_connector():",
    "    if SOURCE == \"drive\":",
    "        return DriveConnector(...)",
    "    return LocalFolderConnector(...)"] });
  num(s);

  // ---------------------------------------------------------------- 9 the sync needs its own identity
  s = S.contentSlide(deck, {
    section: "1 · Read", title: "The sync needs its own identity",
    subtitle: "A job that runs at 3 a.m. can't log in as you. Who is it, then?",
    takeaway: "Read-only, one folder, its own identity: if it leaks, the damage is one read-only folder.",
    notes: `Time: 4 minutes. Concept only; no code. The details (OAuth, managed identity, SharePoint) are in Reference.
Open with: "A program that runs every minute, forever, still has to sign in to Google. There are three ways to do it, and only one is right."
Say for each card: "Your own login: it can read everything you can, and it breaks the day you leave. A key pasted into the code: anyone with the repo has it. A service account: a robot user that belongs to the project, not to a person. I shared exactly one folder with it, as a Viewer. It can't edit, can't delete, can't see my other files."
Analogy: a visitor badge that opens one door, versus lending someone your house keys.
Then the code strip: "This is the whole sign-in. Its own key file, kept in secrets/ and out of git, and one scope: drive.readonly. Even if our code had a bug that tried to delete a file, Google would refuse."
Bridge to Wednesday: "The sync may read every file in the folder. That does NOT mean every employee may. That's Wednesday."`,
  });
  const ids = [["Your own Google login", I.user, false, ["sees everything you can see", "stops working the day you leave", "acts as you, in every log"]],
    ["A key pasted in the code", I.key, false, ["anyone with the repo has it", "can't tell who used it", "hard to take back"]],
    ["A service account", I.badge, true, ["a robot user for this one job", "Viewer on one folder only", "can't edit, delete or share"]]];
  ids.forEach(([t, ic, ok, items], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 2.3, fill: ok ? C.pale : C.white, line: ok ? C.deep : C.line, lineWidth: ok ? 1.5 : 1, name: `id-${i}` });
    s.image(ic, { x: x + 0.22, y: 1.78, w: 0.38, h: 0.38, name: `id-icon-${i}` });
    s.image(ok ? I.yes : I.no, { x: x + 2.27, y: 1.78, w: 0.36, h: 0.36, name: `id-verdict-${i}` });
    s.text(t, { x: x + 0.22, y: 2.28, w: 2.45, h: 0.45, font: "Arial", size: 14.5, bold: true, color: C.dark, valign: "middle", name: `id-t-${i}` });
    s.text(items.map(z => ({ runs: z, bullet: true })), { x: x + 0.22, y: 2.82, w: 2.45, h: 0.98, size: 12, color: C.slate, paraSpace: 5, bulletIndent: 12, name: `id-b-${i}` });
  });
  S.code(s, { x: 0.6, y: 4.05, w: 8.85, h: 0.85, label: "app/ingest/connector_drive.py  ·  line 60  ·  how the sync signs in", size: 11, name: "signin", lines: [
    "creds = service_account.Credentials.from_service_account_file(",
    "    \"secrets/acme-desk-sa.json\", scopes=[DRIVE_READONLY])  # its own key, not in git; read-only"] });
  num(s);

  // ---------------------------------------------------------------- 10 LIVE 1
  s = S.liveSlide(deck, {
    section: "1 · Read", icon: I.laptop, kicker: "LIVE  ·  LOOK BEFORE WE TOUCH",
    title1: "Read the folder,", title2: "plan, then apply",
    steps: ["What does the connector see? Seven folders, twenty files, each with a fingerprint",
      "The dry run: a plan for every file. Nothing is written yet",
      "Apply the plan, then ask the assistant: \"How many unused vacation days can I roll over?\""],
    command: "drive_admin.py tree   ·   sync.py --source drive   ·   sync.py --source drive --apply",
    notes: `Time: 8 minutes. Nothing is typed but commands. Terminal font zoomed to 18+ before class.
1) python ${CP}/drive_admin.py tree. Say: "This is list_items(): the first question. Notice every file has an md5 or a version. Remember that; it's question 2."
2) python ${CP}/sync.py --source drive. Expect: add 18, quarantine 1 (the scan), skip 1 (the draft); 88 chunks, ~6,200 tokens. Say: "A dry run. The sync tells you what it WOULD do and what it would cost, and writes nothing. Read the plan before you pay for it."
3) python ${CP}/sync.py --source drive --apply. 15 to 25 s with Azure, about 5 s local. Then /ui, the carry-over question: 5 days.
DEMO RULE: if anything errors, say "this is what it does", go to the next slide (it is the output), and keep teaching. Debug at the break, never in front of the room for more than 60 seconds.
Plan B: SOURCE=local in .env, restart, fake_drive.py reset, same commands without --source drive. Same numbers.
Fallback text: instructor-notes/fallbacks/part1/first-sync.txt.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 11 what you should see
  s = S.contentSlide(deck, {
    section: "1 · Read", title: "What you should see",
    subtitle: "A plan first, then the work. Every file gets exactly one action, with a reason.",
    takeaway: "A dry run writes nothing. Read the plan before you pay for it.",
    notes: `Time: 3 minutes. This slide doubles as the demo's safety net: if the live run failed, teach from here.
Say: "Eighteen adds: the index was empty, so everything is new. One quarantine: the incident report is a scanned PDF, a picture of text. There is nothing to read, so we report it to a human instead of indexing an empty document. One skip: a draft policy; the register says draft, and drafts must never answer questions."
Then the bubble: "And the assistant answers 5 days, which is right, for now."
Bridge: "Now HR edits the Doc. Do we run all of this again? That's question 2."`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 5.75, h: 2.75, label: "THE DRY RUN, THEN THE APPLY  (shortened)", size: 11, lines: [
    { text: "$ python sync.py --source drive", color: C.mintText },
    { text: " + add         18 documents     88 chunks", color: C.green },
    { text: " ! quarantine  incident report   a scan: no text", color: C.amber },
    { text: " . skip        parental leave    a draft", color: C.mintText },
    { text: "   cost        ~6,200 tokens to embed", color: C.codeText },
    { text: "   nothing written: this was a dry run", color: C.codeText },
    { text: "", color: C.codeText },
    { text: "$ python sync.py --source drive --apply", color: C.mintText },
    { text: "   88 chunks embedded · smoke check ok · LIVE", color: C.green }] });
  s.text([[{ text: "Already three of the seven actions: ", b: true, color: C.dark }, { text: "add, quarantine, skip. Question 2 is about the other four." }]],
    { x: 0.6, y: 4.45, w: 5.75, h: 0.45, size: 12, color: C.slate, valign: "middle", name: "dry-bridge" });
  bubble(s, { x: 6.6, y: 1.6, w: 2.8, h: 0.95, who: "EMPLOYEE", text: "How many unused vacation days can I roll over?", tone: "ask", size: 12, name: "q1" });
  bubble(s, { x: 6.6, y: 2.7, w: 2.8, h: 0.75, who: "ASSISTANT", text: "5 days.  [Leave Policy]", tone: "good", name: "a1" });
  s.text("Correct, for now. HR hasn't touched the Doc yet.", { x: 6.6, y: 3.6, w: 2.8, h: 0.6, size: 12, italic: true, color: C.gray, name: "a1-note" });
  num(s);

  // ================================================================ Q2 NOTICE (30 min)
  // ---------------------------------------------------------------- 12 divider
  s = S.darkSlide(deck, { section: "2 · Notice", icon: I.bulb, kicker: "QUESTION 2 OF 3  ·  30 MINUTES", title1: "How do we know", title2: "what changed?",
    subtitle: "Without downloading, re-reading and paying for every file, every time.",
    footer: "fingerprints  ·  one action per document  ·  the plan",
    notes: `Time: 30 seconds. Clock check: about 0:35.
Say: "We can read the folder. Now HR changes one number in one file. What should the next run do?"` });
  num(s, true);

  // ---------------------------------------------------------------- 13 the lazy fix
  s = S.contentSlide(deck, {
    section: "2 · Notice", title: "The lazy fix: redo everything",
    subtitle: "Run the whole ingestion again every hour. It works for us. Now picture a real company.",
    takeaway: "Almost all of that work finds nothing new. We need a cheap way to skip it.",
    notes: `Time: 4 minutes. Do the arithmetic out loud yourself, left column first, then the right.
Say: "Simplest idea: every hour, throw everything away and ingest it all again. For Acme's 20 files that's fine."
Then: "A real company has 20,000 files. Twenty-four runs a day: that's 480,000 downloads. And how many of those files actually changed today? A handful."
Read the bar at the bottom: "So what we need is a way to tell that a file changed without downloading it. You might think of the modified date, the file size, or a hash. Close, but the source already gives us something better. That's the next slide."
Don't argue about embedding prices; the point is waste and churn, not dollars.`,
  });
  const lazy = [["Acme today", "20 files", [["480", "downloads a day"], ["88", "chunks re-embedded every hour"]], false],
    ["A real company", "20,000 files", [["480,000", "downloads a day"], ["all of it", "re-embedded every hour, while people ask questions"]], true]];
  lazy.forEach(([t, sub, stats, big], i) => {
    const x = 0.6 + i * 4.45;
    s.rect({ x, y: 1.6, w: 4.3, h: 2.05, fill: big ? C.redSoft : C.white, line: big ? C.red : C.line, name: `lazy-${i}` });
    s.text([[{ text: t, b: true, size: 15, color: C.dark, font: "Arial" }, { text: "   " + sub, size: 12, color: C.gray }]], { x: x + 0.22, y: 1.72, w: 3.9, h: 0.4, valign: "middle", name: `lazy-t-${i}` });
    stats.forEach(([v, l], j) => {
      S.stat(s, { x: x + 0.22 + j * 2.05, y: 2.2, w: 1.95, h: 0.65, value: v, label: l, size: v.length > 6 ? 24 : 30, color: big ? C.redText : C.deep, labelH: 0.9, labelSize: 11.5, name: `lazy-s-${i}-${j}` });
    });
  });
  s.rect({ x: 0.6, y: 3.9, w: 8.8, h: 0.8, fill: C.dark, name: "need-box" });
  s.text([[{ text: "WHAT WE NEED   ", b: true, color: C.green, size: 11 }, { text: "A way to tell that a file changed, without downloading it.", color: C.white, size: 15, b: true }]],
    { x: 0.8, y: 3.9, w: 8.4, h: 0.8, valign: "middle", name: "need-text" });
  num(s);

  // ---------------------------------------------------------------- 14 check the label first
  s = S.contentSlide(deck, {
    section: "2 · Notice", title: "Check the label before you open the box",
    subtitle: "Three steps, cheapest first. Most files stop at step 1, and only step 3 costs money.",
    takeaway: "The label says the file was touched. The text says whether it really changed. Only text costs money.",
    notes: `Time: 6 minutes. THE key idea of the day. Use the parcel analogy and stick to it.
Say: "Think of a warehouse full of parcels. Step 1: read the label. Free: Google puts a fingerprint of every file in the listing we already fetched. For an uploaded file it's an md5Checksum, a short code computed from the bytes; change one byte and it changes. For a Google Doc it's a version number that goes up on every edit. Same label as last time? The file didn't change. Don't even download it."
"Step 2: if the label changed, open the box: download, read the text, and compute our own fingerprint of the text we would store. Why? Because the label also moves when nothing important changed: someone re-saves the file, or edits only a page footer we throw away anyway."
"Step 3: only if the text changed do we embed. That is the only step that costs money."
Point at the dark line in each card: "Each step is one line of code. Step 1 compares two labels. Step 2 compares two hashes of the text. Step 3 is the call that costs money. The first two come back on slide 17, inside the full ladder."
Point at the strip: "Monday's real numbers. Twenty documents. Sixteen stopped at step 1. Two were downloaded. One was re-embedded: four chunks."
One worked example to finish: "Someone opens the Leave Policy and saves it without changing anything. If it's an uploaded file, it stops at step 1: same md5. If it's a Google Doc, it often stops at step 2: the version moved, but the text is the same, so nothing is embedded."`,
  });
  const steps3 = [["1", "Read the label", I.tagOne, "free", "Google puts a fingerprint in the listing: an md5 or a version.", "Same as last time? Stop. Don't download.", "if old.etag == item.etag: stop"],
    ["2", "Open the box", I.box, "download", "Download it, extract the text, and hash the text we would store.", "Same text (a re-save, a footer)? Note the new label. Stop.", "if old.hash == hash(text): stop"],
    ["3", "Pay", I.coins, "embed", "Chunk the new text and embed it. Swap the old chunks for the new ones.", "The only step that costs money.", "vectors = embed_texts(texts)"]];
  steps3.forEach(([k, t, ic, cost, what, stop, line], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.75, h: 2.6, fill: C.white, line: C.line, name: `step-${i}` });
    s.image(ic, { x: x + 0.2, y: 1.78, w: 0.4, h: 0.4, name: `step-icon-${i}` });
    const [label, fill, color] = COST[cost];
    pill(s, { x: x + 1.65, y: 1.82, w: 0.9, h: 0.3, text: label, fill, color, size: 10, font: "Calibri", name: `step-cost-${i}` });
    s.text(`${k}  ${t}`, { x: x + 0.2, y: 2.3, w: 2.4, h: 0.38, font: "Arial", size: 15, bold: true, color: C.dark, valign: "middle", name: `step-t-${i}` });
    s.text(what, { x: x + 0.2, y: 2.72, w: 2.4, h: 0.55, size: 11, color: C.slate, name: `step-what-${i}` });
    S.chip(s, { x: x + 0.15, y: 3.3, w: 2.45, h: 0.3, text: line, fill: C.code, color: C.codeText, size: 9.5, bold: false, font: "Consolas", name: `step-code-${i}` });
    s.text(stop, { x: x + 0.2, y: 3.68, w: 2.4, h: 0.48, size: 11, bold: true, color: C.deep, name: `step-stop-${i}` });
    if (i < 2) S.arrow(s, x + 2.78, 2.9, x + 2.94, 2.9, C.gray, 1.5);
  });
  s.rect({ x: 0.6, y: 4.35, w: 8.8, h: 0.6, fill: C.pale, name: "funnel" });
  s.text([[{ text: "MONDAY'S REAL RUN   ", b: true, size: 10.5, color: C.deep }, { text: "20 documents  →  16 stop at step 1  →  2 downloaded  →  1 re-embedded (4 chunks)", size: 13, b: true, color: C.dark }]],
    { x: 0.8, y: 4.35, w: 8.4, h: 0.6, valign: "middle", name: "funnel-t" });
  num(s);

  // ---------------------------------------------------------------- 15 one action per document
  s = S.contentSlide(deck, {
    section: "2 · Notice", title: "One action per document",
    subtitle: "For each document, ask these questions in order. The first yes decides. Cheap questions come first.",
    takeaway: "Only add and change spend embedding money. Everything else is bookkeeping.",
    notes: `Time: 5 minutes. This is the decision ladder. Teach it as new; don't assume Friday covered it.
Walk down once, slowly, with one example per row:
1 skip: a draft policy. It must never answer a question.
2 remove: Legal deletes the Q3 notes. We must delete their chunks, or the assistant keeps quoting a deleted document.
3 unchanged: same label. Not even downloaded (that's step 1 from the last slide).
4 quarantine: a scanned PDF, no text. Report it; don't index an empty document.
5 add: a new file.
6 change: the text differs: new chunks in, old chunks out.
7 touch: the label moved but the text didn't. Store the new label so next time we stop at step 1. Zero embedding.
If asked: there is an eighth, "relabel": only the register changed (say, who may read it). Metadata only, no embedding. Wednesday uses it.
Why remove matters (say it): "The most common production bug here is forgetting deletions. The file is gone; its chunks live forever."`,
  });
  const ladder = [["Is it a draft, or withdrawn?", "skip", "never indexed", "free"],
    ["In the index, but gone from the source?", "remove", "delete its chunks", "free"],
    ["Same label as last time?", "unchanged", "not even downloaded", "free"],
    ["Downloaded, but no text in it (a scan)?", "quarantine", "report it to a human", "download"],
    ["Not in the index yet?", "add", "chunk, embed, insert", "embed"],
    ["Is the text different?", "change", "new chunks in, old out", "embed"],
    ["Same text, new label?", "touch", "store the new label", "download"]];
  ladder.forEach(([q, a, d, cost], i) => {
    const y = 1.55 + i * 0.475;
    s.rect({ x: 0.6, y, w: 8.8, h: 0.42, fill: i % 2 ? C.white : C.soft, name: `lad-${i}` });
    s.text(`${i + 1}`, { x: 0.68, y, w: 0.3, h: 0.42, size: 12, bold: true, color: C.gray, valign: "middle", name: `lad-n-${i}` });
    s.text(q, { x: 1.0, y, w: 3.85, h: 0.42, size: 12.5, color: C.dark, valign: "middle", name: `lad-q-${i}` });
    s.text("yes  →", { x: 4.85, y, w: 0.6, h: 0.42, size: 10.5, color: C.gray, valign: "middle", name: `lad-yes-${i}` });
    const [fill, color] = ACTION[a];
    pill(s, { x: 5.5, y: y + 0.06, w: 1.35, h: 0.3, text: a, fill, color, size: 11.5, name: `lad-a-${i}` });
    s.text(d, { x: 7.0, y, w: 1.45, h: 0.42, size: 11, color: C.slate, valign: "middle", name: `lad-d-${i}` });
    const [label, cf, cc] = COST[cost];
    pill(s, { x: 8.5, y: y + 0.08, w: 0.82, h: 0.26, text: label, fill: cf, color: cc, size: 9.5, font: "Calibri", name: `lad-c-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 16 six real cases, worked through
  s = S.contentSlide(deck, {
    section: "2 · Notice", title: "Six real cases, one action each",
    subtitle: "The ladder applied to six things that happen in a normal week. Watch rows 3 and 6.",
    takeaway: "Rows 1 and 2 are exactly what we'll do live in question 3, so you already know what the tick should say.",
    notes: `Time: 5 minutes. A worked example, not an exercise: you walk down the rows and say the reasoning out loud. Nobody is asked to answer.
For each row, say the event, then climb the ladder out loud until the first yes: "Is it a draft? No. Gone from the source? No. Same label? No, HR edited it. ... Is the text different? Yes: change."
Slow down on 3: "The md5 moved, so we downloaded it. But the HTML parser throws the footer away, so the text we store is identical. That's touch: one download, zero embedding. It looks like a change, and it isn't."
And on 6: "Same label as last time, so we never even downloaded it. That's the case for most files on most days."
Bridge: "Rows 1 and 2 are what I'll do in Drive in a few minutes: a change and a remove. Keep those two words in mind."`,
  });
  const ans = [[I.pencil, "HR changes 5 → 10 in the Leave Policy", "change", "the text differs: 4 chunks out, 4 in", "embed"],
    [I.trash, "Legal deletes the Q3 planning notes", "remove", "in the index, gone from the source", "free"],
    [I.upload, "Wiki page re-uploaded, only the footer changed", "touch", "new md5, same text: the parser drops footers", "download"],
    [I.plus, "A brand-new travel policy", "add", "not in the index yet", "embed"],
    [I.pdf, "A scanned PDF with no text", "quarantine", "nothing to read: report it", "download"],
    [I.eye, "Nobody touched the remote-work guidelines", "unchanged", "same label: never downloaded", "free"]];
  ans.forEach(([ic, t, a, why, cost], i) => {
    const y = 1.55 + i * 0.57;
    s.rect({ x: 0.6, y, w: 8.8, h: 0.5, fill: i % 2 ? C.white : C.soft, name: `ans-${i}` });
    s.text(`${i + 1}`, { x: 0.7, y, w: 0.3, h: 0.5, size: 13, bold: true, color: C.deep, valign: "middle", name: `ans-n-${i}` });
    s.image(ic, { x: 1.02, y: y + 0.12, w: 0.26, h: 0.26, name: `ans-icon-${i}` });
    s.text(t, { x: 1.38, y, w: 3.22, h: 0.5, size: 12, color: C.dark, valign: "middle", name: `ans-t-${i}` });
    const [fill, color] = ACTION[a];
    pill(s, { x: 4.65, y: y + 0.1, w: 1.3, h: 0.3, text: a, fill, color, size: 11.5, name: `ans-a-${i}` });
    s.text(why, { x: 6.1, y, w: 2.35, h: 0.5, size: 11, color: C.slate, valign: "middle", name: `ans-why-${i}` });
    const [label, cf, cc] = COST[cost];
    pill(s, { x: 8.5, y: y + 0.12, w: 0.82, h: 0.26, text: label, fill: cf, color: cc, size: 9.5, font: "Calibri", name: `ans-c-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 17 the code: build_plan
  s = S.contentSlide(deck, {
    section: "2 · Notice", title: "The same ladder, in code",
    subtitle: "You already know what this does. Now read it: every line is a row from the ladder.",
    takeaway: "build_plan() only reads and decides. apply_plan() does the writing, after you've seen the plan.",
    notes: `Time: 5 minutes. CODE MOMENT 2 of 3 (sync.py). Read it with them; don't explain Python syntax, map each line to a ladder row.
Point at the slide first, top to bottom: "skip, remove, unchanged: all decided before any download. Then the first download. Then quarantine, add, change, touch."
Then open the real file zoomed in: ${CP}/app/ingest/sync.py, Ctrl+G 167 (def build_plan). Scroll to line 201 and read the comment aloud: "Cheapest check first: same eTag means same bytes. Don't download." Then line 212: the first fetch(). Stop there. Don't scroll the rest of the file.
Say: "eTag is the industry word for the label. In our code it means whichever fingerprint the source gives: md5 or version."
If asked "why plan and apply separately?": so you can read the plan (the dry run) before anything is written or paid for.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 5.9, h: 3.35, label: "app/ingest/sync.py  ·  build_plan()  ·  simplified", size: 12.5, lines: [
    "for doc in register:",
    "    item = listing.get(doc.path)",
    "    if not doc.indexable:       plan(\"skip\")",
    "    elif item is None:          plan(\"remove\")",
    "    elif old.etag == item.etag: plan(\"unchanged\")",
    { text: "    # only now do we download", color: C.amber },
    "    text = parse(fetch(doc.path))",
    "    if not text:                plan(\"quarantine\")",
    "    elif not old:               plan(\"add\")",
    "    elif old.hash != hash(text): plan(\"change\")",
    "    else:                       plan(\"touch\")"] });
  const callouts = [["Free questions first", "skip, remove, unchanged need only the register and the listing."],
    ["One download, in the middle", "fetch() runs only when the label moved or the file is new."],
    ["The hash decides the money", "change embeds; touch stores the new label and stops."]];
  callouts.forEach(([t, d], i) => {
    const y = 1.6 + i * 1.13;
    s.rect({ x: 6.7, y, w: 2.7, h: 1.0, fill: C.white, line: C.line, name: `co-${i}` });
    s.text([[{ text: t, b: true, size: 12.5, color: C.dark, font: "Arial" }], [{ text: d, size: 11, color: C.slate }]],
      { x: 6.85, y: y + 0.06, w: 2.45, h: 0.88, valign: "middle", paraSpace: 3, name: `co-t-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 19 break
  s = S.darkSlide(deck, { section: "Break", icon: I.coffee, kicker: "10 MINUTES", title1: "Break",
    subtitle: "When we come back: nobody types the command any more. We edit, we trash, we wait.",
    footer: "Question 3: who runs it at 3 a.m.?",
    notes: `Clock check: about 1:05. If you're more than 10 minutes behind, cut slide 20 (three ways) to one sentence.
Online: read the chat now and answer anything that came in during question 2, before you start the timer.
During the break: start the API with the timer (SYNC_INTERVAL_SECONDS=60 python run_checkpoint.py 01-source) so it's warm, check /ui#sync shows the Scheduler card counting down, and that drive_admin.py check is still READY. Have the Leave Policy Doc and the leadership folder open in two browser tabs.` });
  num(s, true);

  // ================================================================ Q3 REPEAT (30 min)
  // ---------------------------------------------------------------- 20 divider
  s = S.darkSlide(deck, { section: "3 · Repeat", icon: I.clockG, kicker: "QUESTION 3 OF 3  ·  30 MINUTES", title1: "Who runs it", title2: "at 3 a.m.?",
    subtitle: "So far I typed the command. A production index is kept true by a job that nobody types.",
    footer: "a timer  ·  the tick  ·  edit, trash, wait",
    notes: `Time: 30 seconds.
Say: "We have a plan that only redoes what changed. Last question: who presses the button? Answer: nobody."` });
  num(s, true);

  // ---------------------------------------------------------------- 21 three ways to run a job
  s = S.contentSlide(deck, {
    section: "3 · Repeat", title: "Three ways to run a job",
    subtitle: "All three do the same thing: call the same sync, on some trigger. They differ in who pulls the trigger.",
    takeaway: "Whatever the trigger, each run is the same plan and apply you just learned.",
    notes: `Time: 3 minutes. Skip to one sentence if behind.
Say: "A timer, like cron: simplest, fine for one machine. A queue worker: each run is a message; you get retries and one-at-a-time for free; most companies end up here. A webhook: the source calls you when something changes. Sounds best, but notifications get lost, so everyone keeps a slow timer as a backup."
"Today: the simplest one. A timer inside our API, every 60 seconds."`,
  });
  const ways = [["A timer", "like cron", ["the simplest thing", "fine for one machine", "today's choice"], I.clockD, true],
    ["A queue worker", "each run is a message", ["retries for free", "one run at a time", "most teams end up here"], I.server, false],
    ["A webhook", "the source calls you", ["near real time", "notifications get lost", "so you keep a timer too"], I.bell, false]];
  ways.forEach(([t, sub, items, ic, now], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.25, fill: now ? C.pale : C.white, line: now ? C.deep : C.line, lineWidth: now ? 1.5 : 1, name: `way-${i}` });
    s.image(ic, { x: x + 0.22, y: 1.8, w: 0.42, h: 0.42, name: `way-icon-${i}` });
    s.text(t, { x: x + 0.22, y: 2.35, w: 2.45, h: 0.42, font: "Arial", size: 16, bold: true, color: C.dark, valign: "middle", name: `way-t-${i}` });
    s.text(sub, { x: x + 0.22, y: 2.78, w: 2.45, h: 0.32, size: 12, italic: true, color: C.gray, name: `way-sub-${i}` });
    s.text(items.map(z => ({ runs: z, bullet: true })), { x: x + 0.22, y: 3.25, w: 2.45, h: 1.45, size: 12, color: C.slate, paraSpace: 5, bulletIndent: 12, name: `way-b-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 22 the timer in 12 lines
  s = S.contentSlide(deck, {
    section: "3 · Repeat", title: "The timer, in twelve lines",
    subtitle: "One run is called a tick. A tick is the sync you already ran by hand, plus a little bookkeeping.",
    takeaway: "A scheduler must survive one bad run. The index was never touched, so the next tick just tries again.",
    notes: `Time: 5 minutes. CODE MOMENT 3 of 3 (scheduler.py). Do NOT live-type this. Read it.
On the slide: tick() first. "Line 3 is the whole sync: the same run_sync you ran by hand, with apply=True. run_locked means the timer and the Sync button can't both write at once. If it throws, we count the error and show it; we never crash the timer."
Then _loop(): "wait(interval) is a sleep you can interrupt: it returns True the moment someone calls stop(). Paused means: keep looping, do nothing."
Then open the real file zoomed in: ${CP}/app/ingest/scheduler.py, Ctrl+G 75 (tick), then 102 (_loop). Show they match the slide. Then GET /sync/status in the browser: the counters this code fills in.
Why no live typing: last time typing ate the time and the attention. Reading working code with a picture already in their heads teaches more.
If asked "why not Celery or APScheduler?": you could. The point is what one tick does, not who triggers it.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 5.6, h: 3.35, label: "app/ingest/scheduler.py  ·  simplified", size: 11, lines: [
    "def tick():",
    "    try:",
    "        report = run_locked(lambda: run_sync(apply=True))",
    "        state[\"last_summary\"] = report[\"counts\"]",
    "    except Exception as exc:",
    "        state[\"errors\"] += 1           # count it, don't crash",
    "        state[\"last_error\"] = str(exc)",
    "    state[\"runs\"] += 1",
    "",
    "def _loop(interval):",
    "    while not stop.wait(interval):     # sleep, wake on stop()",
    "        if not state[\"paused\"]: tick()"] });
  const tickNotes = [["1", "The same sync", "run_sync(apply=True): exactly what you ran by hand."],
    ["2", "One at a time", "run_locked: the timer and the Sync button never write together."],
    ["3", "Survive a bad run", "Count the error, show it in /sync/status, try again next tick."]];
  tickNotes.forEach(([k, t, d], i) => {
    const y = 1.6 + i * 1.13;
    s.rect({ x: 6.4, y, w: 3.0, h: 1.0, fill: C.white, line: C.line, name: `tn-${i}` });
    s.ellipse({ x: 6.55, y: y + 0.12, w: 0.34, h: 0.34, fill: C.deep, name: `tn-dot-${i}` });
    s.text(k, { x: 6.55, y: y + 0.12, w: 0.34, h: 0.34, font: "Arial", size: 11, bold: true, color: C.white, align: "center", valign: "middle", name: `tn-n-${i}` });
    s.text([[{ text: t, b: true, size: 12.5, color: C.dark, font: "Arial" }], [{ text: d, size: 11, color: C.slate }]],
      { x: 7.0, y: y + 0.06, w: 2.3, h: 0.88, valign: "middle", paraSpace: 3, name: `tn-t-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 23 LIVE 2
  s = S.liveSlide(deck, {
    section: "3 · Repeat", icon: I.laptop, kicker: "LIVE  ·  EDIT, TRASH, WAIT",
    title1: "Two clicks in Drive,", title2: "then watch the tick",
    steps: ["What should happen: the Leave Policy is a change, the Q3 notes are a remove (rows 1 and 2)",
      "In Drive: change 5 → 10 in the Leave Policy. Trash the Q3 planning notes",
      "Wait for the tick (the Sync tab counts down), or press Run now",
      "Same question again: \"How many unused vacation days can I roll over?\""],
    command: "SYNC_INTERVAL_SECONDS=60 python run_checkpoint.py 01-source   ·   /ui#sync",
    notes: `Time: 8 minutes. The API is already running with the timer (started during the break).
1) Say what should happen, 30 seconds: "From the six cases: the Leave Policy will be a change, the Q3 notes a remove. Let's see if the tick agrees."
2) In the browser, as the owner. Say what you are doing: "I'm an HR partner fixing a number." Then "I'm Legal deleting notes that named people."
3) The Sync tab counts down. If the minute feels long, POST /sync/now (the Run now button). If the Doc shows as unchanged, Drive hasn't bumped the version yet: wait one more tick.
4) /ui: carry-over is now 10 days. Then as finance-lead: "How many backend developers are we hiring?": no information, because the notes are gone.
Expect: change 1, remove 1, quarantine 1, skip 1, unchanged 16. 82 chunks in the index.
DEMO RULE: if Drive misbehaves, don't fight it. Say "here's what it does" and go to the next slide; the output is on it.
Plan B: SOURCE=local, fake_drive.py apply 2 (the edit) and apply 3 (the deletion). Same numbers. Fallback files: monday-plan.json and the screenshots in instructor-notes/fallbacks/part1/.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 24 what the tick decided
  s = S.contentSlide(deck, {
    section: "3 · Repeat", title: "What the tick decided",
    subtitle: "One minute after two clicks in Drive. Nobody ran anything. Exactly the change and the remove we expected.",
    takeaway: "Cost follows what changed, not the size of the folder. Sixteen documents were never downloaded.",
    notes: `Time: 4 minutes. The safety net for the demo, and the payoff of question 2.
Say: "Two real actions out of twenty, and they're the two we expected from rows 1 and 2: change and remove. The scan and the draft are reported every run; that report is for a human."
Point at the yellow line: "The register says the Company FAQ depends on the Leave Policy. The sync can't fix prose, so it asks a person to look. That's what a good job does: it tells you what it can't do."`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 6.15, h: 3.35, size: 10.5, label: "THE TICK'S REPORT  ·  GET /sync/status", lines: [
    { text: " ~ change     HR-LEAVE               4 chunks out, 4 in", color: C.green },
    { text: " - remove     LEAD-Q3-NOTES          gone from the source", color: "F2A19C" },
    { text: " ! quarantine ENG-INCIDENT-REPORT    a scan: no text", color: C.amber },
    { text: " . skip       HR-PARENTAL-2027-DRAFT a draft", color: C.mintText },
    { text: "   unchanged  16 documents           not downloaded", color: C.mintText },
    { text: "", color: C.codeText },
    { text: "For a human to look at:", color: C.amber },
    { text: " COMPANY-FAQ depends on HR-LEAVE, which changed.", color: C.amber },
    { text: "", color: C.codeText },
    { text: "# 60 s interval · 4 chunks embedded", color: C.mintText }] });
  S.stat(s, { x: 7.0, y: 1.5, w: 2.4, value: "2 / 20", label: "documents acted on", size: 30, name: "tick-acted" });
  S.stat(s, { x: 7.0, y: 2.65, w: 2.4, value: "16", label: "not even downloaded", size: 30, name: "tick-skip" });
  S.stat(s, { x: 7.0, y: 3.8, w: 2.4, value: "0", label: "commands typed", size: 30, name: "tick-typed" });
  num(s);

  // ---------------------------------------------------------------- 25 Monday 9:00, again
  s = S.contentSlide(deck, {
    section: "3 · Repeat", title: "Monday 9:00, again",
    subtitle: "Same questions, asked after the tick. Nobody re-ran the ingestion.",
    takeaway: "Edit, trash, wait. The copy followed the source by itself.",
    notes: `Time: 2 minutes. Back to slide 2: close the loop.
Say: "This is the slide from the start of the session, fixed. The Doc changed, so the answer changed. The notes were deleted, so their chunks were deleted, so the assistant can no longer quote them. Nobody typed anything."`,
  });
  s.text("BEFORE THE TICK", { x: 2.3, y: 1.55, w: 3.3, h: 0.3, size: 10.5, bold: true, color: C.redText, charSpacing: 0.5, name: "col-before" });
  s.text("AFTER THE TICK", { x: 5.95, y: 1.55, w: 3.4, h: 0.3, size: 10.5, bold: true, color: C.deep, charSpacing: 0.5, name: "col-after" });
  const qa = [["How many unused vacation days can I roll over?", "employee", "5 days.  [Leave Policy]", "10 days.  [Leave Policy]", false],
    ["How many backend developers are we hiring?", "finance-lead", "An answer quoted from the Q3 planning notes", "I don't have information about that.", true]];
  qa.forEach(([q, who, before, after, italic], i) => {
    const y = 1.95 + i * 1.5;
    s.text([[{ text: q, b: true, size: 12.5, color: C.dark }], [{ text: "asked as " + who, size: 10.5, color: C.gray, i: true }]],
      { x: 0.6, y, w: 1.55, h: 1.3, valign: "middle", paraSpace: 3, name: `qa-q-${i}` });
    bubble(s, { x: 2.3, y: y + 0.15, w: 3.3, h: 1.0, who: "ASSISTANT", text: before, tone: "bad", italic, name: `qa-b-${i}` });
    S.arrow(s, 5.63, y + 0.65, 5.92, y + 0.65, C.gray, 1.5);
    bubble(s, { x: 5.95, y: y + 0.15, w: 3.45, h: 1.0, who: "ASSISTANT", text: after, tone: "good", name: `qa-a-${i}` });
  });
  num(s);

  // ================================================================ WRAP (10 min)
  // ---------------------------------------------------------------- 26 three ideas
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Three ideas to take home",
    subtitle: "One per question. If these three stick, today worked.",
    notes: `Time: 3 minutes. Clock check: about 1:45.
Say each one in a single sentence, pointing at its card: how we read, how we notice, who runs it.
These three ideas carry over to any source and any vector store. The Google-specific details don't matter; these do.`,
  });
  const ideas = [["1", "A connector is a plug", "Every source answers the same three questions. Change the source: write one class, keep the pipeline.", I.plug],
    ["2", "Label, then text, then pay", "Check the free fingerprint first, the text second, and only embed text that really changed.", I.tagOne],
    ["3", "A job, not a button", "A timer runs the same plan and apply, reports what it did, and survives a bad run.", I.clockD]];
  ideas.forEach(([k, t, d, ic], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.3, fill: C.white, line: C.line, name: `idea-${i}` });
    s.ellipse({ x: x + 0.22, y: 1.82, w: 0.7, h: 0.7, fill: C.pale, name: `idea-dot-${i}` });
    s.image(ic, { x: x + 0.39, y: 1.99, w: 0.36, h: 0.36, name: `idea-icon-${i}` });
    s.text(k, { x: x + 2.1, y: 1.82, w: 0.55, h: 0.7, font: "Arial", size: 30, bold: true, color: C.line, align: "right", valign: "middle", name: `idea-n-${i}` });
    s.text(t, { x: x + 0.22, y: 2.72, w: 2.45, h: 0.75, font: "Arial", size: 16, bold: true, color: C.dark, name: `idea-t-${i}` });
    s.text(d, { x: x + 0.22, y: 3.5, w: 2.45, h: 1.25, size: 12.5, color: C.slate, name: `idea-d-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 27 honest limits
  s = S.contentSlide(deck, {
    section: "Wrap", title: "What this does not do yet",
    subtitle: "Say it before someone asks. Each one is a known gap with a known fix.",
    takeaway: "Production is a list of gaps you know about. The dangerous ones are the ones nobody wrote down.",
    notes: `Time: 2 minutes. Read the three, don't defend them.
If asked "is this production-ready?": the decisions are; the operations around them are the next three sessions.
More detail: in-place writes are safe against an embedding failure (we embed first, write last); a store failure between delete and insert loses one document until the next tick. The full-listing fix (Drive's changes.list, Graph's /delta) is in Reference and is tonight's stretch.`,
  });
  const gaps = [["Writes into the live index", "A tick changes the index people are reading from.", "Build next to it and switch (blue/green). sync.py --rebuild already does this."],
    ["One process, one timer", "Run two copies of the API and you get two timers.", "Run the tick in one worker, or as a queue job. Wednesday does this."],
    ["Lists every file, every tick", "Eight Drive calls a minute, even when nothing changed.", "Ask the source what changed since last time: Drive's changes.list."]];
  gaps.forEach(([t, what, fix], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.3, fill: C.white, line: C.line, name: `gap-${i}` });
    s.image(I.warn, { x: x + 0.22, y: 1.8, w: 0.38, h: 0.38, name: `gap-icon-${i}` });
    s.text(t, { x: x + 0.22, y: 2.3, w: 2.45, h: 0.7, font: "Arial", size: 14.5, bold: true, color: C.dark, name: `gap-t-${i}` });
    s.text(what, { x: x + 0.22, y: 3.0, w: 2.45, h: 0.65, size: 12, color: C.slate, name: `gap-what-${i}` });
    s.text([[{ text: "THE FIX", b: true, size: 9, color: C.deep, charSpacing: 0.5 }], [{ text: fix, size: 12, color: C.dark }]],
      { x: x + 0.22, y: 3.7, w: 2.45, h: 1.1, paraSpace: 2, name: `gap-fix-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 28 tonight
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Tonight",
    subtitle: "Everything runs offline: SOURCE=local, the local embedding model, fake_drive.py as the source. About an hour.",
    takeaway: "Each exercise ends in something you can see: a plan line, a counter, a green test.",
    notes: `Time: 2 minutes. From the checkpoint README.
Say: "Exercise 1 is today again, on your laptop, with a script playing Google Drive. Do it first; it's the one that makes the rest make sense. Exercise 2 is the real work. Exercise 3 is a test you should see fail first. 4 is for anyone who finishes early."
Hint for exercise 2: fingerprint the listing (sha256 of the sorted "path|etag" lines from list_items()), keep the last one in memory, compare before calling run_sync.`,
  });
  const ex = [["Replay today on a timer", "scheduler.py --interval 20 in one terminal; fake_drive.py apply 1 … apply 5 in another. Before each one, predict the action. Then check."],
    ["Make a quiet tick cheap", "The TODO in app/ingest/scheduler.py: if the listing's fingerprints are all the same as last tick, skip the sync. Watch skipped climb in GET /sync/status."],
    ["A test that fails first", "tests/test_connector_drive.py: a Google Form in the fake listing must be skipped. Red, then green."],
    ["Stretch: pause and resume", "POST /sync/pause, apply an event, POST /sync/resume. When does the plan show up?"]];
  ex.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.6 + row * 1.68, w: 4.3, h: 1.55, num: i + 1, title: t, titleSize: 13.5, body: d, bodySize: 11.5, name: `ex-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 29 Wednesday
  s = S.darkSlide(deck, { section: "Wrap", icon: I.usersG, kicker: "WEDNESDAY  ·  PART 2 OF 4", title1: "Who may", title2: "read what",
    subtitle: "Sign-in, a real database, and access that changes on the very next question",
    detail: "The salary bands were shared with every employee by mistake. On Wednesday an admin fixes it with one click, and nothing is re-embedded.",
    footer: "Wed 11 Nov",
    notes: `Say: "Today the copy stays true. Wednesday: the copy is true, but not everyone should see all of it. The salary bands are readable by every employee right now. That's a real bug, and we fix it live."
Remind them to pull the repo Wednesday morning (post it in the chat too).
Then read the chat one last time and answer what's there before you end the call.
Leave the Sync tab on screen with the timer counting down as they pack up.` });
  num(s, true);

  // ================================================================ REFERENCE (for the students' copy; not presented)
  s = S.darkSlide(deck, { section: "Reference", icon: I.book, kicker: "REFERENCE", title1: "For after class",
    subtitle: "Not presented. Read these with the code open.",
    detail: "Commands  ·  Drive and SharePoint side by side  ·  auth patterns  ·  the explain panel  ·  permissions  ·  delta feeds  ·  blue/green",
    notes: `Not presented. If someone asks a detail question in class, jump here.` });
  num(s, true);

  // ---------------------------------------------------------------- R commands
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the commands",
    subtitle: "Everything run today, in order. Scripts work from any folder; paths resolve from the repo root.",
    notes: `For the students' copy of the deck.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 8.8, h: 3.4, size: 10.5, lines: [
    { text: "# Google Drive (the instructor's laptop; docs/drive-setup.md)", color: C.mintText },
    `python ${CP}/drive_admin.py check                      # READY for class`,
    `python ${CP}/drive_admin.py tree`,
    `python ${CP}/sync.py --source drive     # dry run: add 18, quarantine 1, skip 1`,
    `python ${CP}/sync.py --source drive --apply`,
    `SYNC_INTERVAL_SECONDS=60 python run_checkpoint.py 01-source    # the API with the timer on`,
    `python ${CP}/drive_admin.py permissions hr/salary-bands-2026.md`,
    `python ${CP}/drive_admin.py token   /   changes <token>`,
    { text: "# Offline (everyone; SOURCE=local in .env)", color: C.mintText },
    `python ${CP}/fake_drive.py reset  &&  python ${CP}/sync.py --apply`,
    `python ${CP}/scheduler.py --interval 20               # a tick every 20 s, in a terminal`,
    `python ${CP}/fake_drive.py apply 2  /  apply 3  /  apply 5`,
    `pytest ${CP}/tests -q`] });
  num(s);

  // ---------------------------------------------------------------- R Drive vs SharePoint
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: Google Drive and SharePoint",
    subtitle: "Every call the connector makes, next to the Microsoft Graph call that does the same job.",
    takeaway: "docs/sharepoint-mapping.md has the full table and the sketch of a SharePointConnector.",
    notes: `Graph's delta returns a deleted item once more with a 'deleted' facet; Drive just stops listing it. Office files are real bytes we already parse; a Google Doc has to be exported. Both push mechanisms expire and need a public endpoint, which is why everybody still polls.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [2.1, 3.35, 3.35], rowH: 0.43, headH: 0.34, size: 10,
    header: ["", "Google Drive (this repo)", "SharePoint (Microsoft Graph)"],
    rows: [[{ text: "The job's identity", b: true, color: C.dark }, "service account + JSON key, scope drive.readonly", "app registration + secret, Sites.Read.All or Sites.Selected"],
      [{ text: "What exists", b: true, color: C.dark }, "files.list per folder; changes.list as the delta feed", "GET /drives/{id}/root/delta, then the deltaLink"],
      [{ text: "Change signal", b: true, color: C.dark }, "md5Checksum (uploads), version (native Docs)", "eTag (any change), cTag (content only)"],
      [{ text: "The bytes", b: true, color: C.dark }, "files.get alt=media; files.export for a Doc", "GET /items/{id}/content"],
      [{ text: "Who may read it", b: true, color: C.dark }, "permissions.list", "GET /items/{id}/permissions, groups via Entra ID"],
      [{ text: "A deleted file", b: true, color: C.dark }, "absent from the listing; 'removed' in changes", "returned once more with a deleted facet"],
      [{ text: "Push", b: true, color: C.dark }, "files.watch notifications (expire, public HTTPS)", "change subscriptions (expire, public HTTPS)"]] });
  num(s);

  // ---------------------------------------------------------------- R connectors and auth
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: connectors and auth",
    subtitle: "Most projects connect to 3 to 7 sources. The loader is the easy part; auth is where integrations fail.",
    takeaway: "A scheduled sync runs as a service account, never as a person.",
    notes: `PAT dies with its owner; OAuth acts as a person; service principal (Microsoft) and service account (Google) are the same idea; managed identity has no secret at all but is tied to one cloud.`,
  });
  const srcs = [["SharePoint", "service principal", I.folder], ["Confluence", "API token / OAuth", I.book], ["Google Drive", "service account  ← today", I.drive], ["Slack", "bot token + scopes", I.chat],
    ["Notion", "integration token", I.box], ["GitHub", "GitHub App", I.git], ["S3 / Blob", "managed identity", I.db], ["Email", "OAuth (M365)", I.mail]];
  srcs.forEach(([name, auth, ic], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 2.1, y = 1.6 + row * 0.82;
    const today = name === "Google Drive";
    s.rect({ x, y, w: 1.98, h: 0.7, fill: today ? C.pale : C.white, line: today ? C.deep : C.line, name: `src-${i}` });
    s.image(ic, { x: x + 0.12, y: y + 0.17, w: 0.34, h: 0.34, name: `src-icon-${i}` });
    s.text([[{ text: name, b: true, size: 12, color: C.dark, font: "Arial" }], [{ text: auth, size: 10, color: today ? C.deep : C.gray }]], { x: x + 0.55, y: y + 0.06, w: 1.4, h: 0.58, valign: "middle", name: `src-text-${i}` });
  });
  s.text([[{ text: "Rule: ", b: true, color: C.deep }, { text: "read-only, least privilege, secrets in a vault and rotated." }]],
    { x: 4.95, y: 4.4, w: 4.45, h: 0.36, size: 11, italic: true, color: C.slate, valign: "middle", name: "auth-rule" });
  S.table(s, { x: 4.95, y: 1.6, cols: [1.45, 1.5, 1.5], rowH: 0.6, headH: 0.34, size: 10,
    header: ["Pattern", "Use when", "Watch out"],
    rows: [[{ text: "API token / PAT", b: true, color: C.dark }, "Prototypes, one-off scripts", "Dies when its owner leaves"],
      [{ text: "OAuth 2.0", b: true, color: C.dark }, "Users grant their own access", "Refresh, revoke, scope drift"],
      [{ text: "Service account", b: true, color: C.dark }, "Scheduled jobs, server to server", "Easy to over-grant"],
      [{ text: "Managed identity", b: true, color: C.dark }, "Same-cloud sources", "Tied to one cloud"]] });
  num(s);

  // ---------------------------------------------------------------- R two fingerprints, one document
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: two fingerprints, one document",
    subtitle: "GET /sync/explain shows both, index versus source, with the diff behind each.",
    takeaway: "The label says the file moved. The hash says whether the text did. Only the second costs money.",
    notes: `Demo if there's time: the Sync tab's "See the difference" panel for HR-LEAVE, then the wiki page after a footer-only upload (touch), then any untouched document (hash not computed).`,
  });
  S.table(s, { x: 0.6, y: 1.6, cols: [2.3, 1.25, 1.25, 1.5, 2.5], rowH: 0.62, headH: 0.36, size: 10.5,
    header: ["Document", "label: index", "label: source", "content hash", "action"],
    rows: [[{ text: "HR-LEAVE (a Google Doc, edited)", b: true, color: C.dark }, { text: "v7", font: "Consolas" }, { text: "v8", font: "Consolas", color: C.amberDeep, b: true }, { text: "differs", color: C.amberDeep, b: true }, { text: "change: 4 chunks out, 4 in", color: C.deep, b: true }],
      [{ text: "ENG-WIKI-VECTOR-DB (footer re-uploaded)", b: true, color: C.dark }, { text: "3c9f…", font: "Consolas" }, { text: "8e21…", font: "Consolas", color: C.amberDeep, b: true }, { text: "same", color: C.deep }, { text: "touch: new label stored, 0 embedded", color: C.amberDeep, b: true }],
      [{ text: "HR-REMOTE (untouched)", b: true, color: C.dark }, { text: "51aa…", font: "Consolas" }, { text: "51aa…", font: "Consolas" }, { text: "not computed", color: C.gray, i: true }, { text: "unchanged: not downloaded", color: C.gray }]] });
  s.text([[{ text: "Where to look: ", b: true, color: C.dark }, { text: "the Sync tab's \"See the difference\" panel, or GET /sync/explain?doc_id=HR-LEAVE. Both only read the index." }]],
    { x: 0.6, y: 4.2, w: 8.8, h: 0.5, size: 11.5, color: C.slate, valign: "middle", name: "explain-where" });
  num(s);

  // ---------------------------------------------------------------- R who may read it
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: who may read it",
    subtitle: "Drive shows a file's sharing only to identities that could change it. Our sync is a Viewer.",
    takeaway: "Least privilege and permission-awareness pull against each other. Here the register stays the truth.",
    notes: `drive_admin.py permissions hr/salary-bands-2026.md returns 403: that refusal is the lesson. To mirror permissions, a production sync uses a second identity with a metadata-only scope (Google Workspace domain-wide delegation with drive.metadata.readonly; on Microsoft 365 an admin-consented app permission). Fallback: fallbacks/part1/permissions.txt.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 4.6, h: 2.6, label: "drive_admin.py permissions hr/salary-bands-2026.md", size: 10, lines: [
    { text: "  permissions.list", color: C.mintText },
    { text: "    -> 403 insufficientFilePermissions", color: C.codeText },
    { text: "", color: C.codeText },
    { text: "  what a Viewer sees:", color: C.mintText },
    { text: "    owner     hasan@…", color: C.codeText },
    { text: "    shared    True", color: C.codeText },
    { text: "    canShare  False", color: C.green },
    { text: "", color: C.codeText },
    { text: "  second identity: drive.metadata.readonly", color: C.green }] });
  S.card(s, { x: 5.45, y: 1.6, w: 3.95, h: 2.6, title: "shared/data/register.json", titleSize: 13, icon: I.users, iconInline: true,
    body: [{ runs: [{ text: '"doc_id": "HR-SALARY-BANDS-2026"', font: "Consolas", size: 10 }] }, { runs: [{ text: '"allowed_groups": ["hr", "managers"]', font: "Consolas", size: 10, color: C.deep, b: true }] },
      { runs: [{ text: '"status": "current", "version": 1', font: "Consolas", size: 10 }] }, { runs: "" },
      { runs: "On every chunk: acl_hr = true, acl_managers = true, acl_employees = false. The retriever filters on those flags inside the vector search." }], bodySize: 11, name: "reg-card" });
  s.text([[{ text: "In SharePoint: ", b: true, color: C.dark }, { text: "GET /items/{id}/permissions returns users, Entra ID groups and sharing links. Same shape, same mapping table." }]],
    { x: 0.6, y: 4.4, w: 8.8, h: 0.5, size: 11.5, color: C.slate, valign: "middle", name: "perm-sp" });
  num(s);

  // ---------------------------------------------------------------- R polling to a delta feed
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: from polling to a delta feed",
    subtitle: "Today's tick lists the whole folder. That is right for 20 files and wrong for 20,000. Both sources have the fix.",
    takeaway: "Tonight's stretch: changes.list with a saved token, so a tick with nothing to do costs one call.",
    notes: `Demo if time: drive_admin.py token, edit something, drive_admin.py changes <token>: one record for the Doc.`,
  });
  const stages = [["1  List everything", "today", ["files.list per folder: 8 calls a tick", "right up to a few thousand files", "no state to keep"], I.list, true],
    ["2  Ask what changed", "the lab", ["changes.getStartPageToken, then changes.list(token)", "Graph: /delta and the deltaLink", "save the token; a quiet tick is one call"], I.redo, false],
    ["3  Be told", "slides only", ["files.watch, Graph subscriptions", "public HTTPS, expiry, renewal", "notifications get lost: keep polling"], I.bell, false]];
  stages.forEach(([t, tag, items, ic, now], i) => {
    const x = 0.6 + i * 2.97;
    S.card(s, { x, y: 1.6, w: 2.85, h: 2.75, title: t, titleSize: 14, icon: ic, iconInline: true, border: now ? C.deep : undefined, fill: now ? C.pale : C.white,
      body: [{ runs: [{ text: tag, b: true, color: now ? C.deep : C.gray }] }, ...items.map(z => ({ runs: z, bullet: true }))], bodySize: 11, name: `stage-${i}` });
    if (i < 2) S.arrow(s, x + 2.87, 3.0, x + 2.95, 3.0, C.gray, 1.5);
  });
  S.code(s, { x: 0.6, y: 4.5, w: 8.8, h: 0.5, size: 10.5, lines: [
    { text: "drive_admin.py token   →   edit a file in Drive   →   drive_admin.py changes <token>", color: C.green }] });
  num(s);

  // ---------------------------------------------------------------- R blue/green
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: changing the model? Build next to it",
    subtitle: "Vectors from two models cannot share an index. The sync refuses, and tells you what to do.",
    takeaway: "A rebuild is a deploy: build, check, switch, keep the old one for rollback.",
    notes: `app/rag/catalog.py keeps a pointer to the live collection. sync.py --rebuild builds a new collection next to it, runs a smoke check, then flips the pointer. sync.py --rollback flips it back.`,
  });
  s.rect({ x: 0.6, y: 1.7, w: 1.5, h: 0.7, fill: C.dark, name: "bg-queries" });
  s.text("Queries", { x: 0.6, y: 1.7, w: 1.5, h: 0.7, font: "Arial", size: 13, bold: true, color: C.white, align: "center", valign: "middle", name: "bg-queries-t" });
  S.arrow(s, 2.15, 2.05, 2.75, 2.05, C.gray);
  s.rect({ x: 2.8, y: 1.6, w: 1.75, h: 0.9, fill: C.white, line: C.deep, lineWidth: 1.5, name: "bg-pointer" });
  s.text([[{ text: "acme_catalog.json", font: "Consolas", size: 10.5, b: true, color: C.deep }], [{ text: "active →", size: 11, color: C.slate }]], { x: 2.8, y: 1.6, w: 1.75, h: 0.9, align: "center", valign: "middle", name: "bg-pointer-t" });
  S.arrow(s, 4.6, 2.05, 5.2, 2.05, C.deep, 2);
  s.rect({ x: 5.25, y: 1.6, w: 1.9, h: 0.9, fill: C.greenSoft, line: C.deep, name: "bg-live" });
  s.text([[{ text: "acme_kb_A", font: "Consolas", size: 11, b: true, color: C.deep }], [{ text: "LIVE", size: 10, b: true, color: C.deep }]], { x: 5.25, y: 1.6, w: 1.9, h: 0.9, align: "center", valign: "middle", name: "bg-live-t" });
  s.rect({ x: 7.5, y: 1.6, w: 1.9, h: 0.9, fill: C.white, line: C.line, name: "bg-new" });
  s.text([[{ text: "acme_kb_B", font: "Consolas", size: 11, b: true, color: C.slate }], [{ text: "building", size: 10, color: C.gray }]], { x: 7.5, y: 1.6, w: 1.9, h: 0.9, align: "center", valign: "middle", name: "bg-new-t" });
  const bsteps = [["Build B next to A", "A full sync into a new collection; A keeps serving"],
    ["Smoke check B", "Not empty? Every planned document has chunks?"],
    ["Switch the pointer", "One write to the catalog: instant"],
    ["Keep A for rollback", "sync.py --rollback flips it back"]];
  const stepX = [0.6, 2.8, 5.25, 7.5];
  bsteps.forEach(([t, d], i) => {
    const x = stepX[i];
    s.ellipse({ x, y: 2.7, w: 0.36, h: 0.36, fill: C.deep, name: `bg-step-dot-${i}` });
    s.text(String(i + 1), { x, y: 2.7, w: 0.36, h: 0.36, font: "Arial", size: 11, bold: true, color: C.white, align: "center", valign: "middle", name: `bg-step-n-${i}` });
    s.text(t, { x: x + 0.45, y: 2.67, w: 1.7, h: 0.42, size: 12, bold: true, color: C.dark, valign: "middle", name: `bg-step-t-${i}` });
    s.text(d, { x, y: 3.12, w: 2.05, h: 0.45, size: 10.5, color: C.slate, name: `bg-step-d-${i}` });
  });
  S.code(s, { x: 0.6, y: 3.78, w: 8.8, h: 1.17, label: "python sync.py   (after changing EMBEDDING_PROVIDER)", size: 10, lines: [
    { text: "STOP: The live index was built with azure:text-embedding-3-small, but the embedder is", color: C.amber },
    { text: "now local:all-MiniLM-L6-v2. Vectors from two models cannot share an index.", color: C.amber },
    { text: "Run: python sync.py --rebuild", color: C.green }] });
  num(s);

  return deck;
}

module.exports = { build };

if (require.main === module) {
  (async () => {
    const deck = await build();
    const out = process.argv[2] || ".";
    deck.saveHtml(path.join(out, "p1-preview.html"));
    // The SE Factory theme is applied by the pptx skill's apply_theme.js when PPTX_SKILL points at it.
    await deck.savePptx(path.join(out, "p1.pptx"), process.env.PPTX_SKILL ? S.THEME : undefined);
    console.log(`slides: ${deck.slides.length}`);
  })().catch(e => { console.error(e); process.exit(1); });
}
