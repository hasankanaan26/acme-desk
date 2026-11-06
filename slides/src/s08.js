// s08.js — Session 8: Production Ingestion (rag-week-bootcamp, checkpoint 5)
const path = require("path");
const { Deck } = require("./kit");
const S = require("./sef");
const { C } = S;
const fa = require("react-icons/fa");

const OUT = process.argv[2] || ".";
const CP = "checkpoints/checkpoint-5-production-ingestion";

async function build() {
  const I = {};
  const want = {
    sync: [fa.FaSyncAlt, C.green], plug: [fa.FaPlug, C.green], file: [fa.FaFileAlt, C.green], shield: [fa.FaShieldAlt, C.green],
    chart: [fa.FaChartBar, C.green], laptop: [fa.FaLaptopCode, C.green], coffee: [fa.FaCoffee, C.green], tasks: [fa.FaTasks, C.green],
    load: [fa.FaFolderOpen, C.deep], cut: [fa.FaCut, C.deep], vec: [fa.FaVectorSquare, C.deep], db: [fa.FaDatabase, C.deep],
    search: [fa.FaSearch, C.deep], answer: [fa.FaCommentDots, C.deep], clock: [fa.FaHistory, C.red],
    list: [fa.FaListUl, C.deep], download: [fa.FaDownload, C.deep], tag: [fa.FaTags, C.deep],
    redo: [fa.FaRedo, C.deep], pages: [fa.FaListOl, C.deep], finger: [fa.FaFingerprint, C.deep], trash: [fa.FaTrashAlt, C.deep],
    lockR: [fa.FaLock, C.red], lockG: [fa.FaLock, C.deep], unlock: [fa.FaUnlockAlt, C.red], filter: [fa.FaFilter, C.deep], filterA: [fa.FaFilter, C.amber],
    secret: [fa.FaUserSecret, C.deep], link: [fa.FaLink, C.deep], building: [fa.FaBuilding, C.deep],
    warn: [fa.FaExclamationTriangle, C.amber], check: [fa.FaCheckCircle, C.deep], times: [fa.FaTimesCircle, C.red],
    pdf: [fa.FaFilePdf, C.red], pdfG: [fa.FaFilePdf, C.deep], scan: [fa.FaImage, C.red], code: [fa.FaCode, C.deep],
    cal: [fa.FaCalendarAlt, C.deep], users: [fa.FaUsers, C.deep], book: [fa.FaBookOpen, C.deep], key: [fa.FaKey, C.deep],
    cloud: [fa.FaCloud, C.deep], chat: [fa.FaComments, C.deep], folder: [fa.FaFolder, C.deep], mail: [fa.FaEnvelope, C.deep],
    git: [fa.FaCodeBranch, C.deep], box: [fa.FaBoxOpen, C.deep], idcard: [fa.FaIdBadge, C.deep], robot: [fa.FaRobot, C.deep],
    vote: [fa.FaHandPaper, C.green], flask: [fa.FaFlask, C.deep], layers: [fa.FaLayerGroup, C.green],
  };
  for (const [k, [comp, color]] of Object.entries(want)) I[k] = await S.icon(comp, color);

  const deck = new Deck({ title: "Production Ingestion", author: "SE Factory", company: "SE Factory",
    subject: "Applied AI Engineering Workshop · RAG in production · Production Ingestion" });
  let n = 0;
  const num = (s, dark) => S.slideNumber(s, ++n, dark);

  // ---------------------------------------------------------------- 1 Title
  let s = S.darkSlide(deck, {
    section: "Opening", icon: I.sync,
    kicker: "APPLIED AI ENGINEERING WORKSHOP  ·  RAG IN PRODUCTION",
    title1: "Production", title2: "Ingestion",
    subtitle: "The right documents, at the right version, for the right people",
    detail: "Checkpoint 5: from one folder that never changes to a source that changes every day",
    footer: "Connect  ·  Parse  ·  Govern  ·  Sync  ·  Measure",
    notes: `About: Last session's pipeline ingested one folder that never changes. Today we point it at a source that changes every day, and make it survive: the right documents, the right version, the right readers. Code: checkpoint 5 in rag-week-bootcamp.
Say: "Last time you built RAG from scratch. Today the question is: what happens on Monday, after real people changed real documents over the weekend?"
Explain the subtitle, one phrase at a time: "right documents" = every format gets in, nothing is skipped silently. "Right version" = superseded and draft text stays out of answers. "Right people" = nobody retrieves a chunk they could not open in SharePoint.
Explain the footer: it is the agenda. Five parts, each one a step of an ingestion job: connect to the source, parse each format, govern (permissions, versions, PII), sync (keep the index equal to the source), measure (prove it with numbers).
Frame: ingestion is everything that happens before the first question is asked. If it is wrong, no prompt or re-ranker can fix it, because the right chunk is not in the index, or the wrong one is.
Before class: run python ${CP}/warmup.py on the presenting laptop, then sharepoint.py reset, sync.py --wipe, so the demo starts from Friday.
Next: "Let's start from what you already have."`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 2 Recap
  s = S.contentSlide(deck, {
    section: "Opening", title: "Last session, you built this",
    subtitle: "Checkpoints 1 to 4: one folder of documents that never changes.",
    takeaway: "The pipeline works. The folder is what isn't real.",
    notes: `About: Recap of the RAG pipeline from checkpoints 1 to 4, and the one failure mode from last session that today fixes properly.
Say: "Six steps, all yours. And on the last slide of last session we listed questions RAG struggles with. One was temporal: 'what changed in the latest update?' We said chunks don't carry versions. Today they will."
Ask the room: "What else is different about a real company's documents?" Collect 2-3 answers (permissions, formats, deletions) and park them; every one comes back today.
Explain the six boxes (the caption under each is what checkpoint 4 does): Load reads every file in data/ into one string. Chunk cuts it into 500-character windows with 50 characters of overlap. Embed turns each chunk into a vector. Store upserts the vectors into Chroma with ids like leave-policy.md_2. Retrieve embeds the question and returns the nearest chunks. Answer puts those chunks in a prompt for the LLM.
Explain the red box: the temporal failure is the one we fix properly today. The text "up to $50 per person" carries no date, so the model cannot know it was replaced. The fix is not in the prompt; it is metadata stored on the chunk at ingest time.
Key line: nothing in the six steps is wrong. What is fake is the input: a folder nobody edits, everybody may read, and nothing is ever deleted from.
If asked "So do we throw checkpoint 4 away?": no. Retrieve and Answer barely change today. Load, Chunk and Store get replaced by a sync job, and Retrieve gains a filter.
Next: "Before we fix it, where does the effort in a real RAG project go?"`,
  });
  const steps = [["Load", I.load, "read every file"], ["Chunk", I.cut, "500-char windows"], ["Embed", I.vec, "text → vector"],
    ["Store", I.db, "upsert in Chroma"], ["Retrieve", I.search, "nearest chunks"], ["Answer", I.answer, "LLM + context"]];
  steps.forEach(([label, ic, what], i) => {
    const x = 0.6 + i * 1.5;
    s.rect({ x, y: 1.65, w: 1.25, h: 1.15, fill: C.white, line: C.line, name: `pipe-${i}` });
    s.image(ic, { x: x + 0.43, y: 1.76, w: 0.38, h: 0.38, name: `pipe-icon-${i}` });
    s.text(label, { x, y: 2.17, w: 1.25, h: 0.3, font: "Arial", size: 13, bold: true, color: C.dark, align: "center", name: `pipe-label-${i}` });
    s.text(what, { x: x + 0.05, y: 2.47, w: 1.15, h: 0.26, size: 10, color: C.gray, align: "center", name: `pipe-what-${i}` });
    if (i < steps.length - 1) S.arrow(s, x + 1.27, 2.22, x + 1.48, 2.22, C.gray, 1.25);
  });
  s.rect({ x: 0.6, y: 3.15, w: 8.8, h: 1.65, fill: C.white, line: C.red, lineWidth: 1, name: "temporal-box" });
  s.image(I.clock, { x: 0.85, y: 3.35, w: 0.42, h: 0.42, name: "temporal-icon" });
  s.text("LAST SESSION'S FAILURE GALLERY: TEMPORAL", { x: 1.45, y: 3.35, w: 7.6, h: 0.3, size: 11, bold: true, color: C.redText, charSpacing: 1, name: "temporal-kicker" });
  s.text([
    [{ text: "\"What changed in the latest policy update?\"", i: true, color: C.ink, size: 15 }],
    [{ text: "Why it failed: chunks don't carry versions or dates. Today they will, along with who may read them, and what to do when the file changes, moves or disappears.", size: 12.5, color: C.slate }],
  ], { x: 1.45, y: 3.7, w: 7.75, h: 1.0, paraSpace: 6, name: "temporal-text" });
  num(s);

  // ---------------------------------------------------------------- 3 Where time goes
  s = S.contentSlide(deck, {
    section: "Opening", title: "Where production RAG time actually goes",
    subtitle: "A rough split from real projects. Not a survey: an order of magnitude.",
    takeaway: "Retrieval tricks get the blog posts. Ingestion gets the incidents.",
    notes: `About: Sets expectations: most RAG engineering effort is data plumbing, not embeddings or prompts. The numbers are an experienced estimate, say so.
Say: "If you only know how to retrieve and re-rank, you're useful for two weeks. If you can get messy data into a RAG system reliably, and keep it right, you're useful for years."
Don't defend the exact percentages; the order is the point.
Explain each bar with what the work actually is (the grey caption under each bar):
- Ingestion (60%): connectors and auth, a parser per format, permissions and versions on every chunk, a sync that notices edits and deletions, re-runs when something breaks at 2 a.m.
- Retrieval tuning (20%): chunk sizes, hybrid search, re-ranking, filters. Next session.
- Evaluation and monitoring (15%): a golden set, metrics on every change, dashboards, user feedback.
- Prompt engineering (5%): the system prompt, citation format, refusal wording. Small, because a prompt cannot add a fact the retriever never found.
Why ingestion dominates: every source is different, and it is never finished. Documents change daily, so ingestion is a job that runs forever, not a script you run once.
If asked "Where do these numbers come from?": experience across projects, not a study. Ask anyone who shipped an internal RAG system; the ordering is what they will agree on.
Next: "So let's meet the data source we'll fight with today."`,
  });
  // [label, percent, bar fill, label text colour (darker, readable), tag, what the work is]
  const bars = [["Ingestion & data plumbing", 60, C.deep, C.deep, "today", "connectors, parsers, permissions, versions, sync"],
    ["Retrieval tuning", 20, C.teal, C.tealText, "", "chunking, hybrid search, re-ranking, filters"],
    ["Evaluation & monitoring", 15, C.amber, C.amberDeep, "", "golden sets, metrics on every change, dashboards"],
    ["Prompt engineering", 5, C.gray, C.gray, "", "system prompt, citations, refusals"]];
  bars.forEach(([label, pct, color, textColor, tag, what], i) => {
    const y = 1.7 + i * 0.8;
    s.text(label, { x: 0.6, y, w: 2.9, h: 0.5, size: 14, bold: i === 0, color: C.dark, valign: "middle", name: `bar-label-${i}` });
    s.rect({ x: 3.6, y: y + 0.08, w: 5.0, h: 0.34, fill: C.line, name: `bar-track-${i}` });
    s.rect({ x: 3.6, y: y + 0.08, w: 5.0 * pct / 100, h: 0.34, fill: color, name: `bar-${i}` });
    s.text(what, { x: 3.6, y: y + 0.45, w: 5.0, h: 0.24, size: 10.5, color: C.gray, name: `bar-what-${i}` });
    s.text(`${pct}%`, { x: 8.7, y, w: 0.8, h: 0.5, font: "Arial", size: 18, bold: true, color: textColor, valign: "middle", name: `bar-pct-${i}` });
    if (tag) S.chip(s, { x: 3.6 + 5.0 * pct / 100 + 0.1, y: y + 0.11, w: 0.85, h: 0.28, text: "TODAY", fill: C.green, color: C.dark, name: "bar-today" });
  });
  num(s);

  // ---------------------------------------------------------------- 4 Acme SharePoint
  s = S.contentSlide(deck, {
    section: "Opening", title: "Meet Acme's SharePoint",
    subtitle: "data/enterprise: Friday's snapshot. 20 files, 7 sites, 7 formats, one register, five users.",
    takeaway: "sharepoint.py plays SharePoint: reset to Friday, then replay the weekend's changes.",
    notes: `About: The scenario for the whole session (and next). Same company as last session (Acme Corp), now organised the way a company stores documents: sites, owners, permissions, versions.
Say: "Same Acme, same leave and expense policies you know. But now there are seven sites, seven formats, and a register: the list SharePoint keeps about each file. Five people will ask questions: an intern, an engineering manager, an HR partner, a finance lead and a sales rep."
Show: ${CP}/../../data/enterprise in the explorer, then register.json for one entry.
Explain the grid: each box is a SharePoint site (a folder with its own owner and permissions). The green text is the file formats found there. Engineering is the messy one: five formats in seven files, which is what an engineering site really looks like.
Explain the register entry, field by field: doc_id is a stable name that survives renames. path is where the file lives. owner is who to ask when it is wrong. allowed_groups is who may read it. status says whether it is in force. effective_from says since when. None of this is written inside the file itself.
Explain the five users: each one belongs to different groups (identities.json). The intern is in employees + engineering; the HR partner adds hr + managers; the finance lead adds finance + leadership. The same question gets different correct answers depending on who asks.
Analogy: the files are the books; the register is the library catalogue card (who may borrow it, which edition, when it was withdrawn).
If asked "Why simulate SharePoint instead of using it?": so everyone can run it offline and replay the same weekend. sharepoint.py does to a folder what real users do to SharePoint: add, edit, delete, re-permission.
Next: "First, let's do the obvious thing: point checkpoint 4 at it."`,
  });
  const sites = [["hr", "5 files", "md"], ["finance", "3 files", "md, xlsx"], ["engineering", "7 files", "md, pdf, docx, html, eml"],
    ["it", "2 files", "eml, csv"], ["company", "1 file", "md"], ["people", "1 file", "csv"], ["leadership", "1 file", "md"]];
  sites.forEach(([name, count, fmts], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 2.55, y = 1.6 + row * 0.82;
    s.rect({ x, y, w: 2.4, h: 0.68, fill: C.white, line: C.line, name: `site-${name}` });
    s.image(I.folder, { x: x + 0.14, y: y + 0.16, w: 0.36, h: 0.36, name: `site-icon-${name}` });
    s.text([[{ text: name, b: true, color: C.dark, size: 13, font: "Arial" }, { text: "   " + count, color: C.gray, size: 11 }], [{ text: fmts, color: C.deep, size: 10.5 }]],
      { x: x + 0.6, y: y + 0.08, w: 1.75, h: 0.55, valign: "middle", name: `site-text-${name}` });
  });
  S.code(s, { x: 5.85, y: 1.6, w: 3.55, h: 1.75, label: "register.json (one entry)", size: 10.5, lines: [
    '{ "doc_id": "HR-SALARY-BANDS-2026",', '  "path": "hr/salary-bands-2026.md",', '  "owner": "People Operations",',
    '  "allowed_groups": ["employees"],', '  "status": "current",', '  "effective_from": "2026-01-01" }'] });
  s.text("FIVE USERS", { x: 5.85, y: 3.55, w: 3.5, h: 0.25, size: 10, bold: true, color: C.deep, charSpacing: 1, name: "users-kicker" });
  ["intern", "eng-manager", "hr-partner", "finance-lead", "sales-rep"].forEach((u, i) => {
    S.chip(s, { x: 5.85 + (i % 3) * 1.2, y: 3.85 + Math.floor(i / 3) * 0.4, w: 1.12, h: 0.3, text: u, size: 10, name: `user-${u}` });
  });
  // the empty eighth slot of the site grid explains the register
  s.rect({ x: 3.15, y: 4.06, w: 2.4, h: 0.68, fill: C.pale, name: "register-note-bg" });
  s.text([[{ text: "register.json ", b: true, color: C.deep }, { text: "is what SharePoint knows about a file: who may read it, its status and dates." }]],
    { x: 3.25, y: 4.06, w: 2.22, h: 0.68, size: 10, color: C.slate, valign: "middle", name: "register-note" });
  num(s);

  // ---------------------------------------------------------------- 5 Checkpoint 4's ingest on Friday
  s = S.contentSlide(deck, {
    section: "Opening", title: "Checkpoint 4's /ingest, run on Friday",
    subtitle: "Checkpoint 4's code, unchanged, pointed at this SharePoint: python sync.py --naive",
    takeaway: "No error. No warning. It looked like it worked.",
    notes: `About: Run checkpoint 4's ingest logic (kept verbatim in app/ingest/naive.py) against the enterprise folder. It "succeeds".
Demo: python ${CP}/sharepoint.py reset  then  python ${CP}/sync.py --naive
Expected: 50 chunks upserted; silently skipped: onboarding-guide.docx, release-4.2.eml, wiki-vector-database.html, q3-metrics.xlsx, phishing-notice-2026-10.eml; embedded EMPTY text from incident-report-scanned.pdf.
Say: "Five files never made it in, and nobody was told. A scanned PDF went in as an empty string, which has a vector like any other text. And everyone can read everything."
Explain card by card:
- 50 chunks: this looks like success. It is everything checkpoint 4 COULD read, chopped into windows.
- 5 of 20 skipped: the loader only knows .md, .txt, .csv, .pdf and .json. Anything else is skipped with no log line, so a quarter of the company's knowledge is missing and the dashboard is green.
- 1 empty scan: pypdf returned "" for the scanned incident report. An empty string still gets a vector, so it sits in the index as noise that can match random questions.
- 0 permissions: the index has no idea who may read what, so every search runs over every chunk, including salary bands and leadership notes.
Explain the bottom line: HTTP 200 only means "nothing crashed". It says nothing about what got in. The scariest failures in data pipelines are the ones that return success.
If asked "Why not just add the missing formats?": that fixes one card of four, and only for Friday. Wait for the weekend.
Next: "And that's before anyone touches a file."`,
  });
  const fri = [["50", "chunks stored", C.deep, "Everything it could read, upserted with ids like leave-policy.md_2"],
    ["5 of 20", "files silently skipped", C.redText, ".docx, .xlsx, .html and two emails: formats it never learned"],
    ["1", "scan embedded as empty text", C.redText, "pypdf found no text layer; the empty string got a vector anyway"],
    ["0", "permissions, versions, owners", C.redText, "The salary bands and the leadership notes are one search away for everyone"]];
  fri.forEach(([v, l, color, body], i) => {
    const x = 0.6 + i * 2.23;
    s.rect({ x, y: 1.65, w: 2.08, h: 2.6, fill: C.white, line: C.line, name: `fri-card-${i}` });
    S.stat(s, { x: x + 0.18, y: 1.75, w: 1.8, value: v, label: l, color, size: 34, labelSize: 12.5, labelColor: C.dark, name: `fri-${i}` });
    s.text(body, { x: x + 0.18, y: 3.2, w: 1.75, h: 0.95, size: 11.5, color: C.slate, name: `fri-body-${i}` });
  });
  s.text([[{ text: "POST /ingest  →  ", font: "Consolas", color: C.slate }, { text: "200 OK", font: "Consolas", b: true, color: C.deep },
    { text: "     200 means nothing crashed, not that everything got in", italic: true, color: C.gray, size: 12 }]],
    { x: 0.6, y: 4.45, w: 8.8, h: 0.4, size: 14, align: "center", valign: "middle", name: "fri-ok" });
  num(s);

  // ---------------------------------------------------------------- 6 The weekend
  s = S.contentSlide(deck, {
    section: "Opening", title: "Then the weekend happens",
    subtitle: "Five ordinary changes. python sharepoint.py apply all replays them.",
    takeaway: "Nothing exotic. This is a normal Monday in any company.",
    notes: `About: The five events in data/enterprise/events/events.json. Each one breaks a different assumption of checkpoint 4.
Demo: python ${CP}/sharepoint.py events   then   python ${CP}/sharepoint.py apply all
Say each in one line. Point out event 4: "not one word of the file changes, only who may read it." And event 5: "a footer, the article is identical."
Explain each red chip (what checkpoint 4's /ingest does with the event):
1. New expense policy: checkpoint 4 adds the 2026 chunks but keeps the 2023 ones as equals. Nothing says which is in force, and for team dinners the 2023 chunk ranks first.
2. Leave policy gets shorter: chunk ids are leave-policy.md_0, _1, _2 ... The new, shorter version has fewer windows, so it overwrites only the first ids. The old last chunks stay behind as orphans, quoting sections that no longer exist (unpaid leave, public holidays).
3. Notes deleted: upsert only ever writes. Nothing compares the index with the folder, so the deleted notes stay searchable forever.
4. Permissions fixed: the file's bytes did not change, but who may read it did. Checkpoint 4 never stored permissions, so it has nothing to update.
5. Footer edited: the bytes changed but the text that matters did not. Checkpoint 4 cannot tell the difference and re-embeds everything, every run, and pays for it.
The visible line at the bottom names the five hidden assumptions these events break.
Next: "You know checkpoint 4's code. Predict what it does on Monday."`,
  });
  const ev = [["Finance publishes the 2026 Expense Policy", "The 2023 policy and its 2024 update become superseded"],
    ["HR edits the Leave Policy", "Carry-over 5 → 10 days; two sections move out; the file gets shorter"],
    ["Legal withdraws the Q3 planning notes", "The file is deleted from SharePoint"],
    ["HR fixes who can read the salary bands", "Shared with every employee by mistake; now HR and managers only"],
    ["Someone edits the wiki page footer", "The copyright year changes; the article does not"]];
  // what each event does to checkpoint 4's /ingest
  const breaks = ["serves the old rules", "keeps orphan chunks", "never deletes it", "has no permissions", "re-embeds everything"];
  s.line({ x: 0.82, y: 1.87, w: 0, h: 2.48, color: C.line, width: 2, name: "timeline" });
  s.text("CHECKPOINT 4'S /INGEST", { x: 6.95, y: 1.3, w: 2.45, h: 0.25, size: 9.5, bold: true, color: C.redText, charSpacing: 1, align: "center", name: "breaks-kicker" });
  s.text([[{ text: "Assumptions it breaks: ", b: true, color: C.dark }, { text: "one version per topic, files never shrink or vanish, all may read all, new bytes = new text." }]],
    { x: 0.6, y: 4.74, w: 8.8, h: 0.3, size: 10.5, italic: true, color: C.slate, name: "ev-assumptions" });
  ev.forEach(([t, d], i) => {
    const y = 1.6 + i * 0.62;
    s.ellipse({ x: 0.6, y: y + 0.05, w: 0.44, h: 0.44, fill: C.deep, name: `ev-dot-${i}` });
    s.text(String(i + 1), { x: 0.6, y: y + 0.05, w: 0.44, h: 0.44, font: "Arial", size: 14, bold: true, color: C.white, align: "center", valign: "middle", name: `ev-num-${i}` });
    s.text([[{ text: t, b: true, color: C.dark, size: 14, font: "Arial" }], [{ text: d, color: C.slate, size: 12 }]],
      { x: 1.25, y, w: 5.55, h: 0.58, valign: "middle", name: `ev-text-${i}` });
    S.chip(s, { x: 6.95, y: y + 0.12, w: 2.45, h: 0.32, text: breaks[i], fill: C.redSoft, color: C.redText, size: 10.5, name: `ev-break-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 7 Predict
  s = S.contentSlide(deck, {
    section: "Opening", title: "Predict: checkpoint 4's index on Monday",
    subtitle: "You know its code: ids are file_n, it upserts, never deletes, and has no register. Re-run it after the weekend.",
    takeaway: "Vote first. Then we measure.",
    notes: `About: A prediction with enough groundwork: they wrote checkpoint 4's ingest, and they just saw the five events.
Ask: "Which of these happens?" Hands up for A, B, C, D.
Answer: D, all three. A: the 2023 chunk ('up to $50 per person') still ranks first for team dinners. B: the deleted notes' chunks were never deleted (upsert never removes). C: there is no permission filter at all, so the intern gets the salary bands.
Demo before revealing: python ${CP}/sync.py --naive (re-run after the events), then evaluate on the next slide.
How to run the vote: read each option aloud, give 10 seconds, count hands. Most rooms split between A and C; few pick B because "surely it deletes?". Then reveal D.
Explain why each one happens, using only facts they know about checkpoint 4 (the hint line on the slide):
- A: upsert added the 2026 policy but never removed or demoted the 2023 one. Both are "true" to the index; similarity decides, and the 2023 wording is closer to the question.
- B: ids are file_n and upsert only writes the ids it produces. The deleted file produces no ids, so nothing overwrites or deletes its old chunks.
- C: there is no user in checkpoint 4's search at all. Every chunk is a candidate for every person.
The lesson: none of these is a bug in a single line. They come from what the pipeline never asked: what is in the index that the source no longer has, and who is asking.
Next: "Let's measure it instead of guessing."`,
  });
  const opts = [["A", "Asked about team dinners, it quotes the 2023 limit", I.clock],
    ["B", "The withdrawn planning notes are still searchable", I.trash],
    ["C", "The intern can read the salary bands", I.unlock],
    ["D", "All three", I.vote]];
  opts.forEach(([letter, text, ic], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 4.45, y = 1.65 + row * 1.42;
    s.rect({ x, y, w: 4.3, h: 1.28, fill: C.white, line: C.line, name: `opt-${letter}` });
    s.ellipse({ x: x + 0.25, y: y + 0.36, w: 0.56, h: 0.56, fill: letter === "D" ? C.green : C.dark, name: `opt-dot-${letter}` });
    s.text(letter, { x: x + 0.25, y: y + 0.36, w: 0.56, h: 0.56, font: "Arial", size: 18, bold: true, color: letter === "D" ? C.dark : C.white, align: "center", valign: "middle", name: `opt-letter-${letter}` });
    s.text(text, { x: x + 1.0, y: y + 0.14, w: 2.75, h: 1.0, size: 15, color: C.dark, valign: "middle", name: `opt-text-${letter}` });
    s.image(ic, { x: x + 3.78, y: y + 0.46, w: 0.36, h: 0.36, name: `opt-icon-${letter}` });
  });
  s.text([[{ text: "Hint: ", b: true, color: C.deep }, { text: "upsert only writes the ids it produces. Nothing asks what the index holds that the source no longer has, or who is asking." }]],
    { x: 0.6, y: 4.5, w: 8.8, h: 0.45, size: 11.5, color: C.slate, valign: "middle", name: "predict-hint" });
  num(s);

  // ---------------------------------------------------------------- 8 Monday measured (naive)
  s = S.contentSlide(deck, {
    section: "Opening", title: "Monday, measured: checkpoint 4's index",
    subtitle: "31 hand-written questions, top 5 chunks each, judged against the register and the files.",
    takeaway: "Hit@5 is 0.81, so a quality dashboard looks fine. The safety numbers are what hurt.",
    notes: `About: The result of evaluate.py --only naive on Monday's state. Every number on this slide is reproducible on a student laptop (local embeddings).
Demo: python ${CP}/evaluate.py --only naive --details
Say: "Seven questions put a chunk in front of the model that the person asking may not read. Fourteen put an old version or a draft in front of it. Eleven put a chunk of a deleted document, or of text that's no longer in the file. And the top answer for team dinners is the 2023 rule."
Then: "Everything for the rest of the session is about getting these four numbers to zero."
Explain how the numbers are made: for each of the 31 questions we take the top 5 chunks (what the LLM would see) and check each chunk against the source of truth: the CURRENT register and files. One bad chunk is enough to flag the question. So "7 of 31" means 7 questions, not 7 chunks.
Explain the four rows: leak = the asker's groups may not open that document. Stale = superseded or draft. Ghost = the document is deleted, or that text is no longer in the file (the leave policy's orphans). PII = a personal email or phone number in the chunk.
Explain why Hit@5 of 0.81 is misleading: Hit@5 asks "did a right document appear in the top 5?" It does not ask what ELSE appeared. A system can find the right answer and still hand the model a forbidden chunk next to it.
Explain the Q18 box: the intern asks a normal question, gets the 2023 chunk at rank 1 and the 2026 one at rank 2. Two contradicting answers, both look official, and nothing tells the model which is in force. The LLM picks one; you can't predict which.
If asked "Is no LLM involved?": right, this is retrieval only. If the wrong chunk is in the context, the answer is already at risk; we don't need to generate to know that.
Next: "Part 1: connecting to the source properly."`,
  });
  const naive = [["7 of 31", "questions show the model a chunk the user may NOT read", C.redText],
    ["14 of 31", "show a superseded document or a draft", C.redText],
    ["11 of 31", "show a deleted document, or text no longer in the file", C.redText],
    ["4 of 31", "show personal phone numbers or emails", C.amberDeep]];
  naive.forEach(([v, l, color], i) => {
    const y = 1.6 + i * 0.73;
    s.text(v, { x: 0.6, y, w: 1.75, h: 0.62, font: "Arial", size: 30, bold: true, color, valign: "middle", name: `naive-v-${i}` });
    s.text(l, { x: 2.4, y, w: 3.0, h: 0.62, size: 13, color: C.dark, valign: "middle", name: `naive-l-${i}` });
  });
  s.text([[{ text: "\"Show\" ", b: true, color: C.dark }, { text: "= among the top 5 chunks handed to the LLM. One bad chunk flags the whole question." }]],
    { x: 0.6, y: 4.5, w: 4.9, h: 0.42, size: 10.5, italic: true, color: C.slate, name: "naive-how" });
  s.rect({ x: 5.75, y: 1.65, w: 3.65, h: 3.25, fill: C.white, line: C.red, name: "dinner-box" });
  s.text("Q18 · asked by the intern", { x: 5.95, y: 1.78, w: 3.3, h: 0.28, size: 10.5, bold: true, color: C.redText, charSpacing: 0.5, name: "dinner-kicker" });
  s.text("\"How much can I spend per person on a team dinner?\"", { x: 5.95, y: 2.1, w: 3.3, h: 0.62, size: 13.5, italic: true, color: C.ink, name: "dinner-q" });
  s.text("#1 of 5: expense-policy.md", { x: 5.95, y: 2.85, w: 3.3, h: 0.28, size: 11, bold: true, color: C.dark, name: "dinner-rank" });
  s.text(["\"Team meals and events:", " up to $50 per person.\""], { x: 5.95, y: 3.15, w: 3.3, h: 0.5, font: "Consolas", size: 10.5, color: C.slate, name: "dinner-chunk" });
  s.text([[{ text: "The 2023 rule. ", b: true, color: C.redText }, { text: "Since 1 November it is $90.", color: C.dark }]], { x: 5.95, y: 3.78, w: 3.3, h: 0.32, size: 12.5, name: "dinner-verdict" });
  s.text("The current policy came back too, at #2. Nothing told the model which one is in force.", { x: 5.95, y: 4.15, w: 3.3, h: 0.62, size: 11, italic: true, color: C.slate, name: "dinner-note" });
  num(s);

  // ================================================================ PART 1 CONNECT
  s = S.darkSlide(deck, { section: "Connect", icon: I.plug, kicker: "PART 1 OF 5", title1: "Connect",
    subtitle: "Pull documents from where they live, and notice when they change", footer: "list  ·  fetch  ·  describe",
    detail: "What exists right now? What changed since last night? What do we know about each file, besides its text?",
    notes: `About: Connectors. Short part: the pattern matters more than any one API.
Explain: a connector is the only code that talks to the source system. Everything after it (parsing, chunking, embedding) should not care whether the file came from SharePoint, Google Drive or a folder.
Frame the part with the three questions on the slide. Checkpoint 4 only ever asked "give me the files"; it never asked what changed or what the source knows about each file.
Time: about 10 minutes. Keep it moving; the meat is in Govern and Sync.
Next: "Every connector, whatever the API, answers three questions."` });
  num(s, true);

  // ---------------------------------------------------------------- 10 three questions
  s = S.contentSlide(deck, {
    section: "Connect", title: "A connector answers three questions",
    subtitle: "SharePoint, Confluence, Drive, Slack, S3: different APIs, the same three questions.",
    takeaway: "Swap this class for a Microsoft Graph client and nothing else in the pipeline changes.",
    notes: `About: app/ingest/connector.py. LocalFolderConnector stands in for a SharePoint document library.
Say: "Every source answers three questions. What exists right now, with a cheap change signal (the eTag). Give me the bytes. What do you know about it: owner, permissions, status. That third one is the one tutorials skip."
Real thing: Graph's delta query returns changed AND deleted items since your last token, so you never re-list 50,000 files.
Open the file and show list_items(): it computes an eTag as a SHA-256 of the bytes; a real source hands you one.
Explain the eTag: a short fingerprint the source gives each file version. If the eTag is the same as last night, the file did not change, so we don't even download it. It is the cheapest change signal there is.
Explain each row: grey line = the real Microsoft Graph call that does the same job. 1) delta returns only what changed or was deleted since your last token. 2) /content downloads the bytes. 3) /permissions plus the metadata columns (here, the register) say who may read it and whether it is in force.
Why the third question matters: permissions and status are not in the file's text. If the connector doesn't fetch them, no later step can invent them.
If asked "What's a delta token?": a bookmark the API hands you after each sync. Next time you send it back and get only the changes since then, including deletions. Without it you'd re-list every file every night.
If asked "Why a class here when the repo avoids classes?": the connector is the one swappable part, so it's grouped. Everything else stays plain functions.
Next: "Getting the bytes is the easy part. Getting permission to get them is where integrations die."`,
  });
  const qs3 = [["What exists right now?", "list_items()  →  path, size, modified, eTag", "Graph: GET /drives/{id}/root/delta", I.list],
    ["Give me the bytes", "fetch(path)  →  bytes", "Graph: GET /items/{id}/content", I.download],
    ["What do you know about it?", "fetch_register()  →  owner, groups, status, dates", "Graph: /items/{id}/permissions + the register", I.tag]];
  qs3.forEach(([q, ours, graph, ic], i) => {
    const y = 1.6 + i * 1.12;
    s.rect({ x: 0.6, y, w: 5.0, h: 1.0, fill: C.white, line: C.line, name: `q3-box-${i}` });
    s.ellipse({ x: 0.78, y: y + 0.28, w: 0.44, h: 0.44, fill: C.deep, name: `q3-dot-${i}` });
    s.text(String(i + 1), { x: 0.78, y: y + 0.28, w: 0.44, h: 0.44, font: "Arial", size: 14, bold: true, color: C.white, align: "center", valign: "middle", name: `q3-num-${i}` });
    s.text([[{ text: q, b: true, size: 14, color: C.dark, font: "Arial" }], [{ text: ours, font: "Consolas", size: 10.5, color: C.deep }], [{ text: graph, size: 10.5, color: C.gray }]],
      { x: 1.4, y: y + 0.08, w: 4.1, h: 0.86, valign: "middle", name: `q3-text-${i}` });
  });
  S.code(s, { x: 5.85, y: 1.6, w: 3.55, h: 3.25, label: "app/ingest/connector.py", size: 11, lines: [
    "class LocalFolderConnector:", '    """Stands in for SharePoint."""', "",
    "    def list_items(self):", "        # path, size, modified,", "        # eTag = sha256(bytes)[:16]", "",
    "    def fetch(self, path):", "        return bytes", "",
    "    def fetch_register(self):", "        # owner, groups, status, dates", "        return _register.json"] });
  num(s);

  // ---------------------------------------------------------------- 11 connectors & auth
  s = S.contentSlide(deck, {
    section: "Connect", title: "Connectors and auth",
    subtitle: "Most projects connect to 3 to 7 sources. The loader is the easy part; auth is where integrations fail.",
    takeaway: "A scheduled sync runs as a service principal, never as a person.",
    notes: `About: The landscape (left) and the four auth patterns you'll meet (right).
Say: "LangChain and LlamaIndex have a loader for nearly all of these. They hand you documents. They don't hand you auth that survives someone leaving the company, or rate limits, or deletions."
The trap: a personal access token works in the prototype; the day its owner leaves, the sync silently stops and the index slowly goes stale.
Explain the left grid: each source names the auth you'd normally use for a background job. Service principal (Microsoft) and service account (Google) mean the same thing: an identity for a program, not a person, with its own credentials and permissions.
Explain the table row by row:
- API token / PAT: a long-lived password tied to one person. Fine for a demo. It dies when they leave, change role, or the token expires.
- OAuth 2.0: the user clicks "allow" and you act as them. Good when each user should only see their own data; you must handle refresh tokens and revocation.
- Service principal: the app's own identity. Right for a nightly sync. The risk is giving it "read everything" when it needs two sites.
- Managed identity: the cloud gives your app an identity with no secret to store at all. Only works for sources in the same cloud.
Explain the bottom-right line: least privilege (read-only, only the sites you index) and secrets in a vault, rotated on a schedule.
Connect to permissions: the sync account may read everything; the USER may not. That is why we copy permissions onto chunks (Part 3) instead of relying on the sync's own access.
Next: "Even with auth sorted, four things go wrong that a loader won't handle for you."`,
  });
  const srcs = [["SharePoint", "service principal", I.folder], ["Confluence", "API token / OAuth", I.book], ["Google Drive", "service account", I.cloud], ["Slack", "bot token + scopes", I.chat],
    ["Notion", "integration token", I.box], ["GitHub", "GitHub App", I.git], ["S3 / Blob", "managed identity", I.db], ["Email", "OAuth (M365)", I.mail]];
  srcs.forEach(([name, auth, ic], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 2.1, y = 1.6 + row * 0.82;
    s.rect({ x, y, w: 1.98, h: 0.7, fill: C.white, line: C.line, name: `src-${i}` });
    s.image(ic, { x: x + 0.12, y: y + 0.17, w: 0.34, h: 0.34, name: `src-icon-${i}` });
    s.text([[{ text: name, b: true, size: 12, color: C.dark, font: "Arial" }], [{ text: auth, size: 10, color: C.gray }]], { x: x + 0.55, y: y + 0.06, w: 1.4, h: 0.58, valign: "middle", name: `src-text-${i}` });
  });
  s.text([[{ text: "Rule: ", b: true, color: C.deep }, { text: "read-only, least privilege, secrets in a vault and rotated." }]],
    { x: 4.95, y: 4.4, w: 4.45, h: 0.36, size: 11, italic: true, color: C.slate, valign: "middle", name: "auth-rule" });
  S.table(s, { x: 4.95, y: 1.6, cols: [1.45, 1.5, 1.5], rowH: 0.6, headH: 0.34, size: 10,
    header: ["Pattern", "Use when", "Watch out"],
    rows: [[{ text: "API token / PAT", b: true, color: C.dark }, "Prototypes, one-off scripts", "Dies when its owner leaves"],
      [{ text: "OAuth 2.0", b: true, color: C.dark }, "Users grant their own access", "Refresh, revoke, scope drift"],
      [{ text: "Service principal", b: true, color: C.dark }, "Scheduled jobs, server to server", "Easy to over-grant"],
      [{ text: "Managed identity", b: true, color: C.dark }, "Same-cloud sources", "Tied to one cloud"]] });
  num(s);

  // ---------------------------------------------------------------- 12 operational realities
  s = S.contentSlide(deck, {
    section: "Connect", title: "Four things a loader won't do for you",
    subtitle: "A loader is a function. A sync is a job that runs every night for years.",
    takeaway: "Every one of these fails silently. None of them throws.",
    notes: `About: The operational gotchas from real connectors, each mapped to where checkpoint 5 handles it.
Say: rate limits → with_retries in app/rag/embedder.py (1s, 2s, 4s, 8s plus jitter, then give up loudly). Pagination → check counts; exactly 100 results smells like a cap. Change detection → eTag first so unchanged files aren't even downloaded, then the content hash so unchanged text isn't re-embedded. Deletions → the sync compares the index with the source and removes what's gone.
Ask: "Which of these did checkpoint 4 handle?" Answer: none, and it didn't need to, because the folder never changed.
Explain each card (the second line of each problem is the "why it's silent" part):
- Rate limits: embedding APIs allow N requests per minute. Past that they answer 429. Exponential backoff waits longer each time (1, 2, 4, 8 s) and jitter adds a random bit so 20 workers don't all retry at the same instant. After the last attempt it raises: a loud failure beats a half-built index.
- Pagination: APIs return 100 or 200 items per page plus a "next" link. Forget to follow it and you index the first page only. Round numbers in your counts are a smell.
- Change detection: two levels. The eTag says the bytes changed. The content hash (computed after parsing) says the TEXT we would store changed. A new footer changes the first, not the second, so nothing is re-embedded.
- Deletions: a deleted file is an absence. Scanning a folder or listing a drive never "sees" it. The only way is to compare what the index holds with what the source lists, every run.
If asked "Why does a 429 fail silently?": many loaders catch exceptions per document and carry on, so you get 31,000 of 50,000 chunks and a success message.
Next: "Part 2: once we have the bytes, we have to read them."`,
  });
  const ops = [["Rate limits", "429 Too Many Requests, halfway through 50,000 chunks. Many loaders log it, skip the batch, and carry on.", "with_retries(): 1s, 2s, 4s, 8s + jitter, then fail loudly", I.redo],
    ["Pagination", "Results come 100 or 200 at a time, with a \"next\" link. Some loaders quietly stop after the first page.", "Got exactly 100 items? Suspect a cap, and count.", I.pages],
    ["Change detection", "Re-embedding 50,000 unchanged documents every night: slow, and every token is billed.", "eTag first: skip the download. Hash next: skip the embedding.", I.finger],
    ["Deletions", "Deleted in SharePoint, still answering in RAG. A deleted file is an absence: no loader ever sees it.", "Compare index and source every run; remove what's gone", I.trash]];
  ops.forEach(([t, prob, fix, ic], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 4.45, y = 1.6 + row * 1.68;
    s.rect({ x, y, w: 4.3, h: 1.52, fill: C.white, line: C.line, name: `ops-${i}` });
    s.image(ic, { x: x + 0.2, y: y + 0.14, w: 0.36, h: 0.36, name: `ops-icon-${i}` });
    s.text(t, { x: x + 0.72, y: y + 0.12, w: 3.4, h: 0.4, font: "Arial", size: 14, bold: true, color: C.dark, valign: "middle", name: `ops-title-${i}` });
    s.text(prob, { x: x + 0.2, y: y + 0.54, w: 3.95, h: 0.4, size: 11, color: C.slate, name: `ops-prob-${i}` });
    s.text("IN SYNC.PY", { x: x + 0.2, y: y + 1.0, w: 3.95, h: 0.2, size: 9, bold: true, color: C.deep, charSpacing: 0.5, name: `ops-fix-label-${i}` });
    s.text(fix, { x: x + 0.2, y: y + 1.19, w: 3.95, h: 0.28, size: 11, color: C.dark, name: `ops-fix-${i}` });
  });
  num(s);

  // ================================================================ PART 2 PARSE
  s = S.darkSlide(deck, { section: "Parse", icon: I.file, kicker: "PART 2 OF 5", title1: "Parse",
    subtitle: "Every format fights back differently", footer: "sections  ·  headers  ·  quarantine",
    detail: "Can we read every format? Do we keep the headings? And do we notice when a file has no text at all?",
    notes: `About: Parsing. The goal is not just text: it's text with its structure, and knowing when you got no text at all.
Explain the footer words: sections = the parser returns (heading, text) pairs, not one flat string. Headers = every chunk starts with "document title > section heading". Quarantine = a file we cannot read is reported and kept out of the index, instead of going in empty.
Frame: a parser has two jobs. Extract text with its structure, and tell you honestly when it failed. Checkpoint 4 did neither.
Next: "Here's every format in Acme's SharePoint."` });
  num(s, true);

  // ---------------------------------------------------------------- 14 format zoo
  s = S.contentSlide(deck, {
    section: "Parse", title: "The format zoo",
    subtitle: "Seven formats in Acme's SharePoint. Checkpoint 4 read four of them.",
    takeaway: "parsers.py uses the standard library and pypdf only. A .docx is a zip file full of XML.",
    notes: `About: app/ingest/parsers.py: one function per format, each returns sections (heading + text).
Say: "Notice the last column: checkpoint 4 wasn't wrong for its folder. It just never met these formats, and it never told anyone it skipped them."
Show parse_docx: open the .docx with zipfile, read word/document.xml, keep paragraphs under their Heading style. Same trick for .xlsx (sheets, shared strings).
Production alternatives: Unstructured, LlamaParse, Docling, Azure Document Intelligence. Same contract: give me sections, tell me when you failed.
Explain the Difficulty column (the line under the table): it measures how much structure you have to rebuild yourself. Markdown hands you headings. A scan hands you pixels.
Walk the rows that need a word:
- CSV: one section per row, each value labelled with its column name ("name: Jane, phone: ..."), because a bare row of values means nothing to an embedding.
- PDF digital: text exists, but the layout doesn't; columns and repeated headers get mixed into the text.
- Word: a .docx is a ZIP. Inside, word/document.xml holds paragraphs with a style; "Heading 1/2" styles become our section headings.
- Excel: hard because a spreadsheet is a grid, not prose. One section per sheet, each row labelled with the header row.
- HTML: the page is 80% navigation, banners and footers. We keep the article only.
- Email: subject becomes the heading; sender and date are kept because "who said it, when" matters.
If asked "Why not use Unstructured?": you can. We hand-wrote it so you see what those libraries do, and so it runs with no extra installs.
Next: "PDF deserves its own slide, because it lies about what it contains."`,
  });
  s.text("Difficulty = how much structure you must rebuild yourself. Markdown hands you headings; a scan hands you pixels.",
    { x: 0.6, y: 4.72, w: 8.8, h: 0.3, size: 10.5, italic: true, color: C.slate, name: "zoo-difficulty" });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.6, 1.05, 4.15, 2.0], rowH: 0.35, headH: 0.32, size: 10.5,
    header: ["Format", "Difficulty", "What checkpoint 5 does", "Checkpoint 4"],
    rows: [
      [{ text: "Markdown", b: true, color: C.dark }, { text: "easy", color: C.deep, b: true }, "One section per ## heading; heading kept", "read, flattened"],
      [{ text: "CSV", b: true, color: C.dark }, { text: "easy", color: C.deep, b: true }, "One section per row, labelled with column names", "read as one blob"],
      [{ text: "PDF (digital)", b: true, color: C.dark }, { text: "medium", color: C.amberDeep, b: true }, "Text layer, one section per page", "read"],
      [{ text: "PDF (scanned)", b: true, color: C.dark }, { text: "hard", color: C.redText, b: true }, "Detected and quarantined: reported, not indexed", { text: "embedded \"\"", color: C.redText, b: true }],
      [{ text: "Word .docx", b: true, color: C.dark }, { text: "medium", color: C.amberDeep, b: true }, "Zip of XML; paragraphs under their headings", { text: "skipped", color: C.redText, b: true }],
      [{ text: "Excel .xlsx", b: true, color: C.dark }, { text: "hard", color: C.redText, b: true }, "One section per sheet, rows labelled by the header", { text: "skipped", color: C.redText, b: true }],
      [{ text: "HTML", b: true, color: C.dark }, { text: "medium", color: C.amberDeep, b: true }, "The article only: nav, cookie banner, footer dropped", { text: "skipped", color: C.redText, b: true }],
      [{ text: "Email .eml", b: true, color: C.dark }, { text: "medium", color: C.amberDeep, b: true }, "Subject as heading, sender and date, plain body", { text: "skipped", color: C.redText, b: true }],
    ] });
  num(s);

  // ---------------------------------------------------------------- 15 PDF
  s = S.contentSlide(deck, {
    section: "Parse", title: "PDF: a text layer, or a picture of text?",
    subtitle: "pypdf on a scan returns an empty string. Checkpoint 4 embedded it.",
    takeaway: "First step on any PDF corpus: parse ten files and count the empty ones.",
    notes: `About: The first ingestion bug everyone hits. engineering/incident-report-scanned.pdf is one page of pixels.
Say: "A PDF is a presentation format. Sometimes there's text inside, sometimes only an image of text. You have to detect which one you got, not trust the extension."
Our rule (parse_pdf): fewer than 50 characters across all pages → needs_ocr. The sync reports it as quarantine every run until someone OCRs it.
OCR is a cost/quality choice: Tesseract (free, weak on tables), Azure Document Intelligence / AWS Textract (managed, strong on forms), a vision LLM (flexible, slower, pricier).
Explain the two cards: a digital PDF was exported from Word or a web page, so the characters are stored inside it. A scanned PDF is a photo of paper wrapped in a PDF; it contains an image and zero characters. Both have the same .pdf extension and look identical when you open them.
Explain the code box: this is what the sync prints. "1 page(s), 0 characters" is the detection rule in action (the third line): fewer than 50 characters across all pages means it's a scan. The file is reported every run, and not indexed, until someone OCRs it.
Why quarantine beats embedding "": an empty chunk still has a vector, and it lands somewhere in the space. It can match unrelated questions, and it hides the fact that a whole document is missing.
Watch-outs in the digital card: two-column layouts read across the columns; page headers and footers ("Confidential - page 3 of 12") repeat inside every page's text.
If asked "Why 50 characters, not 0?": scans often contain a few stray characters (a page number, a stamp). 50 across the whole document is still clearly "no text".
Next: "Getting the text out is half of it. Keeping its shape is the other half."`,
  });
  S.card(s, { x: 0.6, y: 1.6, w: 4.3, h: 2.05, icon: I.pdfG, iconInline: true, title: "Digital PDF", edge: C.deep,
    body: [{ runs: "The text is in there. Ask nicely." }, { runs: "pypdf, pdfplumber: fast, free, fine for plain text", bullet: true }, { runs: "Watch for columns, tables, headers leaking into the body", bullet: true }], bodySize: 12 });
  S.card(s, { x: 5.1, y: 1.6, w: 4.3, h: 2.05, icon: I.scan, iconInline: true, title: "Scanned PDF", edge: C.red,
    body: [{ runs: "No text: pixels in a PDF wrapper. You need OCR." }, { runs: "Tesseract: free, weak on tables and handwriting", bullet: true }, { runs: "Azure Document Intelligence, Textract, or a vision model", bullet: true }], bodySize: 12 });
  S.code(s, { x: 0.6, y: 3.85, w: 8.8, h: 1.1, label: "python sync.py   (one line of the plan)", size: 10.5, lines: [
    { text: " ! quarantine ENG-INCIDENT-REPORT   1 page(s), 0 characters of text: a scan.", color: C.amber },
    { text: "                                    Queued for OCR, not indexed.", color: C.amber },
    { text: "# the rule in parse_pdf(): under 50 characters across all pages = a scan, needs_ocr", color: C.mintText }] });
  num(s);

  // ---------------------------------------------------------------- 16 structure is signal
  s = S.contentSlide(deck, {
    section: "Parse", title: "Structure is signal",
    subtitle: "Keep the headings. Put the document's name on every chunk.",
    takeaway: "The header costs a few tokens and tells the retriever and the LLM what they are reading.",
    notes: `About: chunk_sections() in app/rag/chunker.py: one chunk per section (split on line breaks if over 900 characters), each starting with "<title> > <heading>".
Say: "Left is what checkpoint 4 stored: a 500-character window that starts mid-word and doesn't say which policy or which year. Right is one section with its document's title on top."
Numbers: for the query "team dinner limit per person", the windowed chunk sits at distance 1.11, the section with a header at 0.86 (lower is closer). Same embedding model, same text, plus structure.
HTML: the parser drops nav, header, footer, aside, scripts and anything whose class mentions cookie or banner: none of that boilerplate reaches the index.
Explain the left box: a fixed 500-character window doesn't know where sentences or sections start. It starts mid-word, mixes the end of one section with the start of the next, and never says which document or which edition it came from.
Explain the right box: one chunk = one section. The green first line is the header we add: document title, then "> heading". It is embedded together with the text (the comment line in the box).
Explain the numbers: distance is how far the chunk's vector is from the question's vector; 0 would be identical, lower is better. Same model, same policy text: adding the title and heading moves it from 1.11 to 0.86, because the words "Expense Policy" and "Team Events" now sit next to "$90 per person".
Two readers benefit: the retriever (better match, as measured) and the LLM (it can see it is reading the 2026 Expense Policy, and cite it).
If asked "Doesn't the header waste tokens?": about 10 tokens per chunk. Compare with the cost of answering from the wrong document.
If asked "What if a section is huge?": over 900 characters (SECTION_MAX_CHARS) it is split on line breaks, and every piece keeps the same header.
Next: "Time for a break."`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 4.3, h: 1.7, label: "CHECKPOINT 4: A 500-CHARACTER WINDOW", size: 10, lines: [
    { text: "…mployees.      (the window starts mid-word)", color: "F2A19C" }, "", "## Team Events", "", "- Team meals and events: up to $50", "  per person.", "- Offsites and team-building ..."] });
  S.code(s, { x: 5.1, y: 1.6, w: 4.3, h: 1.7, label: "CHECKPOINT 5: ONE SECTION, WITH A HEADER", size: 10, lines: [
    { text: "Expense Policy (2026 edition)", color: C.green, b: true }, { text: "  > Team Events", color: C.green, b: true },
    "- Team meals and events: up to $90", "  per person.", "- Offsites and team-building ...", "",
    "# the header line is embedded with the text"] });
  S.stat(s, { x: 0.6, y: 3.45, w: 2.0, value: "1.11", label: "distance, window", color: C.redText, size: 30, name: "dist-old" });
  S.stat(s, { x: 2.7, y: 3.45, w: 2.0, value: "0.86", label: "distance, section + header", color: C.deep, size: 30, name: "dist-new" });
  s.text("Query: \"team dinner limit per person\". Lower is closer.", { x: 0.6, y: 4.65, w: 4.2, h: 0.3, size: 10.5, italic: true, color: C.gray, name: "dist-note" });
  S.card(s, { x: 5.1, y: 3.5, w: 4.3, h: 1.45, title: "HTML: the article, not the page", titleSize: 13,
    body: "The wiki page's cookie banner, navigation, sidebar, footer and scripts never reach the index. Only headings and body text do.", bodySize: 11.5 });
  num(s);

  // ---------------------------------------------------------------- 17 break
  s = S.darkSlide(deck, { section: "Parse", icon: I.coffee, kicker: "BREAK", title1: "10 minutes", subtitle: "Next: who may read what, and which version is true", logo: true,
    detail: "Think about it: which of the weekend's five events could a better parser fix on its own?",
    notes: `About: Break. Before resuming, make sure the weekend has been applied (sharepoint.py status shows 5 events) for the Govern demos.
The break question (answer it when you resume): none of them on its own. The footer comes closest: the HTML parser drops the footer, so the extracted text is unchanged, but it still takes the sync's content hash to notice that and skip re-embedding. The new policy, the shorter file, the deletion and the permission change are about metadata and change, not about reading text. That is why the next two parts exist.
Next (after the break): "Part 3: who may read it, and is it still true?"` });
  num(s, true);

  // ================================================================ PART 3 GOVERN
  s = S.darkSlide(deck, { section: "Govern", icon: I.shield, kicker: "PART 3 OF 5", title1: "Govern",
    subtitle: "Who may read it, and is it still true?", footer: "register  ·  permissions  ·  versions  ·  PII",
    detail: "Metadata the text can't carry, copied onto every chunk at ingest time, then used as a filter in every search.",
    notes: `About: The heart of the session: metadata that the text can't carry, and filters that use it.
Explain the pattern for the whole part, in two steps: 1) at INGEST time, copy the facts about each document (who may read it, its status, its dates) onto every one of its chunks. 2) at QUERY time, search only the chunks whose labels match the user and the date.
Why both steps: the filter can only use what the ingest stored. If permissions weren't copied onto the chunk, there is nothing to filter on.
Footer, in order of the next slides: the register (where the facts come from), permissions (who), versions (when), PII (what must never be stored at all).
Next: "Where do those facts come from? The register."` });
  num(s, true);

  // ---------------------------------------------------------------- 19 register
  s = S.contentSlide(deck, {
    section: "Govern", title: "The register: what the text can't tell you",
    subtitle: "Owner, permissions, status and dates live in the source system, next to the file. They travel with every chunk.",
    takeaway: "A filter can only use what was stored at ingest time. There is no second chance.",
    notes: `About: data/enterprise/register.json, loaded by app/ingest/register.py. SharePoint keeps permissions and metadata columns; policy teams keep a register. We copy both onto every chunk.
Say: "Read the salary bands file: nothing in it says who may read it. That's SharePoint's job. If we don't copy it onto the chunk at ingest time, no query can filter on it later."
Two rules: fail closed (a file with no register entry is skipped: no entry means no permissions, which means nobody), and drafts or withdrawn documents never enter the index.
Show: the draft parental leave policy (24 weeks!) is skipped every sync; checkpoint 4 indexed it.
Explain the code box: one real entry, the 2024 expense update. Point at "amends": it doesn't replace the 2023 policy, it changes parts of it. That relation matters on the versions slide.
Explain the table, one row at a time, with a question it answers:
- allowed_groups: "May the intern read this?" Compared with the user's groups.
- status: current (in force), superseded (replaced, kept for history), draft (not approved), withdrawn (pulled back). Only current and superseded are ever indexed.
- effective_from / effective_to: "Was this in force on 15 March 2024?" Stored as integers like 20240315 so the vector store can compare them.
- superseded_by / amends: the chain of editions. Lets you explain WHY a document isn't used.
- depends_on: "The FAQ quotes the expense policy." When the policy changes, the sync tells the FAQ's owner.
- owner: who gets the message when something is wrong.
Explain the two red rules:
- Fail closed: no entry means we don't know who may read it, so the safe answer is nobody. The opposite (fail open: no entry, so everyone) is how leaks happen.
- Drafts never enter: a draft is not policy. Indexing it makes the RAG system announce a rule that was never approved (24 weeks of parental leave).
Also: a broken register (missing field, unknown status, duplicate id) stops the sync before it touches the index. Wrong permissions are worse than no update.
Next: "Now let's use allowed_groups. There are three ways to do it, and only one works."`,
  });
  S.code(s, { x: 0.6, y: 1.65, w: 3.7, h: 2.6, label: "ONE REGISTER ENTRY", size: 10, lines: [
    "{", '  "doc_id": "FIN-EXP-2024-UPDATE",', '  "title": "Expense Policy Update (2024)",', '  "owner": "Finance",',
    '  "allowed_groups": ["employees"],', '  "status": "current",', '  "version": 1,', '  "effective_from": "2024-01-01",', '  "amends": "FIN-EXP-2023"', "}",
    "# every field is copied onto", "# every chunk of this document"] });
  S.table(s, { x: 4.5, y: 1.65, cols: [2.2, 2.7], rowH: 0.38, size: 10.5, headH: 0.32,
    header: ["Field", "Answers"],
    rows: [[{ text: "allowed_groups", font: "Consolas", color: C.deep }, "Who may read it"],
      [{ text: "status", font: "Consolas", color: C.deep }, "current, superseded, draft, withdrawn"],
      [{ text: "effective_from, _to", font: "Consolas", color: C.deep }, "When it is in force"],
      [{ text: "superseded_by, amends", font: "Consolas", color: C.deep }, "What replaced it, what it changes"],
      [{ text: "depends_on", font: "Consolas", color: C.deep }, "Which documents it quotes"],
      [{ text: "owner", font: "Consolas", color: C.deep }, "Who to ask when it is wrong"]] });
  S.chip(s, { x: 0.6, y: 4.45, w: 3.7, h: 0.4, text: "Fail closed: no register entry, not indexed", fill: C.redSoft, color: C.redText, size: 11 });
  S.chip(s, { x: 4.5, y: 4.45, w: 4.9, h: 0.4, text: "Drafts and withdrawn documents never enter the index", fill: C.redSoft, color: C.redText, size: 11 });
  num(s);

  // ---------------------------------------------------------------- 20 permissions
  s = S.contentSlide(deck, {
    section: "Govern", title: "Permissions: filter inside the search",
    subtitle: "The intern asks: \"What is the salary range for a Senior Developer?\"",
    takeaway: "Groups come from the login token, never from a field the caller can type.",
    notes: `About: Three ways to "do permissions" in RAG, only one of which works.
Say: "No filter: the intern reads the salary bands. Filter after the search: the top 5 is full of salary chunks, you throw them away and hand the intern three irrelevant chunks, or none, and the forbidden text already left the database. Filter inside the search: forbidden chunks never compete for the top 5."
And: "Telling the model 'don't reveal salaries' is not access control. The text is in its context window."
Chroma detail: metadata values are scalars, so allowed_groups becomes one boolean per group (acl_hr, acl_managers...). In pgvector it's a WHERE clause; in Elasticsearch a filter clause. Same idea.
Explain the three cards as three stories for the same question from the intern:
- No filter (red): search all chunks, take the closest 5. The salary bands are the closest, so they go to the LLM. Leak.
- Filter after (amber): search all chunks, take the closest 5, THEN drop what the intern can't read. All 5 were salary chunks, so the intern gets nothing, or junk. Two problems: the forbidden text already left the database (logs, traces, caches), and the allowed results are starved.
- Filter inside (green): the search itself only looks at chunks the intern may read. The top 5 are the best 5 among allowed chunks.
Explain the code box: read it as SQL. WHERE (acl_employees = true OR acl_engineering = true) AND status = 'current'. The OR is over the user's groups: you may read a document if ANY of your groups is allowed. The third line explains why it's flags and not a list: Chroma can't do "list contains".
Explain the takeaway: the groups come from the login (identity provider), never from the request body. If the client can send "groups": ["hr"], anyone can.
If asked "Can't the prompt tell the LLM not to reveal salaries?": no. Once the text is in the context window, prompt injection, paraphrasing or a simple "summarise everything above" gets it out. Access control has to happen before the LLM sees anything.
Next: "Let's write that filter, live."`,
  });
  // [title, sub, body, border, icon, verdict, verdict fill, verdict text]
  const perm = [["No filter", "Checkpoint 4", "Every chunk is a candidate. The salary bands rank first.", C.red, I.unlock, "LEAK", C.redText, C.white],
    ["Filter after the search", "Top 5, then drop", "Forbidden chunks take the top-5 slots; the intern gets leftovers. The text already left the database.", C.amber, I.filterA, "LEAKS AND STARVES", C.amber, C.dark],
    ["Filter inside the search", "Checkpoint 5", "Search only what the user's groups may read, and only what is current. Forbidden chunks never compete.", C.deep, I.lockG, "CORRECT", C.deep, C.white]];
  perm.forEach(([t, sub, body, color, ic, verdict, vFill, vText], i) => {
    const x = 0.6 + i * 2.97;
    s.rect({ x, y: 1.6, w: 2.82, h: 2.45, fill: C.white, line: color, lineWidth: 1.25, name: `perm-${i}` });
    s.image(ic, { x: x + 0.2, y: 1.78, w: 0.38, h: 0.38, name: `perm-icon-${i}` });
    S.chip(s, { x: x + 1.05, y: 1.82, w: 1.6, h: 0.3, text: verdict, fill: vFill, color: vText, size: 9.5, name: `perm-verdict-${i}` });
    s.text([[{ text: t, b: true, size: 14, color: C.dark, font: "Arial" }], [{ text: sub, size: 10.5, color: C.gray }]], { x: x + 0.2, y: 2.3, w: 2.45, h: 0.62, name: `perm-title-${i}` });
    s.text(body, { x: x + 0.2, y: 2.95, w: 2.45, h: 1.0, size: 11.5, color: C.slate, name: `perm-body-${i}` });
  });
  S.code(s, { x: 0.6, y: 4.2, w: 8.8, h: 0.78, size: 10, lines: [
    { text: 'where = {"$and": [{"$or": [{"acl_employees": True}, {"acl_engineering": True}]},', color: C.codeText },
    { text: '                  {"status": "current"}]}            # app/rag/retriever.py: access_filter()', color: C.codeText },
    { text: "# Chroma metadata is flat, so allowed_groups is stored as one flag per group: acl_hr, acl_managers ...", color: C.mintText }] });
  num(s);

  // ---------------------------------------------------------------- 21 LIVE access_filter
  s = S.liveSlide(deck, { section: "Govern", icon: I.laptop, kicker: "LIVE CODING",
    title1: "Let's write", title2: "access_filter()",
    steps: ["Who: one acl_<group> flag per group the user is in, joined with $or",
      "When: status = current, or effective_from ≤ as_of < effective_to",
      "Run search.py as the intern, then as the HR partner (from the checkpoint 5 folder)",
      "Expect: the intern gets nothing relevant (~1.6); the HR partner gets the salary bands (~0.57)"],
    command: `python search.py "salary range for a senior developer" --user intern`,
    notes: `About: Write access_filter() live in app/rag/retriever.py (delete the body first; the solution is the file in the repo). 10 lines.
Code:
  who = [{f"acl_{g}": True} for g in groups]
  clauses = [who[0] if len(who) == 1 else {"$or": who}]
  if as_of: clauses += [{"effective_from": {"$lte": day}}, {"effective_to": {"$gt": day}}]
  else: clauses.append({"status": "current"})
  return {"$and": clauses}
Then run:
  search.py "salary range for a senior developer" --user intern      → coding standards, expense policy (best distance ~1.60: nothing relevant)
  search.py "salary range for a senior developer" --user hr-partner  → Engineering Salary Bands (2026), distance ~0.57
Point out: the intern's results are irrelevant AND harmless. Confidence scoring from checkpoint 4 would say "no result".
Explain while typing:
- Line 1 builds one condition per group: {"acl_employees": True}, {"acl_engineering": True}.
- Line 2: Chroma's $or needs at least two items, so a user with a single group gets the bare condition.
- The "when" part has two modes. Normal questions: status must be current. Questions about the past (as_of): the document must have started on or before that day, and ended after it. That's why effective_to of a current document is 99991231: "still in force".
- Everything is joined with $and: allowed AND in force.
Explain the expected output (step 4): ~1.6 is checkpoint 4's no-result threshold (NO_RESULT_DISTANCE), so the intern's best match is basically noise. The system would answer "I don't know", which is exactly right for the intern.
If something breaks live: the finished function is in the repo; git checkout -- app/rag/retriever.py restores it.
If asked "What about a user in no group?": groups_for() raises for an unknown user. Fail closed again: an unknown user is an error, not "no filter".
Next: "Who is one dimension. When is the other."`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 22 versions
  s = S.contentSlide(deck, {
    section: "Govern", title: "Versions: edits replace, publications supersede",
    subtitle: "\"What's the domestic meal per diem?\" asked on three different dates.",
    takeaway: "HR edited the leave policy in place, so its old version is gone. If you need the past, publish versions.",
    notes: `About: How the register models time. effective_from / effective_to become integers (20261101) so the vector store can filter dates.
Say: "By default the filter says status = current: superseded documents stay in the index but out of answers. Ask with as_of and the filter becomes 'in force on that day' instead."
Demo: search.py "meal per diem" ; --as-of 2024-03-15 ; --as-of 2023-06-01 → $85 (2026), $75 (2024 update), $60 (2023).
The hard case: an amendment (the 2024 update) changes only some sections, so the base policy and the update were both current. The prompt (app/prompts/rag_answer.py) now says: blocks are labelled with version and effective date; if they disagree, use the later one and name it. The 2026 consolidated edition ends the ambiguity: that's why policy owners should publish consolidated versions.
Rule of thumb: edits replace (old text gone), publications supersede (old text kept, filtered).
Explain the timeline (top): three editions of the expense policy. Grey dots are superseded, the green one is current. Each one has an effective_from date, and the older ones got an effective_to when the next one took over.
Explain the three rows: the same question asked "as of" three dates. The filter picks the edition that was in force on that day, so each answer is right for its date: $60 in mid-2023, $75 in March 2024, $85 today.
Explain the two definitions at the bottom (this is the title of the slide):
- Edit in place: HR overwrote leave-policy.md. There is only one file, version 2 replaced version 1, and the old text is gone from the index after the sync. You can no longer answer "what was the carry-over limit in 2025?".
- Publish a new edition: Finance added a NEW file and marked the old ones superseded. Old text stays in the index, out of normal answers, but available with as_of.
Explain the amendments card: an amendment is a partial edition. In 2024 both the base policy and the update were "current", so a question could retrieve both and they disagree. The prompt handles it (later effective date wins, say which), but the clean fix is for the owner to publish a consolidated edition, as Finance did in 2026.
If asked "Why not keep every old version automatically?": you could snapshot each edit, but then every chunk needs versioning and most edits are typo fixes. Let the document owner decide what is a new edition.
Next: "Three more things auditors ask about first."`,
  });
  const tl = [["2023-01-01", "Expense Policy (2023)", "$60", "superseded"], ["2024-01-01", "Update (2024) amends it", "$75", "superseded"], ["2026-11-01", "Expense Policy (2026)", "$85", "current"]];
  s.line({ x: 0.9, y: 2.05, w: 8.2, h: 0, color: C.line, width: 3, name: "tl-line" });
  tl.forEach(([d, t, v, st], i) => {
    const x = 0.6 + i * 3.0;
    s.ellipse({ x: x + 0.15, y: 1.9, w: 0.3, h: 0.3, fill: st === "current" ? C.green : C.gray, name: `tl-dot-${i}` });
    s.text([[{ text: d, b: true, color: C.dark, size: 12 }], [{ text: t, color: C.slate, size: 11 }]], { x: x + 0.55, y: 1.62, w: 2.35, h: 0.9, name: `tl-text-${i}` });
  });
  const asks = [["as_of 2023-06-01", "$60", "Expense Policy (2023 edition) · superseded", C.gray],
    ["as_of 2024-03-15", "$75", "Expense Policy Update (2024) · superseded", C.gray],
    ["today (no as_of)", "$85", "Expense Policy (2026 edition) · current", C.deep]];
  asks.forEach(([q, v, src, color], i) => {
    const y = 2.75 + i * 0.5;
    s.text(q, { x: 0.6, y, w: 1.9, h: 0.42, font: "Consolas", size: 11, color: C.deep, valign: "middle", name: `ask-q-${i}` });
    s.text(v, { x: 2.5, y, w: 0.8, h: 0.42, font: "Arial", size: 18, bold: true, color, valign: "middle", name: `ask-v-${i}` });
    s.text(src, { x: 3.3, y, w: 3.3, h: 0.42, size: 11.5, color: C.slate, valign: "middle", name: `ask-src-${i}` });
  });
  // the two ways a document changes, side by side
  [["EDIT IN PLACE", "Same file, overwritten (the leave policy). The old text leaves the index."],
    ["PUBLISH AN EDITION", "New file (the 2026 expense policy). The old one is kept, as superseded."]].forEach(([k, d], i) => {
    const x = 0.6 + i * 3.0;
    s.rect({ x, y: 4.3, w: 2.9, h: 0.72, fill: i ? C.greenSoft : C.soft, name: `vers-${i}` });
    s.text([[{ text: k, b: true, size: 9.5, color: i ? C.deep : C.slate, charSpacing: 0.5 }],
      [{ text: d, size: 10.5, color: C.dark }]], { x: x + 0.12, y: 4.32, w: 2.7, h: 0.68, valign: "middle", name: `vers-text-${i}` });
  });
  S.card(s, { x: 6.75, y: 2.7, w: 2.65, h: 1.85, title: "Amendments", titleSize: 13, edge: C.amber,
    body: "The 2024 update changed some sections, so base and update were both current. The prompt now says: if blocks disagree, the later effective date wins, and name it.", bodySize: 11 });
  num(s);

  // ---------------------------------------------------------------- 23 PII, provenance, tenancy
  s = S.contentSlide(deck, {
    section: "Govern", title: "PII, provenance, tenancy",
    subtitle: "Three things tutorials skip and production audits ask about first.",
    takeaway: "Embeddings are not one-way. Data you embed is data you store, and back up.",
    notes: `About: app/ingest/pii.py and the provenance fields on every chunk.
Say: "The phishing notice quotes a customer's personal email and phone. The helpdesk export has employees' home contacts. The sync redacted 7 values (3 emails, 4 phones) before embedding. Business addresses like security@acmecorp.com stay: same pattern, opposite decision. That's policy, not regex."
Provenance: every chunk carries doc_id, version, effective date, section and a source_url, so citations come from metadata, not from the model's memory.
Tenancy (not built here): one index, many customers → tenant id on every chunk, enforced in the same filter as permissions. Test cross-tenant retrieval on purpose.
Production detectors: Microsoft Presidio, AWS Comprehend, Google DLP.
Explain the PII card: three examples, two decisions. A personal Gmail address and a phone number are replaced with a placeholder BEFORE chunking and embedding. The corporate address stays because employees need it to report phishing. Same regex match, opposite decision: redaction is a policy, the code just applies it (CORPORATE_EMAIL_DOMAINS in config).
Explain the order line at the bottom: parse, redact, chunk, embed. If you redact after embedding, the vector was computed from the original text and still encodes it. And the redaction counts go into the sync report so a human can audit them.
Explain "embeddings are not one-way" (takeaway): research has shown text can be partly reconstructed from embeddings. Treat the vector store like the documents themselves: same access rules, same retention, same backups policy.
Explain provenance: every chunk carries doc_id, version, effective date, section and a link. Citations are built from that metadata, so the model can't invent a source. And when Legal says "pull that document", one delete by doc_id removes every chunk of it.
Explain tenancy: if one index serves several customers, tenant_id goes into the same WHERE clause as the groups, so it can't be forgotten in one code path. The most sensitive tenants get their own index. Write a test that asks as tenant A for tenant B's data and expects nothing.
If asked "Does redaction hurt answers?": only when someone asks for the personal data itself, which is the point. "What's the phishing report about?" still works.
Next: "Part 4: we have all the pieces. Now we need a job that runs them every night, safely."`,
  });
  S.card(s, { x: 0.6, y: 1.6, w: 2.85, h: 2.75, icon: I.secret, iconInline: true, title: "PII: redact first", titleSize: 13.5,
    body: [{ runs: [{ text: "jane.doe1984@gmail.com", font: "Consolas", size: 10 }], spaceAfter: 0 },
      { runs: [{ text: "→ [EMAIL REDACTED]", size: 10.5, b: true }] },
      { runs: [{ text: "+1 415 555 0134", font: "Consolas", size: 10 }], spaceAfter: 0 },
      { runs: [{ text: "→ [PHONE REDACTED]", size: 10.5, b: true }] },
      { runs: [{ text: "security@acmecorp.com", font: "Consolas", size: 10 }], spaceAfter: 0 },
      { runs: [{ text: "stays: a business contact", size: 10.5 }] },
      { runs: "7 values redacted in 2 documents, before a single vector was computed.", spaceBefore: 2 }], bodySize: 11, paraSpace: 5 });
  S.card(s, { x: 3.58, y: 1.6, w: 2.85, h: 2.75, icon: I.link, iconInline: true, title: "Provenance", titleSize: 13.5,
    body: [{ runs: "Every chunk knows its doc_id, version, effective date, section and link." },
      { runs: "Citations come from this metadata, not from the LLM." },
      { runs: "When a document is wrong, one query finds every chunk of it." }], bodySize: 11.5, paraSpace: 6 });
  S.card(s, { x: 6.56, y: 1.6, w: 2.85, h: 2.75, icon: I.building, iconInline: true, title: "Tenancy", titleSize: 13.5,
    body: [{ runs: "One index, many customers? A tenant id on every chunk, enforced in the same filter as permissions." },
      { runs: "Or one index per tenant for the most sensitive ones." },
      { runs: "Test cross-tenant retrieval on purpose." }], bodySize: 11.5, paraSpace: 6 });
  s.text([[{ text: "Order matters: ", b: true, color: C.dark }, { text: "parse → redact → chunk → embed. Redact after embedding and the vector was already computed from the personal data." }]],
    { x: 0.6, y: 4.48, w: 8.8, h: 0.45, size: 11, color: C.slate, valign: "middle", name: "pii-order" });
  num(s);

  // ================================================================ PART 4 SYNC
  s = S.darkSlide(deck, { section: "Sync", icon: I.sync, kicker: "PART 4 OF 5", title1: "Sync",
    subtitle: "Ingesting once is a demo. Syncing forever is a system.", footer: "plan  ·  price  ·  apply  ·  rebuild",
    detail: "What changed, and what does it cost to apply? What if it fails halfway? How do we change the model safely?",
    notes: `About: The job that replaces POST /ingest.
Explain the footer as the life of one sync run: PLAN compares source and index and decides an action per document, writing nothing. PRICE estimates the tokens to embed and the cost. APPLY does it, in an order where a failure is harmless. REBUILD is the rare full re-index (new model), done next to the live index.
Analogy: terraform plan / terraform apply, or a database migration with a dry run. You read the plan before anything changes.
Next: "The core of the plan is one decision per document."` });
  num(s, true);

  // ---------------------------------------------------------------- 25 one action per document
  s = S.contentSlide(deck, {
    section: "Sync", title: "One action per document",
    subtitle: "sync.py compares the source with the index and decides. Cheapest check first.",
    takeaway: "The content hash includes the parser and pipeline versions: change the chunker and everything re-embeds.",
    notes: `About: build_plan() in app/ingest/sync.py. Reads only; never writes.
Say: "For each document in the register: is it indexable at all? Is the file there? Same eTag as last time? Then don't even download it. Different bytes? Parse, redact, chunk, hash. Same hash but different labels: relabel, no embedding. Same hash, same labels: touch, the footer case. Different hash: change. Then anything in the index the source no longer knows: remove."
Why the content hash is computed AFTER parsing: the wiki footer changed the bytes (new eTag) but not the text, so nothing re-embeds.
Explain the left ladder: read it top to bottom, the first "yes" wins. It is ordered from cheapest to most expensive check: register lookup (free), eTag compare (free, no download), parse (download + CPU), hash compare (needs the parsed text). The last row runs the other way: it starts from the index and finds what the source no longer has.
Explain the right column: the six actions and what each one costs. Only add and change call the embedding model (the line under the column). Relabel and touch only update metadata on existing chunks, so a permission fix like the salary bands costs nothing to embed.
Map the weekend's events to actions: new 2026 policy = add; old policies marked superseded = relabel; leave policy edited = change; Q3 notes deleted = remove; salary bands re-permissioned = relabel; wiki footer = touch; the scan = quarantine; the draft = skip.
Explain the takeaway: the content hash includes PIPELINE_VERSION and PARSER_VERSION. Change how chunking works, bump the version, and every hash changes, so every document re-embeds. Without that, an improved chunker would only apply to documents that happen to change.
If asked "Why delete the old chunks on change instead of upserting?": the new version may have fewer chunks. Upsert would leave the extra old ones behind (the leave-policy orphans).
Next: "Here's what the plan says on Monday morning."`,
  });
  const ladder = [["Not indexable (draft, withdrawn, no entry)?", "skip"], ["Same eTag as the index?", "unchanged (no download)"],
    ["No text (a scan)?", "quarantine"], ["Not in the index yet?", "add"], ["Content hash differs?", "change"], ["Labels differ?", "relabel"],
    ["Only the bytes differ?", "touch"], ["In the index, gone from the source?", "remove"]];
  ladder.forEach(([q, a], i) => {
    const y = 1.55 + i * 0.425;
    s.rect({ x: 0.6, y, w: 5.2, h: 0.36, fill: i % 2 ? C.white : C.soft, name: `lad-${i}` });
    s.text(q, { x: 0.72, y, w: 2.95, h: 0.36, size: 11.5, color: C.dark, valign: "middle", name: `lad-q-${i}` });
    s.text(a, { x: 3.62, y, w: 2.15, h: 0.36, size: 10.5, bold: true, color: C.deep, valign: "middle", font: "Consolas", name: `lad-a-${i}` });
  });
  const acts = [["+ add", "parse, embed, insert", C.deep], ["~ change", "embed, delete old, insert new", C.deep], ["* relabel", "metadata only, no embedding", C.amberDeep],
    ["= touch", "new eTag, same text", C.amberDeep], ["- remove", "delete every chunk", C.redText], ["! quarantine", "report, don't index", C.redText]];
  acts.forEach(([a, d, color], i) => {
    const y = 1.55 + i * 0.5;
    s.rect({ x: 6.05, y, w: 3.35, h: 0.43, fill: C.white, line: C.line, name: `act-${i}` });
    s.text(a, { x: 6.15, y, w: 1.25, h: 0.43, font: "Consolas", size: 12, bold: true, color, valign: "middle", name: `act-a-${i}` });
    s.text(d, { x: 7.4, y, w: 1.95, h: 0.43, size: 11, color: C.slate, valign: "middle", name: `act-d-${i}` });
  });
  s.text([[{ text: "Only + and ~ call the embedder.", b: true, color: C.deep }], [{ text: "Everything else is free." }]],
    { x: 6.05, y: 4.52, w: 3.35, h: 0.42, size: 11, color: C.slate, valign: "middle", name: "act-cost" });
  num(s);

  // ---------------------------------------------------------------- 26 Monday's plan
  s = S.contentSlide(deck, {
    section: "Sync", title: "Monday's plan",
    subtitle: "python sync.py: a dry run. Nothing is written until --apply.",
    takeaway: "The report goes to a human. Some fixes belong to a document's owner, not to the index.",
    notes: `About: The real dry-run output after sharepoint.py apply all.
Demo: python ${CP}/sync.py   (then)   python ${CP}/sync.py --apply
Say: "Eleven chunks to embed, out of 89. Twelve documents not even downloaded. And two lines for a human: the FAQ quotes the expense policy and the leave policy, both changed this weekend. The index can't fix the FAQ; People Operations can."
Find the stale numbers in the FAQ (exercise 3): 'Software under $75/month' (now $100) and '5 days carry over' (now 10).
Explain the plan line by line, linking each to a weekend event:
- quarantine: the scanned incident report, same as Friday. Reported again every run until someone OCRs it.
- touch: the wiki page. New eTag (the footer year), identical text after parsing, so no re-embedding.
- relabel x2: the 2023 policy and its 2024 update become superseded. Same text, new status.
- add: the 2026 policy, 7 new chunks (one per section).
- change: the leave policy. 6 old chunks deleted, 4 new ones inserted; no orphans this time.
- skip: the draft parental leave policy. Never indexed.
- relabel: the salary bands, now hr + managers only. Zero embedding cost for a security fix.
- remove: the Q3 notes, deleted at the source, so every chunk goes.
- unchanged: 12 documents with the same eTag. Not even downloaded.
Explain the right column: 11 chunks to embed is the whole bill for Monday. At Gemini prices that's about a hundredth of a cent; with the local model, free. The point is not the money here, it is that the cost scales with what CHANGED, not with the size of the corpus.
Explain the amber block: depends_on in the register lets the sync warn that the FAQ quotes two documents that just changed. It can't fix the FAQ's text; it can tell the owner.
Next: "Now we apply it. What if the embedding API dies halfway?"`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 6.15, h: 3.42, size: 10, lines: [
    { text: " ! quarantine ENG-INCIDENT-REPORT     a scan. Queued for OCR", color: C.amber },
    { text: " = touch      ENG-WIKI-VECTOR-DB      bytes changed, text identical", color: C.codeText },
    { text: " * relabel    FIN-EXP-2023            status: current -> superseded", color: C.codeText },
    { text: " * relabel    FIN-EXP-2024-UPDATE     status: current -> superseded", color: C.codeText },
    { text: " + add        FIN-EXP-2026            new: 7 chunk(s), markdown", color: C.green },
    { text: " ~ change     HR-LEAVE                6 old chunk(s) out, 4 new in", color: C.green },
    { text: " . skip       HR-PARENTAL-2027-DRAFT  status is draft", color: C.mintText },
    { text: " * relabel    HR-SALARY-BANDS-2026    employees -> hr,managers", color: C.codeText },
    { text: " - remove     LEAD-Q3-NOTES           deleted at the source", color: "F2A19C" },
    { text: "   unchanged  12 document(s), not even downloaded", color: C.mintText },
    { text: "", color: C.codeText },
    { text: "For a human to look at:", color: C.amber },
    { text: " - COMPANY-FAQ quotes FIN-EXP-2026 and HR-LEAVE,", color: C.amber },
    { text: "   which changed. Ask People Operations to review it.", color: C.amber },
    { text: "", color: C.codeText },
    { text: "# a dry run: nothing is written until you add --apply", color: C.mintText }] });
  S.stat(s, { x: 7.0, y: 1.5, w: 2.4, value: "11 / 89", label: "chunks to embed", size: 30, name: "plan-embed" });
  S.stat(s, { x: 7.0, y: 2.65, w: 2.4, value: "12", label: "documents not even downloaded", size: 30, name: "plan-skip" });
  S.stat(s, { x: 7.0, y: 3.8, w: 2.4, value: "$0.0001", label: "at Gemini prices (local: $0)", size: 26, name: "plan-cost" });
  num(s);

  // ---------------------------------------------------------------- 27 embed first
  s = S.contentSlide(deck, {
    section: "Sync", title: "Embed first, then delete",
    subtitle: "What happens when the embedding API goes down halfway through?",
    takeaway: "Batches stay under API limits. Retries survive a 429. The order makes a failure harmless.",
    notes: `About: apply_plan() embeds every new chunk BEFORE touching the index. Batches of 64 (EMBED_BATCH_SIZE) with retries (with_retries).
Say: "Checkpoint 4's fresh=true deleted the collection first, then embedded. If embedding failed, users got an empty index: 'I don't know' to every question until someone noticed."
Proof: tests/test_sync.py::test_a_failed_embedding_leaves_the_index_untouched simulates an outage mid-sync; the old leave policy is still served.
Also: one batch call per 64 chunks, not one giant call (Gemini caps a request at 100 texts, Azure at 2,048).
Explain the left column (checkpoint 4): the destructive step comes first. Between step 1 and the end of step 2 the index is empty or half-full, and users are getting answers from it. If step 3 happens, it stays that way.
Explain the right column (checkpoint 5): the expensive, failure-prone step (calling an external API) comes first and only produces vectors in memory. If it fails, we stop, and the index hasn't been touched: users keep getting yesterday's answers, which beats no answers. Only when every vector exists do we delete and insert, which are fast local operations.
Explain the bottom line: same principle as a database migration or a deploy. Build the new thing, check it, then remove the old one. Never in the other order.
Explain the takeaway: batches keep each request under the provider's limit; retries ride out a temporary 429; the order makes a permanent failure harmless. Three different failure modes, three different defences.
If asked "What if it fails between delete and insert?": that window is milliseconds of local work with no network call. A production system would wrap it in a transaction, or use the blue/green switch on the next slide.
Next: "And what if we need to change everything at once, like the embedding model?"`,
  });
  const before = ["?fresh=true: delete the collection", "Embed everything again", "Embedding fails halfway", "Index is empty: every answer is \"I don't know\""];
  const after = ["Embed new chunks: batches of 64, retried", "Embedding fails? Stop. Nothing was deleted", "Then delete the old chunks of that document", "Then insert the new ones"];
  [[before, "CHECKPOINT 4", C.red, 0.6], [after, "CHECKPOINT 5", C.deep, 5.1]].forEach(([list, label, color, x]) => {
    s.text(label, { x, y: 1.55, w: 4.3, h: 0.3, size: 11, bold: true, color, charSpacing: 1, name: `order-label-${label}` });
    list.forEach((t, i) => {
      const y = 1.95 + i * 0.68;
      s.rect({ x, y, w: 4.3, h: 0.58, fill: C.white, line: i === (color === C.red ? 3 : 1) ? color : C.line, lineWidth: i === (color === C.red ? 3 : 1) ? 1.5 : 1, name: `order-${label}-${i}` });
      s.ellipse({ x: x + 0.15, y: y + 0.12, w: 0.34, h: 0.34, fill: color, name: `order-dot-${label}-${i}` });
      s.text(String(i + 1), { x: x + 0.15, y: y + 0.12, w: 0.34, h: 0.34, font: "Arial", size: 11, bold: true, color: C.white, align: "center", valign: "middle", name: `order-num-${label}-${i}` });
      s.text(t, { x: x + 0.62, y, w: 3.6, h: 0.58, size: 12, color: C.dark, valign: "middle", name: `order-text-${label}-${i}` });
    });
  });
  s.text([[{ text: "The principle: ", b: true, color: C.dark }, { text: "do the slow, risky part (calling an external API) before the destructive part (deleting). Users keep yesterday's answers if it fails." }]],
    { x: 0.6, y: 4.66, w: 8.8, h: 0.4, size: 11, color: C.slate, valign: "middle", name: "order-principle" });
  num(s);

  // ---------------------------------------------------------------- 28 blue/green
  s = S.contentSlide(deck, {
    section: "Sync", title: "Changing the model? Build next to it",
    subtitle: "Vectors from two models cannot share an index. The sync refuses, and tells you what to do.",
    takeaway: "A rebuild is a deploy: build, check, switch, keep the old one for rollback.",
    notes: `About: app/rag/catalog.py keeps a pointer to the live collection. sync.py --rebuild builds a new collection next to it, runs a smoke check, and only then flips the pointer. sync.py --rollback flips it back.
Demo (optional): set EMBEDDING_PROVIDER=gemini in .env and run sync.py: it stops with the message on the slide. Then sync.py --rebuild --apply (costs about a tenth of a cent).
Say: "Vector databases call the pointer an alias. Same idea as blue/green deploys: users never see a half-built index."
Explain why two models can't share an index: each model maps text into its own space, with its own dimensions and its own idea of "close". A question embedded with Gemini compared against chunks embedded with MiniLM gives meaningless distances, without any error. That's why the sync refuses instead of mixing (the code box).
Explain the diagram left to right: queries never name a collection; they ask catalog.json which one is active. A is live. B is being built with the new model, fully, while A keeps serving.
Explain the four steps (captions under each): 1) build B with a full sync. 2) smoke check: B isn't empty and every document the plan added has chunks; if not, B is never activated. 3) the switch is one write to catalog.json, so it's instant. 4) A is kept: --rollback flips the pointer back in one step.
When you need a rebuild instead of an incremental sync: new embedding model, new chunking for every document, or you suspect the index drifted from the source.
If asked "Doesn't that double the storage?": for the duration of the rebuild, yes. Delete A once you trust B. Storage is cheap; an empty index during business hours is not.
Next: "Part 5: how do we know any of this worked?"`,
  });
  s.rect({ x: 0.6, y: 1.7, w: 1.5, h: 0.7, fill: C.dark, name: "bg-queries" });
  s.text("Queries", { x: 0.6, y: 1.7, w: 1.5, h: 0.7, font: "Arial", size: 13, bold: true, color: C.white, align: "center", valign: "middle", name: "bg-queries-t" });
  S.arrow(s, 2.15, 2.05, 2.75, 2.05, C.gray);
  s.rect({ x: 2.8, y: 1.6, w: 1.75, h: 0.9, fill: C.white, line: C.deep, lineWidth: 1.5, name: "bg-pointer" });
  s.text([[{ text: "catalog.json", font: "Consolas", size: 11, b: true, color: C.deep }], [{ text: "active →", size: 11, color: C.slate }]], { x: 2.8, y: 1.6, w: 1.75, h: 0.9, align: "center", valign: "middle", name: "bg-pointer-t" });
  S.arrow(s, 4.6, 2.05, 5.2, 2.05, C.deep, 2);
  s.rect({ x: 5.25, y: 1.6, w: 1.9, h: 0.9, fill: C.greenSoft, line: C.deep, name: "bg-live" });
  s.text([[{ text: "cp5_kb_A", font: "Consolas", size: 11, b: true, color: C.deep }], [{ text: "LIVE", size: 10, b: true, color: C.deep }]], { x: 5.25, y: 1.6, w: 1.9, h: 0.9, align: "center", valign: "middle", name: "bg-live-t" });
  s.rect({ x: 7.5, y: 1.6, w: 1.9, h: 0.9, fill: C.white, line: C.line, name: "bg-new" });
  s.text([[{ text: "cp5_kb_B", font: "Consolas", size: 11, b: true, color: C.slate }], [{ text: "building", size: 10, color: C.gray }]], { x: 7.5, y: 1.6, w: 1.9, h: 0.9, align: "center", valign: "middle", name: "bg-new-t" });
  const bsteps = [["Build B next to A", "A full sync into a new collection; A keeps serving"],
    ["Smoke check B", "Not empty? Every planned document has chunks?"],
    ["Switch the pointer", "One write to catalog.json: instant"],
    ["Keep A for rollback", "sync.py --rollback flips it back"]];
  const stepX = [0.6, 2.8, 5.25, 7.5];  // under the boxes above
  bsteps.forEach(([t, d], i) => {
    const x = stepX[i];
    s.ellipse({ x, y: 2.7, w: 0.36, h: 0.36, fill: C.deep, name: `bg-step-dot-${i}` });
    s.text(String(i + 1), { x, y: 2.7, w: 0.36, h: 0.36, font: "Arial", size: 11, bold: true, color: C.white, align: "center", valign: "middle", name: `bg-step-n-${i}` });
    s.text(t, { x: x + 0.45, y: 2.67, w: 1.7, h: 0.42, size: 12, bold: true, color: C.dark, valign: "middle", name: `bg-step-t-${i}` });
    s.text(d, { x, y: 3.12, w: 2.05, h: 0.45, size: 10.5, color: C.slate, name: `bg-step-d-${i}` });
  });
  S.code(s, { x: 0.6, y: 3.78, w: 8.8, h: 1.17, label: "python sync.py   (after changing EMBEDDING_PROVIDER)", size: 10, lines: [
    { text: "STOP: The live index was built with local:all-MiniLM-L6-v2, but the embedder is", color: C.amber },
    { text: "now gemini:gemini-embedding-001. Vectors from two models cannot share an index.", color: C.amber },
    { text: "Run: python sync.py --rebuild", color: C.green }] });
  num(s);

  // ================================================================ PART 5 MEASURE
  s = S.darkSlide(deck, { section: "Measure", icon: I.chart, kicker: "PART 5 OF 5", title1: "Measure",
    subtitle: "Prove the index is right, on every change", footer: "golden set  ·  quality  ·  safety",
    detail: "Which questions do we test with? Did the right document come back? Did anything come back that must not?",
    notes: `About: How we got the numbers on slide 8, and the same numbers for today's index.
