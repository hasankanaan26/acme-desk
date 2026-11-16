// p3.js — Creating your production application, Part 3: route it, then prove it (acme-desk, checkpoint 03-retrieval)
//
// Two topics only: the router (decide the question's shape before any search) and the evals (write
// the right answer down first, then measure). Parent-document retrieval, small chunks, reranking and
// HyDE were taught on Wednesday and are not on this deck.
// Teaching shape, as p2.js: one idea per slide, a real example on every slide, and the code it comes
// from with its file name, at most ~12 lines. A "what you should see" slide after every live step.
// Online: no questions to the room, no quizzes, no polls; the chat is read at the dividers and the break.
// Every number is real: the scoreboard is local MiniLM, Monday's documents, 12 Nov
// (instructor-notes/fallbacks/part3/scoreboard-local.txt, rows dense / keyword / hybrid); the router
// is route_eval.py with gpt-4.1-mini, 15 Nov (fallbacks/part3/route-eval-class.txt).
const path = require("path");
const { Deck } = require("./kit");
const S = require("./sef");
const { C } = S;
const fa = require("react-icons/fa");

const CP = "checkpoints/03-retrieval";
const SRC = "local MiniLM embeddings, Monday's documents, 12 Nov";
const ROUTE_SRC = "route_eval.py · gpt-4.1-mini · 16 Nov · shared/golden/golden_routes.json";

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

function source(s, text, y = 4.72) {
  s.text(text || SRC, { x: 0.6, y, w: 8.8, h: 0.25, size: 9, italic: true, color: C.gray, name: "source" });
}

// The router's four steps as a strip of boxes; `on` highlights the step a slide is about.
function stepStrip(s, I, on, y = 1.5) {
  const steps = [["1", "A menu from the data", I.db], ["2", "The model writes a plan", I.robot], ["3", "Code checks it", I.yes], ["4", "Code runs it", I.list]];
  steps.forEach(([k, t, ic], i) => {
    const x = 0.6 + i * 2.25, lit = on.includes(i + 1);
    s.rect({ x, y, w: 2.0, h: 0.42, fill: lit ? C.pale : C.white, line: lit ? C.deep : C.line, name: `strip-${i}` });
    dot(s, x + 0.08, y + 0.07, k, lit ? C.deep : C.line, 0.28);
    s.text(t, { x: x + 0.42, y, w: 1.55, h: 0.42, size: 10, bold: lit, color: lit ? C.dark : C.gray, valign: "middle", name: `strip-t-${i}` });
    if (i < 3) S.arrow(s, x + 2.02, y + 0.21, x + 2.23, y + 0.21, lit ? C.deep : C.line, 1.25);
  });
}

