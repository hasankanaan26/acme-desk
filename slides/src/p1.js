// p1.js — Creating your production application, Part 1: a real document source (acme-desk, checkpoint 01-source)
const path = require("path");
const { Deck } = require("./kit");
const S = require("./sef");
const { C } = S;
const fa = require("react-icons/fa");

const CP = "checkpoints/01-source";

async function build() {
  const I = {};
  const want = {
    sync: [fa.FaSyncAlt, C.green], plug: [fa.FaPlug, C.green], clock: [fa.FaClock, C.green], finger: [fa.FaFingerprint, C.green],
    coffee: [fa.FaCoffee, C.green], laptop: [fa.FaLaptopCode, C.green], tasks: [fa.FaTasks, C.green], robot: [fa.FaRobot, C.green],
    drive: [fa.FaGoogleDrive, C.deep], list: [fa.FaListUl, C.deep], download: [fa.FaDownload, C.deep], tag: [fa.FaTags, C.deep],
    key: [fa.FaKey, C.deep], users: [fa.FaUsers, C.deep], check: [fa.FaCheckCircle, C.deep], warn: [fa.FaExclamationTriangle, C.amber],
    cloud: [fa.FaCloud, C.deep], folder: [fa.FaFolder, C.deep], book: [fa.FaBook, C.deep], chat: [fa.FaComments, C.deep],
    box: [fa.FaBoxOpen, C.deep], git: [fa.FaCodeBranch, C.deep], db: [fa.FaDatabase, C.deep], mail: [fa.FaEnvelope, C.deep],
    shield: [fa.FaShieldAlt, C.deep], bell: [fa.FaBell, C.deep], redo: [fa.FaRedo, C.deep], server: [fa.FaServer, C.deep],
    trash: [fa.FaTrashAlt, C.red], fingerD: [fa.FaFingerprint, C.deep], hist: [fa.FaHistory, C.deep], chart: [fa.FaChartBar, C.deep],
    tools: [fa.FaTools, C.deep], flag: [fa.FaFlag, C.deep], file: [fa.FaFileAlt, C.deep], clockD: [fa.FaClock, C.deep],
  };
  for (const [k, [comp, color]] of Object.entries(want)) I[k] = await S.icon(comp, color);

  const deck = new Deck({ title: "Part 1: a real document source", author: "SE Factory", company: "SE Factory",
    subject: "Applied AI Engineering Workshop · Creating your production application · Part 1" });
  let n = 0;
  const num = (s, dark) => S.slideNumber(s, ++n, dark);

  // ---------------------------------------------------------------- 1 Title
  let s = S.darkSlide(deck, {
    section: "Opening", icon: I.sync,
    kicker: "CREATING YOUR PRODUCTION APPLICATION  ·  PART 1 OF 4",
    title1: "A real", title2: "document source",
    subtitle: "Friday's pipeline, on Google Drive, on a timer",
    detail: "Edit a file, trash another, and watch the index follow. Nobody types a command.",
    footer: "Connect  ·  Schedule  ·  Signals",
    notes: `About: The first of four sessions that build one production app, Acme Desk. Today: the Session 8 pipeline, unchanged, reading a real Google Drive folder, run by a scheduler. Code: ${CP} in acme-desk.
Say (the closeout, three minutes, no more): "Friday ran short, for a family reason I had to attend to. I owe you the ending, and I'd rather give you a better one than a repeat: the same pipeline, on a real document source, on a schedule, today. The remaining four sessions build one production app on it. The capstone is cancelled, so nothing competes for your evenings. Here is the plan."
Explain the footer: three blocks. Connect: a second connector, for a real source. Schedule: the sync as a job that runs itself. Signals: how the job knows what changed without downloading anything.
Before class: drive_admin.py check says READY, sync.py --wipe, the API NOT started with the timer on (the opening dry run must say add 18).
Next: the arc.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 2 The arc
  s = S.contentSlide(deck, {
    section: "Opening", title: "One app, four sessions",
    subtitle: "One helpdesk over Acme's documents. Each session adds a layer and leaves a running app behind.",
    takeaway: "Every checkpoint runs offline on your laptop. A Google account is only needed on this screen.",
    notes: `About: The arc slide. It appears in all four decks with the current part highlighted.
Say: "Four sessions, one application. Today the documents and the job that keeps the index true. Wednesday a chat assistant on top, with identity and permissions. Friday it starts acting: tools, with real security controls. Next Monday we make it safe to ship: guardrails, evals as a gate, a kill switch."
Explain why this replaces the planned schedule: evaluation, guardrails and production were going to be three separate sessions on a toy. They are now three layers on one thing you can run, with the Session 8 pipeline underneath.
If asked about the capstone: cancelled. Nothing to submit. Anyone who wrote a design doc and wants comments can send it.
Next: what carries over from Friday.`,
  });
  const parts = [["1", "The source", "today", ["Google Drive through a service account", "the sync on a timer", "edits and deletions, live"], true],
    ["2", "Assistant", "Wed 11 Nov", ["a LangGraph workflow", "identity from an API key", "hybrid retrieval, streaming"], false],
    ["3", "Tools, agents", "Fri 13 Nov", ["allowlists, validation, approval", "idempotency keys, budgets", "workflow vs agent, side by side"], false],
    ["4", "Release", "Mon 16 Nov", ["guardrails: input, document, output", "evals as a release gate", "kill switch, dashboard, Docker"], false]];
  parts.forEach(([k, title, when, items, now], i) => {
    const x = 0.6 + i * 2.2;
    S.card(s, { x, y: 1.6, w: 2.1, h: 3.25, num: k, numColor: now ? C.green : C.deep, title: title, titleSize: 13,
      edge: now ? C.green : undefined, fill: now ? C.pale : C.white,
      body: [{ runs: [{ text: when, b: true, color: now ? C.deep : C.gray }] }, ...items.map(t => ({ runs: t, bullet: true }))], bodySize: 11, name: `arc-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 3 Friday to today
  s = S.contentSlide(deck, {
    section: "Opening", title: "Friday, and today",
    subtitle: "Same pipeline, same register, same decision ladder. Only the source and the trigger are real now.",
    takeaway: "Zero changes in sync.py. That is the test of an interface.",
    notes: `About: Maps every Friday demo step to its real counterpart today.
Say: "On Friday a script played SharePoint and I typed every sync. Today a Google Drive folder is the source, I edit documents the way an HR partner would, and a scheduler runs the sync. The code that decides what to do with each document did not change."
Explain the rows top to bottom: the folder becomes a Drive folder; the script's events become my clicks in Drive; the manual sync becomes a tick; the eTag we computed becomes the one Drive hands out (and ours matches it); sync.py is untouched.
Why this matters for their own work: the swappable part is the connector. Everything downstream of it is an investment that survives a change of source.
Next: a connector answers three questions. You saw this on Friday; today there are two of them.`,
  });
  S.table(s, { x: 0.6, y: 1.6, cols: [2.9, 2.95, 2.95], rowH: 0.47, headH: 0.36, size: 11,
    header: ["", "Friday (Session 8)", "Today"],
    rows: [[{ text: "The source", b: true, color: C.dark }, "a folder playing SharePoint", "a Google Drive folder, read by a service account"],
      [{ text: "HR edits the Leave Policy", b: true, color: C.dark }, "fake_drive.py apply 2", "you edit the Google Doc"],
      [{ text: "Legal deletes the Q3 notes", b: true, color: C.dark }, "fake_drive.py apply 3", "you trash the file"],
      [{ text: "The sync runs", b: true, color: C.dark }, "python sync.py --apply", "a tick, every 60 seconds"],
      [{ text: "The change signal", b: true, color: C.dark }, "our SHA-256 of the bytes", "Drive's md5Checksum; our MD5 now matches it"],
      [{ text: "sync.py", b: true, color: C.dark }, "build_plan, apply_plan, blue/green", { text: "unchanged", b: true, color: C.deep }]] });
  num(s);

  // ================================================================ CONNECT
  // ---------------------------------------------------------------- 4 three questions
  s = S.contentSlide(deck, {
    section: "Connect", title: "A connector answers three questions",
    subtitle: "SharePoint, Confluence, Drive, Slack, S3: different APIs, the same three questions.",
    takeaway: "Two connectors, one protocol. make_connector() reads .env; nothing else knows which one it got.",
    notes: `About: app/ingest/connector.py (the Protocol, LocalFolderConnector, make_connector) and app/ingest/connector_drive.py (DriveConnector).
Say: "Every source answers three questions. What exists right now, with a cheap change signal. Give me the bytes. What do you know about it: owner, permissions, status. On Friday one class answered them from a folder. Today a second class answers them from Drive, and sync.py cannot tell them apart."
Open connector_drive.py and walk down: _children() is one files.list call per folder, following nextPageToken. _identity() picks the change signal: md5Checksum for an uploaded file, the version counter for a native Google Doc. fetch() downloads an upload or exports a Doc as markdown. fetch_register() reads the register. source_url() is the real link in Drive, so every citation opens the file.
Explain the grey lines: the Microsoft Graph call that does the same job. Same three questions.
If asked "Why a Protocol and not a base class?": the sync only needs four methods; a Protocol says that and nothing more. A test can pass a fake.
Next: the identity the job runs as.`,
  });
  const qs3 = [["What exists right now?", "list_items()  →  path, size, modified, eTag", "Drive: files.list   ·   Graph: /root/delta", I.list],
    ["Give me the bytes", "fetch(path)  →  bytes", "Drive: files.get, files.export   ·   Graph: /content", I.download],
    ["What do you know about it?", "fetch_register()  →  owner, groups, status, dates", "the register   ·   Drive: permissions.list   ·   Graph: /permissions", I.tag]];
  qs3.forEach(([q, ours, real, ic], i) => {
    const y = 1.6 + i * 1.12;
    s.rect({ x: 0.6, y, w: 5.0, h: 1.0, fill: C.white, line: C.line, name: `q3-box-${i}` });
    s.ellipse({ x: 0.78, y: y + 0.28, w: 0.44, h: 0.44, fill: C.deep, name: `q3-dot-${i}` });
    s.text(String(i + 1), { x: 0.78, y: y + 0.28, w: 0.44, h: 0.44, font: "Arial", size: 14, bold: true, color: C.white, align: "center", valign: "middle", name: `q3-num-${i}` });
    s.text([[{ text: q, b: true, size: 14, color: C.dark, font: "Arial" }], [{ text: ours, font: "Consolas", size: 10.5, color: C.deep }], [{ text: real, size: 10, color: C.gray }]],
      { x: 1.4, y: y + 0.08, w: 4.1, h: 0.86, valign: "middle", name: `q3-text-${i}` });
  });
  S.code(s, { x: 5.85, y: 1.6, w: 3.55, h: 3.25, label: "app/ingest/connector.py", size: 10.5, lines: [
    "class Connector(Protocol):", "    def list_items(self): ...", "    def fetch(self, path): ...",
    "    def fetch_register(self): ...", "    def source_url(self, path): ...", "",
    "def make_connector():", '    if SOURCE == "drive":', "        return DriveConnector(...)", "    return LocalFolderConnector(SOURCE_DIR)", "",
    "# sync.py: run_sync(connector=None)", "#   connector or make_connector()"] });
  num(s);

  // ---------------------------------------------------------------- 5 connectors & auth (reused from Session 8)
  s = S.contentSlide(deck, {
    section: "Connect", title: "Connectors and auth",
    subtitle: "Most projects connect to 3 to 7 sources. The loader is the easy part; auth is where integrations fail.",
    takeaway: "A scheduled sync runs as a service account, never as a person. Today's does.",
    notes: `About: The landscape (left) and the four auth patterns (right). Shown on Friday; today we are living the Google Drive row.
Say: "Our sync has its own identity: a service account with a JSON key, shared on exactly one folder as a Viewer. It cannot upload, cannot delete, cannot see your other files. When I leave the company, it keeps working. When it is compromised, the blast radius is one read-only folder."
Explain the table briefly: PAT dies with its owner; OAuth acts as a person; service principal (Microsoft) and service account (Google) are the same idea: an identity for a program; managed identity has no secret at all but is tied to one cloud.
The rule at the bottom is the whole of least privilege: read-only, only the folder you index, the key in a vault and rotated.
Connect to permissions: the sync account may read everything in the folder; the USER may not. That is why the register's groups are copied onto every chunk, and why Wednesday's assistant filters inside the query.
Next: the two APIs side by side.`,
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

  // ---------------------------------------------------------------- 6 Drive and SharePoint side by side
  s = S.contentSlide(deck, {
    section: "Connect", title: "Google Drive today, SharePoint at work",
    subtitle: "Every call the connector makes, next to the Microsoft Graph call that does the same job.",
    takeaway: "docs/sharepoint-mapping.md has the full table and the 30-line sketch of a SharePointConnector.",
    notes: `About: The mapping most of the room will need at work. Read a row or two, then point at the doc.
Say: "Most of you will meet SharePoint, not Drive. Same shape. Graph's /delta is the listing and the delta feed in one call; eTag and cTag are the md5 and version; /permissions is permissions.list; an app registration is the service account."
Explain the rows that differ: Graph's delta returns a deleted item once more with a 'deleted' facet, Drive just stops listing it; Office files are real bytes we already parse, a Google Doc has to be exported; both push mechanisms expire and need a public endpoint, which is why everybody still polls.
If asked "How long to write the SharePoint one?": a day, most of it auth and paging. The four methods are in docs/sharepoint-mapping.md; the tests take a fake service, so swap the fake.
Next: the change signal, which is the whole trick.`,
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

  // ---------------------------------------------------------------- 7 the change signal
  s = S.contentSlide(deck, {
    section: "Connect", title: "Three fingerprints, two prices",
    subtitle: "Two come free from the source. We compute the third, and only it decides whether we embed.",
    takeaway: "Same signal: not even downloaded. Different signal, same hash: touch or relabel. Different hash: change.",
    notes: `About: md5Checksum, version, content hash. The ladder on Friday used "eTag"; today eTag means whichever of the first two the source gives you.
Say: "Drive tells us the MD5 of every uploaded file in the listing. For a Google Doc, which has no bytes, it gives a version counter instead. Either way, if it matches what the index stored, we do not download the file. If it differs, we download, parse, redact and hash the chunks, and only a different hash costs an embedding call."
Explain the cards: card 1 is free and moves on any byte. Card 2 is free and moves on any edit, rename or comment of a Doc. Card 3 costs a download and a parse, and is exact: it is a hash of the text we would store, plus the parser and pipeline versions.
Explain the bottom strip as the ladder: it is the same build_plan() as Friday. The word eTag in the code now means "the source's signal".
Why our local MD5 matches Drive's: the same bytes, the same algorithm. A file copied between the local folder and Drive gets the same eTag on both sides, so the demo and the offline exercises agree.
Next: let's run it.`,
  });
  const sig = [["md5Checksum", "every uploaded file", ["free: comes with the listing", "moves on any byte: an edit, a re-save", "SharePoint: eTag"], I.fingerD],
    ["version", "native Docs and Sheets", ["free: comes with the listing", "moves on any edit, rename or comment", "SharePoint: cTag is the closer cousin"], I.hist],
    ["content hash", "computed by the sync", ["costs a download and a parse", "exact: the text we would embed", "includes the parser and pipeline versions"], I.finger]];
  sig.forEach(([t, sub, items, ic], i) => {
    const x = 0.6 + i * 2.97;
    S.card(s, { x, y: 1.6, w: 2.85, h: 2.35, title: t, titleSize: 15, icon: ic, iconInline: true,
      body: [{ runs: [{ text: sub, i: true, color: C.gray }] }, ...items.map(z => ({ runs: z, bullet: true }))], bodySize: 11, name: `sig-${i}` });
  });
  S.code(s, { x: 0.6, y: 4.1, w: 8.8, h: 0.9, size: 10.5, lines: [
    { text: "same signal as the index          -> unchanged      not even downloaded", color: C.mintText },
    { text: "different signal, same hash       -> touch          (or relabel, when only the register changed)", color: C.codeText },
    { text: "different signal, different hash  -> change         embed the new chunks, then swap", color: C.green }] });
  num(s);

  // ---------------------------------------------------------------- 8 LIVE first sync
  s = S.liveSlide(deck, {
    section: "Connect", icon: I.laptop, kicker: "LIVE  ·  THE FIRST SYNC",
    title1: "Friday's job,", title2: "a real folder",
    steps: ["drive_admin.py tree: seven folders, twenty files, each with its md5 or version",
      "sync.py --source drive: the dry run. Add 18, quarantine 1 (the scan), skip 1 (the draft)",
      "sync.py --source drive --apply: 88 chunks, smoke check, LIVE",
      "In the UI: \"How many unused vacation days can I roll over?\"  →  5 days"],
    command: "drive_admin.py tree   ·   sync.py --source drive   ·   sync.py --source drive --apply",
    notes: `About: Block 1's demo. Everything is pre-built; nothing is typed but commands.
Expect: dry run add 18, quarantine 1, skip 1; 88 chunks, about 6,200 tokens. Apply 15 to 25 s with Azure embeddings, about 5 s with the local model. The carry-over answer is 5 days: Friday's text.
Say while it runs: "Eight listing calls, twenty downloads, one plan. Exactly the output you saw on Friday from the folder. The connector changed; the plan did not."
Fallback: instructor-notes/fallbacks/part1/first-sync.txt.
Next: nobody should have to type that.`,
  });
  num(s, true);

  // ================================================================ SCHEDULE
  // ---------------------------------------------------------------- 9 a job, not a button
  s = S.contentSlide(deck, {
    section: "Schedule", title: "A job, not a button",
    subtitle: "Session 8 ran when I typed a command. A production index is kept true by a job nobody types.",
    takeaway: "Every tick is the same ladder, a report, and an untouched index when it fails.",
    notes: `About: The three ways a sync runs in production, and what today's scheduler is (a thread inside the API, one lock).
Say: "Three ways. Cron, or any scheduler: the simplest, fine for one machine. A queue worker: the tick is a message, you get retries and one-at-a-time for free, this is what most teams run. A webhook from the source: no polling, but notifications get lost, so everyone still polls as a backstop."
Explain today's version: a thread started with the API, SYNC_INTERVAL_SECONDS between ticks, and one lock that both the thread and the Sync button take, so two syncs never write at once. tick() calls the same run_sync(apply=True) you ran by hand.
Explain the failure rule: a tick that fails is counted and shown (GET /sync/status), never raised. The index was not touched, because apply_plan embeds first and writes last. The next tick gets another chance.
If asked "Why not Celery / APScheduler?": you could. The point today is what a tick does, not how it is triggered; swap the trigger when you have a queue.
Next: let's write the loop.`,
  });
  const ways = [["cron / a scheduler", "*/5 * * * *  python sync.py --apply", ["the simplest thing", "fine for one box", "no retries unless you add them"], I.clockD],
    ["a queue worker", "the tick is a message", ["retries and backoff for free", "one job at a time, by construction", "scales when the sources multiply"], I.server],
    ["a webhook", "Drive push, Graph subscriptions", ["no polling, near real time", "notifications get lost", "so you still poll as a backstop"], I.bell]];
  ways.forEach(([t, sub, items, ic], i) => {
    const x = 0.6 + i * 2.97;
    S.card(s, { x, y: 1.6, w: 2.85, h: 2.3, title: t, titleSize: 14, icon: ic, iconInline: true,
      body: [{ runs: [{ text: sub, font: "Consolas", size: 10, color: C.deep }] }, ...items.map(z => ({ runs: z, bullet: true }))], bodySize: 11, name: `way-${i}` });
  });
  s.rect({ x: 0.6, y: 4.05, w: 8.8, h: 0.95, fill: C.pale, line: C.deep, name: "today-box" });
  s.text([[{ text: "TODAY  ", b: true, color: C.deep, size: 10.5 }, { text: "app/ingest/scheduler.py: a thread started with the API, a tick every SYNC_INTERVAL_SECONDS, one lock shared with the Sync button.", color: C.dark }],
    [{ text: "GET /sync/status  ·  POST /sync/now  ·  POST /sync/pause  ·  POST /sync/resume", font: "Consolas", size: 10.5, color: C.deep }]],
    { x: 0.8, y: 4.1, w: 8.4, h: 0.85, size: 11.5, valign: "middle", paraSpace: 4, name: "today-text" });
  num(s);

  // ---------------------------------------------------------------- 10 LIVE the scheduler
  s = S.liveSlide(deck, {
    section: "Schedule", icon: I.laptop, kicker: "LIVE  ·  THE SCHEDULER",
    title1: "Edit. Trash.", title2: "Wait.",
    steps: ["Type tick(): run_locked(run_sync(apply=True)), record the counts, count a failure instead of raising",
      "Type _loop(): while not stop.wait(interval): if not paused, tick()",
      "Restart the API with SYNC_INTERVAL_SECONDS=60. The Sync tab counts down",
      "In Drive: carry-over 5 → 10 in the Leave Policy Doc; trash leadership/q3-planning-notes.md",
      "The tick: change HR-LEAVE, remove LEAD-Q3-NOTES. Ask the question again: 10 days"],
    command: `SYNC_INTERVAL_SECONDS=60 python run_checkpoint.py 01-source   ·   /ui#sync   ·   or POST /sync/now`,
    notes: `About: Block 2. The only live-coded code of the day: two functions, about 20 lines, in app/ingest/scheduler.py. The complete file is in instructor-notes/fallbacks/part1/scheduler_complete.py.
Say while typing tick(): "Same run_sync as the button, under the lock. Record what it decided. If it throws, count it and show it; a scheduler has to outlive one bad run, and the index was not touched."
Say while typing _loop(): "wait() sleeps for the interval and returns True the moment stop() is called. Paused means the loop keeps running and does nothing."
Then the edits, as the owner, in the browser: the Doc first, then the trash. Say what you are doing: "This is an HR partner fixing a number. This is Legal deleting notes that named people."
Expect: change 1, remove 1, quarantine 1, skip 1, unchanged 16. Carry-over 10 days. "How many backend developers are we hiring?" as finance-lead: no information.
Fallbacks: POST /sync/now if the minute feels long. SOURCE=local and fake_drive.py apply 2, apply 3 if Drive misbehaves. monday-plan.json and the screenshots if everything does.
Next: what the tick decided, line by line.`,
  });
  num(s, true);

  // ---------------------------------------------------------------- 11 what the tick decided
  s = S.contentSlide(deck, {
    section: "Schedule", title: "What the tick decided",
    subtitle: "One minute after two clicks in Drive. Nobody ran anything.",
    takeaway: "Cost scales with what changed, not with the size of the corpus. Sixteen documents were never downloaded.",
    notes: `About: The tick's plan, as the Sync tab and runs/sync-*.json show it.
Say: "Two actions out of twenty documents. The Doc's version moved, so it was downloaded, exported, parsed, hashed: the hash differs, four chunks out, four in. The Q3 notes are in the register and not in the source: every chunk goes. Sixteen documents had the same signal as the index and were not even downloaded."
Explain quarantine and skip: the scan and the draft are reported every run. The report is for a human; the scan needs OCR, the draft is working as designed.
Explain the warning: the register says the FAQ depends on the Leave Policy, so the report asks People Operations to look at the FAQ. The index cannot fix prose.
Next: the ladder behind those lines. You saw it Friday; it did not change.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 6.15, h: 3.42, size: 10, label: "GET /sync/status  ·  last_summary, and the report in runs/", lines: [
    { text: " ~ change     HR-LEAVE                4 old chunk(s) out, 4 new in", color: C.green },
    { text: " - remove     LEAD-Q3-NOTES           in the register, gone from the source", color: "F2A19C" },
    { text: " ! quarantine ENG-INCIDENT-REPORT     a scan. Queued for OCR, not indexed", color: C.amber },
    { text: " . skip       HR-PARENTAL-2027-DRAFT  status is draft: never indexed", color: C.mintText },
    { text: "   unchanged  16 document(s), not even downloaded", color: C.mintText },
    { text: "", color: C.codeText },
    { text: "For a human to look at:", color: C.amber },
    { text: " - COMPANY-FAQ depends on HR-LEAVE, which changed. Ask People Operations.", color: C.amber },
    { text: "", color: C.codeText },
    { text: "# tick #3 · 60 s interval · 4 chunks embedded · index untouched on failure", color: C.mintText }] });
  S.stat(s, { x: 7.0, y: 1.5, w: 2.4, value: "2 / 20", label: "documents acted on", size: 30, name: "tick-acted" });
  S.stat(s, { x: 7.0, y: 2.65, w: 2.4, value: "16", label: "not even downloaded", size: 30, name: "tick-skip" });
  S.stat(s, { x: 7.0, y: 3.8, w: 2.4, value: "0", label: "commands typed", size: 30, name: "tick-typed" });
  num(s);

  // ---------------------------------------------------------------- 12 one action per document (reused from Session 8)
  s = S.contentSlide(deck, {
    section: "Schedule", title: "One action per document",
    subtitle: "build_plan() compares the source with the index and decides. Cheapest check first. Unchanged since Friday.",
    takeaway: "The content hash includes the parser and pipeline versions: change the chunker and everything re-embeds.",
    notes: `About: build_plan() in app/ingest/sync.py. Reads only; never writes. The same slide as Friday, on purpose.
Say: "Read it top to bottom; the first yes wins. Register lookup: free. Signal compare: free, no download. Parse and hash: a download and some CPU. The last row starts from the index and finds what the source no longer has. Today's two clicks landed on rows 5 and 8."
Map today's demo: the Doc edit is 'content hash differs' → change. The trashed file is 'gone from the source' → remove. A footer upload (block 3) is 'only the bytes differ' → touch. A register-only change is relabel.
Explain the right column: only add and change call the embedder. Everything else is metadata.
If asked "Why delete the old chunks on change instead of upserting?": the new version may have fewer chunks. Upsert would leave the extra old ones behind.
Next: break.`,
  });
  const ladder = [["Not indexable (draft, withdrawn, no entry)?", "skip"], ["Same signal as the index?", "unchanged (no download)"],
    ["No text (a scan)?", "quarantine"], ["Not in the index yet?", "add"], ["Content hash differs?", "change"], ["Labels differ?", "relabel"],
    ["Only the bytes differ?", "touch"], ["In the index, gone from the source?", "remove"]];
  ladder.forEach(([q, a], i) => {
    const y = 1.55 + i * 0.425;
    const today = i === 4 || i === 7;
    s.rect({ x: 0.6, y, w: 5.2, h: 0.36, fill: today ? C.pale : (i % 2 ? C.white : C.soft), line: today ? C.deep : undefined, name: `lad-${i}` });
    s.text(q, { x: 0.72, y, w: 2.95, h: 0.36, size: 11.5, color: C.dark, valign: "middle", name: `lad-q-${i}` });
    s.text(a, { x: 3.62, y, w: 2.15, h: 0.36, size: 10.5, bold: true, color: C.deep, valign: "middle", font: "Consolas", name: `lad-a-${i}` });
  });
  const acts = [["+ add", "parse, embed, insert", C.deep], ["~ change", "embed, delete old, insert new", C.deep], ["* relabel", "metadata only, no embedding", C.amberDeep],
    ["= touch", "new signal, same text", C.amberDeep], ["- remove", "delete every chunk", C.redText], ["! quarantine", "report, don't index", C.redText]];
  acts.forEach(([a, d, color], i) => {
    const y = 1.55 + i * 0.5;
    s.rect({ x: 6.05, y, w: 3.35, h: 0.43, fill: C.white, line: C.line, name: `act-${i}` });
    s.text(a, { x: 6.15, y, w: 1.25, h: 0.43, font: "Consolas", size: 12, bold: true, color, valign: "middle", name: `act-a-${i}` });
    s.text(d, { x: 7.4, y, w: 1.95, h: 0.43, size: 11, color: C.slate, valign: "middle", name: `act-d-${i}` });
  });
  s.text([[{ text: "Only + and ~ call the embedder.", b: true, color: C.deep }], [{ text: "Everything else is free." }]],
    { x: 6.05, y: 4.52, w: 3.35, h: 0.42, size: 11, color: C.slate, valign: "middle", name: "act-cost" });
  num(s);

  // ---------------------------------------------------------------- 13 break
  s = S.darkSlide(deck, { section: "Break", icon: I.coffee, kicker: "10 MINUTES", title1: "Break",
    subtitle: "When we come back: what the two fingerprints looked like, who may read what, and the upgrade path.",
    footer: "Signals  ·  Permissions  ·  Delta feeds",
    notes: `About: Break. Leave the Sync tab on screen with the scheduler counting down; it will tick once or twice during the break and change nothing, which is itself the point.
Before resuming: upload the footer-edited wiki page (shared/data/events/files/wiki-vector-database.html) as a new version of engineering/wiki-vector-database.html in Drive, so block 3 can show a touch.` });
  num(s, true);

  // ================================================================ SIGNALS
  // ---------------------------------------------------------------- 14 two fingerprints, one document
  s = S.contentSlide(deck, {
    section: "Signals", title: "Two fingerprints, one document",
    subtitle: "GET /sync/explain shows both, index versus source, with the diff behind each. Three documents, three verdicts.",
    takeaway: "The signal says the file moved. The hash says whether the text did. Only the second costs money.",
    notes: `About: The explain panel in the Sync tab (Friday's uncommitted feature, now paying off) and the footer touch.
Demo: Sync tab, Compare HR-LEAVE: version v7 → v8, hash differs, the chunk diff shows 5 → 10. Then the wiki page after the footer upload: md5 differs, hash identical, action touch, nothing embedded. Then any untouched document: same signal, hash not computed.
Say: "Three documents, three verdicts. The Doc: signal moved, text moved, four chunks embedded. The wiki page: signal moved, text identical, zero chunks embedded; the HTML parser drops the footer. The remote-work guidelines: same signal, so we never even looked inside."
Explain the byte diff note for the Doc: a native Doc has no bytes we stored, so there is nothing to diff at the byte level; the chunk diff is the one that matters anyway.
Next: who may read it.`,
  });
  S.table(s, { x: 0.6, y: 1.6, cols: [2.3, 1.25, 1.25, 1.5, 2.5], rowH: 0.62, headH: 0.36, size: 10.5,
    header: ["Document", "signal: index", "signal: source", "content hash", "action"],
    rows: [[{ text: "HR-LEAVE (a Google Doc, edited)", b: true, color: C.dark }, { text: "v7", font: "Consolas" }, { text: "v8", font: "Consolas", color: C.amberDeep, b: true }, { text: "differs", color: C.amberDeep, b: true }, { text: "change: 4 chunks out, 4 in", color: C.deep, b: true }],
      [{ text: "ENG-WIKI-VECTOR-DB (footer re-uploaded)", b: true, color: C.dark }, { text: "3c9f…", font: "Consolas" }, { text: "8e21…", font: "Consolas", color: C.amberDeep, b: true }, { text: "same", color: C.deep }, { text: "touch: new signal stored, 0 embedded", color: C.amberDeep, b: true }],
      [{ text: "HR-REMOTE (untouched)", b: true, color: C.dark }, { text: "51aa…", font: "Consolas" }, { text: "51aa…", font: "Consolas" }, { text: "not computed", color: C.gray, i: true }, { text: "unchanged: not downloaded", color: C.gray }]] });
  s.text([[{ text: "Where to look: ", b: true, color: C.dark }, { text: "the Sync tab's \"See the difference\" panel, or GET /sync/explain?doc_id=HR-LEAVE. Both only read the index; nothing is written." }]],
    { x: 0.6, y: 4.2, w: 8.8, h: 0.5, size: 11.5, color: C.slate, valign: "middle", name: "explain-where" });
  num(s);

  // ---------------------------------------------------------------- 15 who may read it
  s = S.contentSlide(deck, {
    section: "Signals", title: "Who may read it",
    subtitle: "Drive knows who a file is shared with. The index enforces allowed_groups. One derives from the other.",
    takeaway: "The register stays the truth here. Mapping principals to groups is the identity provider's job.",
    notes: `About: drive_admin.py permissions hr/salary-bands-2026.md, next to the register entry.
Say: "Drive can tell us who the file is shared with: people and groups by email. The register says which groups may retrieve it. A production sync maps one onto the other: this Google group is the hr group, that one is managers. We keep that mapping as a table and the register as the truth, because the filter inside the query can only use what was stored at ingest time."
Explain why the sync account's own access is irrelevant: it may read everything in the folder. The user may not. The permission that matters is the user's, copied onto the chunk, enforced inside the search. Wednesday's identity work hangs off this.
If asked "Why not call permissions.list at query time?": one call per chunk per question, and the answer would be stale by the time you cached it. Store it at ingest, re-sync when it changes (that is the relabel action).
Next: the upgrade path from polling.`,
  });
  S.code(s, { x: 0.6, y: 1.6, w: 4.6, h: 2.6, label: "drive_admin.py permissions hr/salary-bands-2026.md", size: 10, lines: [
    { text: "  permissions.list                  register group", color: C.mintText },
    { text: "  user   owner    hasan@…           (a person)", color: C.codeText },
    { text: "  user   reader   acme-desk-sync@…  (the sync itself)", color: C.codeText },
    { text: "  group  reader   hr-team@acme.example   hr", color: C.green },
    { text: "  group  reader   managers@acme.example  managers", color: C.green },
    { text: "", color: C.codeText },
    { text: "  register allowed_groups: hr, managers", color: C.green }] });
  S.card(s, { x: 5.45, y: 1.6, w: 3.95, h: 2.6, title: "shared/data/register.json", titleSize: 13, icon: I.users, iconInline: true,
    body: [{ runs: [{ text: '"doc_id": "HR-SALARY-BANDS-2026"', font: "Consolas", size: 10 }] }, { runs: [{ text: '"allowed_groups": ["hr", "managers"]', font: "Consolas", size: 10, color: C.deep, b: true }] },
      { runs: [{ text: '"status": "current", "version": 1', font: "Consolas", size: 10 }] }, { runs: "" },
      { runs: "On every chunk: acl_hr = true, acl_managers = true, acl_employees = false. The retriever's where-clause reads those flags inside the vector search." }], bodySize: 11, name: "reg-card" });
  s.text([[{ text: "In SharePoint: ", b: true, color: C.dark }, { text: "GET /items/{id}/permissions returns users, Entra ID groups and sharing links; groups resolve through Entra ID. Same shape, same mapping table." }]],
    { x: 0.6, y: 4.4, w: 8.8, h: 0.5, size: 11.5, color: C.slate, valign: "middle", name: "perm-sp" });
  num(s);

  // ---------------------------------------------------------------- 16 from polling to a delta feed
  s = S.contentSlide(deck, {
    section: "Signals", title: "From polling to a delta feed",
    subtitle: "Today's tick lists the whole folder. That is right for 20 files and wrong for 20,000. Both sources have the fix.",
    takeaway: "Tonight's stretch: changes.list with a saved token, so a tick with nothing to do costs one call.",
    notes: `About: The three stages, and where the course stops (stage 1, with stage 2 as the lab).
Say: "Eight listing calls per tick is nothing. At a hundred thousand files it is a problem, and the answer is the same on both platforms: ask for what changed since last time. Drive calls it changes.list with a page token; Graph calls it /delta with a deltaLink. Save the token, send it back, download only what it names."
Explain stage 3: push notifications. No polling, near real time, but the endpoint has to be public and the subscription expires, and notifications get lost. Every team that runs push also runs a slow poll as a backstop.
Demo if time: drive_admin.py token, edit something, drive_admin.py changes <token>: one record for the Doc.
Next: honest limits, then tonight.`,
  });
  const stages = [["1  List everything", "today", ["files.list per folder: 8 calls a tick", "right up to a few thousand files", "no state to keep"], I.list, true],
    ["2  Ask what changed", "the lab", ["changes.getStartPageToken, then changes.list(token)", "Graph: /delta and the deltaLink", "save the token; a quiet tick is one call"], I.redo, false],
    ["3  Be told", "slides only", ["files.watch, Graph subscriptions", "public HTTPS, expiry, renewal", "notifications get lost: keep polling"], I.bell, false]];
  stages.forEach(([t, tag, items, ic, now], i) => {
    const x = 0.6 + i * 2.97;
    S.card(s, { x, y: 1.6, w: 2.85, h: 2.75, title: t, titleSize: 14, icon: ic, iconInline: true, edge: now ? C.green : undefined, fill: now ? C.pale : C.white,
      body: [{ runs: [{ text: tag, b: true, color: now ? C.deep : C.gray }] }, ...items.map(z => ({ runs: z, bullet: true }))], bodySize: 11, name: `stage-${i}` });
    if (i < 2) S.arrow(s, x + 2.87, 3.0, x + 2.95, 3.0, C.gray, 1.5);
  });
  S.code(s, { x: 0.6, y: 4.5, w: 8.8, h: 0.5, size: 10.5, lines: [
    { text: "drive_admin.py token   →   edit a file in Drive   →   drive_admin.py changes <token>", color: C.green }] });
  num(s);

  // ---------------------------------------------------------------- 17 honest limits
  s = S.contentSlide(deck, {
    section: "Signals", title: "What this does not do yet",
    subtitle: "Say it before someone asks. Each one is a known gap with a known fix.",
    takeaway: "Production is a list of gaps you know about. The dangerous ones are the ones nobody wrote down.",
    notes: `About: The honest-limits slide. Read all four; do not defend them.
Explain each: 1) a normal tick writes into the live index in place; only --rebuild is blue/green. Embedding failures are safe because we embed first; a store failure between delete and insert loses one document until the next tick. 2) the register is a local file; in production its ACLs are derived from the source's permissions through the identity provider. 3) the scheduler is a thread in one process; two API processes would be two schedulers, and the lock is per process. Run the tick in one worker, or as a queue job. 4) every tick lists the whole folder; stage 2 on the previous slide is the fix.
If asked "Is this production-ready?": the pipeline's decisions are; the operations around it are the next three sessions.
Next: tonight.`,
  });
  const gaps = [["In-place writes", "A normal tick writes into the live index. Only --rebuild builds next to it and switches.", "Embed first, write last: an API failure is safe. A store failure between delete and insert loses one document until the next tick."],
    ["The register is a file", "Permissions and status live in shared/data/register.json, edited by hand.", "Production derives allowed_groups from permissions.list or Graph /permissions through the identity provider."],
    ["One process, one scheduler", "The timer is a thread inside the API. Two API processes would be two timers.", "Run the tick in one worker (scheduler.py), or as a queue job. The lock is per process."],
    ["Full listing per tick", "Eight files.list calls every tick, whether or not anything changed.", "changes.list with a saved page token; Graph's /delta. Tonight's stretch."]];
  gaps.forEach(([t, what, fix], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 4.45, y = 1.6 + row * 1.68;
    s.rect({ x, y, w: 4.3, h: 1.52, fill: C.white, line: C.line, name: `gap-${i}` });
    s.image(I.warn, { x: x + 0.2, y: y + 0.14, w: 0.34, h: 0.34, name: `gap-icon-${i}` });
    s.text(t, { x: x + 0.7, y: y + 0.1, w: 3.4, h: 0.4, font: "Arial", size: 14, bold: true, color: C.dark, valign: "middle", name: `gap-title-${i}` });
    s.text(what, { x: x + 0.2, y: y + 0.52, w: 3.95, h: 0.42, size: 10.5, color: C.slate, name: `gap-what-${i}` });
    s.text("THE FIX", { x: x + 0.2, y: y + 0.96, w: 3.95, h: 0.2, size: 9, bold: true, color: C.deep, charSpacing: 0.5, name: `gap-fix-label-${i}` });
    s.text(fix, { x: x + 0.2, y: y + 1.14, w: 3.95, h: 0.36, size: 10.5, color: C.dark, name: `gap-fix-${i}` });
  });
  num(s);

  // ================================================================ AFTER CLASS
  // ---------------------------------------------------------------- 18 tonight
  s = S.contentSlide(deck, {
    section: "After class", title: "Tonight",
    subtitle: "Everything runs offline: SOURCE=local, the local embedding model, fake_drive.py as the source. About an hour.",
    takeaway: "Each exercise ends in something you can see: a plan line, a counter, a green test.",
    notes: `About: The four exercises, from the checkpoint README.
Say: "Exercise 1 is the whole session again, on your laptop, with the script as the source. Exercise 2 is tonight's real work: make a quiet tick cheap. Exercise 3 is a test, and you should see it fail first. Exercise 4 is for anyone who finishes early."
Expect questions on exercise 2: the fingerprint is a sha256 of the sorted "path|etag" lines from list_items(). Store the last one in module state; compare before calling run_sync. The skipped counter already exists in _state.
Next: Wednesday.`,
  });
  const ex = [["Replay the weekend on a timer", "scheduler.py --interval 20 in one terminal; fake_drive.py apply 1 … apply 5, one at a time, in another. Write down the action the tick planned for each event."],
    ["Make a quiet tick cheap", "The TODO in app/ingest/scheduler.py: fingerprint the listing (sha256 of sorted path|etag lines) and skip run_sync when it matches the last tick. Watch skipped climb in GET /sync/status."],
    ["A test that fails first", "tests/test_connector_drive.py: a Google Form in the fake listing must be skipped. Red, then green."],
    ["Stretch: pause and resume", "POST /sync/pause, apply an event, POST /sync/resume. When does the plan show up, and what did the paused ticks cost?"]];
  ex.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    S.card(s, { x: 0.6 + col * 4.45, y: 1.6 + row * 1.68, w: 4.3, h: 1.55, num: i + 1, title: t, titleSize: 13.5, body: d, bodySize: 11, name: `ex-${i}` });
  });
  num(s);

  // ---------------------------------------------------------------- 19 Wednesday
  s = S.darkSlide(deck, { section: "After class", icon: I.robot, kicker: "WEDNESDAY  ·  PART 2 OF 4", title1: "The", title2: "assistant",
    subtitle: "A face on this index: a chat that remembers, identity from a key, retrieval that measures itself",
    detail: "LangGraph for the graph, SQLite for the conversation, every strategy inside the permission filter, streaming you can replay.",
    footer: "Wed 11 Nov",
    notes: `About: The preview.
Say: "Wednesday the index gets a face. A chat you can come back to, because the conversation is stored. A user who is who the key says, not who the request claims. Hybrid search and re-ranking from Session 9, measured against a golden set before we ship a change. And the answer streams, and survives a closed tab."
Ask them to pull the repo Wednesday morning: checkpoints/02-assistant will be there.
Leave the scheduler running on screen as they pack up.` });
  num(s, true);

  // ================================================================ REFERENCE
  // ---------------------------------------------------------------- R1 commands
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: the commands",
    subtitle: "Everything run today, in order. Scripts work from any folder; paths resolve from the repo root.",
    notes: `About: For the students' copy of the deck.`,
  });
  S.code(s, { x: 0.6, y: 1.55, w: 8.8, h: 3.4, size: 10.5, lines: [
    { text: "# Google Drive (the instructor's laptop; docs/drive-setup.md)", color: C.mintText },
    `python ${CP}/drive_admin.py check                      # READY for class`,
    `python ${CP}/drive_admin.py tree`,
    `python ${CP}/sync.py --source drive                    # dry run: add 18, quarantine 1, skip 1`,
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

  // ---------------------------------------------------------------- R2 blue/green (reused from Session 8)
  s = S.contentSlide(deck, {
    section: "Reference", title: "Reference: changing the model? Build next to it",
    subtitle: "Vectors from two models cannot share an index. The sync refuses, and tells you what to do.",
    takeaway: "A rebuild is a deploy: build, check, switch, keep the old one for rollback.",
    notes: `About: app/rag/catalog.py keeps a pointer to the live collection. sync.py --rebuild builds a new collection next to it, runs a smoke check, then flips the pointer. sync.py --rollback flips it back. Unchanged from Friday; here for reference.`,
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