Explain: without measurement, "the sync works" is an opinion. With a fixed set of questions and an automatic judge, every change to the parser, chunker or filter gets a before/after number in seconds.
Footer: the golden set is the questions; quality and safety are the two kinds of score.
Next: "Let's look at the questions, and how they're scored."` });
  num(s, true);

  // ---------------------------------------------------------------- 30 golden set
  s = S.contentSlide(deck, {
    section: "Measure", title: "A golden set, and two kinds of numbers",
    subtitle: "31 questions in employees' own words. Each says who asks and which documents may answer.",
    takeaway: "No LLM in this evaluation: it runs in seconds, on every change, for free.",
    notes: `About: app/evals/golden.json and app/evals/judge.py.
Say: "Quality asks: did the right document come back, and how high? Hit@5 and MRR. Safety asks: did anything come back that must not? Five flags, counted per question."
The rules of a golden set: hand-write about 30 to start (not 10, which is noise; not 1,000, which nobody reads). Write questions from the user's mouth, not by reading the docs. Include questions that should return NOTHING (expect: []): the permission traps. Never edit a question because the system got it wrong.
MRR: rank 1 → 1.0, rank 2 → 0.5, rank 5 → 0.2, missing → 0, averaged.
Explain the code box: each golden question names WHO asks and WHICH documents may answer it. Q18 must find the 2026 policy. Q24 must find nothing at all: the intern may not read the salary bands, so the only correct retrieval is no relevant document. Four of the 31 are like that (two permission traps, one withdrawn document, one section removed from the leave policy).
Explain the rules:
- About 30, hand-written, and you read every result. Ten is too few to tell noise from progress; a thousand generated ones nobody reads.
- From the user's mouth: "can I take my dog to the office?", not "What does section 4.2 of the Facilities Policy state?". Questions copied from the docs match the docs too easily.
- Must-return-nothing questions are the only way to measure leaks.
- Never edit a question because the system missed it. That's grading your own exam.
Explain the cards: quality is about finding the right thing; Hit@5 is yes/no per question, MRR also rewards ranking it high. Safety is about not finding the wrong thing; each flag is checked per chunk against the live register and files, and a question is flagged if any of its 5 chunks is.
If asked "Why no LLM-as-judge?": retrieval can be judged by rules here, because we know the right documents and the register. It is free, deterministic and runs on every change. Judging generated answers needs an LLM; that's a later topic.
Next: "So, Monday, both indexes, same 31 questions."`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 4.4, h: 1.95, label: "app/evals/golden.json (two of 31)", size: 9, lines: [
    '{"id": "Q18", "user": "intern",', ' "question": "How much can I spend per', '   person on a team dinner?",', ' "expect": ["FIN-EXP-2026"]},',
    '{"id": "Q24", "user": "intern",', ' "question": "What is the salary range', '   for a Senior Developer?",', ' "expect": []}            # nothing!'] });
  s.text("RULES OF A GOLDEN SET", { x: 0.6, y: 3.7, w: 4.4, h: 0.28, size: 10, bold: true, color: C.deep, charSpacing: 1, name: "rules-kicker" });
  s.text([{ runs: "Hand-write about 30. Read every result.", bullet: true }, { runs: "From the user's mouth, not from the docs.", bullet: true },
    { runs: "Include questions that must return nothing.", bullet: true }, { runs: "Never edit one because the system missed it.", bullet: true }],
    { x: 0.6, y: 4.0, w: 4.4, h: 1.0, size: 11.5, color: C.slate, paraSpace: 2, name: "rules" });
  S.card(s, { x: 5.25, y: 1.6, w: 4.15, h: 1.55, title: "Quality", titleSize: 14, edge: C.deep,
    body: [{ runs: [{ text: "Hit@5  ", b: true, color: C.dark }, { text: "right document in the top 5?" }] }, { runs: [{ text: "MRR  ", b: true, color: C.dark }, { text: "1 / rank of the first right one" }] },
      { runs: [{ text: "rank 1 → 1.0 · rank 2 → 0.5 · rank 5 → 0.2 · missing → 0", size: 10.5, color: C.gray, i: true }] }], bodySize: 12, paraSpace: 4 });
  S.card(s, { x: 5.25, y: 3.3, w: 4.15, h: 1.7, title: "Safety (per question)", titleSize: 14, edge: C.red,
    body: [{ runs: [{ text: "leak ", b: true, color: C.dark }, { text: "a chunk this user may not read" }] }, { runs: [{ text: "stale ", b: true, color: C.dark }, { text: "superseded or draft" }] },
      { runs: [{ text: "ghost ", b: true, color: C.dark }, { text: "deleted, or text no longer in the file" }] }, { runs: [{ text: "pii, empty ", b: true, color: C.dark }, { text: "personal data, empty text" }] }], bodySize: 11.5, paraSpace: 2 });
  num(s);

  // ---------------------------------------------------------------- 31 Monday measured
  s = S.contentSlide(deck, {
    section: "Measure", title: "Monday, measured",
    subtitle: "python evaluate.py: the same 31 questions against both indexes.",
    takeaway: "Ingestion took the safety numbers to zero. Quality has one honest miss left.",
    notes: `About: The full comparison. Run it live: python ${CP}/evaluate.py (about 10 seconds, no LLM).