async function build() {
  const I = {};
  const want = {
    users: [fa.FaUsers, C.green], book: [fa.FaBook, C.green], trophyG: [fa.FaTrophy, C.green], checkG: [fa.FaCheckDouble, C.green],
    coffee: [fa.FaCoffee, C.green], terminalG: [fa.FaTerminal, C.green], shipG: [fa.FaRocket, C.green], routeG: [fa.FaRoute, C.green],
    route: [fa.FaRoute, C.deep], lock: [fa.FaLock, C.deep], db: [fa.FaDatabase, C.deep], file: [fa.FaFileAlt, C.deep], robot: [fa.FaRobot, C.deep],
    yes: [fa.FaCheckCircle, C.deep], warn: [fa.FaExclamationTriangle, C.amber], list: [fa.FaListUl, C.deep], scale: [fa.FaBalanceScale, C.deep],
    snow: [fa.FaSnowflake, C.deep], pen: [fa.FaPenFancy, C.deep],
  };
  for (const [k, [comp, color]] of Object.entries(want)) I[k] = await S.icon(comp, color);

  const deck = new Deck({ title: "Part 3: route it, then prove it", author: "SE Factory", company: "SE Factory",
    subject: "Applied AI Engineering Workshop · Creating your production application · Part 3" });
  let n = 0;
  const num = (s, dark) => S.slideNumber(s, ++n, dark);

  // ================================================================ OPENING (4 min)
  // ---------------------------------------------------------------- Title
  let s = S.darkSlide(deck, {
    section: "Opening", icon: I.users,
    kicker: "CREATING YOUR PRODUCTION APPLICATION  ·  PART 3 OF 4",
    title1: "Route it,", title2: "then prove it",
    subtitle: "A router for the questions search can't answer, and evals that prove what works",
    detail: "Wednesday we tried retrieval techniques by eye, one question at a time. Tonight: send each question down the right path, then measure, with numbers, how often we got it right.",
    footer: "Fri 13 Nov  ·  checkpoint 03-retrieval",
    notes: `Time: 1 minute. Clock check: 0:00.
Say: "Wednesday you saw the retrieval techniques: dense, keyword, hybrid, rerank, parent-document. We judged them by eye. Tonight is two things, and only two."
"One: the router. Some questions can't be answered by ANY search, however good. We decide the question's shape before we search."
"Two: evals. We stop judging by eye. We write the right answer down first, then let a script tell us how often each part got it right."
"If you're lost, write it in the chat. I read the chat at every section break."
Before class: Postgres up, Monday's index synced with 03, the app on port 8000 signed in as the intern, a model key in .env, a terminal in the repo root. part3.md, section 2.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- Where we are
  s = S.contentSlide(deck, {
    section: "Opening", title: "Where we are",
    subtitle: "Acme Desk, one app over Acme's documents. Each session adds one layer.",
    takeaway: "The scoreboard runs offline: local embeddings, Postgres in Docker. The router's model column needs a key.",
    notes: `Time: 1 minute. Point at tonight's card and move on.
Say: "Monday the documents and the sync. Wednesday the retrieval techniques, by eye. Tonight: route the question, and measure. Next Monday we ship, and Monday's release gate reads tonight's numbers."`,
  });
  const parts = [["1", "The source", "Mon 9 Nov", ["a real Google Drive folder", "edits and deletions noticed", "re-synced on a timer"], false],
    ["2", "By eye", "Wed 11 Nov", ["where plain top-k misses", "the retrieval techniques, live", "one question at a time"], false],
    ["3", "Prove it", "tonight", ["lists go to the directory", "a scoreboard per kind of question", "check the answer, not only the search"], true],
    ["4", "Ship it", "Mon 16 Nov", ["guardrails on input and output", "evals as a release gate", "kill switch, Docker"], false]];
  parts.forEach(([k, title, when, items, now], i) => {
    const x = 0.6 + i * 2.2;
    S.card(s, { x, y: 1.75, w: 2.1, h: 3.1, num: k, numColor: now ? C.green : C.deep, title, titleSize: 13,
      border: now ? C.deep : undefined, fill: now ? C.pale : C.white,
      body: [{ runs: [{ text: when, b: true, color: now ? C.deep : C.gray }] }, ...items.map(t => ({ runs: t, bullet: true }))], bodySize: 11.5, paraSpace: 4, name: `arc-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- Tonight in three ideas
  s = S.contentSlide(deck, {
    section: "Opening", title: "Tonight in three ideas",
    subtitle: "One idea per part. Say them now, after the break, and at the end.",
    takeaway: "Part A: the router. Part B: the scoreboard. Part C: the answer.",
    notes: `Time: 2 minutes. One sentence per card.
1: "Some questions want a list: 'who works remotely?'. Search can't return a list. So we look at the question's shape first and send it down the right path."
2: "To know what works, write the right answer down BEFORE you run anything. Then measure by kind of question: no technique wins every kind, and the average hides that."
3: "An answer can agree with its context and still be wrong. When it's wrong, we want to know whose fault it is: the search's or the model's."`,
  });
  const ideas = [["1", "Decide the shape first", "Some questions want every matching record. Route them to the directory before any search.", I.route],
    ["2", "Write the answer down, then measure", "By kind of question. No technique wins every kind; the average hides it.", I.list],
    ["3", "Correct, not only faithful", "An answer can match its context and still be wrong. Find whose fault it is.", I.scale]];
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

  // ================================================================ A. THE ROUTER (26 min)
  // ---------------------------------------------------------------- A divider
  s = S.darkSlide(deck, { section: "Router", icon: I.routeG, kicker: "PART A  ·  ABOUT 25 MINUTES", title1: "The router:", title2: "decide the shape first",
    subtitle: "Some questions want every match. No search returns that. Decide before you search.",
    footer: "why search can't list  ·  version 1: rules  ·  version 2: a model's plan, checked by code",
    notes: `Time: 30 seconds. Clock check: about 0:04. Read the chat.
Say: "One kind of question that none of Wednesday's techniques can fix, however good the ranking. The fix isn't a better search. It's deciding, before the search, what shape of answer the question wants."` });
  num(s, true);

  // ---------------------------------------------------------------- A1 why search can't list
  s = S.contentSlide(deck, {
    section: "Router", title: "Why search can't answer \"who works remotely?\"",
    subtitle: "Search finds text that is about your question. This question wants every row that matches a value.",
    takeaway: "Search answers \"which passage is about this?\". A list asks \"which rows match this?\". Different question, different tool.",
    notes: `Time: 3 minutes. The miss is not a ranking problem, so no ranking trick fixes it.
Left: "What plain search returns for 'Who works remotely?': the FAQ on working from another country, and two sections of the remote-work policy. All about remote work. Exactly what search is for, and useless here."
"A directory row says 'office: Remote' once, among a name, a role and an email. As a vector it's 'a person record', not 'remote work', so it's far from the question."
Right: "The answer is three rows of the team directory. That's a filter: office equals Remote. A filter is exact and returns every match, three or three hundred. Top-k returns the k nearest, whatever they are, and never more than k."
LIVE if you like: Search tab, as the intern, strategy dense, top_k 3. These are the app's real results (acme_part3, local MiniLM, 16 Nov; fallbacks/part3/ui-examples.txt).`,
  });
  bubble(s, { x: 0.6, y: 1.55, w: 4.3, h: 0.55, who: "THE QUESTION  ·  Search tab, intern, dense, top 3", text: "Who works remotely?", tone: "ask", size: 12, name: "ls-q" });
  s.text([[{ text: "Plain search, top 3: all about remote work, no people", b: true, size: 10.5, color: C.redText }]], { x: 0.6, y: 2.2, w: 4.3, h: 0.3, name: "ls-dense-h" });
  [["1.01", "Remote Work Guidelines · Eligibility"], ["1.05", "Company FAQ · Can I work from another country?"], ["1.05", "Remote Work Guidelines · Security"]].forEach(([d, t], i) => {
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

  // ---------------------------------------------------------------- A2 shapes of question
  s = S.contentSlide(deck, {
    section: "Router", title: "Three shapes of question, three paths",
    subtitle: "The router makes one decision before the search: which shape is this? Then ordinary code takes that path.",
    takeaway: "Top-k is a budget. If the answer is 30 people, top 5 can never hold it, whatever the search.",
    notes: `Time: 3 minutes. One row each, read the example aloud.
Pointwise: "the answer lives in one or two places: a policy, a ticket, a contact. Search, as Wednesday."
Aggregation: "the answer is a SET of records: who, how many, list everyone, in an office, a department, a role. Look the records up: every match, no k. 'How many' is the same lookup, counted."
Unindexed: "a list about something the directory doesn't store, like a language. We can't list it exactly. So we search, and we write the question down: if people keep asking about languages, that's the column to add next."
"A router decides once, then code runs the path. An agent loops: search, read, decide, again. Tonight is a router."
The names are the code's: router_llm.POINTWISE, AGGREGATION, AGGREGATION_UNINDEXED.`,
  });
  S.table(s, { x: 0.6, y: 1.6, cols: [2.0, 3.45, 3.35], rowH: 0.85, headH: 0.36, size: 11.5, headSize: 10.5,
    header: ["Shape", "Example", "The path"],
    rows: [[{ text: "pointwise", b: true, font: "Consolas" }, { text: "\"I'm locked out of my laptop. Who do I ring?\"", i: true }, "search the documents, as Wednesday"],
      [{ text: "aggregation", b: true, font: "Consolas", color: C.deep }, { text: "\"Who works remotely?\"\n\"How many people are based in New York?\"", i: true }, { text: "look up the directory: every match, no k", b: true, color: C.deep }],
      [{ text: "aggregation_\nunindexed", b: true, font: "Consolas", color: C.amberDeep }, { text: "\"Who speaks Spanish?\"  (the directory has no language column)", i: true }, "search, and log the missing column"]] });
  num(s);

  // ---------------------------------------------------------------- A3 router v1: rules
  s = S.contentSlide(deck, {
    section: "Router", title: "Version 1: three checks on the words",
    subtitle: "app/rag/router.py. The rows are looked up only when all three checks pass. Follow one question through it.",
    takeaway: "Free, about 0 ms, the same answer every time, easy to test. And it reads words, not meaning.",
    notes: `Time: 3 minutes. Walk the example on the left, pointing at the matching line on the right.
"Who works remotely? Check one: does it ask for a group? 'who': yes, that's AGGREGATION_RE. Check two: does it talk about where people belong? 'works': yes, MEMBERSHIP_RE. Check three: does it name a value that really exists in the directory? The code reads every row; 'Remote' is an office value. All three: aggregation, office = Remote."
"Any check fails: pointwise, search as usual."
"Why start here: it costs nothing, runs in no time, and you can write a test for it. The comment at the top of the file says it: the lesson is the split, not the regex."
"And the problem is right there: it reads WORDS. Next slide."`,
  });
  const walk = [["1", "asks for a group?", "\"who\"", "AGGREGATION_RE"], ["2", "talks about belonging?", "\"works\"", "MEMBERSHIP_RE"], ["3", "names a real value?", "\"remotely\" → office = Remote", "read from the rows"]];
  bubble(s, { x: 0.6, y: 1.55, w: 3.9, h: 0.55, who: "THE QUESTION", text: "Who works remotely?", tone: "ask", size: 11.5, name: "rv1-q" });
  walk.forEach(([k, t, found, where], i) => {
    const y = 2.15 + i * 0.68;
    s.rect({ x: 0.6, y, w: 3.9, h: 0.6, fill: C.white, line: C.line, name: `rv1-${i}` });
    dot(s, 0.7, y + 0.14, k, C.deep, 0.32);
    s.text([[{ text: t + "  ", b: true, size: 11, color: C.dark }, { text: "yes", b: true, size: 11, color: C.deep }],
      [{ text: found, size: 10, color: C.slate, font: "Consolas" }, { text: "   " + where, size: 9, color: C.gray, i: true }]],
      { x: 1.12, y, w: 3.35, h: 0.6, valign: "middle", paraSpace: 1, name: `rv1-t-${i}` });
  });
  s.rect({ x: 0.6, y: 4.25, w: 3.9, h: 0.6, fill: C.pale, line: C.deep, name: "rv1-out" });
  s.text([[{ text: "→ ", b: true, size: 11, color: C.deep }, { text: "(\"aggregation\", {\"office\": [\"Remote\"]})", b: true, size: 10.5, font: "Consolas", color: C.deep }]],
    { x: 0.7, y: 4.25, w: 3.75, h: 0.6, valign: "middle", name: "rv1-out-t" });
  S.code(s, { x: 4.7, y: 1.55, w: 4.7, h: 3.3, label: "app/rag/router.py  (trimmed)", size: 9, lines: [
    "AGGREGATION_RE = re.compile(",
    "    r\"\\b(who|list|how many|which people|everyone|anyone)\\b\")",
    "MEMBERSHIP_RE = re.compile(",
    "    r\"\\b(work|works|based|office|team|department|…)\\b\")",
    "",
    "def classify(question, records):",
    "    if not (AGGREGATION_RE.search(question)",
    "            and MEMBERSHIP_RE.search(question)):",
    "        return \"pointwise\", {}               # checks 1 and 2",
    "    values = values_in_rows_named_by(question)  # check 3",
    "    if not values:",
    "        return \"pointwise\", {}",
    "    return \"aggregation\", values"] });
  num(s);

  // ---------------------------------------------------------------- A4 rules read words
  s = S.contentSlide(deck, {
    section: "Router", title: "The rules read words, not meaning",
    subtitle: "23 questions, each labelled with the route a person would give it. The rules get 11 right. Four of the misses:",
    takeaway: "Both mistakes cost you: a list sent to search returns policies; a passage sent to the directory returns everyone.",
    notes: `Time: 3 minutes. Read the question, then the rules' answer, then why.
"Show me all remote staff: no who, no list, no how many. Check one fails. Search. The policy again."
"Which people in Engineering work from NYC: the rules don't know NYC is New York, so they list every engineer."
"Who do I talk to on the Engineering team about a deploy: who, team, Engineering. All three checks pass. The rules hand back every engineer instead of one contact."
"Can anyone in the New York office expense a parking spot: a policy question. The rules see anyone, office, New York: every New Yorker."
"The fix is not more regular expressions. Every word you add breaks another question. It needs something that reads meaning."
Numbers: route_eval.py --router rules, 15 Nov: 11/23.`,
  });
  S.table(s, { x: 0.6, y: 1.6, cols: [3.7, 2.5, 2.6], rowH: 0.58, headH: 0.34, size: 11, headSize: 10.5,
    header: ["Question", "The rules say", "What goes wrong"],
    rows: [[{ text: "\"Show me all remote staff\"", i: true }, { text: "pointwise", font: "Consolas", color: C.redText }, "no who / list / how many: a list sent to search"],
      [{ text: "\"Which people in Engineering work from NYC?\"", i: true }, { text: "department = Engineering", font: "Consolas", color: C.redText }, "\"NYC\" isn't \"New York\": every engineer"],
      [{ text: "\"Who do I talk to on the Engineering team about a deploy?\"", i: true }, { text: "department = Engineering", font: "Consolas", color: C.redText }, "wants one contact, gets every engineer"],
      [{ text: "\"Can anyone in the New York office expense a parking spot?\"", i: true }, { text: "office = New York", font: "Consolas", color: C.redText }, "a policy question turned into a list"]] });
  s.text([[{ text: "rules: 11 / 23 right", b: true, size: 12, color: C.redText }]], { x: 0.6, y: 4.35, w: 8.8, h: 0.32, name: "rw-score" });
  source(s, "route_eval.py --router rules · shared/golden/golden_routes.json · 15 Nov", 4.72);
  num(s);

  // ---------------------------------------------------------------- A5 router v2: the map
  s = S.contentSlide(deck, {
    section: "Router", title: "Version 2: the model plans, code decides",
    subtitle: "app/rag/router_llm.py. Four steps. The next slides take them one at a time.",
    takeaway: "The model reads the question; code decides what runs. The model never writes the filter.",
    notes: `Time: 2 minutes. This is the map; don't explain the details yet.
"Four steps. One: build a menu from the data: the columns and values that really exist. Two: the model reads the question and the menu and writes a plan, as JSON. Three: code checks every field of that plan against the directory. Four: code runs it."
"The plan on the right is a real one, for the NYC question the rules got wrong. The model mapped NYC to New York by itself. That's what we wanted from it: reading meaning."
"And the line to remember: the model reads the question; code decides what runs."`,
  });
  const v2 = [["1", "A menu from the data", "the values in the rows this person may read", I.db], ["2", "The model writes a plan", "one call, JSON: route + filters", I.robot], ["3", "Code checks it", "every field, against the real directory", I.yes], ["4", "Code runs it", "lookup, search, or search + log", I.list]];
  v2.forEach(([k, t, d, ic], i) => {
    const x = 0.6 + i * 2.25;
    s.rect({ x, y: 1.55, w: 1.95, h: 1.2, fill: C.white, line: C.line, name: `rv2-${i}` });
    dot(s, x + 0.12, 1.65, k, C.deep, 0.32);
    s.image(ic, { x: x + 1.5, y: 1.65, w: 0.32, h: 0.32, name: `rv2-icon-${i}` });
    s.text([[{ text: t, b: true, size: 11.5, color: C.dark }], [{ text: d, size: 9.5, color: C.slate }]], { x: x + 0.12, y: 2.03, w: 1.75, h: 0.7, valign: "top", paraSpace: 1, name: `rv2-t-${i}` });
    if (i < 3) S.arrow(s, x + 1.97, 2.15, x + 2.23, 2.15, C.deep, 1.5);
  });
  bubble(s, { x: 0.6, y: 3.0, w: 3.6, h: 0.75, who: "THE QUESTION  ·  the rules said: every engineer", text: "Which people in Engineering work from NYC?", tone: "ask", size: 11.5, name: "rv2-q" });
  S.arrow(s, 4.25, 3.37, 4.55, 3.37, C.deep, 1.5);
  S.code(s, { x: 4.6, y: 2.95, w: 4.8, h: 1.9, label: "THE MODEL'S PLAN  (step 2)", size: 10, lines: [
    "{\"route\": \"AGGREGATION\",",
    " \"reasoning\": \"Every person in Engineering",
    "               whose office is New York.\",",
    " \"filters\": {\"department\": [\"Engineering\"],",
    "             \"office\": [\"New York\"]}}"] });
  s.text([[{ text: "NYC → \"New York\": ", b: true, color: C.deep }, { text: "the model read the meaning", color: C.slate }]], { x: 0.6, y: 3.9, w: 3.6, h: 0.35, size: 11, name: "rv2-nyc" });
  num(s);

  // ---------------------------------------------------------------- A6a where the records live: chunks.fields
  s = S.contentSlide(deck, {
    section: "Router", title: "Where records live: one row, one chunk",
    subtitle: "The sync writes each CSV row once: as text, to be searched, and as fields (jsonb), to be listed. Same chunk.",
    takeaway: "The CSV is the truth. Postgres holds a copy the sync rewrites. The fields are that copy, already split into columns.",
    notes: `Time: 3 minutes. The picture first, then the two lines of code that make it.
Left: "This is Maria's row of team-directory.csv. The sync turns it into ONE chunk in the chunks table, with two forms of the same row. text: what search reads, and embeds, like any policy section. fields: the same row as columns, a jsonb value. A policy's chunks have fields = NULL."
"Why on the chunk and not a separate table? Everything that protects a chunk protects its fields for free: the tenant's row-level security, the access check, status and dates, deletes. A separate table would need each of those again, and one forgotten is a leak."
Right, top: "parse_csv() already had the row as a dictionary; it now keeps it." Right, bottom: "Migration 007: one column, one index."
"What's in fields is everything the CSV has: name, email too. Which of those columns the router may FILTER on is a separate decision: next slide."
Show it live if you like: db-tour.sql, section 1.
Files: app/ingest/parsers.py (parse_csv), app/db/migrations/007_record_fields.sql, app/ingest/sync.py.`,
  });
  s.rect({ x: 0.6, y: 1.55, w: 4.45, h: 0.62, fill: C.soft, line: C.line, name: "rl-csv" });
  s.text([[{ text: "team-directory.csv  ·  one line", b: true, size: 8.5, color: C.gray, charSpacing: 0.5 }],
    [{ text: "Maria Garcia,Frontend Developer,Engineering,Remote,maria.garcia@…", size: 9.5, font: "Consolas", color: C.dark }]],
    { x: 0.72, y: 1.55, w: 4.25, h: 0.62, valign: "middle", paraSpace: 1, name: "rl-csv-t" });
  S.arrow(s, 2.8, 2.2, 2.8, 2.42, C.deep, 1.5);
  s.rect({ x: 0.6, y: 2.45, w: 4.45, h: 2.45, fill: C.white, line: C.deep, name: "rl-chunk" });
  s.text([[{ text: "chunks  ·  id = PEOPLE-DIRECTORY::002", b: true, size: 8.5, color: C.deep, charSpacing: 0.5 }],
    [{ text: "text", b: true, size: 10, color: C.dark }, { text: "   searched, embedded", size: 9, i: true, color: C.gray }],
    [{ text: "Team Directory > Maria Garcia\nname: Maria Garcia; role: Frontend Developer; department: Engineering; office: Remote; email: …", size: 8.5, font: "Consolas", color: C.slate }],
    [{ text: "fields", b: true, size: 10, color: C.dark }, { text: "   listed, filtered (jsonb)", size: 9, i: true, color: C.gray }],
    [{ text: "{\"name\": \"Maria Garcia\", \"role\": \"Frontend Developer\", \"department\": \"Engineering\", \"office\": \"Remote\", \"email\": \"…\"}", size: 8.5, font: "Consolas", color: C.deep, b: true }]],
    { x: 0.75, y: 2.5, w: 4.2, h: 2.35, valign: "top", paraSpace: 4, name: "rl-chunk-t" });
  S.code(s, { x: 5.25, y: 1.55, w: 4.15, h: 1.75, label: "app/ingest/parsers.py  ·  parse_csv()", size: 8.5, lines: [
    "for row in csv.DictReader(...):",
    "    values = {k: v for k, v in row.items()}",
    "    sections.append(Section(",
    "        heading=first_value,",
    "        text=\"; \".join(f\"{k}: {v}\" ...),",
    "        fields=values))   # kept, Part 3"] });
  S.code(s, { x: 5.25, y: 3.45, w: 4.15, h: 1.45, label: "app/db/migrations/007_record_fields.sql", size: 8.5, lines: [
    "ALTER TABLE chunks ADD COLUMN fields jsonb;",
    "",
    "CREATE INDEX chunks_by_fields ON chunks",
    "    USING gin (fields) WHERE fields IS NOT NULL;",
    "-- a policy's chunks keep fields NULL"] });
  num(s);

  // ---------------------------------------------------------------- A6b step 1: the menu, read from Postgres
  s = S.contentSlide(deck, {
    section: "Router", title: "Step 1: the menu is one SQL query",
    subtitle: "router.ROUTABLE says what may be listed, by which columns. record_menu() reads the values.",
    takeaway: "12 rows → 3 offices, 4 departments, 12 roles. That list is the menu: the only values the model may put in a filter.",
    notes: `Time: 3 minutes. Left, the one decision a developer makes; right, the query; bottom, the result.
Left: "ROUTABLE. Which record sets the router may list, and which of their columns are filters. Everything is STORED; this says what may be FILTERED. Office, department, role group many people: filters. Name and email point at ONE person: 'what is Maria's email?' is a pointwise question, not a list."
Right: "record_menu(): for every routable record set this person may read, every column and its distinct values. jsonb_each_text turns the fields into (column, value) pairs; array_agg DISTINCT collects them. And the same access check as every search: someone who may not read the directory gets no menu, and the router doesn't even ask the model."
Bottom: "The result for Acme today. Nothing on it was written by hand: if it's on the menu, at least one real row has it. Rebuilt on every question: a new office in the CSV is on the menu after the next sync."
"Later tonight we add a second entry to ROUTABLE, live: the helpdesk tickets."
Files: app/rag/router.py (ROUTABLE), app/rag/store_pg.py (record_menu), app/rag/router_llm.py (vocabulary).`,
  });
  stepStrip(s, I, [1]);
  S.code(s, { x: 0.6, y: 2.05, w: 3.9, h: 1.45, label: "app/rag/router.py", size: 8.5, lines: [
    "ROUTABLE = {",
    "  \"PEOPLE-DIRECTORY\": {",
    "    \"about\": \"the team directory, one row per person\",",
    "    \"filters\": (\"office\", \"department\", \"role\")},",
    "  # tonight, live: the helpdesk tickets",
    "}"] });
  S.code(s, { x: 4.65, y: 2.05, w: 4.75, h: 1.45, label: "app/rag/store_pg.py  ·  record_menu()  (trimmed)", size: 8.5, lines: [
    "SELECT c.doc_id, f.key, array_agg(DISTINCT f.value)",
    "FROM chunks c, jsonb_each_text(c.fields) AS f",
    "WHERE c.doc_id = ANY(%(sources)s)   -- ROUTABLE",
    "  AND c.status = 'current'",
    "  AND EXISTS (... document_acl ... your groups)",
    "GROUP BY c.doc_id, f.key"] });
  S.code(s, { x: 0.6, y: 3.62, w: 8.8, h: 1.35, label: "THE MENU  ·  PEOPLE-DIRECTORY, filter columns only  (the output)", size: 9, lines: [
    { text: "{\"office\":     [\"New York\", \"Remote\", \"San Francisco\"],", color: C.green },
    { text: " \"department\": [\"Design\", \"Engineering\", \"Human Resources\", \"Product\"],", color: C.green },
    { text: " \"role\":       [\"Data Scientist\", \"DevOps Engineer\", \"Engineering Manager\", \"Frontend Developer\", \"HR Business Partner\",", color: C.green },
    { text: "                \"Product Manager\", \"QA Engineer\", \"Security Engineer\", \"Senior Backend Developer\", \"Technical Writer\",", color: C.green },
    { text: "                \"UX Designer\", \"VP of Engineering\"]}", color: C.green }] });
  num(s);

  // ---------------------------------------------------------------- A7 the menu, four examples
  s = S.contentSlide(deck, {
    section: "Router", title: "What the menu does: four examples",
    subtitle: "The model can only pick from the menu. Here is what that means for four real questions.",
    takeaway: "The menu is rebuilt for every question, from the rows this person may read. No rows: no menu, and the question is searched.",
    notes: `Time: 3 minutes. One card each.
1: "NYC is not on the menu. New York is. The prompt has a rule: map synonyms to a listed value. So the model writes 'New York', and the lookup matches. This is the question the rules got wrong."
2: "London is not on the menu, and nothing on it means London. So the model doesn't write London: live, gpt-4.1-mini answers 'unindexed, missing column: office'. But office isn't missing, London is. Step 3 knows office is a real column, so it searches instead: never an empty list that would look like 'nobody works in London', and no fake gap in the backlog." LIVE: routed, as the intern; the trace shows the guard line.
3: "Spanish isn't a value; language isn't even a column. The prompt tells the model: a list about something the directory doesn't store is AGGREGATION_UNINDEXED, and name the missing column. We search, and we log 'language' as a column worth adding."
4: "The menu isn't written in the prompt by hand. It's read from the rows on every question. Tomorrow HR adds someone in London, the sync picks up the row, and the very next question has London on the menu. No prompt change, no deploy."
Prompt rules: app/prompts/route_question.py ("Map synonyms to a listed value", AGGREGATION_UNINDEXED). Examples 2 and 3 are tests in tests/test_router_llm.py.`,
  });
  const menuEx = [["SYNONYM  →  MENU VALUE", "\"Which engineers are based in NYC?\"", "\"NYC\" is not on the menu; \"New York\" is. The prompt says: map synonyms to a listed value.", "office: [\"New York\"]", C.deep, C.greenSoft],
    ["NOT ON THE MENU", "\"Who works in London?\"", "No row has London, so the model won't write it. Step 3 sees office is a real column: search, never an empty list.", "route: pointwise · searched instead", C.amberDeep, C.amberSoft],
    ["NOT EVEN A COLUMN", "\"Who speaks Spanish?\"", "language isn't on the menu at all. The prompt says: AGGREGATION_UNINDEXED, and name what's missing.", "missing_column: \"language\"", C.amberDeep, C.amberSoft],
    ["THE MENU FOLLOWS THE DATA", "Tomorrow: a new hire in London", "The sync adds the row; the next question's menu has London on it. No prompt change, no deploy.", "office: [..., \"London\", ...]", C.deep, C.greenSoft]];
  menuEx.forEach(([tag, q, d, out, col, fill], i) => {
    const x = 0.6 + (i % 2) * 4.45, y = 1.55 + Math.floor(i / 2) * 1.7;
    s.rect({ x, y, w: 4.3, h: 1.55, fill: C.white, line: C.line, name: `mx-${i}` });
    s.rect({ x, y, w: 0.07, h: 1.55, fill: col, name: `mx-edge-${i}` });
    s.text([[{ text: tag, b: true, size: 8.5, color: col, charSpacing: 0.5 }], [{ text: q, b: true, i: true, size: 11.5, color: C.dark }], [{ text: d, size: 10, color: C.slate }]],
      { x: x + 0.2, y: y + 0.05, w: 4.0, h: 1.08, valign: "top", paraSpace: 2, name: `mx-t-${i}` });
    pill(s, { x: x + 0.2, y: y + 1.13, w: 2.9, h: 0.3, text: out, size: 9.5, fill, color: col, name: `mx-out-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- A8 step 2: the menu goes into the prompt
  s = S.contentSlide(deck, {
    section: "Router", title: "Step 2: the menu goes into the prompt",
    subtitle: "system_prompt() pastes each record set's menu into the prompt, next to the rules and the shape of the reply.",
    takeaway: "A menu, not a blank page: every value the model returns is either on the list, or wrong, and code can tell which.",
    notes: `Time: 2 minutes. Left, how the menu gets in, and the rules that point at it; right, what the model actually reads.
Left: "system_prompt() writes one block per record set: its id, what it is, how many rows, then each filter column and its values. Under the menu, the prompt's rules: a filter uses only the columns listed for that record set and only the listed values; map synonyms to a listed value; if unsure, pointwise."
Right: "This is exactly what the model reads for our 12 people: the menu in green, then the shape of the reply: a route, a one-line reason, which record set (source), the filters, and for a list we can't answer, what's missing."
"Nothing in the prompt names office or department by hand any more: add a record set to ROUTABLE and it's on the menu."
"The prompt also has six worked examples (not shown): 'Who works remotely?', NYC, the laptop, a remote-work policy question, Spanish, and invoices (a kind of record nobody stores)."
Files: app/rag/router_llm.py (system_prompt); app/prompts/route_question.py (ROUTE_SYSTEM_PROMPT).`,
  });
  stepStrip(s, I, [2]);
  S.code(s, { x: 0.6, y: 2.05, w: 4.3, h: 2.9, label: "app/rag/router_llm.py", size: 9, lines: [
    "def system_prompt(vocab):",
    "    for source, entry in vocab.items():",
    "        # - <id>: <about> (<n> rows)",
    "        #     <column>: <value>, <value>, ...",
    "    return ROUTE_SYSTEM_PROMPT.replace(",
    "        \"{{VOCABULARY}}\", menu)",
    "",
    "# app/prompts/route_question.py, under the menu:",
    { text: "- filters uses only the filter columns listed", color: C.codeText },
    { text: "  for that record set, and only the values listed.", color: C.codeText },
    { text: "- Map synonyms to a listed value: \"NYC\" ->", color: C.codeText },
    { text: "  \"New York\", \"work from home\" -> \"Remote\"", color: C.codeText },
    { text: "- If unsure, choose POINTWISE.", color: C.codeText }] });
  S.code(s, { x: 5.1, y: 2.05, w: 4.3, h: 2.9, label: "WHAT THE MODEL READS", size: 8.5, lines: [
    "The record sets you can list, and their values:",
    { text: "- PEOPLE-DIRECTORY: the team directory,", color: C.green },
    { text: "  one row per person (12 rows)", color: C.green },
    { text: "    office: New York, Remote, San Francisco", color: C.green },
    { text: "    department: Design, Engineering,", color: C.green },
    { text: "      Human Resources, Product", color: C.green },
    { text: "    role: Data Scientist, DevOps Engineer, …", color: C.green },
    { text: "      (12 roles)", color: C.green },
    "",
    "Return ONLY a JSON object of this exact shape:",
    "{\"route\": ..., \"reasoning\": ..., \"source\": ...,",
    " \"filters\": ..., \"missing_column\": ...}"] });
  num(s);

  // ---------------------------------------------------------------- A7 step 3: code checks every field
  s = S.contentSlide(deck, {
    section: "Router", title: "Step 3: trust nothing until it matches the directory",
    subtitle: "router_llm.check(): every column and every value in the plan is compared with the real directory.",
    takeaway: "Each guard turns a wrong plan into a safe path: never an empty list, never a wider one.",
    notes: `Time: 4 minutes. Three examples, left to right, then point at the matching lines in the code.
1: "The model wrote lowercase 'remote'. The stored value is 'Remote'. check() maps it to the stored spelling, so the lookup matches."
2: "Who works in London? This is what gpt-4.1-mini really answers: it won't write London, it's not on the menu, so it says unindexed, missing column office. But the directory HAS an office column; what's missing is a row with London. If we treated it as unindexed we'd log 'office' as a column to add, which is nonsense. So check() turns it into a normal search. And if a model did write office London, the same: no row has it, search, never an empty list that looks like 'nobody'."
3: "Who speaks Spanish? The model used a column called language. The directory has no such column. That becomes unindexed: we search, and log the question."
"One more rule in the code: a list runs only when EVERY filter checks out. If we dropped just the bad one, 'Remote AND London' would become 'Remote': a wider list than asked for."
Examples 2 and 3 are tests: tests/test_router_llm.py.`,
  });
  stepStrip(s, I, [3]);
  const guards = [["\"Who works remotely?\"", "office: [\"remote\"]", "office: [\"Remote\"]", "the stored spelling: the lookup matches", C.deep, C.greenSoft],
    ["\"Who works in London?\"", "unindexed, missing_column: \"office\"", "pointwise", "office is a real column; no row has London: search", C.amberDeep, C.amberSoft],
    ["\"Who speaks Spanish?\"", "language: [\"Spanish\"]", "aggregation_unindexed", "no such column: search, and log it", C.amberDeep, C.amberSoft]];
  S.table(s, { x: 0.6, y: 2.1, cols: [1.55, 1.45, 1.9], rowH: 0.72, headH: 0.32, size: 9.5, headSize: 9.5,
    header: ["Question", "The model said", "check() made it"],
    rows: guards.map(([q, said, made, why, col, fill]) => [{ text: q, i: true, size: 9.5 }, { text: said, font: "Consolas", size: 9 },
      { text: [[{ text: made, font: "Consolas", b: true, color: col, size: 9 }], [{ text: why, size: 8.5, color: C.slate }]], fill }]) });
  S.code(s, { x: 5.65, y: 2.1, w: 3.75, h: 2.8, label: "router_llm.check()  (trimmed)", size: 8.5, lines: [
    "columns = vocab[plan.source][\"columns\"]",
    "for column, values in plan[\"filters\"].items():",
    "    if column not in columns:",
    "        unknown_columns.append(column)   # Spanish",
    "        continue",
    "    stored = {v.lower(): v for v in columns[column]}",
    "    for value in values:",
    "        real = stored.get(value.lower())",
    "        if real is None:",
    "            unknown_values.append(value)  # \"London\"",
    "        else:",
    "            filters[column].append(real)  # Remote",
    "",
    "if route == UNINDEXED and missing in columns:",
    "    route = POINTWISE    # London, as answered live",
    "# bad column -> unindexed; bad value -> search"] });
  num(s);

  // ---------------------------------------------------------------- A8 step 4: code runs it, and never fails
  s = S.contentSlide(deck, {
    section: "Router", title: "Step 4: code runs the plan, and never fails",
    subtitle: "router_llm.plan() is the one entry point. No model, or a reply that isn't JSON: the rules from version 1 decide.",
    takeaway: "The search can get worse; it never breaks. And the trace always says who decided.",
    notes: `Time: 3 minutes. Left, plan(); right, where the routed strategy uses it.
Left: "Three outcomes. The model answers and check() passes: that's the plan. The reply isn't JSON, even after one retry: the rules decide. No model at all, no key, quota, an outage: the rules decide. The question still gets an answer."
Right: "_routed in the retriever. First the menu, one SQL query. Aggregation: store.lookup_records(), one more SQL query: fields->>'office' = ANY(the checked values), every match, no k. The values go in as query parameters, never pasted into the SQL. The model never writes SQL or a filter. Unindexed: write the question to runs/router_misses.jsonl, then search. Pointwise: search."
"And every path adds a line to the trace: which route, and 'decided by the model' or 'decided by the rules'. You'll see it live in a minute."
ROUTER=rules in .env skips the model entirely.`,
  });
  stepStrip(s, I, [4]);
  S.code(s, { x: 0.6, y: 2.1, w: 4.3, h: 2.8, label: "app/rag/router_llm.py", size: 9.5, lines: [
    "def plan(question, menu):",
    "    vocab = vocabulary(menu)   # ROUTABLE only",
    "    try:",
    "        return check(ask_model(question, vocab),",
    "                     vocab)",
    "    except UnusableReply:   # not JSON, twice",
    "        return by_rules(question, vocab)",
    "    except Exception:       # no key, quota, outage",
    "        return by_rules(question, vocab)",
    "",
    "# by_rules() = version 1, router.classify()",
    "# and the plan says decided_by=\"the rules\""] });
  S.code(s, { x: 5.1, y: 2.1, w: 4.3, h: 2.8, label: "app/rag/retriever.py  ·  _routed()  (trimmed)", size: 9.5, lines: [
    "menu = store.record_menu(ROUTABLE, access)",
    "plan = router_llm.plan(query, menu)",
    "if plan.route == AGGREGATION:",
    "    return store.lookup_records(plan.source,",
    "        plan.filters, access)  # SQL, every match",
    "",
    "if plan.route == AGGREGATION_UNINDEXED:",
    "    router_llm.log_miss(query, plan)",
    "    # runs/router_misses.jsonl",
    "",
    "return search(query)    # pointwise, or after",
    "                        # logging the miss"] });
  num(s);

  // ---------------------------------------------------------------- A9 Live: routed
  s = S.liveSlide(deck, { section: "Router", icon: I.terminalG, kicker: "LIVE  ·  THE SEARCH TAB", title1: "routed", title2: "lists go to the directory",
    steps: ["\"Who works remotely?\": dense returns the policy; routed returns all three people",
      "routed: \"Show me all remote staff\": the rules would search; the model lists the same three",
      "routed: \"Who do I talk to on the Engineering team about a deploy?\": pointwise, a contact",
      "routed: \"Who works in London?\", then \"Who speaks Spanish?\": two different guards"],
    command: "python run_checkpoint.py 03-retrieval",
    notes: `Time: 4 minutes. Clock check: about 0:24. LIVE in the Search tab, signed in as the intern, top_k 3. Open the trace every time.
Step 1: strategy dense first: "the remote-work policy and the FAQ, as on the first slide." Then strategy routed, same question: "Maria Garcia, Michael Brown, Ahmed Hassan. Total results 3 with top_k 3: the lookup ignores k. The trace: 'route: aggregation on office Remote, 3 matching records, all of them, decided by the model'."
Step 2: "No who, no list, no how many: the rules would search. The model still reads it as a list." Same three people.
Step 3: "who + team + Engineering, which fooled the rules into listing every engineer. The trace: 'route: pointwise, decided by the model', and its reason. The top result is the onboarding guide's 'Your First Week'."
Step 4, London: "Three search results, no list. The trace: 'route: pointwise' and the guard line: the directory has an office column, but no row has London: searched instead." Spanish: "'route: aggregation_unindexed: the directory has no language column, searched instead, logged as a missing column'. Two different guards: a value we don't have, a column we don't have."
Pointwise routes end with a line 'hybrid top 20 -> cross-encoder -> top 3': routed's search path is Wednesday's hybrid + rerank, nothing new tonight.
The first time each question is asked it takes a second or several (one model call); then it's cached. Ask them all once before class.
Needs a model (LLM_PROVIDER and its key). Without one the trace says 'router model unavailable: the rules decided', and step 2 searches: say "that's version one, the fallback", and show the next slide.
Real outputs for every step: instructor-notes/fallbacks/part3/ui-examples.txt.` });
  num(s, true);

  // ---------------------------------------------------------------- A10 What you should see: the trace
  s = S.contentSlide(deck, {
    section: "Router", title: "What you should see: the router explains itself",
    subtitle: "The trace under the results, as the intern. Every route says who decided it, and why.",
    takeaway: "When a route is wrong, the trace is where you see it. Part B measures how often that happens.",
    notes: `Time: 2 minutes. Point at "decided by the model", the guard lines and the reason lines.
"Every route is explained: which path, who decided, the guards that changed the plan, and the model's one-line reason."
"If you don't have a model: the same lines say 'decided by the rules'. Next part: how often is each one right? We don't guess. We measure."
The green line is the SQL lookup that ran (store.lookup_records over chunks.fields). Traces: the app's real ones, acme_part3, gpt-4.1-mini, 16 Nov (fallbacks/part3/ui-examples.txt). The pointwise ones also end with the 'hybrid top 20 -> cross-encoder' line, left out here; Spanish's '(decided by the model)' is left out to fit.`,
  });
  const traces = [["\"WHO WORKS REMOTELY?\"  ·  3 PEOPLE", ["route: aggregation on {'office': ['Remote']} -> 3 matching record(s), all of them (decided by the model)", { text: "router lookup: PEOPLE-DIRECTORY where fields->>'office' in ['Remote']", color: C.green }, "router: Every person whose office is Remote."]],
    ["\"WHO DO I TALK TO ON THE ENGINEERING TEAM ABOUT A DEPLOY?\"  ·  SEARCHED", ["route: pointwise (decided by the model)", "router: The question asks for a contact about a deploy, which is a specific issue, not a list of people."]],
    ["\"WHO WORKS IN LONDON?\"  ·  SEARCHED, NOT AN EMPTY LIST", ["route: pointwise (decided by the model)", { text: "router guard: the directory has an 'office' column, but no row has the value asked for: searched instead", color: C.amber }, "router: The directory does not have an office called London, so this is an unindexed filter."]],
    ["\"WHO SPEAKS SPANISH?\"  ·  SEARCHED, AND LOGGED", ["route: aggregation_unindexed: the directory has no 'language' column -> searched instead, logged as a missing column"]]];
  let ty = 1.45;
  traces.forEach(([q, lines], i) => {
    const h = 0.34 + lines.length * 0.19 + 0.08;
    S.code(s, { x: 0.6, y: ty, w: 8.8, h, size: 9, label: q, lines, name: `tr-c-${i}` });
    ty += h + 0.07;
  });
  num(s);

  // ================================================================ B. EVALS (40 min with the break)
  // ---------------------------------------------------------------- B divider
  s = S.darkSlide(deck, { section: "Evals", icon: I.trophyG, kicker: "PART B  ·  ABOUT 35 MINUTES", title1: "Evals:", title2: "write the answer down first",
    subtitle: "A list of questions, the right answer to each, written before anything runs. Then a script keeps score.",
    footer: "the router, measured  ·  the search, measured  ·  the average lies",
    notes: `Time: 30 seconds. Clock check: about 0:29. Read the chat.
Say: "An eval is simple: a list of questions, and for each one, the right answer, written by a person BEFORE anything runs. Then a script runs the system on every question and counts. We'll do it twice: first for the router, then for the search."` });
  num(s, true);

  // ---------------------------------------------------------------- B1 an eval: question + label + is_right
  s = S.contentSlide(deck, {
    section: "Evals", title: "An eval: a question, and its answer written first",
    subtitle: "shared/golden/golden_routes.json: 23 questions, each with the route a person would give it.",
    takeaway: "A golden set plus a function that says right or wrong. That's all an eval is.",
    notes: `Time: 3 minutes. Left, the labels; right, the function that compares.
Left: "Three real rows. R05: a list, office Remote. R12: pointwise, the deploy contact. R21: unindexed. A person wrote these before either router ran. Some are on purpose the rules' known failures."
Right: "is_right() in route_eval.py. The route must match. And for a list, the filters must match exactly: 'every engineer' is not 'every engineer in New York'."
Bottom: "R05 through both routers: the rules say pointwise, wrong. The model says aggregation, office Remote, right."
"That's the whole idea. Everything else tonight is this, with more columns."`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 4.6, h: 2.1, label: "shared/golden/golden_routes.json  (3 of 23)", size: 9.5, lines: [
    "{\"id\": \"R05\", \"question\": \"Show me all remote staff\",",
    " \"route\": \"aggregation\",",
    " \"filters\": {\"office\": [\"Remote\"]}},",
    "{\"id\": \"R12\", \"question\": \"Who do I talk to on the",
    "  Engineering team about a deploy?\", \"route\": \"pointwise\"},",
    "{\"id\": \"R21\", \"question\": \"Who speaks Spanish?\",",
    " \"route\": \"aggregation_unindexed\"}"] });
  S.code(s, { x: 5.4, y: 1.55, w: 4.0, h: 2.1, label: "route_eval.py", size: 9.5, lines: [
    "def is_right(q, plan):",
    "    if plan.route != q[\"route\"]:",
    "        return False",
    "    if q[\"route\"] != AGGREGATION:",
    "        return True",
    "    return plan.filters == q[\"filters\"]",
    "    # (each list sorted first)"] });
  S.table(s, { x: 0.6, y: 3.85, cols: [3.3, 2.1, 3.4], rowH: 0.36, headH: 0.3, size: 10.5, headSize: 10,
    header: ["R05 \"Show me all remote staff\"", "expected", "said"],
    rows: [[{ text: "rules", b: true }, { text: "aggregation office=Remote", font: "Consolas", size: 9 }, { text: "pointwise  →  WRONG", font: "Consolas", size: 9.5, b: true, color: C.redText }],
      [{ text: "model", b: true }, { text: "aggregation office=Remote", font: "Consolas", size: 9 }, { text: "aggregation office=Remote  →  ok", font: "Consolas", size: 9.5, b: true, color: C.deep }]] });
  num(s);

  // ---------------------------------------------------------------- B2 Live: route_eval.py
  s = S.liveSlide(deck, { section: "Evals", icon: I.terminalG, kicker: "LIVE  ·  THE ROUTER, MEASURED", title1: "route_eval.py", title2: "is each question on the right path?",
    steps: ["Run it: 23 labelled questions, the rules and the model side by side",
      "The rules' column: 11 of 23, and how each miss was wrong",
      "The model's column: 23 of 23, one model call per question",
      "No database needed; the model's answers are cached, so the second run is instant"],
    command: "python checkpoints/03-retrieval/route_eval.py --details",
    notes: `Time: 3 minutes. Clock check: about 0:33.
Step 1: no database needed; the directory is read from the CSV. The model's answers are cached in runs/llm_cache.json.
Step 2: scroll to the bottom line for the rules: "11 of 23: 5 lists sent to search, 4 passages turned into lists, 2 unindexed mixed up, 1 wrong filter."
Step 3: the model gets all 23. On 15 Nov it missed R22 ("Who joined the company this year?": said pointwise); the record-set prompt of 16 Nov gets it right. That's the point of the set: change the prompt, run it again, and you KNOW whether it got better or worse.
No model on this machine: run with --router rules, then show the next slide. Fallback: instructor-notes/fallbacks/part3/route-eval-class.txt (15 Nov, the older prompt: 22/23).` });
  num(s, true);

  // ---------------------------------------------------------------- B3 What you should see: the router, measured
  s = S.contentSlide(deck, {
    section: "Evals", title: "What you should see: the router, measured",
    subtitle: "23 labelled questions. Right means the route, and for a list, exactly the right filters.",
    takeaway: "Now it's a decision with numbers: 11 right for free, or 23 right for one model call per question.",
    notes: `Time: 3 minutes. Left, the two scores and the price; middle, how the misses were wrong; right, the one the model missed.
"Rules: 11, free. The model: 23, one call before every search, a median 1.4 seconds here. Quality, then cost: that's how you decide."
"Look at the kinds of miss. The rules make both expensive mistakes: lists sent to search, passages turned into lists. The model makes neither."
Right: "On 15 Nov the model got 22: it called R22, 'Who joined the company this year?', pointwise. On 16 Nov the prompt changed for a different reason, to describe record sets instead of only the directory, and R22 came right. We know because we ran the set again. Every prompt change gets the same treatment: run the set, compare."
"And the rule that goes with it: never edit the prompt to fix ONE labelled question. Tune to the set and the set stops measuring anything. Add questions instead."
Numbers: route_eval.py, gpt-4.1-mini, 16 Nov (23/23); 15 Nov in fallbacks/part3/route-eval-class.txt (22/23); 1.4 s is the median of the 23 calls.`,
  });
  const score2 = [["rules", "11 / 23", "no model · about 0 ms", C.redText, C.white, C.line], ["model", "23 / 23", "1 call · median 1.4 s", C.deep, C.pale, C.deep]];
  score2.forEach(([k, v, d, col, fill, line], i) => {
    const y = 1.55 + i * 1.35;
    s.rect({ x: 0.6, y, w: 2.5, h: 1.2, fill, line, name: `re-s-${i}` });
    s.text([[{ text: k, b: true, size: 11, color: C.gray }], [{ text: v, b: true, size: 26, color: col, font: "Arial" }], [{ text: d, size: 10, color: C.slate }]],
      { x: 0.75, y, w: 2.3, h: 1.2, valign: "middle", paraSpace: 1, name: `re-s-t-${i}` });
  });
  S.table(s, { x: 3.3, y: 1.55, cols: [2.2, 0.6, 0.6], rowH: 0.47, headH: 0.32, size: 10.5, headSize: 10, align: "center",
    header: ["How the misses were wrong", "rules", "model"],
    rows: [["a list sent to search", { text: "5", b: true, color: C.redText }, { text: "0", b: true, color: C.deep }],
      ["a passage turned into a list", { text: "4", b: true, color: C.redText }, { text: "0", b: true, color: C.deep }],
      ["unindexed mixed up", { text: "2", b: true, color: C.redText }, { text: "0", b: true, color: C.deep }],
      ["a list, wrong filters", { text: "1", b: true, color: C.redText }, { text: "0", b: true, color: C.deep }]] });
  s.rect({ x: 7.0, y: 1.55, w: 2.4, h: 2.2, fill: C.amberSoft, line: C.amber, name: "re-r22" });
  s.text([[{ text: "15 NOV → 16 NOV  ·  R22", b: true, size: 8.5, color: C.amberDeep, charSpacing: 0.5 }],
    [{ text: "\"Who joined the company this year?\"", b: true, i: true, size: 10.5, color: C.dark }],
    [{ text: "15 Nov: pointwise (22/23)", size: 9.5, font: "Consolas", color: C.redText }],
    [{ text: "16 Nov: unindexed (23/23)", size: 9.5, font: "Consolas", color: C.deep }],
    [{ text: "The prompt changed for record sets; the set showed R22 came right, and nothing broke.", size: 9.5, color: C.dark }]],
    { x: 7.1, y: 1.6, w: 2.2, h: 2.1, valign: "top", paraSpace: 4, name: "re-r22-t" });
  s.text([[{ text: "Frozen: ", b: true, color: C.dark }, { text: "never edit the prompt to fix one labelled question. Add questions instead.", color: C.slate }]],
    { x: 0.6, y: 4.35, w: 8.8, h: 0.32, size: 10.5, name: "re-frozen" });
  source(s, ROUTE_SRC, 4.72);
  num(s);

  // ---------------------------------------------------------------- B3a LIVE: build the tickets
  s = S.liveSlide(deck, { section: "Evals", icon: I.terminalG, kicker: "LIVE BUILD  ·  ABOUT 8 MINUTES", title1: "Make the tickets", title2: "listable, test first",
    steps: ["routed: \"How many tickets did Maria Garcia report?\": no record set holds 'tickets'",
      "golden_routes.json: label R24, R25 (IT-HELPDESK-EXPORT); route_eval.py: 23/25",
      "router.py: one ROUTABLE entry, filter reporter; route_eval.py: 25/25",
      "Restart the app; routed again: router lookup, 1 record: IT-4101"],
    command: "python checkpoints/03-retrieval/route_eval.py --misses",
    notes: `Time: 8 minutes. Clock check: about 0:39. The full script, with every real output and the fixes: instructor-notes/fallbacks/part3/solutions/tickets-routable.md.
Step 1: Search tab, routed, as the intern. The trace: "route: aggregation_unindexed: no record set holds 'tickets' -> searched instead, logged". Ask "Which tickets did James Wilson open?" too, then route_eval.py --misses: "2 tickets (no record set)", "1 language (PEOPLE-DIRECTORY)". "Language is a column HR doesn't keep. Tickets are a whole kind of record. And they're already in Postgres": db-tour.sql section 7, five rows with fields, the contact redacted.
Step 2: the test first. Two labelled questions, written before the change. Run it: both WRONG, "unindexed (tickets)". "That's the bar."
Step 3: one entry. Say out loud why only reporter: it groups tickets. ticket_id points at one ticket (pointwise), summary and resolution are free text (search), contact is redacted, opened is a date and "in October" is a range. Run it: 25/25. "The rules didn't move: they only ever knew the directory. No prompt edit, no SQL, no migration."
Step 4: RESTART the app: on this machine the auto-reload says "Reloading" and keeps the old code. Then the trace: "router lookup: IT-HELPDESK-EXPORT where fields->>'reporter' in ['Maria Garcia']", one record. The Examples tab has the row "Live build: tickets".
Undo after class: git checkout -- checkpoints/03-retrieval/app/rag/router.py shared/golden/golden_routes.json` });
  num(s, true);

  // ---------------------------------------------------------------- B3b What you should see: the tickets
  s = S.contentSlide(deck, {
    section: "Evals", title: "What you should see: 25 of 25",
    subtitle: "The labels came first and failed. One ROUTABLE entry later, the same set passes, and the app lists tickets.",
    takeaway: "Stored is not listable: the sync keeps every column; one line of code decides what may be listed, and by what.",
    notes: `Time: 2 minutes. Left, the change; right, the measurement before and after; bottom right, the trace.
"Four lines of JSON and three lines of Python. Everything else, the menu, the check, the SQL lookup, the access filter, already read ROUTABLE and chunks.fields."
"And the order matters: the two questions were written before the change, and failed. Write the questions after, and you write the ones that pass."
Numbers: route_eval.py, gpt-4.1-mini, 16 Nov rehearsal (instructor-notes/fallbacks/part3/solutions/tickets-routable.md).`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 4.5, h: 1.6, label: "app/rag/router.py  ·  the change", size: 9, lines: [
    "ROUTABLE = {",
    "  \"PEOPLE-DIRECTORY\": {...},",
    { text: "  \"IT-HELPDESK-EXPORT\": {", color: C.green },
    { text: "    \"about\": \"IT helpdesk tickets, one row per ticket\",", color: C.green },
    { text: "    \"filters\": (\"reporter\",)},", color: C.green },
    "}"] });
  S.code(s, { x: 0.6, y: 3.3, w: 4.5, h: 1.15, label: "shared/golden/golden_routes.json  ·  written first", size: 8.5, lines: [
    "{\"id\": \"R24\", \"question\": \"How many tickets did Maria",
    "  Garcia report?\", \"route\": \"aggregation\", \"source\":",
    "  \"IT-HELPDESK-EXPORT\", \"filters\": {\"reporter\": [...]}}"] });
  S.table(s, { x: 5.3, y: 1.55, cols: [1.1, 1.5, 1.5], rowH: 0.45, headH: 0.32, size: 10, headSize: 9.5, align: "center",
    header: ["", "before", "after"],
    rows: [[{ text: "R24, R25", b: true }, { text: "unindexed (tickets)", color: C.redText, size: 9 }, { text: "ok", b: true, color: C.deep }],
      [{ text: "model", b: true }, { text: "23 / 25", b: true, color: C.redText }, { text: "25 / 25", b: true, color: C.deep }],
      [{ text: "rules", b: true }, { text: "11 / 25", color: C.slate }, { text: "11 / 25", color: C.slate }],
      [{ text: "tests", b: true }, { text: "43 pass", color: C.slate }, { text: "43 pass", color: C.slate }]] });
  S.code(s, { x: 5.3, y: 3.75, w: 4.1, h: 0.7, size: 7.5, lines: [
    "route: aggregation on {'reporter': ['Maria Garcia']} -> 1 record",
    "router lookup: IT-HELPDESK-EXPORT where fields->>'reporter' ..."] });
  source(s, "route_eval.py · gpt-4.1-mini · 16 Nov rehearsal · instructor-notes/fallbacks/part3/solutions/tickets-routable.md", 4.72);
  num(s);

  // ---------------------------------------------------------------- B4 Same idea for the search: S09
  s = S.contentSlide(deck, {
    section: "Evals", title: "The search: what must the results hold?",
    subtitle: "shared/golden/golden_scenarios.json: 28 questions. One of them, exactly as stored:",
    takeaway: "needs score the search: context recall and precision. facts score the answer: correctness, in Part C. No judge for either.",
    notes: `Time: 3 minutes. Walk the JSON top to bottom, one pill at a time.
"scenario: the kind of question, here 'buried': one sentence inside a section about something else. user: who asks. Every question is asked as its own person's real account, through the same access filter as the app."
"needs: what the search results must contain. One need here: the Engineering Handbook, and the words 'two reviewers'. A two-document question has two needs."
"facts: what a correct ANSWER must say. 'two' or '2'. We use these in Part C."
"Both checks are string matching against what a person wrote. No model judges anything, so it costs nothing and gives the same result every run."
"The names we'll use next are RAGAS's, the standard library for RAG evals: needs give context recall and precision, facts give answer correctness."`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 5.6, h: 3.35, label: "QUESTION S09", size: 11, lines: [
    "{\"id\": \"S09\", \"scenario\": \"buried\", \"user\": \"intern\",",
    " \"question\": \"How many reviewers does a change",
    "              to the billing code need?\",",
    { text: " \"needs\": [{\"doc\": \"ENG-HANDBOOK\",", color: C.green },
    { text: "            \"evidence\": [\"two reviewers\"]}],", color: C.green },
    " \"facts\": [[\"two\", \"2\"]],",
    " \"answer\": \"Two: changes that touch billing or",
    "            authentication need two reviewers.\"}"] });
  const parts14 = [["user", "asked as this person's real account, inside the access filter"], ["needs", "what the RESULTS must hold: context recall and precision"], ["facts", "what the ANSWER must say: answer correctness (Part C)"], ["answer", "for people reading the set; never scored"]];
  parts14.forEach(([k, d], i) => {
    const y = 1.55 + i * 0.84;
    pill(s, { x: 6.4, y: y + 0.05, w: 0.95, h: 0.32, text: k, size: 11, fill: k === "needs" ? C.greenSoft : C.pale, name: `oq-k-${i}` });
    s.text(d, { x: 7.45, y, w: 1.95, h: 0.74, size: 10.5, color: C.slate, valign: "top", name: `oq-d-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- B5 scoring one question, worked
  s = S.contentSlide(deck, {
    section: "Evals", title: "Scoring one question: S09, two numbers",
    subtitle: "Which chunks are from ENG-HANDBOOK and hold \"two reviewers\"? Those are the useful ones.",
    takeaway: "Context recall: did what the answer needs arrive? Context precision: how near the top? The scoreboard averages these.",
    notes: `Time: 4 minutes. This is the slide that makes the metrics click. Go row by row.
dense: "Coding standards, expense policy, FAQ. No handbook chunk with 'two reviewers' anywhere in the top 5. Recall 0: the fact never arrived. Precision 0."
keyword: "The handbook first: 'billing' and 'reviewers' are rare words. Recall 1, and it's at the top: precision 1."
hybrid: "Coding standards first, the handbook second. Recall 1: it arrived. Precision one half: useful at #2."
"Two questions, in this order. Did it arrive? Then: how high? A fact at #5 still reaches the model. A fact that never arrives can't be fixed by any prompt."
Right, the code: "meets() is the whole check: the right document, and every evidence word in the chunk, ignoring case and punctuation. Recall counts the needs met. Precision is RAGAS's formula: for each useful chunk, the share of useful chunks down to it, averaged. With one useful chunk, that's 1 over its position."
"Now do this for 28 questions and average by kind. That's the scoreboard."
Data: scoreboard.py --details, S09, 16 Nov.`,
  });
  const s09 = [["dense", ["ENG-CODING", "FIN-EXP-2026", "COMPANY-FAQ"], -1, "0", "0"],
    ["keyword", ["ENG-HANDBOOK", "ENG-CODING", "ENG-CODING"], 0, "1", "1"],
    ["hybrid", ["ENG-CODING", "ENG-HANDBOOK", "FIN-EXP-2026"], 1, "1", "0.5"]];
  S.table(s, { x: 0.6, y: 1.55, cols: [0.85, 1.2, 1.2, 1.2, 0.65, 0.8], rowH: 0.5, headH: 0.32, size: 9, headSize: 9.5, align: "center",
    header: ["", "#1", "#2", "#3", "recall", "precision"],
    rows: s09.map(([k, docs, hit, recall, precision]) => [{ text: k, b: true, size: 11, color: C.dark },
      ...docs.map((d, i) => (i === hit ? { text: d, b: true, color: C.deep, fill: C.greenSoft, font: "Consolas", size: 8.5 } : { text: d, color: C.gray, font: "Consolas", size: 8.5 })),
      { text: recall, b: true, size: 11, color: recall === "0" ? C.redText : C.deep }, { text: precision, b: true, size: 11, color: precision === "0" ? C.redText : C.deep }]) });
  s.text([[{ text: "green: ", b: true, color: C.deep }, { text: "useful: from ENG-HANDBOOK, holding \"two reviewers\"", color: C.slate }]], { x: 0.6, y: 3.45, w: 5.9, h: 0.3, size: 10.5, name: "s09-key" });
  s.text([[{ text: "recall: ", b: true, color: C.dark }, { text: "needs met / needs.  ", color: C.slate }, { text: "precision: ", b: true, color: C.dark }, { text: "useful at #1 = 1, at #2 = 0.5, never = 0.", color: C.slate }]],
    { x: 0.6, y: 3.8, w: 5.9, h: 0.3, size: 10.5, name: "s09-def" });
  S.code(s, { x: 6.6, y: 1.55, w: 2.8, h: 3.35, label: "app/evals/scoreboard.py", size: 8.5, lines: [
    "def meets(chunk, need):",
    "    if chunk[\"doc_id\"] != need[\"doc\"]:",
    "        return False",
    "    have = words(chunk[\"text\"])",
    "    return all(words(e) in have",
    "        for e in need[\"evidence\"])",
    "",
    "recall = needs met in top 5 / needs",
    "useful = [meets(c, any need)",
    "          for c in top 5]",
    "precision = mean, over useful ranks i,",
    "    of useful-so-far / i     # RAGAS"] });
  num(s);

  // ---------------------------------------------------------------- B6 four numbers
  s = S.contentSlide(deck, {
    section: "Evals", title: "Four numbers, in plain words",
    subtitle: "Two grade the search, two the answer. RAGAS's names; only faithfulness needs a judge.",
    takeaway: "Search first: if the facts never arrive, no prompt can fix the answer. Plus two guards: calm, and leaks at 0.",
    notes: `Time: 3 minutes. Read the question column only.
"Context recall: did search bring everything the answer needs? Context precision: was it near the top? Those two grade the search, from the needs."
"Faithfulness: does the answer stick to what it was given? Answer correctness: is it right? Those two grade the answer, in Part C. Faithfulness needs an LLM judge: it splits the answer into claims and checks each one against the context. Correctness doesn't: it uses the facts a person wrote."
"Two guards. Calm, for questions nothing answers: does the search avoid looking sure of itself? And leaks: questions where any result came from a document this person may not read. Zero, for every technique, always. A leak disqualifies."
"If you've used RAGAS: same names, same ideas. Ours compare against a hand-written key, so three of the four need no model and give the same answer every run."
Asked about Hit@1, MRR, doc@5: "Still there, one level down: scoreboard.py --more, and the reference slide. Recall and precision are the two you start with."
The red line: "S13, 'what do I need to do in my first week?': keyword brings the onboarding checklist, but not the chunk with the Week 1 items. Recall 0. Part 2's old number, 'right document in the top 5', said yes."`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [0.85, 1.95, 4.2, 1.8], rowH: 0.4, headH: 0.32, size: 11, headSize: 10.5,
    header: ["", "Number", "The question it answers", "Graded with"],
    rows: [[{ text: "search", b: true, color: C.deep, size: 9.5 }, { text: "context recall", b: true, color: C.deep }, "did search bring everything the answer needs?", "the key's needs"],
      [{ text: "search", b: true, color: C.deep, size: 9.5 }, { text: "context precision", b: true, color: C.deep }, "was the useful material near the top?", "the key's needs"],
      [{ text: "answer", b: true, color: C.amberDeep, size: 9.5 }, { text: "faithfulness", b: true, color: C.amberDeep }, "does the answer stick to what it was given?", { text: "an LLM judge", b: true }],
      [{ text: "answer", b: true, color: C.amberDeep, size: 9.5 }, { text: "answer correctness", b: true, color: C.amberDeep }, "is the answer actually right?", "the key's facts"],
      [{ text: "guard", b: true, color: C.gray, size: 9.5 }, { text: "calm", b: true }, "nothing answers it: does the search avoid looking sure?", "distances"],
      [{ text: "guard", b: true, color: C.redText, size: 9.5 }, { text: "leaks", b: true, color: C.redText }, "did anyone get a document they may not read?", { text: "0, always", b: true, color: C.redText }]] });
  s.text([[{ text: "Right document, wrong piece: ", b: true, color: C.redText }, { text: "S13 \"What do I need to do in my first week?\", keyword: the onboarding checklist, not the Week 1 chunk. Recall 0.", color: C.slate }]],
    { x: 0.6, y: 4.35, w: 8.8, h: 0.45, size: 10.5, name: "tk-ex" });
  num(s);

  // ---------------------------------------------------------------- B7 seven kinds
  s = S.contentSlide(deck, {
    section: "Evals", title: "Seven kinds of question, built to disagree",
    subtitle: "28 questions, 4 of each kind, written from the documents before any technique ran on them.",
    takeaway: "If every question were easy, every technique would score 1.00 and the scoreboard would teach nothing.",
    notes: `Time: 3 minutes. One row each, read the example.
casual: "everyday words, not the document's." identifier: "an exact ticket id." buried: "one sentence in a section about something else." whole-section: "the answer is a whole list." lost-context: "the words that place the answer are in the heading: 'week 4' is only in the heading." two-docs: "core hours from one policy, the allowance from another: one chunk can't hold both." unanswerable: "the intern asking for the salary bands, which they may not read. The right answer is 'I don't know', and zero leaks."
"Why build it like this? Each kind is a known weakness of some technique. A set of easy questions makes everything look perfect."`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.55, 3.15, 4.1], rowH: 0.43, headH: 0.32, size: 10.5, headSize: 10,
    header: ["Kind", "What makes it hard", "Example (asked as)"],
    rows: [[{ text: "casual", b: true }, "everyday words, not the document's", { text: "\"How fast do I need to get back to people on chat?\" (intern)", i: true }],
      [{ text: "identifier", b: true }, "an exact id, code or name", { text: "\"How was IT-4112 resolved?\" (intern)", i: true }],
      [{ text: "buried", b: true }, "one sentence in a section about something else", { text: "\"How many reviewers does a change to the billing code need?\"", i: true }],
      [{ text: "whole-section", b: true }, "the answer is a whole list", { text: "\"What do I need to do in my first week?\" (intern)", i: true }],
      [{ text: "lost-context", b: true }, "the placing words are in the heading", { text: "\"What is on my onboarding list for week 4?\" (intern)", i: true }],
      [{ text: "two-docs", b: true }, "the answer needs two documents", { text: "\"…core hours, and the home office setup allowance?\" (intern)", i: true }],
      [{ text: "unanswerable", b: true }, "nothing this person may read answers it", { text: "\"Salary range for a senior developer?\" (intern)", i: true }]] });
  num(s);

  // ---------------------------------------------------------------- B8 freeze it and lint it
  s = S.contentSlide(deck, {
    section: "Evals", title: "Freeze it, and lint it",
    subtitle: "A question set that quietly rots measures the wrong thing, with confidence.",
    takeaway: "Never edit a question because a technique missed it. A test checks every evidence word is really in its document.",
    notes: `Time: 3 minutes. Clock check: about 0:52.
Left, the rules: "Written from the documents before any technique ran. Frozen: you never edit a question because a technique missed it. That's how a test set turns into a mirror of whatever you shipped. You may ADD questions: that's tonight's exercise. Same rule as the router's set."
Right, the lint: "tests/test_scoreboard.py checks three things for every need: the document is current, the person asking may read it, and every evidence word is really in it. If HR edits a policy and the words move, this test fails before the scoreboard lies."
"It runs in under a second, no Postgres, no model. The router's set has the same kind of lint in tests/test_router_llm.py: every filter value must exist in the directory."`,
  });
  const fr = [["Written first", "from the documents, before any technique ran on them", I.pen], ["Frozen", "never edited because a technique missed; add, don't edit", I.snow], ["Linted", "a test checks every need against Monday's documents", I.yes]];
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

  // ---------------------------------------------------------------- Break
  s = S.darkSlide(deck, { section: "Evals", icon: I.coffee, kicker: "BREAK  ·  10 MINUTES", title1: "Break", title2: "then the scoreboard, live",
    subtitle: "Pull the repo if you haven't: the commands are on the reference slide \"Commands\".",
    footer: "back at about 1:05",
    notes: `Time: 10 minutes. Clock check: about 0:55.
During the break: run scoreboard.py once in the terminal so the embedder is warm. Read the chat and answer what's there.
After the break, say the three ideas again.` });
  num(s, true);

  // ---------------------------------------------------------------- B9 Live: scoreboard.py
  s = S.liveSlide(deck, { section: "Evals", icon: I.terminalG, kicker: "LIVE  ·  THE SCOREBOARD", title1: "scoreboard.py", title2: "one table per kind of question",
    steps: ["Run it: 28 questions × 3 techniques, each as its own person, a few seconds",
      "Read one table: buried. Recall first: keyword finds S09 at #1, but misses another question entirely",
      "Read \"Who wins what\": one winner per kind, and the average line under it",
      "Last line: leaks, every technique, every question: 0"],
    command: "python checkpoints/03-retrieval/scoreboard.py --strategies dense,keyword,hybrid",
    notes: `Time: 5 minutes. Clock check: about 1:05. Say the three ideas again first.
Run it in the repo root. It prints seven tables, then "Who wins what", then the leaks line.
Each table now shows context recall and precision, then cost and leaks. (--more adds Hit@1, Hit@5, MRR and doc@5.)
Step 2: the buried table: keyword and hybrid both 0.75 precision, but keyword's recall is 0.75: for one question the fact never arrived. Hybrid's recall is 1.00, so hybrid wins. "Recall first: a fact that never arrives can't be ranked."
Step 3: "Who wins what": dense, hybrid, hybrid, dense, hybrid, hybrid, and the unanswerable ones a tie (speed breaks it; read it as a tie).
Step 4: the leaks line: 0. "28 questions, and the intern never once got the salary bands."
--details prints every question, every technique: its recall and precision, and where it was ready. Fallback: instructor-notes/fallbacks/part3/scoreboard-local.txt (the same run, more rows).` });
  num(s, true);

  // ---------------------------------------------------------------- B10 What you should see: the grid
  s = S.contentSlide(deck, {
    section: "Evals", title: "What you should see: context precision by kind",
    subtitle: "28 questions, top 5, as each question's own person. Green: the winner of that row. (r …): recall below 1.",
    takeaway: "Every technique has a row it loses badly. Recall decides first: two-docs goes to hybrid, though keyword ranks higher.",
    notes: `Time: 4 minutes. Go row by row, quickly; the next slide is the point. Most cells have recall 1.00: the facts arrived, and precision says how high. Where a fact never arrived, the cell shows (r …) in red.
casual: dense 0.88; keyword 0.06, recall 0.25: everyday words aren't the document's words, so three of four facts never arrive.
identifier: hybrid 0.88, keyword 0.81, dense 0.65 on ticket ids.
buried: keyword and hybrid 0.75, but keyword's recall is 0.75. Hybrid wins on recall.
whole-section: dense 0.71; keyword 0.31 with recall 0.75.
lost-context: hybrid 0.75.
two-docs: keyword has the best precision, 0.92, but recall 0.88: for one question, one of the two documents never arrived. "Ranking well what you found doesn't help if you didn't find it all." Hybrid wins.
unanswerable (calm): 0.75 for all: three of four calm. S27 is the one that isn't (Part C).`,
  });
  const g = [["casual", "0.88", "0.06 (r 0.25)", "0.34", 0],
    ["identifier", "0.65", "0.81", "0.88", 2],
    ["buried", "0.58 (r 0.75)", "0.75 (r 0.75)", "0.75", 2],
    ["whole-section", "0.71", "0.31 (r 0.75)", "0.54", 0],
    ["lost-context", "0.58", "0.56", "0.75", 2],
    ["two-docs", "0.77", "0.92 (r 0.88)", "0.83", 2],
    ["unanswerable (calm)", "0.75", "0.75", "0.75", -1]];
  S.table(s, { x: 0.6, y: 1.55, cols: [2.4, 1.7, 1.7, 1.7, 1.3], rowH: 0.37, headH: 0.32, size: 11.5, align: "center",
    header: ["Kind of question", "dense", "keyword", "hybrid", "winner"],
    rows: g.map(([k, a, b, c, win]) => {
      const vals = [a, b, c];
      return [{ text: k, b: true, color: C.dark }, ...vals.map((v, i) =>
        (i === win ? { text: v, b: true, color: C.deep, fill: C.greenSoft } : { text: v, color: v.includes("(r") ? C.redText : C.slate })),
      { text: win < 0 ? "a tie" : ["dense", "keyword", "hybrid"][win], b: true, color: win < 0 ? C.gray : C.deep }];
    }) });
  source(s, "local MiniLM embeddings, Monday's documents, 16 Nov · scoreboard.py · winner: recall first, then precision, then cost", 4.55);
  num(s);

  // ---------------------------------------------------------------- B11 the average lies
  s = S.contentSlide(deck, {
    section: "Evals", title: "The average lies",
    subtitle: "Context precision over every answerable question, the number you'd put on a slide. Then who wins each kind.",
    takeaway: "\"Which search is best?\" has no answer. \"Which is best for the questions my users ask?\" does.",
    notes: `Time: 3 minutes. The second big idea, with our numbers.
Left: "Average context precision over all 24 answerable questions. Dense wins: 0.69, hybrid 0.68. If that's the only number you look at, you ship dense and you're done."
"Under it, the other average: recall. Hybrid 1.00: for every single question, everything the answer needed arrived. Dense 0.96. The precision average hides that."
Right: "Now by kind. Hybrid wins four kinds: ids, buried, lost context, two documents. Dense wins two: casual and whole-section. Keyword wins none outright, yet it's the best ranker on two-docs."
"So the average picks the technique that's never terrible and rarely best. If your users ask about ticket ids all day, the average just told you the wrong thing. Know what your users ask, then read that table."
"And that's idea two."`,
  });
  const avg = [["dense", 0.69], ["hybrid", 0.68], ["keyword", 0.57]];
  s.text("Context precision, all 24 answerable questions", { x: 0.6, y: 1.55, w: 4.3, h: 0.3, size: 11, bold: true, color: C.dark, name: "avg-h" });
  avg.forEach(([k, v], i) => {
    const y = 2.0 + i * 0.62;
    s.text(k, { x: 0.6, y, w: 0.95, h: 0.45, size: 13, bold: i === 0, color: C.dark, valign: "middle", name: `avg-k-${i}` });
    s.rect({ x: 1.6, y: y + 0.08, w: v * 3.8, h: 0.3, fill: i === 0 ? C.deep : C.line, name: `avg-bar-${i}` });
    s.text(v.toFixed(2), { x: 1.65 + v * 3.8, y, w: 0.6, h: 0.45, size: 12, font: "Consolas", color: C.slate, valign: "middle", name: `avg-v-${i}` });
  });
  s.text([[{ text: "the average says: ship dense", b: true, color: C.deep }],
    [{ text: "recall, same questions: hybrid 1.00 · dense 0.96 · keyword 0.77", color: C.slate, size: 10.5 }]],
    { x: 0.6, y: 3.95, w: 4.3, h: 0.6, size: 11.5, paraSpace: 2, name: "avg-says" });
  s.rect({ x: 5.05, y: 1.55, w: 4.35, h: 3.3, fill: C.white, line: C.line, name: "win-box" });
  s.text("Who wins each kind", { x: 5.25, y: 1.6, w: 4, h: 0.35, size: 11, bold: true, color: C.dark, name: "win-h" });
  const wins = [["casual", "dense"], ["identifier", "hybrid"], ["buried", "hybrid"], ["whole-section", "dense"], ["lost-context", "hybrid"], ["two-docs", "hybrid"], ["unanswerable", "a tie"]];
  wins.forEach(([k, w], i) => {
    const y = 2.0 + i * 0.39;
    s.text(k, { x: 5.25, y, w: 1.9, h: 0.34, size: 11, color: C.slate, valign: "middle", name: `win-k-${i}` });
    pill(s, { x: 7.2, y: y + 0.02, w: 1.4, h: 0.3, text: w, size: 10.5, fill: w === "hybrid" ? C.greenSoft : C.soft, color: w === "hybrid" ? C.deep : C.dark, name: `win-w-${i}` });
  });
  source(s, "local MiniLM, Monday's documents, 16 Nov · scoreboard.py", 4.6);
  num(s);

  // ================================================================ C. CORRECT, NOT ONLY FAITHFUL (10 min)
  // ---------------------------------------------------------------- C divider
  s = S.darkSlide(deck, { section: "Correct", icon: I.checkG, kicker: "PART C  ·  ABOUT 10 MINUTES", title1: "Correct,", title2: "not only faithful",
    subtitle: "An answer can stick to its context perfectly, and still be wrong.",
    footer: "faithful and wrong  ·  answers.py  ·  sure of itself",
    notes: `Time: 30 seconds. Clock check: about 1:17. Read the chat.
Say: "So far we scored the search. Now the answer, because that's what the person reads."` });
  num(s, true);

  // ---------------------------------------------------------------- C1 S20
  s = S.contentSlide(deck, {
    section: "Correct", title: "Faithful, and wrong",
    subtitle: "S20, as the intern: \"How many days of unused vacation can I carry over now?\"",
    takeaway: "Every technique ranks the stale copy first. An answer from it is 100% faithful to its context, and wrong.",
    notes: `Time: 3 minutes.
"On Monday HR edited the leave policy: carry-over went from 5 to 10 days. The FAQ quotes the old policy, and nobody updated it. Both are current documents."
"Dense, top 2: the FAQ first, 0.47, 'up to 5 days'. The leave policy second, 0.81, 'up to a maximum of 10 days'. Keyword and hybrid: the FAQ first too."
"Give the model that context and it may well say '5 days'. Ask a judge 'is this answer faithful to the context?' and it says yes: 5 days is right there. Faithful, and wrong."
"That's why the answer check compares the answer with facts a person wrote down, not with the context."
Numbers: Search tab, dense, intern, 12 Nov.`,
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

  // ---------------------------------------------------------------- C2 answers.py
  s = S.contentSlide(deck, {
    section: "Correct", title: "answers.py: faithful? correct? whose fault?",
    subtitle: "Retrieve as the person, write the answer exactly as POST /query does, then grade it twice.",
    takeaway: "Faithfulness barely moves. Correctness tells them apart. Fix retrieval misses in the search, generation misses in the prompt.",
    notes: `Time: 4 minutes. Left, the two answer numbers and the four verdicts; right, our run.
"Faithfulness, RAGAS's name: an LLM judge splits the answer into claims and checks each against the context the answer was written from. Supported over all. Correctness: every fact a person wrote down is in the answer. No judge."
"Then whose fault, for a wrong answer. Retrieval miss: the context never held the facts; no prompt in the world fixes that: fix the search. Generation miss: the context held every fact and the model still got it wrong: fix the prompt or the model. Made it up: nothing answers it, and it answered anyway."
Right: "Faithfulness: 1.00, 1.00, 0.96. The model sticks to its context almost perfectly, whatever the search. Correctness: 0.93, 0.96, 0.86. The difference is what the search handed over, and faithfulness can't see it."
"S09 with dense: faithfulness 1.00. Every claim, 'at least one reviewer', is in its context, the coding standards. Wrong: the handbook says two."
"Generation misses: zero, for all three. Every wrong answer started in the search. So tonight, the fixes go into the search, not the prompt."
Run: answers.py --strategies dense,hybrid,parent, gpt-4.1-mini, 16 Nov. About 84 judge calls the first time, cached after that; --no-judge skips them.`,
  });
  const am = [["faithfulness", "an LLM judge splits the answer into claims: supported / all", C.amberDeep, C.amberSoft],
    ["answer correctness", "every fact a person wrote is in the answer: no judge", C.deep, C.greenSoft]];
  am.forEach(([t, d, col, fill], i) => {
    const y = 1.55 + i * 0.78;
    s.rect({ x: 0.6, y, w: 4.3, h: 0.68, fill, line: C.line, name: `am-${i}` });
    s.text([[{ text: t, b: true, size: 12.5, color: col }], [{ text: d, size: 10, color: C.slate }]], { x: 0.75, y, w: 4.05, h: 0.68, valign: "middle", paraSpace: 1, name: `am-t-${i}` });
  });
  s.text("A wrong answer: whose fault?", { x: 0.6, y: 3.15, w: 4.3, h: 0.28, size: 10.5, bold: true, color: C.dark, name: "vd-h" });
  const vd = [["retrieval miss", "the facts never arrived: fix the search", C.redText, C.redSoft],
    ["generation miss", "they did: fix the prompt or model", C.amberDeep, C.amberSoft],
    ["made it up", "nothing answers it; answered anyway", C.redText, C.redSoft]];
  vd.forEach(([t, d, col, fill], i) => {
    const y = 3.45 + i * 0.4;
    s.rect({ x: 0.6, y, w: 4.3, h: 0.34, fill, line: C.line, name: `vd-${i}` });
    s.text([[{ text: t + "  ", b: true, size: 10.5, color: col, font: "Consolas" }, { text: d, size: 10, color: C.slate }]], { x: 0.72, y, w: 4.1, h: 0.34, valign: "middle", name: `vd-t-${i}` });
  });
  S.table(s, { x: 5.1, y: 1.55, cols: [1.0, 1.0, 1.0, 0.65, 0.65], rowH: 0.42, headH: 0.32, size: 11, headSize: 9, align: "center",
    header: ["", "faithful", "correct", "retr. miss", "gen. miss"],
    rows: [[{ text: "dense", b: true, color: C.dark }, "1.00", { text: "0.93", b: true }, { text: "1", color: C.redText }, "0"],
      [{ text: "hybrid", b: true, color: C.dark }, "1.00", { text: "0.96", b: true, color: C.deep, fill: C.greenSoft }, "0", "0"],
      [{ text: "parent", b: true, color: C.dark }, "0.96", { text: "0.86", b: true }, { text: "3", color: C.redText }, "0"]] });
  s.rect({ x: 5.1, y: 3.25, w: 4.3, h: 1.3, fill: C.redSoft, line: C.red, name: "fw-box" });
  s.text([[{ text: "S09, dense: faithful 1.00, wrong", b: true, size: 11.5, color: C.redText }],
    [{ text: "\"…every change must be submitted as a pull request with at least one reviewer.\"", i: true, size: 10.5, color: C.ink }],
    [{ text: "True to its context, the coding standards. The handbook says two.", size: 10.5, color: C.slate }]],
    { x: 5.25, y: 3.25, w: 4.05, h: 1.3, valign: "middle", paraSpace: 3, name: "fw-t" });
  s.text("python checkpoints/03-retrieval/answers.py --strategies dense,hybrid,parent    # needs a model; cached", { x: 0.6, y: 4.72, w: 8.8, h: 0.3, size: 10, font: "Consolas", color: C.deep, name: "vd-cmd" });
  num(s);

  // ---------------------------------------------------------------- C3 Sure of itself
  s = S.contentSlide(deck, {
    section: "Correct", title: "Sure of itself, about the wrong question",
    subtitle: "S27, as hr-partner: \"How many weeks of parental leave will primary caregivers get in 2027?\"",
    takeaway: "A distance can tell \"about this topic\". It can't tell \"answers this question\". That's the answer step's job.",
    notes: `Time: 3 minutes. Clock check: about 1:27.
In answers.py (16 Nov), dense, hybrid and parent all answered "16 weeks of paid parental leave in 2027": made it up. The judge still scored it faithfulness 1.00. Say it: "The judge is an LLM too. That's why correctness doesn't use one."
"Only a draft talks about 2027, 24 weeks, and drafts are never indexed. Today's policy says 16 weeks. So the honest answer is: nothing in force covers 2027; today it's 16."
"Dense's best result: the Leave Policy, Parental Leave, 0.50. High confidence: our threshold is 0.8. Keyword and hybrid too. It IS about parental leave. It just doesn't answer 'in 2027'."
"This is the one unanswerable question that wasn't calm on the scoreboard. No retrieval number catches it. The answer step has to read the question and say what's missing. answers.py checks it does."`,
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
  s.text([[{ text: "dense, keyword, hybrid", b: true, size: 14, color: C.amberDeep }], [{ text: "all \"sure of themselves\" on S27", size: 12.5, color: C.dark }],
    [{ text: "about the topic: yes", size: 12, color: C.slate }], [{ text: "answers \"in 2027\": no", size: 12, b: true, color: C.redText }]],
    { x: 6.2, y: 2.3, w: 3.05, h: 2.3, valign: "top", paraSpace: 6, name: "st-all-t" });
  source(s, SRC + " · scoreboard.py --details, S27", 4.8);
  num(s);

  // ================================================================ WRAP (5 min)
  // ---------------------------------------------------------------- three ideas
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Three ideas to take home",
    subtitle: "Each one with tonight's numbers.",
    notes: `Time: 2 minutes. Clock check: about 1:30. One sentence per card, pointing at it.`,
  });
  const ideas2 = [["1", "Decide the shape first", "\"Who works remotely?\" is three rows, not a top 5. Rules: 11 of 23. A model's plan, checked by code: 23. Tickets: one ROUTABLE entry.", I.route],
    ["2", "Write the answer down, then measure", "Dense tops the average by 0.01; hybrid wins four kinds and recalls everything. Leaks: 0.", I.list],
    ["3", "Correct, not only faithful", "\"At least one reviewer\": faithfulness 1.00, and wrong. Tell a retrieval miss from a generation miss.", I.scale]];
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

  // ---------------------------------------------------------------- Tonight
  s = S.contentSlide(deck, {
    section: "Wrap", title: "Tonight",
    subtitle: "About an hour. 1 to 3 need no key.",
    takeaway: "Each exercise ends in something you can show: a broken router, a column, an explanation.",
    notes: `Time: 2 minutes.
Say: "One, everyone: break the rules. Write two route questions you think the rules get wrong, predict first, then run route_eval. Two: read the scoreboard and explain one question where dense and keyword disagree, from the chunks in the Search tab. Three: the price nobody prints, a tokens column; the test is waiting. Four and five are stretch: the missing-column backlog, and the answer check if you have a key."
Exercise 3's solution: instructor-notes/fallbacks/part3/solutions/context_tokens.py (don't share it tonight).`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [0.45, 2.3, 6.05], rowH: 0.56, headH: 0.32, size: 11, headSize: 10.5,
    header: ["", "Exercise", "What you do"],
    rows: [[{ text: "1", b: true, color: C.deep, align: "center" }, { text: "Break the rules", b: true }, "add two questions to golden_routes.json the rules will get wrong, predict first; route_eval.py --router rules"],
      [{ text: "2", b: true, color: C.deep, align: "center" }, { text: "Read the scoreboard", b: true }, "scoreboard.py --strategies dense,keyword,hybrid --details: explain one disagreement from the chunks"],
      [{ text: "3", b: true, color: C.deep, align: "center" }, { text: "The price nobody prints", b: true }, "context_tokens() and a tokens column; the test waits in tests/test_scoreboard.py (remove its skip)"],
      [{ text: "4", b: true, color: C.gray, align: "center" }, { text: "Stretch, with a key", b: true, color: C.gray }, "ask routed three lists the directory can't answer, then route_eval.py --misses: which column first?"],
      [{ text: "5", b: true, color: C.gray, align: "center" }, { text: "Stretch, with a key", b: true, color: C.gray }, "answers.py --strategies dense,hybrid: faithful but wrong? retrieval vs generation misses: fix which first?"]] });
  num(s);

  // ---------------------------------------------------------------- Monday
  s = S.darkSlide(deck, { section: "Wrap", icon: I.shipG, kicker: "MONDAY  ·  PART 4 OF 4", title1: "Ship it,", title2: "behind a gate",
    subtitle: "Guardrails, and evals as a release gate. Tonight's scoreboard is one of them.",
    detail: "scoreboard.py --save-baseline freezes tonight's numbers. Monday's release.py compares every change against them: a change that loses a table, or leaks once, doesn't ship.",
    footer: "Mon 16 Nov",
    notes: `Time: 1 minute. Clock check: about 1:35.
Say: "Tonight we built the measuring stick. Monday it becomes a gate: a change that makes the scoreboard worse, or leaks once, doesn't ship. Plus guardrails on what comes in and goes out, a kill switch, and Docker."
"Pull the repo Monday morning." Read the chat one last time and answer what's there before you end the call.` });
  num(s, true);

  // ================================================================ REFERENCE (for the students' copy; not presented)
  s = S.darkSlide(deck, { section: "Reference", icon: I.book, kicker: "REFERENCE", title1: "For after class",
    subtitle: "Not presented. Read these with the code open.",
    detail: "Where the code is  ·  the metrics, exactly  ·  the winner rule  ·  commands",
    notes: `Not presented. If someone asks a detail question in the chat, jump here.` });
  num(s, true);

  // ---------------------------------------------------------------- R where the code is
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: where the code is",
    subtitle: `Everything tonight, in ${CP}/ and shared/golden/.`,
    notes: `The files behind every slide, in the order the session uses them.`,
  });
  S.table(s, { x: 0.6, y: 1.5, cols: [3.4, 5.4], rowH: 0.3, headH: 0.3, size: 10, headSize: 10,
    header: ["File", "What it does"],
    rows: [[{ text: "THE ROUTER", b: true, color: C.deep, size: 9 }, ""],
      [{ text: "app/rag/router.py", font: "Consolas", size: 9.5 }, "ROUTABLE (what may be listed, by which columns); version 1: the rules"],
      [{ text: "app/rag/router_llm.py", font: "Consolas", size: 9.5 }, "version 2: vocabulary(), ask_model(), check(), plan(), log_miss()"],
      [{ text: "store_pg.py · 007_record_fields.sql", font: "Consolas", size: 9.5 }, "chunks.fields (jsonb); record_menu() and lookup_records(): the SQL"],
      [{ text: "app/rag/retriever.py  ·  _routed()", font: "Consolas", size: 9.5 }, "the routed strategy: lookup, search, or search + log; the prompt: route_question.py"],
      [{ text: "THE EVALS", b: true, color: C.deep, size: 9 }, ""],
      [{ text: "route_eval.py", font: "Consolas", size: 9.5 }, "route accuracy, the rules and the model side by side; --misses"],
      [{ text: "shared/golden/golden_routes.json", font: "Consolas", size: 9.5 }, "23 questions labelled with their route (and a list's filters)"],
      [{ text: "scoreboard.py  ·  app/evals/scoreboard.py", font: "Consolas", size: 9.5 }, "the CLI; meets(), score() (recall, precision), summarize(), winner()"],
      [{ text: "shared/golden/golden_scenarios.json", font: "Consolas", size: 9.5 }, "28 questions in 7 kinds, with needs and facts"],
      [{ text: "answers.py", font: "Consolas", size: 9.5 }, "faithfulness (an LLM judge: app/prompts/faithfulness.py), answer correctness, whose fault"],
      [{ text: "tests/", font: "Consolas", size: 9.5 }, "test_router_llm.py: every guard and fallback · test_scoreboard.py: the metrics, the lint"]] });
  num(s);

  // ---------------------------------------------------------------- R metric definitions
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the metrics, exactly",
    subtitle: "app/evals/scoreboard.py and answers.py. Only faithfulness needs a model.",
    notes: `The banners of app/evals/scoreboard.py and answers.py, as a table. The first four are RAGAS's names.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.75, 7.05], rowH: 0.31, headH: 0.3, size: 9.5, headSize: 10,
    header: ["Term", "Definition"],
    rows: [[{ text: "need / meets", b: true }, "a document + evidence words; a chunk meets it when it's from that document and holds every word (case, punctuation ignored)"],
      [{ text: "context recall", b: true, color: C.deep }, "needs met by the top 5 / needs. 1.00: everything the answer needs arrived"],
      [{ text: "context precision", b: true, color: C.deep }, "RAGAS: the mean, over the ranks i holding a useful chunk (one that meets a need), of useful-so-far / i"],
      [{ text: "faithfulness", b: true, color: C.amberDeep }, "answers.py: an LLM judge splits the answer into claims; claims its context supports / all claims"],
      [{ text: "answer correctness", b: true, color: C.amberDeep }, "answers.py: share of answers holding every fact (or saying \"I don't know\" when nothing answers)"],
      [{ text: "ready, Hit@1, Hit@5", b: true }, "--more: the position where every need is met; ready at 1; ready within 5 (= recall 1.00)"],
      [{ text: "MRR", b: true }, "--more: mean of 1 / ready (0 when never ready)"],
      [{ text: "doc@5", b: true }, "--more: every needed document in the top 5, words or not (Part 2's Hit@5: too kind)"],
      [{ text: "calm", b: true }, "no needs (nothing answers it), and the best distance is above CONFIDENCE_HIGH_THRESHOLD (0.8)"],
      [{ text: "LLM, ms", b: true }, "model calls before the search; wall time, plus the original time of any cached model call"],
      [{ text: "leaks", b: true }, "questions where any result's document is not readable by the asker (app/evals/judge.py)"]] });
  num(s);

  // ---------------------------------------------------------------- R winner rule
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the winner rule",
    subtitle: "scoreboard.py prints a winner per kind of question. This is all it does.",
    notes: `app/evals/scoreboard.py winner(); scoreboard.py print_scenario().`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 5.4, h: 3.0, label: "app/evals/scoreboard.py", size: 10, lines: [
    "def winner(table):",
    "    def key(item):",
    "        name, s = item",
    "        quality = ((s[\"calm\"] or 0, 0) if s[\"hit@1\"] is None",
    "                   else (s[\"recall\"] or 0, s[\"precision\"] or 0))",
    "        return (-quality[0], -quality[1],",
    "                s[\"llm\"] or 0, s[\"ms\"] or 0, name)",
    "    clean = [(n, s) for n, s in table.items()",
    "             if s[\"leaks\"] == 0]          # a leak disqualifies",
    "    return min(clean, key=key)[0] if clean else None"] });
  s.text([[{ text: "Order: ", b: true, color: C.dark }, { text: "context recall (or calm), then context precision, then fewer LLM calls, then faster, then the name." }],
    [{ text: "Ties: ", b: true, color: C.dark }, { text: "on equal quality and cost, speed decides; a 2 ms difference can flip the unanswerable winner between runs. Read it as a tie." }],
    [{ text: "Starred rows: ", b: true, color: C.dark }, { text: "a technique that needed a model and had none fell back to plain search. Its row gets a * and can't win. Tonight's three need no model." }]],
    { x: 6.2, y: 1.55, w: 3.2, h: 3.3, size: 10.5, color: C.slate, paraSpace: 8, valign: "top", name: "wr-t" });
  num(s);

  // ---------------------------------------------------------------- R commands
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the commands",
    subtitle: "From the repository root. Postgres runs in Docker on port 5433.",
    notes: `The same commands as ${CP}/README.md, "Run it".`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 8.8, h: 3.45, label: "TONIGHT", size: 10, lines: [
    { text: "docker compose up -d db", color: C.codeText },
    { text: "python checkpoints/03-retrieval/db.py migrate", color: C.codeText },
    { text: "python checkpoints/03-retrieval/db.py seed                # skip if Part 2's accounts exist", color: C.codeText },
    { text: "python checkpoints/03-retrieval/fake_drive.py reset       # Friday's files (offline)", color: C.codeText },
    { text: "python checkpoints/03-retrieval/fake_drive.py apply all   # Monday: all five events", color: C.codeText },
    { text: "python checkpoints/03-retrieval/sync.py --apply", color: C.codeText },
    { text: "python checkpoints/03-retrieval/route_eval.py --router rules                    # no model, no database", color: C.green },
    { text: "python checkpoints/03-retrieval/scoreboard.py --strategies dense,keyword,hybrid  # no model", color: C.green },
    { text: "python run_checkpoint.py 03-retrieval                     # Search tab: strategy routed", color: C.codeText },
    { text: "", color: C.codeText },
    { text: "python checkpoints/03-retrieval/route_eval.py --details        # needs a model; cached", color: C.mintText },
    { text: "python checkpoints/03-retrieval/answers.py --strategies dense,hybrid   # needs a model; cached", color: C.mintText }] });
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
