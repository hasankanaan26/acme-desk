// p2.js — Creating your production application, Part 2: who may read what (acme-desk, checkpoint 02-platform)
//
// Same teaching shape as p1.js (rewritten 8 Nov, online 9 Nov):
//   one story (the salary bands are readable by every employee; an admin fixes it live, nothing is
//   re-embedded), three questions (who is asking / what may they read / can we talk to it), a picture
//   before any code, at most ~12 lines of code on a slide, and a "what you should see" slide after
//   every live step, built from real screenshots and a real transcript (instructor-notes/fallbacks/part2/).
//   Online: no questions to the room, no quizzes, no polls; the chat is read at the dividers and the break.
//   The dense material (layer table, sign-in details, the worker, RRF, the SSE events) is in Reference.
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
    id: [fa.FaIdBadge, C.deep], cookie: [fa.FaCookieBite, C.deep], key: [fa.FaKey, C.deep], lock: [fa.FaLock, C.deep],
    db: [fa.FaDatabase, C.deep], building: [fa.FaBuilding, C.deep], chat: [fa.FaComments, C.deep], graph: [fa.FaProjectDiagram, C.deep],
    search: [fa.FaSearch, C.deep], brain: [fa.FaBrain, C.deep], font: [fa.FaFont, C.deep], stream: [fa.FaStream, C.deep],
    hist: [fa.FaHistory, C.deep], eyeSlash: [fa.FaEyeSlash, C.deep], yes: [fa.FaCheckCircle, C.deep], no: [fa.FaTimesCircle, C.redText],
    warn: [fa.FaExclamationTriangle, C.amber], server: [fa.FaServer, C.deep], user: [fa.FaUser, C.deep], shield: [fa.FaShieldAlt, C.deep],
    filter: [fa.FaFilter, C.deep], audit: [fa.FaClipboardList, C.deep], signin: [fa.FaSignInAlt, C.deep], file: [fa.FaFileAlt, C.deep],
    pen: [fa.FaPenFancy, C.redText], userRed: [fa.FaUserSecret, C.redText], robot: [fa.FaRobot, C.deep], sync: [fa.FaSyncAlt, C.deep],
    fingerprint: [fa.FaFingerprint, C.deep], userCog: [fa.FaUserCog, C.deep],
  };
  for (const [k, [comp, color]] of Object.entries(want)) I[k] = await S.icon(comp, color);

  // real screenshots, cropped to the part that matters
  const P = {
    before: await shot("03-intern-search-before", 456, 520, 1104, 395),
    after: await shot("05-intern-search-after", 456, 520, 1104, 395),
    followup: await shot("09-chat-followup", 786, 350, 1024, 580),
    hidden: await shot("14-chat-hidden", 786, 350, 1024, 420),
  };

  const deck = new Deck({ title: "Part 2: who may read what", author: "SE Factory", company: "SE Factory",
    subject: "Applied AI Engineering Workshop · Creating your production application · Part 2" });
  let n = 0;
  const num = (s, dark) => S.slideNumber(s, ++n, dark);

  // ================================================================ OPENING (10 min)
  // ---------------------------------------------------------------- 1 Title
  let s = S.darkSlide(deck, {
    section: "Opening", icon: I.users,
    kicker: "CREATING YOUR PRODUCTION APPLICATION  ·  PART 2 OF 4",
    title1: "Who may", title2: "read what",
    subtitle: "Sign-in, access the database enforces, and a chat that keeps the rules",
    detail: "The salary bands are readable by every employee. Today an admin fixes it with one click, and nothing is re-embedded.",
    footer: "Who  ·  What  ·  Talk",
    notes: `Time: 2 minutes. Clock check: 0:00.
Say: "Monday the copy of the documents learned to stay true by itself. Today: the copy is true, but not everyone should see all of it. Right now our engineering intern can read the salary bands. That's a real bug, and we fix it live, with one click, and nothing gets re-embedded."
Then: "Same shape as Monday. Three questions, a picture before any code, nothing typed live. If you're lost, write it in the chat. I read the chat at every section break."
Paste the six words into the chat (teaching guide, "Six words").
Before class: the reset in part2.md section 2 (db.py seed, fake_drive reset, apply 1 2 3 5, sync). The intern must still find the salary bands when you start.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 2 The problem in one picture
  s = S.contentSlide(deck, {
    section: "Opening", title: "The problem in one picture",
    subtitle: "Our intern asks a fair question and gets an answer nobody meant them to have.",
    takeaway: "Today: the server decides who you are, and the database decides what you may read.",
    notes: `Time: 3 minutes. The session's motivation. Don't rush it.
Say: "Our engineering intern asks what a Senior Developer earns. The assistant answers, with numbers, and cites the Engineering Salary Bands. Confident, cited, and none of their business."
Then the two cracks on the right, one sentence each: "One: HR shared the bands with every employee by mistake. That's a data bug, and somebody has to be able to fix it, fast. Two, and worse: in Part 1, the request said who you were. Type user=hr-partner in the URL and you were HR. Anyone could be anyone."
Then: "Today fixes both. Who you are comes from a sign-in, never from the request. What you may read is checked by the database, on every question, and an admin can change it with one click."`,
  });
  bubble(s, { x: 0.6, y: 1.6, w: 4.3, h: 0.85, who: "ENGINEERING INTERN", text: "What is the salary range for a Senior Developer?", tone: "ask", name: "q" });
  bubble(s, { x: 0.6, y: 2.6, w: 4.3, h: 1.0, who: "ASSISTANT", text: "$120,000 to $155,000 a year.  [Engineering Salary Bands (2026)]", tone: "bad", name: "a" });
  s.text([[{ text: "Confident, cited, and none of their business.", b: true, color: C.redText }], [{ text: "Nothing in the pipeline is broken. The question is who it answers for.", color: C.slate }]],
    { x: 0.6, y: 3.75, w: 4.3, h: 0.9, size: 12, paraSpace: 4, name: "a-why" });
  const cracks = [["The register says employees", "HR shared the bands with every employee by mistake. Somebody must be able to fix that in seconds.", I.file, '"allowed_groups": ["employees"]'],
    ["The request says who you are", "Part 1 believed the URL. Anyone could be anyone.", I.userRed, "GET /search?q=salary&user=hr-partner"]];
  cracks.forEach(([t, d, ic, code], i) => {
    const y = 1.6 + i * 1.62;
    s.rect({ x: 5.2, y, w: 4.2, h: 1.48, fill: C.white, line: C.line, name: `crack-${i}` });
    s.rect({ x: 5.2, y, w: 0.07, h: 1.48, fill: C.red, name: `crack-edge-${i}` });
    s.image(ic, { x: 5.42, y: y + 0.14, w: 0.32, h: 0.32, name: `crack-icon-${i}` });
    s.text(t, { x: 5.85, y: y + 0.1, w: 3.45, h: 0.4, font: "Arial", size: 13.5, bold: true, color: C.dark, valign: "middle", name: `crack-t-${i}` });
    s.text(d, { x: 5.42, y: y + 0.52, w: 3.85, h: 0.5, size: 11, color: C.slate, name: `crack-d-${i}` });
    pill(s, { x: 5.42, y: y + 1.06, w: 3.8, h: 0.3, text: code, fill: C.redSoft, color: C.redText, size: 10, name: `crack-code-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 3 Monday's state, in one place
  s = S.contentSlide(deck, {
    section: "Opening", title: "Monday's app kept its state in four places",
    subtitle: "Two JSON files, a ChromaDB folder and the API's memory. Today all of it moves into one database.",
    takeaway: "One place to keep it means one place to protect it. The files themselves stay in Drive.",
    notes: `Time: 2 minutes. A recap with one new idea: why Postgres.
Point at the four boxes on the left: "Who is who was a JSON file. Who may read what was another JSON file. The chunks were a ChromaDB folder. The timer lived in the API's memory. Four places, and you can't put a lock on a JSON file that says 'only HR may change this line'."
Then the right: "Today everything except the documents moves into Postgres, with pgvector for the vectors. Not because Postgres is fashionable: because one database can enforce rules in one place. Sign-in, access, companies, and later the chat's memory."
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

  // ---------------------------------------------------------------- 4 The arc
  s = S.contentSlide(deck, {
    section: "Opening", title: "One app, four sessions",
    subtitle: "Acme Desk, a helpdesk assistant over Acme's documents. Each session adds one layer.",
    takeaway: "Every checkpoint runs offline on your laptop: local folder, local embeddings, Postgres in Docker.",
    notes: `Time: 1 minute. Point at today's card and move on.
Say: "Monday the documents and the sync. Today sign-in, who may read what, and a chat. Friday it starts doing things, with real security controls. Next Monday we make it safe to ship."
New since Monday for their laptops: Docker for Postgres (docker compose up -d db). Say it once; the README has the three commands.`,
  });
  const parts = [["1", "The source", "Mon 9 Nov", ["read a real Google Drive folder", "notice edits and deletions", "re-sync on a timer"], false],
    ["2", "The platform", "today", ["sign-in and sessions", "who may read what, live", "a chat that keeps the rules"], true],
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
    notes: `Time: 2 minutes. The map. Come back to it at each divider ("we're on question 2").
Say: "Who is asking: how the server knows it's you, and why it never believes the request. What may they read: how the database checks access inside the search, live, and keeps companies apart. Can we talk to it: a chat that remembers, and keeps all of those rules on every turn, including its own memory."
Timing, for you: Q1 ends at 0:35, break at 1:05, Q3 ends at 1:45, wrap by 1:55. Behind by more than 10 minutes at the break: cut slide 26 (streaming is just text) and show slide 23 (the graph's code) for one minute only.`,
  });
  const qs = [["1", "Who is asking?", "Sign in once. A cookie, a session, and the server works out the rest.", "?user=hr-partner, ignored", "25 min"],
    ["2", "What may they read?", "Access is a JOIN inside the search. The database keeps companies apart.", "The fix, live. Nothing re-embedded", "30 min"],
    ["3", "Can we talk to it?", "A chat that remembers, with the same rules on every turn.", "An answer that disappears", "30 min"]];
  qs.forEach(([k, q, idea, demo, mins], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.3, fill: C.white, line: C.line, name: `q-${i}` });
    dot(s, x + 0.2, 1.78, k, C.deep, 0.5);
    pill(s, { x: x + 1.85, y: 1.87, w: 0.8, h: 0.3, text: mins, font: "Calibri", size: 10, fill: C.soft, color: C.gray, name: `q-time-${i}` });
    s.text(q, { x: x + 0.2, y: 2.4, w: 2.45, h: 0.8, font: "Arial", size: 15.5, bold: true, color: C.dark, valign: "top", name: `q-q-${i}` });
    s.text([[{ text: "THE IDEA", b: true, size: 9, color: C.deep, charSpacing: 0.5 }], [{ text: idea, size: 11.5, color: C.slate }]],
      { x: x + 0.2, y: 3.1, w: 2.45, h: 0.95, paraSpace: 2, name: `q-idea-${i}` });
    s.text([[{ text: "YOU WILL SEE", b: true, size: 9, color: C.deep, charSpacing: 0.5 }], [{ text: demo, size: 11.5, color: C.slate }]],
      { x: x + 0.2, y: 4.15, w: 2.45, h: 0.65, paraSpace: 2, name: `q-demo-${i}` });
  });
  num(s);

  // ================================================================ Q1 WHO (25 min)
  // ---------------------------------------------------------------- 6 divider
  s = S.darkSlide(deck, { section: "1 · Who", icon: I.idG, kicker: "QUESTION 1 OF 3  ·  25 MINUTES", title1: "Who is", title2: "asking?",
    subtitle: "Until today the request said who you were. From today the server decides.",
    footer: "sign-in  ·  session  ·  Principal",
    notes: `Time: 30 seconds. Clock check: about 0:10.
Say: "First question. Before we can decide what someone may read, we have to know who they are. And 'they told us' is not an answer."` });
  num(s, true);

  // ---------------------------------------------------------------- 7 anyone can be anyone
  s = S.contentSlide(deck, {
    section: "1 · Who", title: "A badge you write yourself",
    subtitle: "Part 1 took your name from the request. Today the same request gets you nothing extra.",
    takeaway: "Never take an identity, a company or a group from the request. The server works them out.",
    notes: `Time: 4 minutes. No code yet, just the idea.
Picture: "Part 1 was a conference where you write your own name badge. You write 'HR' and the doors open. Today the badge is printed at the door, after you prove who you are, and nobody can write on it."
Left: "This is Part 1's request. The app read user=hr-partner, looked up HR's groups in a JSON file, and searched with them."
Right: "Same request today. The app ignores the parameter: it already knows you're the intern, from your sign-in, and it searches with the intern's groups."
Then: "This one rule takes care of a whole class of bugs. Not just user=: a tenant id in the body, a list of groups in a header. If the request can say it, the request can lie about it."`,
  });
  const sideBox = (x, title, sub, good, lines, nm) => {
    s.rect({ x, y: 1.6, w: 4.3, h: 3.3, fill: C.white, line: good ? C.deep : C.line, name: nm });
    s.rect({ x, y: 1.6, w: 4.3, h: 0.5, fill: good ? C.pale : C.redSoft, name: `${nm}-head` });
    s.image(good ? I.yes : I.no, { x: x + 0.15, y: 1.71, w: 0.28, h: 0.28, name: `${nm}-icon` });
    s.text([[{ text: title, b: true, color: good ? C.deep : C.redText }, { text: "   " + sub, color: C.gray }]], { x: x + 0.5, y: 1.6, w: 3.7, h: 0.5, size: 12.5, valign: "middle", name: `${nm}-title` });
    S.code(s, { x: x + 0.15, y: 2.25, w: 4.0, h: 1.55, size: 10.5, name: `${nm}-code`, lines });
  };
  sideBox(0.6, "Part 1", "the request says", false, [
    { text: "GET /search?q=salary&user=hr-partner", color: C.mintText },
    { text: "", color: C.codeText },
    { text: "  user   = request.user      # hr-partner", color: C.amber },
    { text: "  groups = identities[user]  # hr, managers", color: C.codeText },
    { text: "  -> the salary bands", color: C.amber }], "p1");
  sideBox(5.1, "Part 2", "the server says", true, [
    { text: "GET /search?q=salary&user=hr-partner", color: C.mintText },
    { text: "Cookie: acme_session=<random>", color: C.mintText },
    { text: "  user   = intern@acme.test  # the session", color: C.green },
    { text: "  groups = employees, engineering", color: C.codeText },
    { text: "  ?user= is not even a parameter", color: C.green }], "p2");
  s.text("Anyone could claim to be HR. The salary bands were one URL away.", { x: 0.75, y: 3.95, w: 4.0, h: 0.8, size: 12, italic: true, color: C.slate, name: "p1-note" });
  s.text("You proved who you are once, at sign-in. Everything else is looked up on the server.", { x: 5.25, y: 3.95, w: 4.0, h: 0.8, size: 12, italic: true, color: C.slate, name: "p2-note" });
  num(s);

  // ---------------------------------------------------------------- 8 sign in once, then a cookie
  s = S.contentSlide(deck, {
    section: "1 · Who", title: "Sign in once, then a cookie",
    subtitle: "The password is checked once. After that, a random token in a cookie stands for you.",
    takeaway: "The database keeps a hash of the token, not the token: a stolen sessions table opens no doors.",
    notes: `Time: 6 minutes. Walk the four boxes left to right, then the three flags.
1) "You type an email and a password. That's the only time the password travels."
2) "The server compares it with a hash, argon2id. A hash you can check but can't reverse, and slow on purpose: about a tenth of a second per guess, which is nothing for you and a lot for someone trying a million."
3) "If it matches, the server makes a random token, sends it to the browser in a cookie, and stores only the token's SHA-256. If someone steals the sessions table, they have hashes, not keys."
4) "Every request after that sends the cookie. The server hashes it, finds the session, and knows it's you."
The flags, one sentence each: "HttpOnly: JavaScript on the page can't read it, so a script injected into the page can't steal it. SameSite=Lax: another website can't make your browser send it with a form post. And it expires: idle after 8 hours, at most a week."
Last line: "Wrong password and unknown email get the same message, so the login page never tells an attacker which emails exist. After 5 failures, 15 minutes' wait."
Skip the details in Reference (CSRF header) unless asked in the chat.`,
  });
  const flow = [["1", "Email + password", "POST /auth/login, once", I.signin], ["2", "Check the hash", "argon2id: slow on purpose", I.fingerprint],
    ["3", "Make a session", "random token in a cookie; the DB keeps its hash", I.cookie], ["4", "Every request", "cookie → session → you", I.id]];
  flow.forEach(([k, t, d, ic], i) => {
    const x = 0.6 + i * 2.22;
    s.rect({ x, y: 1.6, w: 2.0, h: 1.75, fill: C.white, line: C.line, name: `flow-${i}` });
    dot(s, x + 0.15, 1.75, k);
    s.image(ic, { x: x + 1.47, y: 1.75, w: 0.36, h: 0.36, name: `flow-icon-${i}` });
    s.text([[{ text: t, b: true, size: 13, color: C.dark, font: "Arial" }], [{ text: d, size: 11, color: C.slate }]],
      { x: x + 0.15, y: 2.25, w: 1.75, h: 1.0, paraSpace: 3, name: `flow-t-${i}` });
    if (i < 3) S.arrow(s, x + 2.02, 2.47, x + 2.2, 2.47, C.gray, 1.5);
  });
  const flags = [["HttpOnly", "page scripts can't read the cookie"], ["SameSite=Lax", "other sites can't send it with a form"], ["Expires", "8 h idle, 7 days at most"]];
  flags.forEach(([f, d], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 3.55, w: 2.85, h: 0.75, fill: C.pale, name: `flag-${i}` });
    s.text([[{ text: f, b: true, font: "Consolas", color: C.deep, size: 12 }], [{ text: d, size: 11, color: C.slate }]],
      { x: x + 0.15, y: 3.55, w: 2.6, h: 0.75, valign: "middle", paraSpace: 1, name: `flag-t-${i}` });
  });
  s.text([[{ text: "One message for every failure: ", b: true, color: C.dark }, { text: "\"Email or password is wrong.\" The page never says which emails exist. Five failures: wait 15 minutes." }]],
    { x: 0.6, y: 4.45, w: 8.8, h: 0.5, size: 11.5, color: C.slate, valign: "middle", name: "one-message" });
  num(s);

  // ---------------------------------------------------------------- 9 the Principal
  s = S.contentSlide(deck, {
    section: "1 · Who", title: "The Principal: worked out by the server",
    subtitle: "Every route gets one. None of it comes from the request, and it's re-read on every request.",
    takeaway: "Take someone out of hr, and their very next question is answered without hr's documents.",
    notes: `Time: 5 minutes. CODE MOMENT 1 of 3 (deps.py). Nothing typed.
Picture first: the chain along the top. "From the cookie, the server walks five tables: the session, the person, their company, their role, their groups. The result is one object we call the Principal: who is asking."
Then the code: "This is the whole guard. Cookie in, Principal out, or a 401. Every route that needs a person says principal = Depends(get_principal), and gets this object. A route never reads a user, a tenant or a group from the request."
Open the real file, zoomed in: ${CP}/app/auth/deps.py, Ctrl+G 35 (get_principal). Then ${CP}/app/auth/service.py line 158 (principal_for): point at the comment "Re-read on EVERY request". Close both.
Why re-read every time: "It costs one small query. In exchange, an admin's change is live on the next request. No 'log out and back in', no stale token that still says hr."`,
  });
  const chain = ["cookie", "session", "user", "tenant", "role", "groups"];
  chain.forEach((t, i) => {
    const x = 0.6 + i * 1.5;
    s.rect({ x, y: 1.6, w: 1.25, h: 0.55, fill: i === 0 ? C.soft : C.dark, line: i === 0 ? C.line : C.dark, name: `chain-${i}` });
    s.text(t, { x, y: 1.6, w: 1.25, h: 0.55, font: "Consolas", size: 12, bold: true, color: i === 0 ? C.slate : C.white, align: "center", valign: "middle", name: `chain-t-${i}` });
    if (i < 5) S.arrow(s, x + 1.27, 1.875, x + 1.48, 1.875, C.gray, 1.5);
  });
  S.code(s, { x: 0.6, y: 2.4, w: 5.3, h: 2.55, label: "app/auth/deps.py  ·  line 35  ·  simplified", size: 11, lines: [
    "def get_principal(request):",
    "    token = request.cookies.get(\"acme_session\")",
    "    principal = principal_for(token)   # 5 tables, 1 query",
    "    if principal is None:",
    "        raise HTTPException(401, \"Sign in first.\")",
    "    return principal",
    "",
    "@router.get(\"/search\")",
    "def search(q, principal = Depends(get_principal)):",
    "    ...  principal.group_ids   # never the request's"] });
  S.card(s, { x: 6.1, y: 2.4, w: 3.3, h: 2.55, title: "The intern's Principal", titleSize: 13, icon: I.id, iconInline: true,
    body: [{ runs: [{ text: "email   ", color: C.gray, font: "Consolas", size: 10.5 }, { text: "intern@acme.test", font: "Consolas", size: 10.5 }] },
      { runs: [{ text: "tenant  ", color: C.gray, font: "Consolas", size: 10.5 }, { text: "Acme Corp", font: "Consolas", size: 10.5 }] },
      { runs: [{ text: "role    ", color: C.gray, font: "Consolas", size: 10.5 }, { text: "member", font: "Consolas", size: 10.5 }] },
      { runs: [{ text: "groups  ", color: C.gray, font: "Consolas", size: 10.5 }, { text: "employees, engineering", font: "Consolas", size: 10.5, b: true, color: C.deep }] },
      { runs: "" },
      { runs: "Built on the server, for this request only, then thrown away." }], bodySize: 11, name: "principal" });
  num(s);

  // ---------------------------------------------------------------- 10 LIVE 1
  s = S.liveSlide(deck, {
    section: "1 · Who", icon: I.laptop, kicker: "LIVE  ·  WHO DOES THE SERVER THINK I AM?",
    title1: "Sign in,", title2: "then try to be someone else",
    steps: ["Sign in as the intern. My account: who the server thinks you are",
      "Ask for HR's view in the URL: ?user=hr-partner. Nothing changes",
      "A wrong password, then an email that doesn't exist: the same message"],
    command: "/login   ·   /ui#account   ·   /search?q=salary+range+senior+developer&user=hr-partner",
    notes: `Time: 7 minutes. Nothing typed but URLs and a password.
1) http://localhost:8000/login, intern@acme.test and the class password. Open My account. Say: "This is the Principal, drawn on a page: the server's answer to 'who are you'. The page can't even read the cookie: it's HttpOnly."
2) In the address bar: http://localhost:8000/search?q=salary+range+senior+developer&user=hr-partner. The JSON says user intern@acme.test, groups employees, engineering. Say: "The parameter is simply ignored. There's no such thing as asking as someone else any more."
   Notice the results DO include the salary bands: "and that's question 2's bug: the intern is who they say they are, and they still shouldn't see this."
3) Sign out (My account), then intern@acme.test with a wrong password: "Email or password is wrong." Then nobody@acme.test: the same message.
Optional, if on time: in a terminal, docker compose exec db psql -U postgres acme -c "select encode(token_hash,'hex'), user_id from sessions limit 2". Say: "A hash. The real token is only in my browser."
DEMO RULE: anything errors, say "this is what it does", go to the next slide, keep teaching. Fix at the break.
Fallback: instructor-notes/fallbacks/part2/demo-transcript.txt, section Q1; screenshots 01 and 02.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 11 what you should see
  s = S.contentSlide(deck, {
    section: "1 · Who", title: "What you should see",
    subtitle: "The request can't change who you are. Failures all look alike. No cookie, no answer.",
    takeaway: "We know who is asking. Notice the intern still finds the salary bands: that's question 2.",
    notes: `Time: 3 minutes. The demo's safety net: if the live run failed, teach from here.
Read the transcript top to bottom: "Two wrong sign-ins, one message. The cookie, with its flags. The user parameter, ignored. No cookie at all: 401, sign in first."
Then the chips at the right: "This is the top of every page: who the server thinks you are. Your groups decide what you can read."
Bridge: "And with those groups, the intern still finds the salary bands. Identity was the first half. Now: what may they read?"
Read the chat now; this is the end of block 1.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 5.6, h: 3.3, label: "THE REQUESTS  (from the rehearsal transcript)", size: 10.5, lines: [
    { text: "POST /auth/login  intern, wrong password", color: C.mintText },
    { text: "  401  Email or password is wrong.", color: C.amber },
    { text: "POST /auth/login  nobody@acme.test", color: C.mintText },
    { text: "  401  Email or password is wrong.", color: C.amber },
    { text: "POST /auth/login  intern, right password", color: C.mintText },
    { text: "  200  Set-Cookie: acme_session=…; HttpOnly; SameSite=lax", color: C.green },
    { text: "GET /search?q=salary…&user=hr-partner", color: C.mintText },
    { text: "  user: intern@acme.test   groups: employees, engineering", color: C.green },
    { text: "GET /search  (no cookie)", color: C.mintText },
    { text: "  401  Sign in first.", color: C.amber }] });
  s.text("WHO THE SERVER THINKS YOU ARE", { x: 6.45, y: 1.6, w: 2.95, h: 0.28, size: 9, bold: true, color: C.deep, charSpacing: 0.5, name: "chips-label" });
  [["Engineering intern · intern@acme.test", C.white, C.deep], ["Role  member", C.soft, C.slate], ["Groups  employees, engineering", C.soft, C.slate]].forEach(([t, fill, color], i) => {
    s.roundRect({ x: 6.45, y: 1.95 + i * 0.4, w: 2.95, h: 0.32, fill, line: i === 0 ? C.deep : C.line, radius: 0.14, name: `who-chip-${i}` });
    s.text(t, { x: 6.5, y: 1.95 + i * 0.4, w: 2.85, h: 0.32, size: 10.5, bold: i === 0, color, align: "center", valign: "middle", name: `who-chip-t-${i}` });
  });
  s.text([[{ text: "One message for both failures, ", b: true, color: C.dark }, { text: "so the page never confirms that an email exists." }]],
    { x: 6.45, y: 3.25, w: 2.95, h: 0.75, size: 11.5, color: C.slate, name: "same-msg" });
  bubble(s, { x: 6.45, y: 4.05, w: 2.95, h: 0.85, who: "STILL TRUE", text: "The intern still finds the salary bands.", tone: "bad", size: 12, name: "still" });
  num(s);

  // ================================================================ Q2 WHAT (30 min)
  // ---------------------------------------------------------------- 12 divider
  s = S.darkSlide(deck, { section: "2 · What", icon: I.lockG, kicker: "QUESTION 2 OF 3  ·  30 MINUTES", title1: "What may", title2: "they read?",
    subtitle: "Access is checked inside the search, on every question, by the database.",
    footer: "the JOIN  ·  the walls  ·  the keys",
    notes: `Time: 30 seconds. Clock check: about 0:35.
Say: "We know who's asking. Now the important part: what they may read, and who enforces it. This is the hardest part of today; I'll go slowly."` });
  num(s, true);

  // ---------------------------------------------------------------- 13 two shortcuts that fail
  s = S.contentSlide(deck, {
    section: "2 · What", title: "Two shortcuts that fail, and the one that works",
    subtitle: "Where you check access decides whether forbidden text ever leaves the database.",
    takeaway: "A prompt is not access control. If the text reaches the model, it can reach the user.",
    notes: `Time: 5 minutes. A worked example, no code.
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

  // ---------------------------------------------------------------- 14 access is a JOIN
  s = S.contentSlide(deck, {
    section: "2 · What", title: "Access is a JOIN, inside the search",
    subtitle: "Part 1 copied who-may-read onto every chunk. Part 2 asks a small table, at the moment of the question.",
    takeaway: "Change one row in document_acl and the next question obeys it. Nothing is re-embedded.",
    notes: `Time: 6 minutes. CODE MOMENT 2 of 3 (store_pg.py). The key slide of the day. Slow down.
Left: "In Part 1 the chunk carried flags: acl_employees true, acl_hr true. To change who may read the bands, you had to re-label every chunk of it: a sync. Fine once a day, wrong when HR says 'fix it now'."
Middle: "Today the chunk carries nothing about access. A separate table, document_acl, says which groups may read which document. One row per pair."
Then the SQL: "This is the search. The ORDER BY is the vector search you know. The new part is the EXISTS: keep a chunk only if its document has an access row for one of my groups. It runs inside the same query, so it's live: change a row, and the very next query sees it."
Open the real file, zoomed in: ${CP}/app/rag/store_pg.py, Ctrl+G 134 (search), scroll to line 152, the EXISTS. Point at the comment above the function: forbidden chunks never compete for the top-k slots. Close it.
If asked "isn't that slow?": the vector index walks the graph and the filter runs on each candidate; pgvector 0.8's iterative scan keeps going until 5 rows pass (comment in the file).`,
  });
  S.card(s, { x: 0.6, y: 1.6, w: 2.6, h: 1.55, title: "Part 1: a flag per chunk", titleSize: 12, edge: C.red,
    body: [{ runs: [{ text: "acl_employees = true", font: "Consolas", size: 10.5 }] }, { runs: [{ text: "acl_hr = true", font: "Consolas", size: 10.5 }] }, { runs: "Change access: re-label every chunk. A sync." }], bodySize: 11, name: "p1-acl" });
  S.card(s, { x: 0.6, y: 3.3, w: 2.6, h: 1.65, title: "Part 2: one small table", titleSize: 12, edge: C.deep,
    body: [{ runs: [{ text: "document_acl", font: "Consolas", size: 10.5, b: true, color: C.deep }] }, { runs: [{ text: "SALARY-BANDS  hr", font: "Consolas", size: 10.5 }] }, { runs: [{ text: "SALARY-BANDS  managers", font: "Consolas", size: 10.5 }] }, { runs: "Change access: change a row." }], bodySize: 11, name: "p2-acl" });
  S.code(s, { x: 3.4, y: 1.6, w: 6.0, h: 3.35, label: "app/rag/store_pg.py  ·  search()  ·  line 134", size: 11, lines: [
    "SELECT c.id, c.text, c.metadata",
    "FROM chunks c",
    "WHERE c.index_name = :live_index",
    "  AND c.status = 'current'",
    { text: "  AND EXISTS (SELECT 1 FROM document_acl a", color: C.green, b: true },
    { text: "              WHERE a.doc_id = c.doc_id", color: C.green, b: true },
    { text: "                AND a.group_id = ANY(:my_groups))", color: C.green, b: true },
    "ORDER BY c.embedding <=> :question_vector",
    "LIMIT 5",
    "",
    "# :my_groups comes from the Principal, never the request"] });
  num(s);

  // ---------------------------------------------------------------- 15 walls between companies
  s = S.contentSlide(deck, {
    section: "2 · What", title: "Walls between companies",
    subtitle: "Acme and Globex share one database. Row-Level Security makes the database add the company to every query.",
    takeaway: "Forget a WHERE clause in Python and the database still returns nothing from another company.",
    notes: `Time: 5 minutes. Row-Level Security in plain words.
Picture: "One chunks table, rows from two companies. The app could add WHERE tenant_id = acme to every query. And one day somebody forgets, in one query, and Acme's intern reads Globex's roadmap."
"So we make the database do it. Every transaction starts by saying which company it acts for: that's the SET LOCAL line, done for you by db.tx(). Then a policy on every table: you only see rows where tenant_id equals that setting."
"Two consequences. Forget the WHERE clause: still only Acme's rows. Forget to say which company at all: no rows. It fails closed."
Show: ${CP}/app/db/migrations/002_security.sql line 46 (the policy loop). Don't open anything else.
The tests prove it with a second company, Globex, and alice@globex.test (tests/test_access.py).`,
  });
  s.rect({ x: 0.6, y: 1.6, w: 4.2, h: 3.3, fill: C.white, line: C.line, name: "rls-table" });
  s.text([[{ text: "chunks", b: true, font: "Consolas", color: C.dark, size: 12 }, { text: "   one table, two companies", color: C.gray, size: 11 }]], { x: 0.75, y: 1.65, w: 3.9, h: 0.4, valign: "middle", name: "rls-table-t" });
  const rows = [["acme", "Leave Policy · Annual Leave", true], ["globex", "Secret Roadmap · Project Falcon", false], ["acme", "Expense Policy · Team Events", true], ["globex", "Globex Leave Policy", false], ["acme", "Salary Bands · Overview", true]];
  rows.forEach(([t, d, mine], i) => {
    const y = 2.1 + i * 0.52;
    s.rect({ x: 0.75, y, w: 3.9, h: 0.44, fill: mine ? C.greenSoft : C.soft, line: mine ? C.deep : C.line, name: `rls-row-${i}` });
    s.text([[{ text: t.padEnd(8), font: "Consolas", b: true, color: mine ? C.deep : C.gray, size: 10.5 }, { text: d, color: mine ? C.dark : C.gray, size: 11 }]],
      { x: 0.85, y, w: 3.7, h: 0.44, valign: "middle", name: `rls-row-t-${i}` });
    if (!mine) s.image(I.eyeSlash, { x: 4.3, y: y + 0.1, w: 0.24, h: 0.24, name: `rls-hidden-${i}` });
  });
  S.code(s, { x: 5.0, y: 1.6, w: 4.4, h: 2.15, label: "EVERY TRANSACTION, THEN EVERY TABLE", size: 10.5, lines: [
    "with db.tx(\"app\", tenant_id=acme):   # Python",
    "  # SET LOCAL app.tenant_id = 'acme…'",
    "",
    "CREATE POLICY tenant_isolation",
    "  ON chunks USING",
    { text: "  (tenant_id = app_tenant());", color: C.green, b: true }] });
  const rules = [["Forget the WHERE clause", "still only Acme's rows"], ["Forget to name the company", "no rows at all: fail closed"]];
  rules.forEach(([t, d], i) => {
    const y = 3.9 + i * 0.52;
    s.rect({ x: 5.0, y, w: 4.4, h: 0.45, fill: C.pale, name: `rule-${i}` });
    s.text([[{ text: t + ":  ", b: true, color: C.dark }, { text: d, color: C.deep }]], { x: 5.15, y, w: 4.2, h: 0.45, size: 11.5, valign: "middle", name: `rule-t-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 16 three keys, three doors
  s = S.contentSlide(deck, {
    section: "2 · What", title: "Three keys, three doors",
    subtitle: "The API and the sync no longer share a key. Each process connects as its own database role.",
    takeaway: "A bug in a web route can't corrupt the index. A bug in the sync can't leak a password hash.",
    notes: `Time: 4 minutes. Least privilege, applied to the database.
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

  // ---------------------------------------------------------------- 17 LIVE 2
  s = S.liveSlide(deck, {
    section: "2 · What", icon: I.laptop, kicker: "LIVE  ·  THE FIX, WITH ONE CLICK",
    title1: "Untick one box,", title2: "ask again",
    steps: ["Intern: search \"salary range senior developer\". The bands: Friday's mis-share",
      "Admin (second browser): Document access, Salary Bands, untick employees, tick hr and managers, Save",
      "Intern: the same search. No bands. Nothing synced, nothing re-embedded",
      "Admin: give the intern hr, then take it away. Then the Audit log"],
    command: "two browsers: intern in a normal window, admin@acme.test in a private one",
    notes: `Time: 9 minutes. The best moment of the day. Don't rush it.
Before: two browser windows side by side, intern left (normal window), admin right (private window, so the cookies don't mix). Both on http://localhost:8000.
1) Intern, Search tab: "salary range senior developer". Say: "Three of the five results are the salary bands. That's the bug."
2) Admin, Document access, the row "Engineering Salary Bands (2026)": untick employees, tick hr and managers, Save. Read the green banner: "live now".
3) Intern: press Search again. No bands. Say: "Nobody ran a sync. Nobody re-embedded anything. The worker didn't wake up. One row changed in document_acl, and the next query obeyed it."
4) Admin, People, the intern: tick hr, Save (the banner says "Live on their next question"). Intern: search again, the bands are back. Admin: untick hr, Save. Intern: gone. Say: "Same session, nobody signed out. Groups are re-read on every request: that's the Principal from slide 9."
5) Admin, Audit log: both changes, with before and after, and every search with which documents came back. Say: "Who gave the intern access to the salary bands, and when? Now there's an answer."
Plan B if a browser misbehaves: the same with curl is in part2.md section 5. Fallback: screenshots 03 to 08 and demo-transcript.txt, section Q2.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 18 what you should see
  s = S.contentSlide(deck, {
    section: "2 · What", title: "What you should see",
    subtitle: "The same search, a second apart. The only thing that changed is one row in document_acl.",
    takeaway: "Live, audited, and nothing re-embedded. That's what \"access is a JOIN\" buys.",
    notes: `Time: 3 minutes. The safety net for the live demo.
Point at the left picture: "Before: three of five results are salary bands." The right: "After the admin's click: none. The intern's other results move up."
Then the audit rows: "Every change with before and after, and every search with the document ids it returned. Not the text: the ids. An audit log that leaks salaries would be its own bug."
Read the chat now: end of block 2. Then the break.`,
  });
  s.text([[{ text: "BEFORE  ", b: true, color: C.redText, size: 10 }, { text: "the intern, Friday's mis-share", color: C.gray, size: 10.5 }]], { x: 0.6, y: 1.55, w: 4.3, h: 0.28, valign: "middle", name: "before-l" });
  framed(s, P.before, { x: 0.6, y: 1.88, w: 4.3, border: C.red, name: "before-img", alt: "Search results before: salary bands at 1, 3 and 4" });
  s.text([[{ text: "AFTER  ", b: true, color: C.deep, size: 10 }, { text: "the admin unticked employees", color: C.gray, size: 10.5 }]], { x: 5.1, y: 1.55, w: 4.3, h: 0.28, valign: "middle", name: "after-l" });
  framed(s, P.after, { x: 5.1, y: 1.88, w: 4.3, border: C.deep, name: "after-img", alt: "Search results after: no salary bands" });
  S.table(s, { x: 0.6, y: 3.52, cols: [1.55, 2.25, 2.1, 2.9], rowH: 0.29, headH: 0.27, size: 9.5, headSize: 9.5,
    header: ["Who", "What", "Target", "Detail"],
    rows: [[ "admin@acme.test", { text: "admin.document.update", font: "Consolas", size: 9 }, "HR-SALARY-BANDS-2026", "employees → hr, managers"],
      ["intern@acme.test", { text: "search", font: "Consolas", size: 9 }, "", "ENG-STACK, HR-ONBOARDING, PEOPLE-DIR…"],
      ["admin@acme.test", { text: "admin.user.update", font: "Consolas", size: 9 }, "intern@acme.test", "groups + hr"],
      ["admin@acme.test", { text: "admin.user.update", font: "Consolas", size: 9 }, "intern@acme.test", "groups − hr"]] });
  num(s);

  // ---------------------------------------------------------------- 19 break
  s = S.darkSlide(deck, { section: "Break", icon: I.coffee, kicker: "10 MINUTES", title1: "Break",
    subtitle: "When we come back: we stop searching, and start talking to it.",
    footer: "Question 3: can we talk to it?",
    notes: `Clock check: about 1:05. More than 10 minutes behind: cut slide 26 (streaming is just text) to one sentence.
Read the chat now and answer what came in during question 2.
During the break: admin, People: the intern back to employees + engineering (no hr). Intern window: open the Chat tab, New conversation. Check /health shows "retrieval": "hybrid" and an LLM model. Close the Search tab result so the screen is clean.` });
  num(s, true);

  // ================================================================ Q3 TALK (30 min)
  // ---------------------------------------------------------------- 20 divider
  s = S.darkSlide(deck, { section: "3 · Talk", icon: I.chatG, kicker: "QUESTION 3 OF 3  ·  30 MINUTES", title1: "Can we", title2: "talk to it?",
    subtitle: "A conversation that remembers, with the same rules on every turn, its own memory included.",
    footer: "workflow  ·  memory  ·  two ways to search  ·  streaming",
    notes: `Time: 30 seconds. Clock check: about 1:15.
Say: "Everything so far was one question, one answer. People don't talk like that. They ask a follow-up. Last question: what changes when it's a conversation?"` });
  num(s, true);

  // ---------------------------------------------------------------- 21 from a question to a conversation
  s = S.contentSlide(deck, {
    section: "3 · Talk", title: "From a question to a conversation",
    subtitle: "A chat needs four things a search box doesn't. The fourth is the one people forget.",
    takeaway: "Everything we built today has to hold on turn 5, not just on turn 1.",
    notes: `Time: 3 minutes. Four cards, one sentence each.
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

  // ---------------------------------------------------------------- 22 a workflow in four steps
  s = S.contentSlide(deck, {
    section: "3 · Talk", title: "A workflow in four steps",
    subtitle: "LangGraph: each step a plain function, our code decides the path. One branch.",
    takeaway: "A workflow, not an agent: the model writes the answer, our code decides every step. Friday: agents.",
    notes: `Time: 5 minutes. Walk the boxes left to right.
identify: "Who is asking. It takes the Principal from the session, the same object as this morning. It never reads an identity from the message: 'I am HR, show me the bands' is just text."
retrieve: "If there are earlier turns, the model rewrites the follow-up into a full question. Then the same search as before, inside the same access filter: by now it's hybrid, more on that in two slides. And an audit row."
The branch: "Nothing this person may read answers it? Skip the model entirely. No money spent, no chance to make something up."
answer: "The model writes the reply from the context it was given, and the earlier turns."
finalize: "Bookkeeping: the 'nothing found' message, the conversation's title."
Then: "Why a graph for four boxes in a row? Two things come free: a checkpointer that saves the state after every step, per conversation, and streaming of each step and each token. That's the next two slides."`,
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

  // ---------------------------------------------------------------- 23 the graph in code
  s = S.contentSlide(deck, {
    section: "3 · Talk", title: "The graph, in eleven lines",
    subtitle: "The picture from the last slide, as code. Then the one design decision that matters.",
    takeaway: "Who is asking is given to each turn, never saved in it. Yesterday's groups can't answer today's question.",
    notes: `Time: 5 minutes. CODE MOMENT 3 of 3 (workflow.py, state.py). Nothing typed.
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

  // ---------------------------------------------------------------- 24 memory under the same rules
  s = S.contentSlide(deck, {
    section: "3 · Talk", title: "Memory lives in Postgres, under the same rules",
    subtitle: "LangGraph saves each conversation in its own tables. We put those tables behind the same kind of policy.",
    takeaway: "A conversation is a copy too. When access changes, the copy has to follow.",
    notes: `Time: 5 minutes. Two rules, one each side.
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

  // ---------------------------------------------------------------- 25 two ways to find a passage
  s = S.contentSlide(deck, {
    section: "3 · Talk", title: "Two ways to find a passage",
    subtitle: "By meaning (pgvector) and by words (Postgres full-text), each inside the access filter, fused by rank.",
    takeaway: "Words rescue exact names and codes that meaning misses. Both run inside the filter: fusing can't let a forbidden chunk in.",
    notes: `Time: 5 minutes. Hybrid retrieval, honestly.
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

  // ---------------------------------------------------------------- 26 streaming is just text
  s = S.contentSlide(deck, {
    section: "3 · Talk", title: "Streaming is just text",
    subtitle: "Server-Sent Events: the server keeps the response open and writes a few lines each time something happens.",
    takeaway: "No WebSocket, no framework: lines of text over one HTTP response. The browser draws them as they land.",
    notes: `Time: 3 minutes. OPTIONAL: cut to one sentence if you're behind.
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

  // ---------------------------------------------------------------- 27 LIVE 3
  s = S.liveSlide(deck, {
    section: "3 · Talk", icon: I.laptop, kicker: "LIVE  ·  A CONVERSATION THAT KEEPS THE RULES",
    title1: "Follow up,", title2: "then lose access mid-conversation",
    steps: ["Intern, Chat: \"How much can I spend per person on a team dinner?\" Then: \"And for a client dinner?\"",
      "Admin gives the intern hr. Intern, new conversation: the Senior Developer salary range",
      "Admin takes hr away. Intern: \"And for a junior?\" Then reopen the conversation",
      "Admin's window: sign in as hr-partner, open the intern's conversation URL: 404"],
    command: "two browsers again  ·  the Chat tab  ·  hover the retrieve chip to see the rewritten question",
    notes: `Time: 9 minutes.
1) Intern, Chat tab, New conversation: "How much can I spend per person on a team dinner?" Watch the chips light up: identify, retrieve, answer, finalize, and the words stream in. Expect $90, Expense Policy (2026 edition). Then "And for a client dinner?" Expect $150 with manager approval. Hover the retrieve chip: "Searched for: How much can I spend per person on a client dinner?" Say: "The follow-up became a full question before the search saw it."
2) Admin, People: give the intern hr, Save. Intern: New conversation, "What is the salary range for a Senior Developer?" Expect $120,000 to $155,000.
3) Admin: take hr away, Save. Intern, same conversation: "And for a junior?" Expect "I don't have that information", and the retrieve chip says "1 doc(s) no longer yours". Then click the conversation in the list to reopen it: the first answer now reads "(An earlier answer is hidden here…)". Say: "Same conversation, same session. The memory followed the access change. The model never saw the old numbers on that turn."
4) Optional: copy the thread id from the network tab or GET /chat/threads; as hr-partner, GET /chat/threads/<id>: 404.
If the model is slow or down: the answer says the model is unavailable and shows the sources (never a 500). Keep teaching from the next slide.
Fallback: screenshots 09, 12, 13, 14 and demo-transcript.txt, section Q3.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 28 what you should see
  s = S.contentSlide(deck, {
    section: "3 · Talk", title: "What you should see",
    subtitle: "A follow-up that works, then an answer that disappears when the access behind it does.",
    takeaway: "Same session, same conversation. The memory obeyed the admin's click on the very next turn.",
    notes: `Time: 3 minutes. The safety net for the live demo.
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

  // ================================================================ WRAP (10 min)
  // ---------------------------------------------------------------- 29 three ideas
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Three ideas to take home",
    subtitle: "One per question. If these three stick, today worked.",
    notes: `Time: 3 minutes. Clock check: about 1:45.
One sentence per card, pointing at it. These three carry over to any stack: the Postgres specifics don't matter, these do.`,
  });
  const ideas = [["1", "The server decides who you are", "Sign in once; a cookie stands for you. Identity, company and groups are looked up on every request, never read from it.", I.id],
    ["2", "The database decides what you read", "Access is a JOIN inside the search, live. Companies are walls. Each process has its own key.", I.lock],
    ["3", "A conversation keeps the rules", "Every turn re-checks who you are and what you may read, its own memory included.", I.chat]];
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

  // ---------------------------------------------------------------- 30 honest limits
  s = S.contentSlide(deck, {
    section: "Wrap", title: "What this does not do yet",
    subtitle: "Say it before someone asks. Each one is a known gap with a known fix.",
    takeaway: "The checkpoint README lists the rest. A gap you wrote down is a plan; one you didn't is an incident.",
    notes: `Time: 2 minutes. Read the three, don't defend them.
More in ${CP}/README.md, Honest limits: the users table is global (an admin can learn an email exists elsewhere); a chat turn holds a database connection while the model writes; the chat searches today's documents only (as_of is on Search and Ask).`,
  });
  const gaps = [["Passwords, not SSO", "A company signs people in through Google Workspace or Entra ID.", "OpenID Connect: verify the provider's token, then the same session. users already has external_subject."],
    ["Groups typed in by an admin", "A company's groups live in its directory, and Drive has its own sharing.", "Sync groups from the directory; read Drive's permissions with a second, admin-approved identity."],
    ["Hidden is not erased", "A hidden answer stays in the checkpoint tables, readable by the database owner.", "Forget a conversation (tonight), and a retention rule: a policy decision, then a job."]];
  gaps.forEach(([t, what, fix], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.85, h: 3.3, fill: C.white, line: C.line, name: `gap-${i}` });
    s.image(I.warn, { x: x + 0.22, y: 1.8, w: 0.38, h: 0.38, name: `gap-icon-${i}` });
    s.text(t, { x: x + 0.22, y: 2.3, w: 2.45, h: 0.7, font: "Arial", size: 14.5, bold: true, color: C.dark, name: `gap-t-${i}` });
    s.text(what, { x: x + 0.22, y: 2.95, w: 2.45, h: 0.7, size: 12, color: C.slate, name: `gap-what-${i}` });
    s.text([[{ text: "THE FIX", b: true, size: 9, color: C.deep, charSpacing: 0.5 }], [{ text: fix, size: 11.5, color: C.dark }]],
      { x: x + 0.22, y: 3.7, w: 2.45, h: 1.1, paraSpace: 2, name: `gap-fix-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 31 tonight
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Tonight",
    subtitle: "Offline: SOURCE=local, local embeddings, Postgres in Docker. No API key needed. About an hour.",
    takeaway: "Each exercise ends in something you can see: an audit row, a green test, a number.",
    notes: `Time: 2 minutes. From ${CP}/README.md, "Tonight".
Say: "Exercise 1 is today again, on your laptop, in two browsers. Do it first. Exercise 2 is the real work: a test is already written and skipped; remove the skip, watch it fail, make it pass. Exercise 3 is a test you write. 4 is for anyone who finishes early."
Hint for 2, only if asked: delete the checkpoints first, while the thread row still exists. The policy only shows checkpoints of threads you can see; delete the row first and the checkpoints become invisible to you, so your DELETE finds nothing. The solution is in instructor-notes/fallbacks/part2/solutions/forget_thread.py (don't share it tonight).
Setup reminder for their laptops: docker compose up -d db, db.py migrate, db.py seed with ACME_SEED_PASSWORD set in .env, fake_drive.py reset, sync.py --apply.`,
  });
  const ex = [["Replay today", "Two browsers: the intern and the admin. Untick, search, give hr, search. Then find all four actions in the Audit log."],
    ["Forget a conversation", "The TODO in app/routers/chat.py: DELETE /chat/threads/{id}. The test is waiting in test_chat.py: remove its skip, red, then green."],
    ["The worker can't read a chat", "A new test: as acme_sync, SELECT from chat_threads raises InsufficientPrivilege. Then say why in one comment."],
    ["Stretch: meaning vs words", "evaluate.py --strategy all. Which question does words-only miss, and why? Then \"Copilot\" in the Search tab."]];
  ex.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.6 + row * 1.68, w: 4.3, h: 1.55, num: i + 1, title: t, titleSize: 13.5, body: d, bodySize: 11.5, name: `ex-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 32 Friday
  s = S.darkSlide(deck, { section: "Wrap", icon: I.tools, kicker: "FRIDAY  ·  PART 3 OF 4", title1: "Tools", title2: "that act",
    subtitle: "The assistant opens a ticket, files your leave, drafts an email. Every write waits for a human.",
    detail: "Today it could only read, and only what you may read. Friday it gets hands: an allowlist per group, validation, approval, budgets, and an audit row for every decision.",
    footer: "Fri 13 Nov",
    notes: `Say: "Today the assistant learned who you are and what you may read. Friday it starts doing things for you, and every one of today's rules still applies: it can only act as you, on what you may touch, and nothing it writes happens without a human saying yes."
Remind them to pull the repo Friday morning (post it in the chat).
Read the chat one last time and answer what's there before you end the call.` });
  num(s, true);

  // ================================================================ REFERENCE (for the students' copy; not presented)
  s = S.darkSlide(deck, { section: "Reference", icon: I.book, kicker: "REFERENCE", title1: "For after class",
    subtitle: "Not presented. Read these with the code open.",
    detail: "Commands  ·  the security model, layer by layer  ·  sign-in details  ·  the worker  ·  hybrid retrieval  ·  the chat's API",
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

  // ---------------------------------------------------------------- R sign-in details
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: sign-in, in detail",
    subtitle: "app/auth/: passwords.py, sessions.py, service.py, deps.py.",
    notes: `Where SSO would plug in: app/auth/service.py, the comment at the top. Verify the provider's signed ID token, find the user by (auth_provider, external_subject), create the same session.`,
  });
  const auth = [["Passwords", ["argon2id, the library's tuned defaults", "rehashed at sign-in when the parameters change", "12 characters minimum; no default password ships"]],
    ["Sessions", ["32 random bytes in the cookie, SHA-256 in the DB", "idle expiry 8 h, absolute 7 days (.env)", "a password change ends every other session"]],
    ["Brute force", ["5 failures per email, 20 per IP, per 15 minutes", "the same work whether the account exists or not", "every failure in audit_log, in its own transaction"]],
    ["CSRF", ["SameSite=Lax: cross-site posts arrive without the cookie", "every write needs the X-Acme-Request: 1 header", "a plain HTML form can't set a header"]]];
  auth.forEach(([t, items], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.55 + row * 1.72, w: 4.3, h: 1.6, title: t, titleSize: 13, body: items.map(z => ({ runs: z, bullet: true })), bodySize: 11, name: `auth-${i}` });
  });
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