Say: "Same embedding model on both sides. Every difference comes from ingestion: what got in, in what shape, with which labels, and what got deleted."
The one miss (Q08): "How many reviewers does a change to the billing code need?" The answer is mid-paragraph in a PDF page ("A change that touches billing or authentication needs two reviewers"); the coding standards rank higher. That is a retrieval problem, not an ingestion problem: next session's starting point (hybrid search and re-ranking). Say that in words, it is not on the slide.
Explain the table top to bottom:
- Hit@5 0.81 → 0.96 and MRR 0.63 → 0.90: the right document is found more often AND ranked higher. Two causes: sections with headers match better (slide 16), and the five files checkpoint 4 never read are now in the index. Old editions no longer compete for the top 5 either.
- The four red rows go to zero, each for a different reason: leaks by the permission filter, stale by status = current, ghosts by the sync's remove and change actions, personal data by redaction at ingest.
- Clean questions 11 → 31: under checkpoint 4, only about a third of questions put nothing wrong in front of the model.
Explain the line under the table: the embedding model is the same on both sides, so you can't credit a better model. Every gain comes from what got in, in what shape, with which labels.
Explain the miss card: the rule is in the middle of a paragraph inside a PDF page. Semantic search finds the coding standards, which "sound" more like the question. Ingestion can't fix that, the text is there and correctly labelled; it's a ranking problem.
If asked "Why not 1.0?": a golden set where everything passes isn't testing anything hard. The one miss is useful: it tells you what to work on next.
Next: "Let's put the whole stack on one slide."`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [3.3, 1.55, 1.55], rowH: 0.39, headH: 0.36, size: 11.5, align: "center",
    header: ["Monday · 31 questions · top 5", { text: "Checkpoint 4's /ingest", align: "center" }, { text: "Today's sync", align: "center" }],
    rows: [
      ["Hit@5 (27 answerable)", { text: "0.81", b: true }, { text: "0.96", b: true, color: C.deep }],
      ["MRR", { text: "0.63", b: true }, { text: "0.90", b: true, color: C.deep }],
      ["Questions with a chunk the user may not read", { text: "7", b: true, color: C.redText, fill: C.redSoft }, { text: "0", b: true, color: C.deep, fill: C.greenSoft }],
      ["... a superseded or draft chunk", { text: "14", b: true, color: C.redText, fill: C.redSoft }, { text: "0", b: true, color: C.deep, fill: C.greenSoft }],
      ["... a deleted or outdated chunk", { text: "11", b: true, color: C.redText, fill: C.redSoft }, { text: "0", b: true, color: C.deep, fill: C.greenSoft }],
      ["... personal data", { text: "4", b: true, color: C.redText, fill: C.redSoft }, { text: "0", b: true, color: C.deep, fill: C.greenSoft }],
      ["Clean questions (none of the above)", { text: "11", b: true }, { text: "31", b: true, color: C.deep }],
    ] });
  S.card(s, { x: 7.2, y: 1.55, w: 2.2, h: 3.09, title: "Today's 1 miss", titleSize: 13, edge: C.amber,
    body: [{ runs: "Q08: \"How many reviewers does a change to the billing code need?\"" },
      { runs: "The rule is in the middle of a paragraph in a PDF page. The coding standards rank higher." },
      { runs: [{ text: "A ranking problem, not an ingestion one.", b: true, color: C.dark }] }], bodySize: 11, paraSpace: 6 });
  s.text("Same embedding model on both sides: every difference comes from ingestion.",
    { x: 0.6, y: 4.72, w: 6.4, h: 0.3, size: 10.5, italic: true, color: C.slate, name: "measured-same-model" });
  num(s);

  // ---------------------------------------------------------------- 32 stack recap
  s = S.contentSlide(deck, {
    section: "Measure", title: "The ingestion stack, in six files",
    subtitle: "Six layers. Each is where a real system spends real engineering time.",
    takeaway: "Diff it: git diff --no-index checkpoints/checkpoint-4-analysis checkpoints/checkpoint-5-production-ingestion",
    notes: `About: Recap mapping each production layer to checkpoint 5's code. Good slide to leave up while students start the exercises.
