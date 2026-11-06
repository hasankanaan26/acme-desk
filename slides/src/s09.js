// s09.js — Session 9: Retrieval You Can Defend (rag-week-bootcamp, checkpoint 6)
const path = require("path");
const { Deck } = require("./kit");
const S = require("./sef");
const { C } = S;
const fa = require("react-icons/fa");

const CP = "checkpoints/checkpoint-6-advanced-retrieval";

async function build() {
  const I = {};
  const want = {
    target: [fa.FaBullseye, C.green], search: [fa.FaSearch, C.green], layers: [fa.FaLayerGroup, C.green], route: [fa.FaRoute, C.green],
    gavel: [fa.FaGavel, C.green], laptop: [fa.FaLaptopCode, C.green], coffee: [fa.FaCoffee, C.green], tasks: [fa.FaTasks, C.green],
    ruler: [fa.FaRulerHorizontal, C.deep], words: [fa.FaFont, C.deep], dice: [fa.FaDiceFive, C.deep], list: [fa.FaListUl, C.deep],
    key: [fa.FaKey, C.deep], brain: [fa.FaBrain, C.deep], sort: [fa.FaSortAmountDown, C.deep], bolt: [fa.FaBolt, C.amber],
    magic: [fa.FaMagic, C.deep], clone: [fa.FaClone, C.deep], users: [fa.FaUsers, C.deep], robot: [fa.FaRobot, C.deep],
    graph: [fa.FaProjectDiagram, C.deep], redo: [fa.FaRedo, C.deep], tools: [fa.FaTools, C.deep], check: [fa.FaCheckCircle, C.deep],
    times: [fa.FaTimesCircle, C.redText], warn: [fa.FaExclamationTriangle, C.amber], file: [fa.FaFileAlt, C.deep], flask: [fa.FaFlask, C.deep],
    scale: [fa.FaBalanceScale, C.deep], ship: [fa.FaShippingFast, C.green], eye: [fa.FaEye, C.deep], coins: [fa.FaCoins, C.deep],
    // dark-teal versions for white backgrounds (the green ones are for dark slides)
    searchD: [fa.FaSearch, C.deep], routeD: [fa.FaRoute, C.deep],
  };
  for (const [k, [comp, color]] of Object.entries(want)) I[k] = await S.icon(comp, color);

  const deck = new Deck({ title: "Retrieval You Can Defend", author: "SE Factory", company: "SE Factory",
    subject: "Applied AI Engineering Workshop · RAG in production · Retrieval You Can Defend" });
  let n = 0;
  const num = (s, dark) => S.slideNumber(s, ++n, dark);

  // ================================================================ 1 Title
  let s = S.darkSlide(deck, {
    section: "Opening", icon: I.target,
    kicker: "APPLIED AI ENGINEERING WORKSHOP  ·  RAG IN PRODUCTION",
    title1: "Retrieval", title2: "You Can Defend",
    subtitle: "Every lever measured: what it fixes, what it costs, what it breaks",
    footer: "Diagnose  ·  Search  ·  Store  ·  Route  ·  Prove",
    notes: `About: Last session made the index RIGHT (permissions, versions, freshness). Today makes retrieval GOOD, and makes every claim about "good" a number. Code: checkpoint 6 in rag-week-bootcamp (it copies checkpoint 5 and adds app/rag/strategies.py and friends).
Say: "There are dozens of retrieval tricks with names: HyDE, re-ranking, parent documents, GraphRAG. Today we try the important ones on the same 24 questions, and keep only what earns its place."
Before class: cd ${CP}; python sharepoint.py reset; python sharepoint.py apply all; python sync.py --apply; python warmup.py (downloads the reranker, builds the children index). Run compare.py --llm once so HyDE and multi-query answers are cached.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 2 Where we left off
  s = S.contentSlide(deck, {
    section: "Opening", title: "Where we left off",
    subtitle: "The index is right now: permissions, versions, no ghosts. Two questions still go wrong.",
    takeaway: "Ingestion decides what CAN be found. Retrieval decides what IS found.",
    notes: `About: Bridge from last session's evaluation (one honest miss) to today. Both examples run live on checkpoint 6.
Say: "Last time ended with one miss: billing changes need two reviewers, and we didn't find it. Here's a second kind of miss: ask who works in San Francisco. Six people. Our top 5 can hold five. No embedding fixes arithmetic."
Demo: python ask.py "How many reviewers does a change to the billing code need?" --strategies dense
       python ask.py "Who works in our San Francisco office?" --strategies dense`,
  });
  S.card(s, { x: 0.6, y: 1.6, w: 4.3, h: 2.75, icon: I.file, iconInline: true, title: "The buried rule", edge: C.red,
    body: [{ runs: [{ text: "\"How many reviewers does a change to the billing code need?\"", i: true, color: C.ink }] },
      { runs: "The answer is one sentence in a PDF page about deployments and on-call: \"A change that touches billing or authentication needs two reviewers.\"" },
      { runs: [{ text: "Dense top 5: ", b: true, color: C.dark }, { text: "coding standards, expense policy, FAQ... not the handbook." }] }],
    bodySize: 12, paraSpace: 6 });
  S.card(s, { x: 5.1, y: 1.6, w: 4.3, h: 2.75, icon: I.users, iconInline: true, title: "The answer bigger than k", edge: C.red,
    body: [{ runs: [{ text: "\"Who works in our San Francisco office?\"", i: true, color: C.ink }] },
      { runs: "Six people, one row each in the team directory." },
      { runs: [{ text: "Dense top 5: ", b: true, color: C.dark }, { text: "four of the six. A top-5 can hold five at best, however good the embedding." }] }],
    bodySize: 12, paraSpace: 6 });
  num(s);

  // ---------------------------------------------------------------- 3 Why top-k breaks
  s = S.contentSlide(deck, {
    section: "Opening", title: "Why plain top-k breaks",
    subtitle: "Four ways a similarity search returns the wrong five chunks.",
    takeaway: "Each problem has its own fix. Picking the fix starts with naming the problem.",
    notes: `About: The four failure shapes. Every technique today maps to one of them.
Say: "One chunk size never fits all: small chunks match precisely but lack context; big ones carry context but match poorly. Users and documents use different words. Top-k is a guess: k=5 gives you the 5 most similar, not the 5 you need. And some answers are sets bigger than k."
Ask: "Which of these is our billing question?" (chunk size: the sentence is drowned in a big PDF page.) "And the San Francisco one?" (bigger than k.)`,
  });
  const breaks = [["No chunk size fits all", "Small chunks match precisely but lack context. Big chunks have context but match poorly.", I.ruler],
    ["Different words, same meaning", "Users say \"locked out of my account\"; the FAQ says \"account lockout: call the IT hotline\".", I.words],
    ["Top-k is a guess", "The 5 most similar chunks are not always the 5 you need. The right one is often 6th.", I.dice],
    ["Some answers are bigger than k", "\"Who works in San Francisco?\" has six right rows. Top 5 can't hold them.", I.list]];
  breaks.forEach(([t, d, ic], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.6 + row * 1.72, w: 4.3, h: 1.58, icon: ic, iconInline: true, title: t, titleSize: 13.5, body: d, bodySize: 12, name: `break-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 4 golden set for today
  s = S.contentSlide(deck, {
    section: "Opening", title: "Today's golden set: 24 questions, six kinds",
    subtitle: "Asked by the engineering manager on Monday's index, each with a reference answer.",
    takeaway: "app/evals/golden_retrieval.json. Frozen: we never edit a question because a strategy missed it.",
    notes: `About: The measuring stick for the whole session. Six kinds of question so each technique gets a fair chance to show what it fixes.
Say: "Casual: how people really ask. Identifier: ticket and incident numbers, library names. Buried: a sentence inside a long section. Pointwise: plain facts, the control group. Multi-document: the answer needs two documents. List: the answer is a set of records."
Every question also has a reference answer written by a person, for the answer-quality metrics at the end.`,
  });
  S.table(s, { x: 0.6, y: 1.6, cols: [1.45, 0.55, 5.0, 1.8], rowH: 0.45, headH: 0.34, size: 11,
    header: ["Kind", "n", "Example", "Expected"],
    rows: [[{ text: "casual", b: true, color: C.dark }, "7", "\"Who do I call if I'm locked out of my account?\"", { text: "COMPANY-FAQ", font: "Consolas", size: 9.5 }],
      [{ text: "identifier", b: true, color: C.dark }, "3", "\"How was ticket IT-4112 resolved?\"", { text: "IT-HELPDESK-EXPORT", font: "Consolas", size: 9.5 }],
      [{ text: "buried", b: true, color: C.dark }, "2", "\"How many reviewers does a change to the billing code need?\"", { text: "ENG-HANDBOOK", font: "Consolas", size: 9.5 }],
      [{ text: "pointwise", b: true, color: C.dark }, "6", "\"Which database do we use for primary data?\"", { text: "ENG-STACK", font: "Consolas", size: 9.5 }],
      [{ text: "multi-doc", b: true, color: C.dark }, "3", "\"I work remotely: core hours, and the home office allowance?\"", { text: "HR-REMOTE + FIN-EXP", font: "Consolas", size: 9.5 }],
      [{ text: "list", b: true, color: C.dark }, "3", "\"Who works in our San Francisco office?\"", { text: "6 directory rows", font: "Consolas", size: 9.5 }]] });
  num(s);

  // ---------------------------------------------------------------- 5 baseline
  s = S.contentSlide(deck, {
    section: "Opening", title: "The baseline: dense search, as built",
    subtitle: "Checkpoint 5's retrieval: embed the question, take the 5 nearest chunks inside the access filter.",
    takeaway: "92% sounds fine. The misses are exactly the two kinds no amount of prompt tuning will fix.",
    notes: `About: compare.py --strategies dense. Hit@5, MRR and Recall defined on the next part's slides and in the reference section.
Say: "Hit@5: did a right document make the top 5? MRR: how high, on average (first place = 1, second = 0.5, fifth = 0.2). Recall: of everything that belongs in the answer, how much reached the model."
"Who works remotely?" is the worst: dense returns the remote-work POLICY five times, because the question looks like the policy. Zero people.`,
  });
  S.stat(s, { x: 0.6, y: 1.55, w: 2.0, value: "0.92", label: "Hit@5", size: 40, name: "base-hit" });
  S.stat(s, { x: 2.75, y: 1.55, w: 2.0, value: "0.84", label: "MRR", size: 40, name: "base-mrr" });
  S.stat(s, { x: 4.9, y: 1.55, w: 2.0, value: "0.89", label: "Recall", size: 40, name: "base-recall" });
  S.stat(s, { x: 7.05, y: 1.55, w: 2.35, value: "~45 ms", label: "per question, no LLM", size: 34, color: C.slate, name: "base-ms" });
  S.table(s, { x: 0.6, y: 2.9, cols: [0.7, 4.4, 3.7], rowH: 0.42, headH: 0.32, size: 11,
    header: ["", "Not fully answered", "What came back"],
    rows: [[{ text: "R11", b: true, color: C.redText }, "Billing changes: how many reviewers?", "Coding standards, expense policy, FAQ"],
      [{ text: "R21", b: true, color: C.amberDeep }, "Who works in our San Francisco office?", "4 of the 6 people"],
      [{ text: "R22", b: true, color: C.redText }, "Who works remotely?", "The remote-work policy, five times. 0 people"],
      [{ text: "R23", b: true, color: C.amberDeep }, "Who is based in the New York office?", "2 of the 3 people"]] });
  num(s);

  // ---------------------------------------------------------------- 6 decision framework
  s = S.contentSlide(deck, {
    section: "Opening", title: "Pick the lever by the symptom",
    subtitle: "Order matters: fix the floor first. Adding HyDE on top of bad retrieval hides the real problem.",
    takeaway: "Every lever below adds latency, cost or complexity. Each one has to win on the golden set to stay.",
    notes: `About: The decision framework for the session. Each row is a part of today.
Say: "Read the symptom first, then the fix. If the right chunk never comes back at all, no reranker helps: a reranker can only re-order what was retrieved. If it comes back at rank 6 to 20, that's exactly the reranker's job. If users and documents use different words, change the query. If the answer is a set, stop using top-k."`,
  });
  const lev = [["The right chunk never comes back", "Hybrid; parent-document; better chunks", I.searchD],
    ["It comes back, but ranked 6th to 20th", "Re-rank a wider candidate list", I.sort],
    ["Users and documents use different words", "HyDE, multi-query, hybrid", I.magic],
    ["The answer is a set of records", "Route to a structured lookup", I.routeD],
    ["Some questions shouldn't retrieve at all", "Agentic: retrieval as one tool among several", I.robot]];
  lev.forEach(([sym, fix, ic], i) => {
    const y = 1.55 + i * 0.68;
    s.rect({ x: 0.6, y, w: 8.8, h: 0.58, fill: C.white, line: C.line, name: `lev-${i}` });
    s.ellipse({ x: 0.75, y: y + 0.11, w: 0.36, h: 0.36, fill: C.deep, name: `lev-dot-${i}` });
    s.text(String(i + 1), { x: 0.75, y: y + 0.11, w: 0.36, h: 0.36, font: "Arial", size: 11, bold: true, color: C.white, align: "center", valign: "middle", name: `lev-n-${i}` });
    s.text(sym, { x: 1.25, y, w: 4.0, h: 0.58, size: 13, bold: true, color: C.dark, valign: "middle", name: `lev-sym-${i}` });
    s.text("→", { x: 5.2, y, w: 0.4, h: 0.58, size: 16, color: C.gray, valign: "middle", name: `lev-arrow-${i}` });
    s.text(fix, { x: 5.6, y, w: 3.2, h: 0.58, size: 12.5, color: C.deep, valign: "middle", name: `lev-fix-${i}` });
    s.image(ic, { x: 8.85, y: y + 0.12, w: 0.34, h: 0.34, name: `lev-icon-${i}` });
  });
  num(s);

  // ================================================================ PART 1 SEARCH
  s = S.darkSlide(deck, { section: "Search better", icon: I.search, kicker: "PART 1 OF 4", title1: "Search better",
    subtitle: "Keywords and meanings, then a second, smarter pass", footer: "bm25  ·  hybrid  ·  re-rank",
    notes: `About: First-stage retrieval (what comes back) and second-stage re-ranking (what order).` });
  num(s, true);

  // ---------------------------------------------------------------- 8 dense vs keyword
  s = S.contentSlide(deck, {
    section: "Search better", title: "Dense and keyword search fail differently",
    subtitle: "Embeddings match meaning. BM25 matches words. Each one's blind spot is the other's strength.",
    takeaway: "BM25 is 40 lines in app/rag/bm25.py. In production it lives in your search engine, filtered the same way.",
    notes: `About: app/rag/bm25.py. BM25 scores a chunk by the query's words it contains: rare words count more (idf), repeated words count more but with diminishing returns (k1), long chunks are penalised a little (b).
Measured: bm25 alone gets Hit@5 0.96 (dense 0.92): it finds the billing rule at #1 because "billing" and "reviewers" are rare words. But it drops casual questions: "How fast am I expected to reply on Slack?" goes from rank 1 (dense) to rank 3.
The tokenizer keeps identifiers whole (it-4112, inc-2024-017) AND indexes their parts.`,
  });
  S.card(s, { x: 0.6, y: 1.6, w: 4.3, h: 1.85, icon: I.brain, iconInline: true, title: "Dense (embeddings)", edge: C.deep,
    body: [{ runs: "Finds meaning: \"locked out\" ≈ \"account lockout\"", bullet: true }, { runs: "Blurs exact tokens: IT-4112 ≈ IT-4120", bullet: true },
      { runs: "Drowns one sentence inside a long chunk", bullet: true }], bodySize: 12, paraSpace: 4 });
  S.card(s, { x: 5.1, y: 1.6, w: 4.3, h: 1.85, icon: I.key, iconInline: true, title: "Keyword (BM25)", edge: C.amber,
    body: [{ runs: "Finds exact words: billing, reviewers, Zustand", bullet: true }, { runs: "Rare words weigh more (idf)", bullet: true },
      { runs: "Misses paraphrase: \"reply on Slack\" vs \"respond to messages\"", bullet: true }], bodySize: 12, paraSpace: 4 });
  S.table(s, { x: 0.6, y: 3.65, cols: [4.6, 2.1, 2.1], rowH: 0.4, headH: 0.32, size: 11.5, align: "center",
    header: ["Rank of the right document", { text: "dense", align: "center" }, { text: "BM25", align: "center" }],
    rows: [["Billing changes: how many reviewers?", { text: "dense: miss", color: C.redText, b: true }, { text: "bm25: #1", color: C.deep, b: true }],
      ["How fast am I expected to reply on Slack?", { text: "dense: #1", color: C.deep, b: true }, { text: "bm25: #3", color: C.redText, b: true }]] });
  num(s);

  // ---------------------------------------------------------------- 9 hybrid
  s = S.contentSlide(deck, {
    section: "Search better", title: "Hybrid: let both rankings vote",
    subtitle: "Reciprocal rank fusion: no need to compare a distance with a BM25 score. Ranks are enough.",
    takeaway: "Hybrid keeps BM25's wins and gives back most of its losses: Hit@5 0.96, MRR 0.90, ~75 ms.",
    notes: `About: rrf() in app/rag/bm25.py and _hybrid() in app/rag/strategies.py.
Say: "A cosine distance and a BM25 score live on different scales. You could normalise them; RRF sidesteps it: each list gives every item 1 / (60 + rank). An item near the top of both lists wins. The 60 dampens the difference between rank 1 and rank 2."
Numbers: dense 0.92 / 0.84; bm25 0.96 / 0.87; hybrid 0.96 / 0.90. The Slack question is back at #1.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 4.6, h: 2.7, label: "app/rag/bm25.py", size: 11.5, lines: [
    "def rrf(rankings, k=60):",
    "    scores = {}",
    "    for ranking in rankings:",
    "        for rank, item in enumerate(ranking, 1):",
    "            scores[item] = scores.get(item, 0) \\",
    "                + 1.0 / (k + rank)",
    "    return sorted(scores.items(),",
    "                  key=lambda kv: kv[1],",
    "                  reverse=True)"] });
  const fuse = [["Dense top 20", "A, B, C, D ...", C.deep], ["BM25 top 20", "C, E, A, F ...", C.amberDeep], ["RRF", "A and C first: both liked them", C.dark]];
  fuse.forEach(([t, d, color], i) => {
    const y = 1.6 + i * 0.95;
    s.rect({ x: 5.45, y, w: 3.95, h: 0.8, fill: C.white, line: C.line, name: `fuse-${i}` });
    s.text([[{ text: t, b: true, color, size: 13, font: "Arial" }], [{ text: d, color: C.slate, size: 11.5 }]], { x: 5.6, y, w: 3.7, h: 0.8, valign: "middle", name: `fuse-t-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 10 bi vs cross
  s = S.contentSlide(deck, {
    section: "Search better", title: "Bi-encoder or cross-encoder?",
    subtitle: "Why vector search misses things the right chunk is in the index for.",
    takeaway: "Use both: the cheap one casts the net, the expensive one picks the winners.",
    notes: `About: The core idea behind re-ranking.
Say: "The embedding model encodes the question and each chunk separately, then compares two vectors. It never reads them side by side. A cross-encoder takes the pair as ONE input and outputs one relevance score. Much better judgement, one model run per pair: fine for 20 pairs, not for 20 million."
Model: cross-encoder/ms-marco-MiniLM-L-6-v2, about 90 MB, run with onnxruntime (already installed by ChromaDB). No PyTorch.`,
  });
  S.card(s, { x: 0.6, y: 1.6, w: 4.3, h: 2.55, title: "Bi-encoder (vector search)", titleSize: 14, edge: C.deep,
    body: [{ runs: [{ text: "question → vector,  chunk → vector", font: "Consolas", size: 10.5 }] }, { runs: "compare: cosine distance" },
      { runs: [{ text: "Fast: ", b: true, color: C.dark }, { text: "millions of chunks in milliseconds" }] },
      { runs: [{ text: "Approximate: ", b: true, color: C.dark }, { text: "never reads question and chunk together" }] }], bodySize: 12, paraSpace: 6 });
  S.card(s, { x: 5.1, y: 1.6, w: 4.3, h: 2.55, title: "Cross-encoder (re-ranker)", titleSize: 14, edge: C.amber,
    body: [{ runs: [{ text: "(question, chunk) → one score", font: "Consolas", size: 10.5 }] }, { runs: "the model attends to both at once" },
      { runs: [{ text: "Accurate: ", b: true, color: C.dark }, { text: "it actually reads the pair" }] },
      { runs: [{ text: "Slow: ", b: true, color: C.dark }, { text: "one run per pair; only for a short list" }] }], bodySize: 12, paraSpace: 6 });
  num(s);

  // ---------------------------------------------------------------- 11 two-stage
  s = S.contentSlide(deck, {
    section: "Search better", title: "Retrieve 20, re-rank, keep 5",
    subtitle: "Stage 1 for recall: don't miss it. Stage 2 for precision: put it first.",
    takeaway: "MRR 0.84 → 0.94. The price: about 0.5 s of CPU per question instead of 45 ms.",
    notes: `About: rerank() and hybrid_rerank() in app/rag/strategies.py; app/rag/reranker.py.
Measured: rerank Hit@5 0.96, MRR 0.94 (dense 0.84), ~520 ms per question on a laptop CPU (dense ~45 ms). hybrid_rerank the same quality.
Position shifts: R11 (billing) from somewhere in dense's 6-20 to #1; R16 ("which database for primary data?") from #4 to #1.
Demo: python ask.py "Which database do we use for primary data?" --strategies dense,rerank`,
  });
  const stages = [["Question", C.dark, ""], ["Retrieve", C.deep, "top 20 · fast"], ["Re-rank", C.amberDeep, "20 pairs · ~0.5 s"], ["Top 5", C.dark, "to the LLM"]];
  stages.forEach(([t, color, d], i) => {
    const x = 0.6 + i * 2.28;
    s.rect({ x, y: 1.65, w: 1.94, h: 0.95, fill: C.white, line: color, lineWidth: 1.5, name: `stage-${i}` });
    const lines = [[{ text: t, b: true, color, size: 14, font: "Arial" }]];
    if (d) lines.push([{ text: d, size: 10.5, color: C.gray }]);
    s.text(lines, { x, y: 1.65, w: 1.94, h: 0.95, align: "center", valign: "middle", name: `stage-t-${i}` });
    if (i < stages.length - 1) S.arrow(s, x + 1.98, 2.12, x + 2.25, 2.12, C.gray);
  });
  S.table(s, { x: 0.6, y: 2.95, cols: [4.4, 2.2, 2.2], rowH: 0.42, headH: 0.34, size: 11.5, align: "center",
    header: ["Rank of the right document", { text: "dense", align: "center" }, { text: "dense + re-rank", align: "center" }],
    rows: [["R11 · billing changes: how many reviewers?", { text: "not in top 5", color: C.redText, b: true }, { text: "#1", color: C.deep, b: true }],
      ["R16 · which database for primary data?", { text: "#4", color: C.amberDeep, b: true }, { text: "#1", color: C.deep, b: true }],
      ["R02 · who do I call if I'm locked out?", { text: "#2", color: C.amberDeep, b: true }, { text: "#1", color: C.deep, b: true }]] });
  num(s);

  // ---------------------------------------------------------------- 12 how many candidates
  s = S.contentSlide(deck, {
    section: "Search better", title: "How many candidates? Measured",
    subtitle: "A re-ranker can only promote what stage 1 handed it.",
    takeaway: "20 is the usual start. If you need 100+, the first stage is the real problem.",
    notes: `About: The regression drill from the README, run live: save a baseline with 20 candidates, re-run with 5.
Demo: python compare.py --strategies rerank,hybrid_rerank --save-baseline
      $env:CANDIDATES=5; python compare.py --strategies rerank,hybrid_rerank --against-baseline   (PowerShell)
Say: "With 5 candidates, plain rerank loses the billing question: it was never in dense's top 5, so the re-ranker never saw it. Hybrid + rerank keeps it: BM25 put it in the pool."`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 5.1, h: 1.3, label: "CANDIDATES=5  python compare.py --against-baseline", size: 10.5, lines: [
    "rerank          Hit@5 -0.04  MRR -0.04  Recall -0.06",
    { text: "    R11: HIT -> miss  explain this one", color: "F2A19C" },
    "hybrid_rerank   Hit@5 +0.00  MRR +0.00  Recall +0.00"] });
  S.table(s, { x: 5.95, y: 1.55, cols: [0.95, 2.5], rowH: 0.62, headH: 0.32, size: 11,
    header: ["k", "What happens"],
    rows: [[{ text: "5", b: true, color: C.dark }, "Barely re-ranking: can't rescue a miss"], [{ text: "20", b: true, color: C.deep }, "The usual sweet spot"],
      [{ text: "50", b: true, color: C.dark }, "Hard corpora (legal, medical)"], [{ text: "100+", b: true, color: C.redText }, "The first stage is the problem"]] });
  S.card(s, { x: 0.6, y: 3.0, w: 5.1, h: 1.35, title: "Add a re-ranker when...", titleSize: 13, edge: C.deep,
    body: "the right chunk lands in the top 20 but not the top 5, and you send only a few chunks to the LLM. Skip it when latency must stay under ~100 ms.", bodySize: 11.5 });
  num(s);

  // ---------------------------------------------------------------- 13 LIVE scoreboard
  s = S.liveSlide(deck, { section: "Search better", icon: I.laptop, kicker: "LIVE",
    title1: "Run the scoreboard", title2: "and read the misses",
    steps: ["compare.py: dense, bm25, hybrid, rerank on 24 questions",
      "ask.py on the billing question: watch each strategy's trace",
      "Predict before each run: which kind of question will this strategy fix?"],
    command: "python compare.py --strategies dense,bm25,hybrid,rerank --details",
    notes: `About: Run the scoreboard live from ${CP}. About 30 seconds.
Then: python ask.py "How many reviewers does a change to the billing code need?" --strategies dense,bm25,hybrid,rerank,parent
Point at the traces: "dense top 20 -> cross-encoder (85 ms) -> top 5". Ask the room to predict the next strategy's result before running it.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 14 break
  s = S.darkSlide(deck, { section: "Search better", icon: I.coffee, kicker: "BREAK", title1: "10 minutes",
    subtitle: "Next: change what you store, and what you search with",
    notes: `About: Break.` });
  num(s, true);

  // ================================================================ PART 2 STORE
  s = S.darkSlide(deck, { section: "Store & rewrite", icon: I.layers, kicker: "PART 2 OF 4", title1: "Store better,", title2: "search smarter",
    subtitle: "Change what you index, or change the question", footer: "parent-document  ·  HyDE  ·  multi-query",
    notes: `About: Two families: change WHAT YOU STORE (parent-document, multi-vector), change WHAT YOU SEARCH WITH (HyDE, multi-query).` });
  num(s, true);

  // ---------------------------------------------------------------- 16 parent-document
  s = S.contentSlide(deck, {
    section: "Store & rewrite", title: "Parent-document: match small, return big",
    subtitle: "Index each sentence on its own, pointing to its section. Search the sentences; hand the LLM the section.",
    takeaway: "R11 found at #2, MRR 0.89, ~60 ms, no LLM. The cost: a second index to keep in sync.",
    notes: `About: app/rag/children.py builds a children collection (136 sentence-sized children) from the live index; parent() in strategies.py searches it and returns distinct parents.
Say: "The billing sentence is one of eight in a 900-character PDF chunk; its embedding is an average of deployments, on-call and incidents. On its own, the sentence matches the question almost exactly. We search the sentence and return the whole chunk, so the LLM still gets context."
Production note: the children index is DERIVED. Our code rebuilds it when the live index changes (fingerprint check); in production the sync job rebuilds it in the same run.
Rule of thumb: use it when a chunk's meaning depends on its neighbours (clauses, steps, run-in headings); skip it for atomic facts.`,
  });
  S.code(s, { x: 0.6, y: 1.65, w: 4.5, h: 1.5, label: "Parent: ENG-HANDBOOK::000 (PDF page, 900 chars)", size: 10, lines: [
    "Acme Engineering Handbook ... Code review.", "Every change must be reviewed by at least one",
    { text: "other engineer ... A change that touches billing", color: C.green, b: true }, { text: "or authentication needs two reviewers.", color: C.green, b: true },
    "Deployments. The team deploys to production ..."] });
  S.code(s, { x: 5.3, y: 1.65, w: 4.1, h: 1.0, label: "Child: ENG-HANDBOOK::000#03", size: 10, lines: [
    { text: "Engineering Handbook: A change that touches", color: C.green }, { text: "billing or authentication needs two reviewers.", color: C.green }] });
  s.text([[{ text: "1. ", b: true, color: C.deep }, { text: "The question matches the CHILD sentence" }], [{ text: "2. ", b: true, color: C.deep }, { text: "The PARENT chunk goes to the LLM" }]],
    { x: 5.3, y: 2.8, w: 4.1, h: 0.75, size: 12.5, color: C.dark, paraSpace: 4, name: "parent-steps" });
  S.table(s, { x: 0.6, y: 3.35, cols: [4.8, 2.0, 2.0], rowH: 0.42, headH: 0.32, size: 11.5, align: "center",
    header: ["R11 · billing changes: how many reviewers?", { text: "dense", align: "center" }, { text: "parent", align: "center" }],
    rows: [["Rank of the right document", { text: "miss", color: C.redText, b: true }, { text: "#2", color: C.deep, b: true }]] });
  s.text([[{ text: "Use it: ", b: true, color: C.deep }, { text: "clauses, steps, run-in headings, PDF pages.   " }, { text: "Skip it: ", b: true, color: C.redText }, { text: "atomic facts (a spec, a date, a name)." }]],
    { x: 0.6, y: 4.25, w: 8.8, h: 0.4, size: 12, color: C.slate, valign: "middle", name: "parent-rule" });
  num(s);

  // ---------------------------------------------------------------- 17 HyDE & multi-query
  s = S.contentSlide(deck, {
    section: "Store & rewrite", title: "HyDE and multi-query: rewrite the question",
    subtitle: "Questions don't look like their answers. Let an LLM write something that does, then search with it.",
    takeaway: "One LLM call per question, ~40x slower than dense. HyDE earned a little; multi-query earned nothing here.",
    notes: `About: hyde() and multi_query() in app/rag/strategies.py; prompts in app/prompts/query_rewrite.py. LLM calls cached in runs/llm_cache.json (latency reported as the original call's).
HyDE: the LLM writes a fake handbook passage; we search with its embedding. It doesn't need to be correct, just shaped like the documents. Measured: Hit@5 0.96 (finds the billing rule), MRR 0.88, ~1.8 s per question, worse on list questions (recall 0.91).
Multi-query: 3 rewrites + the original, each searched, fused with RRF. Measured: 0.92 / 0.87 at ~1.7 s: no Hit@5 gain over dense on this corpus.
Say: "On a small, clearly written corpus the embedding already bridges most vocabulary gaps. On jargon-heavy corpora HyDE earns more. Measure on YOUR questions."
Where HyDE is the wrong tool: identifiers (you want exact match), high-stakes domains (a wrong guess drags the search off topic), latency-sensitive paths.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 4.4, h: 1.75, label: "HyDE on R11: what the LLM actually wrote", size: 10, lines: [
    { text: "\"All changes to the billing code must be", color: C.green }, { text: " reviewed and approved by at least two senior", color: C.green },
    { text: " developers with billing system expertise...\"", color: C.green },
    { text: "# invented details, right shape:", color: C.mintText }, { text: "# the handbook comes back at #3", color: C.mintText }] });
  S.table(s, { x: 5.2, y: 1.6, cols: [1.6, 0.8, 0.8, 1.0], rowH: 0.47, headH: 0.34, size: 11.5, align: "center",
    header: ["Strategy", { text: "Hit@5", align: "center" }, { text: "MRR", align: "center" }, { text: "ms/q", align: "center" }],
    rows: [[{ text: "dense", b: true, color: C.dark }, "0.92", "0.84", "~45"], [{ text: "hyde", b: true, color: C.dark }, { text: "0.96", color: C.deep, b: true }, "0.88", { text: "~1,800", color: C.redText, b: true }],
      [{ text: "multi_query", b: true, color: C.dark }, "0.92", "0.87", { text: "~1,700", color: C.redText, b: true }]] });
  S.card(s, { x: 0.6, y: 3.65, w: 8.8, h: 1.3, title: "Where HyDE is the wrong tool", titleSize: 13, edge: C.amber,
    body: "Identifiers and names (you want an exact match, not a paraphrase), high-stakes domains (a wrong guess drags the search off topic), latency-sensitive paths. Multi-vector does similar work once, at indexing time (see the reference slides).", bodySize: 11.5 });
  num(s);

  // ---------------------------------------------------------------- 18 scoreboard
  s = S.contentSlide(deck, {
    section: "Store & rewrite", title: "Every lever, one scoreboard",
    subtitle: "python compare.py --llm: 24 questions, top 5, Monday's index, a laptop CPU.",
    takeaway: "Several strategies tie at 0.96 Hit@5; they differ in rank (MRR), latency and LLM calls. And none fixes the list questions.",
    notes: `About: The whole scoreboard. Read it column by column.
Say: "Quality: hybrid, rerank, parent and HyDE all reach 0.96. MRR separates them: the re-rankers put the right document first most often. Latency and LLM calls separate them again: HyDE and multi-query pay an LLM call on every question for no gain over hybrid + rerank. And look at the list column: 0.67 for everyone. That's the next part."
Numbers may differ by a few ms on student laptops; the order should not change.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [2.0, 1.1, 1.1, 1.1, 1.3, 1.1, 1.1], rowH: 0.34, headH: 0.34, size: 11, align: "center",
    header: ["Strategy", { text: "Hit@5", align: "center" }, { text: "MRR", align: "center" }, { text: "Recall", align: "center" }, { text: "ms / q", align: "center" }, { text: "LLM / q", align: "center" }, { text: "lists", align: "center" }],
    rows: [
      [{ text: "dense", b: true, color: C.dark }, "0.92", "0.84", "0.89", "~45", "0", { text: "0.67", color: C.redText }],
      [{ text: "bm25", b: true, color: C.dark }, "0.96", "0.87", "0.95", "~17", "0", { text: "0.67", color: C.redText }],
      [{ text: "hybrid", b: true, color: C.dark }, "0.96", "0.90", "0.95", "~75", "0", { text: "0.67", color: C.redText }],
      [{ text: "rerank", b: true, color: C.dark }, "0.96", { text: "0.94", b: true, color: C.deep }, "0.95", "~520", "0", { text: "0.67", color: C.redText }],
      [{ text: "hybrid_rerank", b: true, color: C.dark }, "0.96", { text: "0.94", b: true, color: C.deep }, "0.95", "~500", "0", { text: "0.67", color: C.redText }],
      [{ text: "parent", b: true, color: C.dark }, "0.96", "0.89", "0.93", "~60", "0", { text: "0.67", color: C.redText }],
      [{ text: "hyde", b: true, color: C.dark }, "0.96", "0.88", "0.91", { text: "~1,800", color: C.redText }, { text: "1", color: C.redText }, { text: "0.67", color: C.redText }],
      [{ text: "multi_query", b: true, color: C.dark }, "0.92", "0.87", "0.90", { text: "~1,700", color: C.redText }, { text: "1", color: C.redText }, { text: "0.67", color: C.redText }],
    ] });
  num(s);

  // ================================================================ PART 3 ROUTE
  s = S.darkSlide(deck, { section: "Route", icon: I.route, kicker: "PART 3 OF 4", title1: "Route",
    subtitle: "Pick the retrieval by the shape of the question", footer: "lookup  ·  agentic patterns  ·  GraphRAG",
    notes: `About: When no similarity trick can help: the answer is bigger than k, or retrieval is the wrong tool entirely.` });
  num(s, true);

  // ---------------------------------------------------------------- 20 bigger than k
  s = S.contentSlide(deck, {
    section: "Route", title: "Some answers are bigger than k",
    subtitle: "\"Who works in our San Francisco office?\" Six right answers, one per directory row.",
    takeaway: "k is a budget. When the answer is a set, retrieve the set: every matching record, not the most similar five.",
    notes: `About: The lesson from the history-rag project (top-k vs aggregation), on our directory.
Say: "Dense gets 4 of 6. The best top-5 strategy gets 5 of 6, because 5 is the most a top-5 can hold. No re-ranker, no HyDE, no better prompt fixes that. 'Who works remotely?' is worse: dense returns the remote-work POLICY five times and zero people."
Demo: python ask.py "Who works remotely?" --strategies dense,routed   → dense: HR-REMOTE x4, FAQ; routed: Maria Garcia, Michael Brown, Ahmed Hassan (16 ms).`,
  });
  const sf = [["dense", "4 of 6", 0.67, C.redText], ["hybrid_rerank", "5 of 6", 0.83, C.amberDeep], ["routed (lookup)", "6 of 6", 1.0, C.deep]];
  sf.forEach(([name, got, frac, color], i) => {
    const y = 1.65 + i * 0.75;
    s.text(name, { x: 0.6, y, w: 2.1, h: 0.55, size: 14, bold: true, color: C.dark, valign: "middle", font: "Consolas", name: `sf-name-${i}` });
    for (let p = 0; p < 6; p++) {
      const on = p < Math.round(frac * 6);
      s.ellipse({ x: 2.85 + p * 0.55, y: y + 0.07, w: 0.42, h: 0.42, fill: on ? color : C.white, line: on ? undefined : "9AA3AE", lineWidth: 1.5, name: `sf-dot-${i}-${p}` });
    }
    s.text(got, { x: 6.3, y, w: 1.2, h: 0.55, size: 16, bold: true, color, valign: "middle", font: "Arial", name: `sf-got-${i}` });
  });
  S.code(s, { x: 0.6, y: 4.0, w: 8.8, h: 0.95, label: "python ask.py \"Who works remotely?\"", size: 10.5, lines: [
    { text: "dense   1. HR-REMOTE  2. COMPANY-FAQ  3. HR-REMOTE  4. HR-REMOTE  5. HR-REMOTE   (0 people)", color: "F2A19C" },
    { text: "routed  aggregation on {'office': ['Remote']} -> Maria Garcia, Michael Brown, Ahmed Hassan", color: C.green }] });
  num(s);

  // ---------------------------------------------------------------- 21 route by shape
  s = S.contentSlide(deck, {
    section: "Route", title: "Route by the shape of the question",
    subtitle: "Pointwise questions go to search. Set questions go to a lookup over the records.",
    takeaway: "routed: Hit@5 1.00, MRR 0.98, Recall 1.00. No LLM call: the router is a few rules.",
    notes: `About: app/rag/router.py. classify() = "does it ask for a set (who / list / how many) AND name a value that exists in a record field (office, department, role)?" lookup() returns EVERY matching record.
Say: "Rules, because the shapes are clear, rules are free, and you can unit-test them. When rules can't tell, a small LLM classifier can. The point is the split, not the regex. In production the structured side is SQL over a table: spreadsheets and directories are records, not prose."
Watch for: misroutes. "Who approves engineering offsites?" names a department; the membership words (work, office, based...) keep it out of the lookup. Test the router like any code.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 4.7, h: 3.2, label: "app/rag/router.py (simplified)", size: 11, lines: [
    "def classify(question, records):",
    "    if not (asks_for_a_set(question)",
    "            and names_a_member(question)):",
    "        return \"pointwise\", {}",
    "    # office / department / role values",
    "    # that appear in the question",
    "    return \"aggregation\", wanted", "",
    "def lookup(records, wanted):",
    "    # EVERY match, not the top 5",
    "    return [r for r in records",
    "            if matches(r, wanted)]"] });
  const rflow = [["\"Who works remotely?\"", "aggregation → lookup", "3 records, 16 ms", C.deep], ["\"Who do I call if I'm locked out?\"", "pointwise → hybrid + re-rank", "COMPANY-FAQ #1", C.amberDeep]];
  rflow.forEach(([q, route, out, color], i) => {
    const y = 1.6 + i * 1.7;
    s.rect({ x: 5.55, y, w: 3.85, h: 1.5, fill: C.white, line: color, lineWidth: 1.25, name: `rflow-${i}` });
    s.text([[{ text: q, i: true, color: C.ink, size: 13 }], [{ text: route, b: true, color, size: 12 }], [{ text: out, color: C.slate, size: 11.5 }]],
      { x: 5.75, y: y + 0.1, w: 3.5, h: 1.3, valign: "middle", paraSpace: 4, name: `rflow-t-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 22 agentic patterns
  s = S.contentSlide(deck, {
    section: "Route", title: "Agentic RAG: retrieval as a tool",
    subtitle: "A fixed pipeline always retrieves and always answers. An agent decides whether, where and when to stop.",
    takeaway: "Routing is the cheapest agentic step, and it's what won here. Add loops only when the golden set says they pay.",
    notes: `About: The three agentic patterns, from cheapest to most expensive. We built the first one.
Routing: classify, then send to the right index or tool (one rule set or one LLM call).
Self-correcting (corrective RAG, Self-RAG): retrieve, grade the chunks or the answer, rewrite and retry. Costs 2-3x latency; on our own measurement a corrective loop showed no gain when retrieval was already good. Measure before you keep it.
Tool-using agent: retrieval is one tool among several (SQL, web search, a calculator, an API); the model picks. The agent loop you built earlier, with search as a tool.
Rule: code still decides what the agent may do; the model only proposes.`,
  });
  const ag = [["Routing", "Classify, then send to the right index or tool.", "One rule set or one LLM call. Built today.", I.routeD, C.deep],
    ["Self-correcting", "Retrieve, grade, rewrite, retry. Corrective RAG, Self-RAG.", "2 to 3 times the latency. Measure first.", I.redo, C.amberDeep],
    ["Tool-using agent", "Search is one tool among SQL, APIs, a calculator.", "Most flexible; hardest to test and bound.", I.tools, C.redText]];
  ag.forEach(([t, d, cost, ic, color], i) => {
    const x = 0.6 + i * 2.97;
    S.card(s, { x, y: 1.6, w: 2.82, h: 2.05, icon: ic, iconInline: true, title: t, titleSize: 13.5,
      body: [{ runs: d }, { runs: [{ text: cost, b: true, color }], spaceBefore: 6 }], bodySize: 12, name: `ag-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 23 GraphRAG
  s = S.contentSlide(deck, {
    section: "Route", title: "GraphRAG: the honest pitch",
    subtitle: "Extract entities and relations with an LLM, build a graph, retrieve by walking it. Powerful on some problems.",
    takeaway: "On general Q&A over documents, hybrid search plus re-ranking usually wins on quality and cost.",
    notes: `About: Concept only; not built in the checkpoint (the history-rag repository has a GraphRAG pipeline if you want to see one).
Say: "Most teams who try GraphRAG quietly walk away. It earns its keep when the questions are about relationships between entities (who replaced the CFO who signed the 2022 merger?), or global themes across thousands of documents (community summaries). It costs an LLM pass over the whole corpus at ingest, and LLM-extracted relations are wrong 15-30% of the time; errors propagate."
Even in GraphRAG you usually still union with vector search and re-rank at the end.`,
  });
  S.card(s, { x: 0.6, y: 1.6, w: 2.85, h: 2.65, title: "Reach for it", titleSize: 14, edge: C.deep, icon: I.graph, iconInline: true,
    body: [{ runs: "Entity-heavy domains: cases, filings, people and orgs", bullet: true }, { runs: "Multi-hop: \"who replaced the CFO who signed it?\"", bullet: true },
      { runs: "Global themes across thousands of documents", bullet: true }], bodySize: 11.5, paraSpace: 4 });
  S.card(s, { x: 3.58, y: 1.6, w: 2.85, h: 2.65, title: "Maybe", titleSize: 14, edge: C.amber, icon: I.scale, iconInline: true,
    body: [{ runs: "You already have a schema or ontology", bullet: true }, { runs: "Reviewers want explainable paths (audit)", bullet: true },
      { runs: "Metadata filters almost do it, but not quite", bullet: true }], bodySize: 11.5, paraSpace: 4 });
  S.card(s, { x: 6.56, y: 1.6, w: 2.85, h: 2.65, title: "Don't bother", titleSize: 14, edge: C.red, icon: I.coins, iconInline: true,
    body: [{ runs: "General Q&A over documents", bullet: true }, { runs: "Small corpora: ingestion cost dwarfs the lift", bullet: true },
      { runs: "No ground truth for relations: extraction errors propagate", bullet: true }], bodySize: 11.5, paraSpace: 4 });
  num(s);

  // ================================================================ PART 4 PROVE
  s = S.darkSlide(deck, { section: "Prove it", icon: I.gavel, kicker: "PART 4 OF 4", title1: "Prove it",
    subtitle: "Was the answer grounded, was it right, and did the last change help?", footer: "faithfulness  ·  correctness  ·  regression",
    notes: `About: From retrieval metrics to answer metrics, and the discipline that keeps both honest.` });
  num(s, true);

  // ---------------------------------------------------------------- 25 two failures, two metrics
  s = S.contentSlide(deck, {
    section: "Prove it", title: "Two kinds of failure, two kinds of metric",
    subtitle: "Every bad answer is a retrieval failure or a generation failure. Measure them separately.",
    takeaway: "Retrieval metrics are cheap and need no LLM. Answer metrics need a judge: an LLM with its own failure modes.",
    notes: `About: The split that makes debugging possible. judge.py implements two answer metrics with an LLM judge; RAGAS (a library) has more: answer relevancy, context precision, context recall.
Say: "Retrieval failure: the right chunk never reached the model. Generation failure: it did, and the model still got it wrong, or added things. If you can't tell which one happened, you can't fix anything."
Diagnosis: good retrieval + bad answer → fix the prompt or the model. Bad retrieval → don't touch the prompt yet: every prompt improvement is wasted until retrieval is fixed.`,
  });
  S.card(s, { x: 0.6, y: 1.6, w: 4.3, h: 2.55, title: "Retrieval failure", titleSize: 14, edge: C.red,
    body: [{ runs: "The right chunk never reached the LLM." }, { runs: "Confidently wrong; \"I don't know\" when the doc exists; a citation that doesn't hold the fact.", spaceAfter: 8 },
      { runs: [{ text: "Measured by: ", b: true, color: C.dark }, { text: "Hit@5, MRR, Recall. No LLM. Seconds." }] }], bodySize: 12, paraSpace: 5 });
  S.card(s, { x: 5.1, y: 1.6, w: 4.3, h: 2.55, title: "Generation failure", titleSize: 14, edge: C.amber,
    body: [{ runs: "The right chunk arrived. The answer is still wrong." }, { runs: "Ignores the context; adds facts that aren't there; hedges when the context is clear.", spaceAfter: 8 },
      { runs: [{ text: "Measured by: ", b: true, color: C.dark }, { text: "faithfulness, correctness (judge.py), RAGAS. An LLM judge." }] }], bodySize: 12, paraSpace: 5 });
  num(s);

  // ---------------------------------------------------------------- 26 faithful is not correct
  s = S.contentSlide(deck, {
    section: "Prove it", title: "Faithful is not correct",
    subtitle: "python judge.py: same 24 questions, answers by gpt-4.1-mini, graded against the hand-written references.",
    takeaway: "A grounded answer from the wrong chunk scores 100% faithful. Correctness needs a reference answer.",
    notes: `About: judge.py --strategy dense and --strategy routed. Faithfulness = share of the answer's claims supported by the retrieved context. Correctness = does it agree with the reference answer.
Say: "Faithfulness barely moves: 0.99 for both. Correctness moves from 17 to 23 out of 24. Look at R11: with dense retrieval the model reads the coding standards, 'every change needs at least one reviewer', and answers 'at least one'. Every claim is supported by its context: faithfulness 1.00. It's wrong."
Cost: about 72 LLM calls per strategy the first time (24 answers + 48 verdicts), cached after that.`,
  });
  S.stat(s, { x: 0.6, y: 1.55, w: 2.1, value: "0.99", label: "faithfulness, dense and routed", size: 36, name: "faith" });
  S.stat(s, { x: 2.8, y: 1.55, w: 2.3, value: "17 → 23", label: "correct answers out of 24\ndense → routed", size: 36, name: "correct" });
  S.card(s, { x: 5.35, y: 1.55, w: 4.05, h: 2.6, title: "R11 with dense retrieval", titleSize: 13.5, edge: C.red,
    body: [{ runs: [{ text: "\"How many reviewers does a change to the billing code need?\"", i: true, color: C.ink }] },
      { runs: [{ text: "Answer: ", b: true, color: C.dark }, { text: "\"According to the Coding Standards (v1), every change must be submitted as a pull request with at least one reviewer. So, a change to the billing code needs at least one reviewer.\"" }] },
      { runs: [{ text: "Faithfulness 1.00. ", b: true, color: C.deep }, { text: "Correct: no. ", b: true, color: C.redText }, { text: "The handbook says two." }] }], bodySize: 11.5, paraSpace: 6 });
  s.text([{ runs: "With routed retrieval, the same model answers: \"A change that touches billing code needs two reviewers.\" (Engineering Handbook). Correct." }],
    { x: 0.6, y: 3.25, w: 4.5, h: 0.8, size: 12, italic: true, color: C.slate, name: "routed-note" });
  num(s);

  // ---------------------------------------------------------------- 27 judge problems
  s = S.contentSlide(deck, {
    section: "Prove it", title: "The judge is an LLM too",
    subtitle: "Useful, cheap to run, and wrong sometimes. In our own run:",
    takeaway: "Spot-check 10 verdicts by hand before you trust any judged number. Write references with only the facts that matter.",
    notes: `About: Real judge mistakes from judge.py --show.
R03 (camera): the dense answer said video is required for scheduled meetings and camera-on is encouraged, which is exactly the policy. The judge marked it wrong against our reference. With routed context, a slightly different wording was marked correct: same facts, different verdict.
R24 (DevOps engineer): "David Kim" judged wrong because the reference also said "in the New York office". The reference was too detailed: write references with only the facts that must be there.
General pathologies: self-grading inflates scores (we used the same model to answer and judge: don't, in production); variance between runs; cost per verdict.`,
  });
  const jp = [["Self-grading is generous", "We used gpt-4.1-mini to answer AND to judge. In production, judge with a different model.", I.eye],
    ["Same facts, different verdict", "R03 (camera policy): judged wrong with one wording, right with another.", I.warn],
    ["References that say too much", "R24: \"David Kim\" judged wrong because the reference also gave his office.", I.file],
    ["Every verdict costs a call", "72 calls per strategy per run. Cache them; re-run only what changed.", I.coins]];
  jp.forEach(([t, d, ic], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.55 + row * 1.72, w: 4.3, h: 1.58, icon: ic, iconInline: true, title: t, titleSize: 13.5, body: d, bodySize: 11.5, name: `jp-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 28 regression discipline
  s = S.contentSlide(deck, {
    section: "Prove it", title: "Every change runs the eval",
    subtitle: "Freeze a baseline. Change one thing. Explain every number that moved, in both directions.",
    takeaway: "\"It feels better\" is not a result. \"MRR went 0.84 → 0.94, R16 moved from #4 to #1, and it costs 0.5 s\" is.",
    notes: `About: compare.py --save-baseline / --against-baseline. The three rules of the discipline.
Say: "One change at a time, each measured. Every change has a case it makes worse: BM25 helped billing and hurt Slack. A number that went up without a reason is luck; one that went down without a reason is a bug you haven't found."
CI: the same script, in a GitHub Action, failing the build when Hit@5 drops below the baseline. Infrastructure is the easy part; the habit is the hard part.`,
  });
  const rules = [["One change at a time", "Model, chunk size, k, a prompt: re-run the set each time."],
    ["Metrics move both ways", "BM25 alone helped billing and hurt Slack. Hybrid hurt nothing."],
    ["Explain every move", "R11 lost with 5 candidates: never in dense's top 5."]];
  rules.forEach(([t, d], i) => {
    S.card(s, { x: 0.6, y: 1.55 + i * 1.17, w: 4.6, h: 0.98, num: i + 1, title: t, titleSize: 13, body: d, bodySize: 11, name: `rule-${i}` });
  });
  S.code(s, { x: 5.45, y: 1.55, w: 3.95, h: 3.32, label: "compare.py --against-baseline", size: 12, lines: [
    "Against the baseline of 20261105:", "",
    "rerank         Hit@5 -0.04", "               MRR   -0.04", { text: "    R11: HIT -> miss", color: "F2A19C" }, { text: "    explain this one", color: "F2A19C" }, "",
    "hybrid_rerank  Hit@5 +0.00", "               MRR   +0.00"] });
  num(s);

  // ---------------------------------------------------------------- 29 what we ship
  s = S.contentSlide(deck, {
    section: "Prove it", title: "What we ship, and how we'd defend it",
    subtitle: "POST /query now defaults to strategy=routed: lists to a lookup, everything else to hybrid + re-rank.",
    takeaway: "That paragraph, with the regression script open, is the interview answer.",
    notes: `About: The decision, and the paragraph students should be able to say about their own system.
Say it out loud: "Dense retrieval hit 92% on 24 hand-written questions. Hybrid search plus a cross-encoder re-ranker moved MRR from 0.84 to 0.94 for half a second of CPU. Routing list questions to a lookup took Hit@5 and Recall to 100%. Faithfulness stayed at 0.99; correctness went from 17 to 23 out of 24. HyDE and multi-query cost an LLM call per question and didn't beat that, so they're off. Here's the regression script."`,
  });
  S.card(s, { x: 0.6, y: 1.55, w: 4.3, h: 2.85, title: "Kept", titleSize: 14, edge: C.deep, icon: I.check, iconInline: true,
    body: [{ runs: [{ text: "Hybrid search: ", b: true, color: C.dark }, { text: "BM25 catches the exact words" }], bullet: true },
      { runs: [{ text: "Re-ranking (20 → 5): ", b: true, color: C.dark }, { text: "MRR 0.84 → 0.94" }], bullet: true },
      { runs: [{ text: "Routing: ", b: true, color: C.dark }, { text: "lists go to a lookup, Recall 1.00" }], bullet: true },
      { runs: [{ text: "The access filter: ", b: true, color: C.dark }, { text: "every strategy runs inside it" }], bullet: true }], bodySize: 12, paraSpace: 5 });
  S.card(s, { x: 5.1, y: 1.55, w: 4.3, h: 2.85, title: "Off, for now", titleSize: 14, edge: C.amber, icon: I.times, iconInline: true,
    body: [{ runs: [{ text: "HyDE, multi-query: ", b: true, color: C.dark }, { text: "an LLM call per question, no gain over hybrid + re-rank" }], bullet: true },
      { runs: [{ text: "Parent-document: ", b: true, color: C.dark }, { text: "helped the PDF case; a second index to keep in sync" }], bullet: true },
      { runs: [{ text: "GraphRAG: ", b: true, color: C.dark }, { text: "not our kind of question" }], bullet: true },
      { runs: [{ text: "Watch: ", b: true, color: C.dark }, { text: "p95 latency, router misroutes" }], bullet: true }], bodySize: 12, paraSpace: 5 });
  num(s);

  // ---------------------------------------------------------------- 30 After class
  s = S.darkSlide(deck, { section: "After class", icon: I.tasks, kicker: "AFTER CLASS", title1: "Your turn",
    subtitle: "Four exercises on checkpoint 6, then the reference slides", footer: "exercises  ·  reference  ·  commands",
    notes: `About: Everything after this slide is for reading at home.` });
  num(s, true);

  // ---------------------------------------------------------------- 31 exercises
  s = S.contentSlide(deck, {
    section: "After class", title: "Tonight",
    subtitle: "Each exercise ends with a number from compare.py or judge.py, and one sentence explaining it.",
    takeaway: "Run the tests after each change: pytest checkpoints/checkpoint-6-advanced-retrieval/tests -q",
    notes: `About: Homework. Exercise 2 is the most important: grade the judge.`,
  });
  const ex = [["Beat dense", "Write three golden questions you expect dense to miss. Were you right? Which strategy fixes each, and why?"],
    ["Grade the judge", "Run judge.py --show on five answers and grade them yourself. How often do you agree with the judge?"],
    ["Route the spreadsheet", "Make the router answer \"Which teams grew from Q2 to Q3?\" from the Excel headcount sheet."],
    ["Size the children", "Set CHILD_MAX_CHARS to 120, then 400. What happens to parent on R11 and R12? Explain the move."]];
  ex.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.55 + row * 1.72, w: 4.3, h: 1.58, num: i + 1, title: t, titleSize: 13.5, body: d, bodySize: 11.5, name: `ex-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- R1 metrics
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the retrieval metrics",
    subtitle: "All computed against the golden set, without an LLM. app/evals/metrics.py",
    notes: `About: Definitions and calibration.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.4, 3.6, 3.8], rowH: 0.62, headH: 0.34, size: 11,
    header: ["Metric", "What it is", "Use it when"],
    rows: [[{ text: "Hit@5", b: true, color: C.dark }, "1 if a right document is in the top 5, else 0. Averaged.", "Always first. If Hit@5 is bad, nothing downstream matters."],
      [{ text: "MRR", b: true, color: C.dark }, "1 / rank of the first right document (rank 2 → 0.5).", "Position matters: models read the start of the context more carefully."],
      [{ text: "Recall", b: true, color: C.dark }, "Share of everything that belongs in the answer that reached the LLM.", "Multi-document and list questions."],
      [{ text: "nDCG", b: true, color: C.dark }, "Rank-weighted, with graded relevance (somewhat relevant counts a little).", "Relevance is a spectrum. Often overkill to start."]] });
  s.text("Calibration: naive RAG on a real corpus often scores 0.40 to 0.55 Hit@5; tuned systems 0.60 to 0.75; above 0.90 usually means the questions are too easy (ours are: 24 questions on 89 chunks).",
    { x: 0.6, y: 4.5, w: 8.8, h: 0.55, size: 11.5, italic: true, color: C.slate, name: "calibration" });
  num(s);

  // ---------------------------------------------------------------- R2 managed rerankers & ColBERT
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: other re-rankers",
    subtitle: "The local cross-encoder is the cheapest start. Two alternatives worth knowing.",
    notes: `About: Not used in the checkpoint.`,
  });
  S.card(s, { x: 0.6, y: 1.55, w: 4.3, h: 2.9, title: "Managed re-rank APIs", titleSize: 14, edge: C.deep,
    body: [{ runs: "Cohere Rerank, Voyage, Jina: send the question and 20 candidates, get scores back." },
      { runs: "Reach for one: no model hosting, multilingual out of the box.", bullet: true },
      { runs: "Skip it: data can't leave your network, or the latency budget can't take a network hop.", bullet: true },
      { runs: "Roughly a few dollars per thousand searches. Check current pricing.", bullet: true }], bodySize: 11.5, paraSpace: 5 });
  S.card(s, { x: 5.1, y: 1.55, w: 4.3, h: 2.9, title: "ColBERT: late interaction", titleSize: 14, edge: C.amber,
    body: [{ runs: "Keep one vector per TOKEN, not one per chunk. Score: for each query token, its best-matching chunk token (MaxSim), summed." },
      { runs: "Between bi-encoder speed and cross-encoder quality.", bullet: true },
      { runs: "10 to 20 times the index size. Thinner tooling (RAGatouille helps).", bullet: true }], bodySize: 11.5, paraSpace: 5 });
  num(s);

  // ---------------------------------------------------------------- R3 multi-vector & parent rule
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: multi-vector retrieval",
    subtitle: "Same document, several search faces: a summary, a few likely questions. Any hit returns the original.",
    notes: `About: Not built in the checkpoint; a good extension. LLM calls happen once, at indexing time, not per query.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 4.6, h: 2.95, label: "SKETCH", size: 11, lines: [
    "for doc in sections:",
    "    faces = [summary(doc)]",
    "    faces += likely_questions(doc, n=3)",
    "    for face in faces:",
    "        children.add(text=face,",
    "            meta={**doc.meta,",
    "                  \"parent_id\": doc.id})", "",
    "# query: search the faces,",
    "# return the parents (like parent())"] });
  S.card(s, { x: 5.45, y: 1.55, w: 3.95, h: 2.95, title: "Parent or multi-vector?", titleSize: 14, edge: C.deep,
    body: [{ runs: [{ text: "Parent-document: ", b: true, color: C.dark }, { text: "the default. Documents with structure, the chunk-size trade-off hurts." }] },
      { runs: [{ text: "Summaries: ", b: true, color: C.dark }, { text: "high-level questions about long, detailed documents." }] },
      { runs: [{ text: "Hypothetical questions: ", b: true, color: C.dark }, { text: "users and documents speak different languages (FAQs, support)." }] },
      { runs: "Move past parent-document only when you can name the failure you're fixing." }], bodySize: 11.5, paraSpace: 6 });
  num(s);

  // ---------------------------------------------------------------- R4 synthetic questions
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: synthetic questions",
    subtitle: "An LLM can write eval questions from your corpus. Useful for exploring. Never for proof.",
    notes: `About: RAGAS and others can generate test sets. Read every generated question before it goes anywhere near a golden set.`,
  });
  S.card(s, { x: 0.6, y: 1.55, w: 4.3, h: 2.75, title: "Use them for", titleSize: 14, edge: C.deep,
    body: [{ runs: "Exploration: what kinds of questions does the system handle?", bullet: true }, { runs: "Coverage: topics your hand-written set misses", bullet: true },
      { runs: "Stress tests: multi-hop or adversarial probes", bullet: true }, { runs: "Day one, when you have no golden set yet", bullet: true }], bodySize: 12, paraSpace: 5 });
  S.card(s, { x: 5.1, y: 1.55, w: 4.3, h: 2.75, title: "Never for", titleSize: 14, edge: C.red,
    body: [{ runs: "The golden set: an LLM's question graded by an LLM judge is two LLMs agreeing", bullet: true },
      { runs: "Customer claims: \"92% on synthetic\" means nothing to a customer", bullet: true },
      { runs: "Regression baselines: if the set changes every run, the delta is noise", bullet: true }], bodySize: 12, paraSpace: 5 });
  num(s);

  // ---------------------------------------------------------------- R5 commands
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the commands",
    subtitle: "From checkpoints/checkpoint-6-advanced-retrieval. Each script works from any folder.",
    notes: `About: Replay of everything run in class.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 4.3, h: 2.95, size: 11, lines: [
    "# once: Monday's SharePoint + index", "python sharepoint.py reset", "python sharepoint.py apply all", "python sync.py --apply",
    "python warmup.py      # models", "", "# the scoreboard", "python compare.py", "python compare.py --llm --details"] });
  S.code(s, { x: 5.1, y: 1.55, w: 4.3, h: 2.95, size: 11, lines: [
    "# one question, many strategies", 'python ask.py "Who works remotely?"', "",
    "# answer quality (LLM, cached)", "python judge.py --strategy dense", "", "# regression", "python compare.py --save-baseline",
    "python compare.py --against-baseline"] });
  num(s);

  return deck;
}

module.exports = { build };

if (require.main === module) {
  (async () => {
    const deck = await build();
    const out = process.argv[2] || ".";
    deck.saveHtml(path.join(out, "s09-preview.html"));
    await deck.savePptx(path.join(out, "s09.pptx"), S.THEME);
    console.log(`slides: ${deck.slides.length}`);
  })().catch(e => { console.error(e); process.exit(1); });
}