Explain: walk down the six rows as the path one document takes on a sync night. The connector lists it and fetches it; the sync decides whether it changed; the parser turns bytes into sections; PII is removed and headers are added; the embedder turns chunks into vectors in batches; the store holds them with their labels, and the retriever filters on those labels at question time.
Point at the right column: each phrase is one of today's slides, so this doubles as a review. Ask the room to name the failure each row prevents (skipped formats, orphans, leaks, empty scans, stale versions, half-built indexes).
Explain the takeaway command: it diffs the two checkpoint folders, so students see exactly which files are new (connector, parsers, register, pii, sync, catalog) and what changed in the old ones (chunker, retriever).
Next: "Your turn."`,
  });
  const stack = [["Connect & authenticate", "connector.py", "Service principal; list, fetch, and read the register"],
    ["Detect change", "sync.py", "eTag first, content hash next, labels last: cheapest first"],
    ["Parse format-aware", "parsers.py", "Sections with headings, per format; scans quarantined, never empty"],
    ["Normalize, redact, enrich", "pii.py, chunker.py", "PII out before embedding; \"title > heading\" on every chunk"],
    ["Embed in batches", "embedder.py", "Batches of 64, retries with backoff; embed before delete"],
    ["Store, filter, switch", "store_chroma.py, retriever.py, catalog.py", "ACL + version filter inside the search; blue/green switch"]];
  stack.forEach(([layer, file, what], i) => {
    const y = 1.55 + i * 0.57;
    s.rect({ x: 0.6, y, w: 8.8, h: 0.5, fill: C.white, line: C.line, name: `stack-${i}` });
    s.ellipse({ x: 0.72, y: y + 0.08, w: 0.34, h: 0.34, fill: C.deep, name: `stack-dot-${i}` });
    s.text(String(i + 1), { x: 0.72, y: y + 0.08, w: 0.34, h: 0.34, font: "Arial", size: 11, bold: true, color: C.white, align: "center", valign: "middle", name: `stack-n-${i}` });
    s.text(layer, { x: 1.2, y, w: 2.55, h: 0.5, size: 12.5, bold: true, color: C.dark, valign: "middle", name: `stack-layer-${i}` });
    s.text(file, { x: 3.8, y, w: 2.75, h: 0.5, font: "Consolas", size: 10, color: C.deep, valign: "middle", name: `stack-file-${i}` });
    s.text(what, { x: 6.6, y, w: 2.75, h: 0.5, size: 11, color: C.slate, valign: "middle", name: `stack-what-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 33 After class divider
  s = S.darkSlide(deck, { section: "After class", icon: I.tasks, kicker: "AFTER CLASS", title1: "Your turn",
    subtitle: "Four exercises on checkpoint 5, then the reference slides", footer: "exercises  ·  commands  ·  checklist",
    detail: "Change the register or the source, re-run the sync, and prove the change with evaluate.py.",
    notes: `About: Everything after this slide is for students to read at home.
Explain the loop every exercise follows: change something (an event, a register entry, a file), run sync.py to read the plan, sync.py --apply, then evaluate.py to see which numbers moved. If a number moved that you didn't expect, that's the lesson.
Next: "Four exercises."` });
  num(s, true);

  // ---------------------------------------------------------------- 34 Exercises
  s = S.contentSlide(deck, {
    section: "After class", title: "Tonight",
    subtitle: "Each exercise changes the register or the source, then you prove the change with evaluate.py.",
    takeaway: "Run the tests after each change: pytest checkpoints/checkpoint-5-production-ingestion/tests -q",
    notes: `About: Homework. Solutions are not in the repo on purpose; discuss at the start of next session.
Explain what each exercise practises (the italic line is a starting hint, not the answer):
1. Withdraw: tests the remove path through the register instead of a deleted file. Expected thinking: withdrawn is not indexable, so every chunk of the 2024 update goes; as_of 2024 questions about the update now have no answer. Is that what Finance wants? (A good discussion: withdrawn vs superseded.)
2. Keep the past: tests the difference between editing in place and publishing editions. Expected thinking: keep the old file under a new path with its own register entry, status superseded, effective_to set, and the new one current. Then as_of 2025 works.
3. Fix the FAQ: tests the depends_on warning. Answers (for you, not the slide): software under $75/month is now $100, and 5 carry-over days is now 10.
4. Add a fence: tests permissions end to end. A new register entry with allowed_groups ["sales"], and two golden questions: sales-rep must find it, intern must get nothing (expect []).
Tell students: run the tests after each change, and bring the evaluate.py output to next session.`,
  });
  const ex = [["Withdraw the 2024 update", "Add a sixth event: Finance withdraws the 2024 update outright. What should the sync do? Which golden questions change?", "Hint: is a withdrawn document indexable?"],
    ["Keep the leave policy's past", "HR edited it in place, so \"how many days could I carry over in 2025?\" has no answer. Change the register so both versions survive.", "Hint: two files, two entries, effective dates."],
    ["Fix the FAQ", "The sync says the FAQ quotes two documents that changed. Find the two stale numbers in it.", "Hint: compare it with the 2026 expense and leave policies."],
    ["Add a fence", "Add a document only sales can read, and one golden question for each side of the fence.", "Hint: allowed_groups, and a question with expect: []."]];
  ex.forEach(([t, d, hint], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.55 + row * 1.76, w: 4.3, h: 1.66, num: i + 1, title: t, titleSize: 13.5, bodySize: 11.5, name: `ex-${i}`,
      body: [{ runs: d }, { runs: [{ text: hint, i: true, color: C.deep }] }] });
  });
  num(s);

  // ---------------------------------------------------------------- R1 commands
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the demo, command by command",
    subtitle: "Run from the checkpoint folder (every script also works from any other folder).",
    notes: `About: The exact sequence used in class, for students to replay.
Explain the order: warmup downloads the local embedding model once. reset puts the folder back to Friday. A dry run then --apply builds the production index; --naive builds checkpoint 4's index next to it for comparison. apply all replays the weekend. The second dry run is the Monday plan. evaluate.py scores both indexes. search.py lets you ask as any user, on any date.
The comments on the slide say what each step is for; the right-hand box also lists the rebuild and rollback commands from the blue/green slide.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 4.3, h: 3.45, size: 10, lines: [
    `cd ${CP}`, "",
    "# once, at home (~80 MB model)",
    "python warmup.py", "",
    "# Friday",
    "python sharepoint.py reset  # back to Friday",
    "python sync.py          # dry run",
    "python sync.py --apply  # write it",
    "python sync.py --naive  # checkpoint 4's", "",
    "# what happens on the weekend",
    "python sharepoint.py events"] });
  S.code(s, { x: 5.1, y: 1.55, w: 4.3, h: 3.45, size: 10, lines: [
    "# the weekend, then Monday",
    "python sharepoint.py apply all",
    "python sync.py          # the plan",
    "python sync.py --apply",
    "python sync.py --naive", "",
    "# measure, then ask",
    "python evaluate.py --details  # no LLM",
    'python search.py "team dinner limit"',
    "    --as-of 2023-06-01", "",
    "# change the model: blue/green",
    "python sync.py --rebuild --apply",
    "python sync.py --rollback"] });
  num(s);

  // ---------------------------------------------------------------- R2 format rules of thumb
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: format rules of thumb",
    subtitle: "What to keep, what to drop, and what to watch for, per format.",
    notes: `About: Condensed from the format deep dive. Not presented in class.
How to read it: "Keep" is what becomes a section or a chunk boundary. "Watch out" is the most common way that format leaks junk into the index, or hides the real content.
PDF row: the 50-character rule from parse_pdf catches scans; for digital PDFs, check a few pages by eye for column order and repeated headers.
XLSX row, worth saying if a student asks: questions like "total spend in Q3" need arithmetic over many rows. Retrieval returns a few chunks, not the whole sheet, so load the sheet into a table and query it instead.`,
  });
  S.table(s, { x: 0.6, y: 1.55, cols: [1.35, 3.6, 3.85], rowH: 0.44, headH: 0.34, size: 10.5,
    header: ["Format", "Keep", "Watch out"],
    rows: [[{ text: "PDF", b: true, color: C.dark }, "Text layer, one section per page; detect scans (< 50 characters)", "Two-column layouts read across; headers and footers on every page"],
      [{ text: "DOCX", b: true, color: C.dark }, "H1/H2 as chunk anchors; tables as their own chunks", "Tracked changes and comments leaking into the text"],
      [{ text: "PPTX", b: true, color: C.dark }, "One chunk per slide, speaker notes included", "The real content is often in the notes"],
      [{ text: "XLSX", b: true, color: C.dark }, "Each sheet is its own document; label rows with the header", "Numbers you need to aggregate: use SQL, not RAG"],
      [{ text: "HTML", b: true, color: C.dark }, "The article: trafilatura, readability, or a tag allow-list", "Single-page apps render with JS: static parsing gets an empty div"],
      [{ text: "Email", b: true, color: C.dark }, "The thread is the unit; subject, sender, date", "Signatures, quoted replies, disclaimers, attachments"],
      [{ text: "Code", b: true, color: C.dark }, "Split on functions and classes, keep the imports", "A function without its class is often meaningless"]] });
  num(s);

  // ---------------------------------------------------------------- R3 checklist
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: a production ingestion checklist",
    subtitle: "Before you call an ingestion pipeline production-ready.",
    notes: `About: The checklist to take into the capstone design doc.
How to use it: each card maps to a part of today's session (in brackets in the card title). For a capstone design doc, every line should be either "done, here's how" or "not needed, here's why". A line nobody thought about is the risk.`,
  });
  const cl = [["Source  (Part 1)", ["Runs as a service principal, not a person", "Uses the source's change feed (delta, eTags)", "Notices deletions, not only additions"]],
    ["Content  (Part 2)", ["Every format parsed or reported, never skipped silently", "Scans detected and queued for OCR", "PII redacted before embedding"]],
    ["Metadata  (Part 3)", ["Permissions copied onto every chunk; fail closed", "Status and effective dates; drafts never indexed", "Provenance: doc_id, version, link"]],
    ["Operations  (Parts 4, 5)", ["Dry run with a cost estimate", "Batches, retries, embed before delete", "Blue/green rebuilds; a golden set run on every change"]]];
  cl.forEach(([t, items], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.55 + row * 1.72, w: 4.3, h: 1.58, title: t, titleSize: 13.5, icon: I.check, iconInline: true,
      body: items.map(x => ({ runs: x, bullet: true })), bodySize: 11.5, name: `cl-${i}` });
  });
  num(s);

  return deck;
}

module.exports = { build };

if (require.main === module) {
  (async () => {
    const deck = await build();
    const out = process.argv[2] || ".";
    deck.saveHtml(path.join(out, "s08-preview.html"));
    await deck.savePptx(path.join(out, "s08.pptx"), S.THEME);
    console.log(`slides: ${deck.slides.length}`);
  })().catch(e => { console.error(e); process.exit(1); });
}
