// ============================================================
// RAG Workbench — vanilla JS, one small function per job
// ============================================================
// Every tab follows the same pattern:
//   1. read the form
//   2. call the endpoint with api()
//   3. turn the JSON into HTML with a render function
// Checkpoint 5: every retrieval call also sends who() — the user
// picked in "Ask as" and the "As of" date — and every source shows
// its title, version, status and effective date.
// ============================================================

// Confidence thresholds, loaded from /health so distance bars
// use the same cut-offs as the server.
let thresholds = { high: 0.8, low: 1.4, no_result: 1.6 };

// Purpose: the "Ask as" user and the "As of" date from the top bar.
function who() {
    return { user: value("askAs"), as_of: value("asOf") };
}

// Purpose: "Expense Policy (2026 edition) · v1 · current · from 2026-11-01 · Team Events"
function provenance(src) {
    if (!src.title) return src.source;
    return src.title + " · v" + src.version + " · " + src.status + " · from " + src.effective_from +
        (src.section ? " · " + src.section : "");
}


// ---------- Helpers ----------

// Purpose: call an endpoint and return JSON, or throw a readable error.
async function api(path, options = {}) {
    const response = await fetch(path, options);
    if (!response.ok) {
        const body = await response.text();
        let detail = body;
        try { detail = JSON.parse(body).detail || body; } catch (e) { /* plain text */ }
        if (typeof detail !== "string") detail = JSON.stringify(detail);
        throw new Error(response.status + ": " + detail);
    }
    return response.json();
}

function postJson(path, payload) {
    return api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

// Purpose: build a query string, skipping empty values.
function withParams(path, params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== "" && value !== null && value !== undefined) query.set(key, value);
    }
    const text = query.toString();
    return text ? path + "?" + text : path;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function value(id) {
    return document.getElementById(id).value.trim();
}

function setOutput(id, html) {
    document.getElementById(id).innerHTML = html;
}

function errorBanner(err) {
    return '<div class="banner banner-error">' + escapeHtml(err.message) +
        "<br><small>If the index is empty, open the Sync tab (or run <code>python sync.py --apply</code>).</small></div>";
}

// Purpose: disable a form's button while a request runs, then restore it.
async function runWithBusy(form, outputId, busyText, task) {
    const button = form.querySelector("button");
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    setOutput(outputId, '<p class="loading">' + busyText + "</p>");
    try {
        await task();
    } catch (err) {
        setOutput(outputId, errorBanner(err));
    } finally {
        button.disabled = false;
        button.textContent = label;
    }
}


// ---------- Distance display ----------

// Purpose: map a distance to the same level names the server uses.
function distanceLevel(distance) {
    if (distance <= thresholds.high) return "high";
    if (distance <= thresholds.low) return "medium";
    if (distance <= thresholds.no_result) return "low";
    return "none";
}

// Purpose: a short bar means a close match.
function distanceBar(distance, max, level) {
    const width = Math.max(4, Math.min(100, (distance / max) * 100));
    return '<span class="bar"><i class="' + level + '" style="width:' + width + '%"></i></span>';
}

function badge(confidence) {
    return '<span class="badge badge-' + escapeHtml(confidence) + '">' + escapeHtml(confidence) + " confidence</span>";
}

// Purpose: one collapsible row showing a chunk's source, distance and text.
function chunkRow(title, text, distance, extraHtml = "") {
    let distanceHtml = "";
    if (distance !== undefined && distance !== null) {
        const level = distanceLevel(distance);
        distanceHtml = distanceBar(distance, thresholds.no_result * 1.25, level) +
            '<span class="dist">' + distance.toFixed(3) + "</span>";
    }
    return '<details class="chunk"><summary><span class="name">' + escapeHtml(title) + "</span>" +
        distanceHtml + "</summary><pre>" + escapeHtml(text) + "</pre>" + extraHtml + "</details>";
}

function sourcesList(sources) {
    return sources.map((src, i) =>
        chunkRow("#" + (i + 1) + "  " + provenance(src), src.text, src.distance)
    ).join("");
}


// ---------- Status bar ----------

// Purpose: show provider, model, vector store and chunk count in the header.
async function loadStatus() {
    const status = document.getElementById("status");
    try {
        const health = await api("/health");
        thresholds = health.thresholds || thresholds;
        const store = await api("/store/inspect?limit=500").catch(() => null);
        const count = store ? store.total_stored : "?";

        const sched = health.scheduler || {};
        status.replaceChildren(
            chip("", String(health.checkpoint), "", "ok"),
            chip("Source ", sourceLabel(health.source)),
            chip("Sync ", sched.enabled ? (sched.paused ? "paused" : "every " + sched.interval + "s") : "manual"),
            chip("LLM ", health.llm_provider, " · " + health.model),
            chip("Embeddings ", health.embedding_model),
            vectorChip(health),
            chip("", String(count), " chunks live", count === 0 || count === "?" ? "bad" : ""),
            changeChip(sched.last_change)
        );

        renderPipeline(health);
        if (store) fillSourceFilter(store.sources);
        if (health.doc_types) fillDocFilter(health.doc_types);
    } catch (err) {
        status.replaceChildren(chip("Server not reachable", "", "", "bad"));
    }
}

// Purpose: "Vectors Postgres + pgvector", red when the database cannot be reached.
function vectorChip(health) {
    const span = chip("Vectors ", health.vector_store || "?", "", health.vector_store_error ? "bad" : "");
    span.title = (health.vector_store_location || "") + (health.vector_store_error ? " · " + health.vector_store_error : "");
    return span;
}

// Purpose: one status chip, built with textContent (no HTML strings).
function chip(before, bold, after = "", extraClass = "") {
    const span = document.createElement("span");
    span.className = "chip" + (extraClass ? " " + extraClass : "");
    const b = document.createElement("b");
    b.textContent = bold;
    span.append(document.createTextNode(before), b, document.createTextNode(after));
    return span;
}

// Purpose: add one "force" option per doc type so the fallback is easy to test.
function fillDocFilter(docTypes) {
    const select = document.getElementById("queryDocFilter");
    const current = select.value;
    select.innerHTML =
        '<option value="auto">auto: LLM picks the doc type</option>' +
        '<option value="off">off: search all documents</option>' +
        docTypes.map(t => '<option value="' + escapeHtml(t) + '">force: ' + escapeHtml(t) + "</option>").join("");
    select.value = current;
}

function fillSourceFilter(sources) {
    const select = document.getElementById("storeSource");
    const current = select.value;
    select.innerHTML = '<option value="">All files</option>' +
        sources.map(s => "<option>" + escapeHtml(s) + "</option>").join("");
    select.value = current;
}


// ---------- Ask (RAG): POST /query ----------

async function submitQuery(event) {
    event.preventDefault();
    const url = withParams("/query", {
        ...who(),
        top_k: value("queryTopK"),
        prompt_style: value("queryPromptStyle"),
        high_threshold: value("queryHigh"),
        low_threshold: value("queryLow"),
        no_result_threshold: value("queryNoResult"),
        doc_filter: value("queryDocFilter"),
    });
    await runWithBusy(event.target, "queryOutput", "Classifying, retrieving and generating…", async () => {
        const data = await postJson(url, { question: value("queryQuestion") });
        setOutput("queryOutput", classificationCard(data.doc_filter) + renderRagAnswer(data, true));
    });
}

const FILTER_MODE_LABELS = {
    auto: "auto: LLM classifies the question",
    off: "off: no classification, search all documents",
};

// Purpose: show how the question was classified and how that narrowed retrieval.
function classificationCard(filter) {
    if (!filter) return "";

    const label = filter.doc_type || (filter.mode === "off" ? "filter off" : "unclassified");
    const labelClass = filter.doc_type ? "badge-doctype" : "badge-none";
    const rows = [["Filter mode", escapeHtml(FILTER_MODE_LABELS[filter.mode] || "forced: " + filter.mode)]];

    if (filter.picked_by === "llm") {
        let reply = "<code>" + escapeHtml(filter.classifier_reply || "(empty)") + "</code>";
        if (!filter.doc_type) reply += ' <span class="muted">not one of the known doc types, so no filter</span>';
        rows.push(["LLM reply", reply]);
    }

    if (filter.doc_type) {
        const best = filter.filtered_best_distance;
        rows.push(["Best match in " + escapeHtml(filter.doc_type),
            best != null ? best.toFixed(3) + " (no-result cut-off " + thresholds.no_result + ")" : "no chunks with this doc type"]);
    }

    let outcome;
    if (!filter.doc_type) {
        outcome = '<span class="badge badge-none">unfiltered</span> searched all documents';
    } else if (filter.fallback_used) {
        outcome = '<span class="badge badge-medium">fallback</span> nothing in ' + escapeHtml(filter.doc_type) +
            " was close enough, so all documents were searched";
    } else {
        outcome = '<span class="badge badge-high">filtered</span> searched only ' + escapeHtml(filter.doc_type) + " chunks";
    }
    rows.push(["Retrieval", outcome]);

    return '<div class="card"><h3>Query classification <span class="badge ' + labelClass + '">' + escapeHtml(label) + "</span></h3>" +
        '<table class="kv">' + rows.map(([k, v]) => "<tr><th>" + k + "</th><td>" + v + "</td></tr>").join("") + "</table></div>";
}

// Purpose: answer card + sources, shared by /query and /compare.
function renderRagAnswer(data, showMeta) {
    if (data.no_result) {
        return '<div class="banner banner-none"><b>No relevant documents found.</b> ' + escapeHtml(data.answer) + "</div>" +
            (data.sources && data.sources.length
                ? '<div class="card"><h3>Closest chunks (all beyond the no-result threshold)</h3>' + sourcesList(data.sources) + "</div>"
                : "");
    }

    let html = "";
    if (data.confidence === "low") {
        html += '<div class="banner banner-low">Weak evidence: the retrieved chunks may not answer this. Try rephrasing.</div>';
    }
    html += '<div class="card"><h3>Answer ' + badge(data.confidence) + '</h3><p class="answer">' + escapeHtml(data.answer) + "</p>";
    if (showMeta) {
        html += '<p class="meta">Model ' + escapeHtml(data.model) + (data.request_id ? " · request " + escapeHtml(data.request_id) : "") + "</p>";
    }
    html += "</div>";

    if (data.sources && data.sources.length) {
        html += '<div class="card"><h3>Sources · ' + data.chunks_used + " chunks retrieved</h3>" + sourcesList(data.sources) + "</div>";
    }
    return html;
}


// ---------- RAG vs plain: POST /compare ----------

async function submitCompare(event) {
    event.preventDefault();
    const url = withParams("/compare", { top_k: value("compareTopK"), user: who().user });
    await runWithBusy(event.target, "compareOutput", "Asking both ways…", async () => {
        const data = await postJson(url, { question: value("compareQuestion") });
        setOutput("compareOutput",
            '<div class="columns">' +
                '<div class="card"><h3>With RAG ' + badge(data.rag.confidence) + "</h3>" +
                    '<p class="answer">' + escapeHtml(data.rag.answer) + "</p>" +
                    (data.rag.sources.length ? sourcesList(data.rag.sources) : "") + "</div>" +
                '<div class="card"><h3>Plain LLM</h3><p class="answer">' + escapeHtml(data.plain.answer) + "</p></div>" +
            "</div>" +
            '<p class="meta">' + escapeHtml(data.note) + "</p>");
    });
}


// ---------- LLM only: POST /ask and /ask/grounded ----------

async function submitLlm(event) {
    event.preventDefault();
    const payload = { question: value("llmQuestion") };
    await runWithBusy(event.target, "llmOutput", "Asking the model…", async () => {
        const [plain, grounded] = await Promise.allSettled([
            postJson("/ask", payload),
            postJson(withParams("/ask/grounded", who()), payload),
        ]);
        setOutput("llmOutput",
            '<div class="columns">' +
                llmCard("Plain", "/ask", plain) +
                llmCard("Grounded (retrieved context)", "/ask/grounded", grounded) +
            "</div>");
    });
}

function llmCard(title, path, result) {
    const sources = result.status === "fulfilled" && (result.value.sources || []).length
        ? '<p class="meta">From ' + result.value.sources.map(escapeHtml).join(" · ") + "</p>"
        : "";
    const body = result.status === "fulfilled"
        ? '<p class="answer">' + escapeHtml(result.value.answer) + "</p>" + sources +
          '<p class="meta">Model ' + escapeHtml(result.value.model) + "</p>"
        : errorBanner(result.reason);
    return '<div class="card"><h3>' + escapeHtml(title) + " <code>" + path + "</code></h3>" + body + "</div>";
}


// ---------- Search: GET /search ----------

async function submitSearch(event) {
    event.preventDefault();
    const url = withParams("/search", { q: value("searchQuery"), top_k: value("searchTopK"), ...who() });
    await runWithBusy(event.target, "searchOutput", "Searching…", async () => {
        const data = await api(url);
        if (!data.results.length) {
            setOutput("searchOutput", '<div class="banner banner-none">Nothing this user may read matches ' +
                "(or the index is empty: open the Sync tab).</div>");
            return;
        }
        const rows = data.results.map((r, i) =>
            chunkRow("#" + (i + 1) + "  " + provenance(r), r.text, r.distance)
        ).join("");
        const asked = "as " + escapeHtml(data.user) + " (" + escapeHtml(data.groups.join(", ")) + ")" +
            (data.as_of ? ", as of " + escapeHtml(data.as_of) : ", today");
        setOutput("searchOutput",
            '<div class="card"><h3>' + data.total_results + " closest chunks " + asked + "</h3>" + rows +
            '<p class="meta">Bar colours use the server thresholds: green ≤ ' + thresholds.high +
            ", amber ≤ " + thresholds.low + ", red ≤ " + thresholds.no_result + ", grey = no result.</p></div>");
    });
}


// ---------- Embeddings: POST /embed ----------

async function submitEmbed(event) {
    event.preventDefault();
    const texts = value("embedTexts").split("\n").map(t => t.trim()).filter(Boolean);
    if (texts.length < 2) {
        setOutput("embedOutput", '<div class="banner banner-error">Enter at least two lines of text.</div>');
        return;
    }
    await runWithBusy(event.target, "embedOutput", "Embedding…", async () => {
        const data = await postJson("/embed", { texts: texts });
        const pairs = Object.entries(data.distances).sort((a, b) => a[1] - b[1]);
        const max = Math.max(...pairs.map(p => p[1]), 0.01);
        const rows = pairs.map(([label, dist]) =>
            "<tr><td>" + escapeHtml(label) + '</td><td class="num">' + dist.toFixed(4) +
            "</td><td>" + distanceBar(dist, max, "medium") + "</td></tr>"
        ).join("");
        setOutput("embedOutput",
            '<div class="card"><h3>Pairwise distances · ' + data.dimensions + "-dimension vectors</h3>" +
            "<table><tr><th>Pair (closest first)</th><th>L2 distance</th><th></th></tr>" + rows + "</table>" +
            '<p class="meta">Plain Euclidean distance. The store’s search distances are this number squared.</p></div>');
    });
}


// ---------- Sync: POST /sync (Checkpoint 4's Ingest tab) ----------

async function submitSync(event) {
    event.preventDefault();
    const apply = document.getElementById("syncApply").checked;
    const url = withParams("/sync", { apply: apply });
    await runWithBusy(event.target, "syncOutput", apply ? "Syncing…" : "Planning…", async () => {
        const data = await api(url, { method: "POST" });
        setOutput("syncOutput", renderSync(data));
        loadStatus();
        if (data.applied) refreshScheduler();  // you just saw it: the card updates, no toast
    });
}

// One badge colour per action: green = adds content, amber = metadata only, red = removes.
const ACTION_LEVEL = { add: "high", change: "high", relabel: "medium", touch: "medium",
    remove: "low", quarantine: "low", skip: "none", unchanged: "none" };

// Purpose: one fingerprint cell: what the index holds vs what the source has now.
//   a1b2c3d4 = same      same, nothing to do
//   a1b2c3d4 → e5f6a7b8  changed
//   new · e5f6a7b8       not in the index yet
//   not computed         eTag matched, so the file was never downloaded or parsed
function fingerprint(inIndex, inSource, missingText, indexed = true) {
    const short = h => '<code>' + escapeHtml(h.slice(0, 8)) + "</code>";
    const tip = ' title="index: ' + escapeHtml(inIndex || "–") + "\nsource: " + escapeHtml(inSource || "–") + '"';
    if (!inIndex && !inSource) return '<td class="sig-none">–</td>';
    if (!inIndex && !indexed) return '<td class="sig-none"' + tip + ">" + short(inSource) + " · not indexed</td>";
    if (!inIndex) return '<td class="sig-new"' + tip + ">new · " + short(inSource) + "</td>";
    if (!inSource) return '<td class="sig-none"' + tip + ">" + short(inIndex) + " → " + missingText + "</td>";
    if (inIndex === inSource) return '<td class="sig-same"' + tip + ">" + short(inSource) + " = same</td>";
    return '<td class="sig-diff"' + tip + ">" + short(inIndex) + " → " + short(inSource) + "</td>";
}

// Purpose: one plan row: the action, why, and the evidence behind it.
function syncRow(d) {
    const s = d.signals || {};
    // A missing eTag means the file is gone; a missing hash means we never parsed it.
    const etagGone = d.action === "remove" ? "file gone" : "–";
    const notIndexed = ["remove", "quarantine", "skip"].includes(d.action);
    const hashSkipped = d.action === "remove" ? "chunks deleted" : notIndexed ? "–" : "not computed";
    return '<tr><td><span class="badge badge-' + ACTION_LEVEL[d.action] + '">' + escapeHtml(d.action) + "</span></td>" +
        "<td>" + escapeHtml(d.doc_id) + "</td><td>" + escapeHtml(d.reason) + "</td>" +
        fingerprint(s.etag_index, s.etag_source, etagGone, !notIndexed) +
        fingerprint(s.hash_index, s.hash_source, hashSkipped) + "</tr>";
}

const SYNC_HEADER = "<tr><th>Action</th><th>Document</th><th>Why</th>" +
    "<th>eTag<br><small>index → source</small></th><th>Content hash<br><small>index → source</small></th></tr>";

function renderSync(data) {
    const counts = Object.entries(data.counts).map(([action, n]) => stat(n, action)).join("");
    const rows = data.documents.filter(d => d.action !== "unchanged").map(syncRow).join("");
    const same = data.documents.filter(d => d.action === "unchanged");
    const unchanged = same.length
        ? '<details class="unchanged"><summary>' + same.length + " unchanged: same eTag, so not even downloaded " +
          "(the content hash was never computed)</summary><table>" + SYNC_HEADER + same.map(syncRow).join("") +
          "</table></details>"
        : "";
    const warnings = data.warnings.length
        ? '<div class="card"><h3>For a human to look at</h3><ul>' +
          data.warnings.map(w => "<li>" + escapeHtml(w) + "</li>").join("") + "</ul></div>"
        : "";
    const banner = data.applied
        ? '<div class="banner banner-high">Applied to ' + escapeHtml(data.collection) + ". Report: " + escapeHtml(data.report_file || "") + "</div>"
        : '<div class="banner banner-none">Dry run: nothing was written. Tick “Apply” to run it.</div>';
    return banner +
        '<div class="card"><div class="stats">' + counts +
        stat(data.chunks_to_embed, "chunks to embed") +
        stat("$" + data.estimated_cost_usd.toFixed(4), "estimated cost") +
        "</div></div>" +
        '<div class="card"><h3>Plan · ' + escapeHtml(data.embedding_model) + "</h3>" +
        '<div class="scroll-x"><table class="plan">' + SYNC_HEADER + rows + "</table></div>" + unchanged +
        '<p class="meta">Hover a fingerprint for the full value. Green = new, amber = changed, grey = same or not checked. ' +
        "Only add and change call the embedding model.</p></div>" + warnings;
}

// ---------- Sync: the scheduler (GET /sync/status, POST /sync/now|pause|resume) ----------

const SCHED_LEVEL = { off: "none", paused: "medium", running: "high", on: "high" };

// Purpose: redraw the scheduler card from one GET /sync/status payload.
function renderScheduler(s) {
    const card = document.getElementById("schedulerCard");
    const state = !s.enabled ? ["off", "manual: SYNC_INTERVAL_SECONDS=0, the sync runs only when asked"]
        : s.paused ? ["paused", "the timer is running, its ticks do nothing"]
        : s.running ? ["running", "a sync is executing right now"]
        : ["on", "every " + s.interval + "s · next tick in " + (s.seconds_to_next_run ?? "?") + "s"];
    // One sentence about the last run: the table below has the details.
    const counts = (s.last_summary || {}).counts || {};
    const changed = Object.entries(counts).filter(([a]) => !["unchanged", "skip", "quarantine"].includes(a))
        .reduce((n, [, k]) => n + k, 0);
    const last = !s.last_run ? "No run since the app started."
        : "Last run " + when(s.last_run) + " (" + escapeHtml(ago(s.last_run)) + "): " +
          (s.last_error ? "failed" : changed ? changed + " document(s) changed" : "nothing new");
    card.querySelector(".scheduler-state").innerHTML =
        '<span class="badge badge-' + SCHED_LEVEL[state[0]] + '">' + state[0] + "</span> " +
        '<span class="muted">' + escapeHtml(state[1]) + "</span>";
    card.querySelector(".scheduler-last").innerHTML = '<p class="meta">' + last + "</p>" +
        (s.last_error ? errorBanner(new Error("The last run failed and the index was left untouched: " + s.last_error)) : "");
    document.getElementById("schedPause").disabled = !s.enabled || s.paused;
    document.getElementById("schedResume").disabled = !s.enabled || !s.paused;
    lastSchedStatus = s;
}

const SOURCE_LABELS = { drive: "Google Drive", onedrive: "OneDrive", local: "local folder" };
function sourceLabel(source) {
    return SOURCE_LABELS[source] || "local folder";
}

// Purpose: where the documents come from and where the vectors go, in one line:
// "Google Drive → sync every 60 s → Postgres + pgvector (postgres://localhost:5433/acme_part1)".
function renderPipeline(health) {
    const el = document.getElementById("pipeline");
    if (!el || !health) return;
    const sched = health.scheduler || {};
    const source = sourceLabel(health.source);
    const index = health.live_index
        ? "live index <code>" + escapeHtml(health.live_index) + "</code>, built with " + escapeHtml(health.live_index_built_with || "?")
        : "no live index yet: the next run builds one";
    el.innerHTML =
        '<div class="flow"><span class="node">' + escapeHtml(source) + "</span><span class=\"arrow\">→</span>" +
        '<span class="node">sync ' + escapeHtml(sched.enabled ? "every " + sched.interval + " s" : "by hand") + "</span>" +
        '<span class="arrow">→</span><span class="node store">' + escapeHtml(health.vector_store || "?") + "</span></div>" +
        '<p class="meta">' + escapeHtml(health.vector_store_location || "") + " · " + index + "</p>" +
        (health.vector_store_error ? errorBanner(new Error(health.vector_store_error)) : "");
}

// Purpose: one status read, on any tab. The Sync tab redraws from it;
// every tab learns about a sync that changed the index.
async function refreshScheduler() {
    let s;
    try { s = await api("/sync/status"); } catch (err) { return; /* the status bar already says the server is away */ }
    const onSyncTab = !!document.querySelector('section[data-panel="sync"].active');
    if (onSyncTab) {
        renderScheduler(s);
        loadHistory();  // redraws only when a new run has landed
    }
    noticeChange(s, onSyncTab);
}

// Purpose: Run now / Pause / Resume. "Run now" is the very tick the timer makes.
async function clickScheduler(event) {
    const button = event.target.closest("button[data-sched]");
    if (!button) return;
    button.disabled = true;
    try {
        const s = await api("/sync/" + button.dataset.sched, { method: "POST" });
        renderScheduler(s);
        noticeChange(s, true);
        if (button.dataset.sched === "now") {
            loadStatus();
            if (document.getElementById("explainOutput").innerHTML) submitExplain();
        }
    } catch (err) {
        setOutput("syncOutput", errorBanner(err));
    } finally {
        button.disabled = false;
    }
}

// Poll on every tab: on the Sync tab the countdown moves and a tick shows up by
// itself; on any other tab, a sync that changed the index pops up a toast.
setInterval(refreshScheduler, 5000);

// ---------- Sync: what the last change did (GET /sync/status → last_change) ----------
// A tick a minute almost always says "unchanged 18", so "the last tick" hides
// the one run that mattered. The server keeps the runs that changed the index
// apart; this section announces a new one and explains it in plain words.

const TRIGGER_LABEL = { tick: "Automatic sync", "run now": "Run now", manual: "Manual sync", cli: "sync.py" };
const SEEN_KEY = "acme.seenChange";
let seenChangeId = null;        // in memory too, in case localStorage is blocked
let knownChangeId;              // undefined until the first status read
let lastSchedStatus = null;
let scrollToChange = false;

function triggerLabel(t) { return TRIGGER_LABEL[t] || "Sync"; }

function when(iso) { return iso ? escapeHtml(new Date(iso).toLocaleString()) : "–"; }

function ago(iso) {
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return "just now";
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " day(s) ago";
}

function seenChange() {
    try { return localStorage.getItem(SEEN_KEY) || seenChangeId; } catch (e) { return seenChangeId; }
}

function markChangeSeen(id) {
    seenChangeId = id;
    try { localStorage.setItem(SEEN_KEY, id); } catch (e) { /* in memory is enough for this page */ }
    document.getElementById("changeToast").hidden = true;
}

// Purpose: what happened to one document, in a sentence.
function changeSentence(d) {
    switch (d.action) {
        case "add": return "New in the index: " + d.chunks + " chunk(s) embedded.";
        case "change": return "Its text changed (" + d.reason.replace(/^text changed: /, "") + "): the old chunks were deleted and the new ones embedded.";
        case "relabel": return "Only its labels changed, nothing re-embedded: " + d.reason + ".";
        case "touch": return "The file changed but its text did not. Only the new eTag was stored; nothing re-embedded.";
        case "remove": return "Removed from the index: " + d.reason + ".";
        case "quarantine": return "Taken out of the index: " + d.reason;
        default: return d.reason;
    }
}

function changeShort(d) {
    return { add: "added, " + d.chunks + " chunk(s) embedded", change: "text changed, " + d.chunks + " chunk(s) re-embedded",
        relabel: "labels updated", touch: "file touched, text unchanged", remove: "removed from the index",
        quarantine: "quarantined" }[d.action] || d.action;
}

// Warnings that name a document this run changed are news; the rest show up on every run.
function splitWarnings(c) {
    // Whole ids only: HR-LEAVE must not match HR-LEAVE-2027.
    const names = c.documents.map(d => new RegExp("(^|[^\\w-])" + d.doc_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])"));
    const related = c.warnings.filter(w => names.some(re => re.test(w)));
    return { related, other: c.warnings.filter(w => !related.includes(w)) };
}

function duration(seconds) {
    if (seconds < 90) return seconds + " s";
    if (seconds < 5400) return Math.round(seconds / 60) + " min";
    if (seconds < 172800) return Math.round(seconds / 3600) + " h";
    return Math.round(seconds / 86400) + " days";
}

// Purpose: "Saved in the source 17:28:01 by Hasan · picked up 42 s later".
// Only for actions caused by a new save of the file: a relabel comes from
// the register, so the file's own modified time says nothing about it.
function sourceLine(d, runAt, before = "") {
    const src = d.source || {};
    if (!src.modified || !["add", "change", "touch", "quarantine"].includes(d.action)) return "";
    const lag = Math.round((new Date(runAt) - new Date(src.modified)) / 1000);
    return before + '<span class="muted">Saved in the source ' + when(src.modified) +
        (src.modified_by ? " by " + escapeHtml(src.modified_by) : "") +
        (lag >= 0 ? " · picked up " + escapeHtml(duration(lag)) + " later" : "") + "</span>";
}

// ---------- Sync: history (GET /sync/history, GET /sync/runs/{id}) ----------

let historyDrawnFor = null;  // the last_run the table was drawn for: redraw only when a run lands

function fillHistoryFiles(files, current) {
    const select = document.getElementById("historyFile");
    select.innerHTML = '<option value="">All files</option>' +
        files.map(f => '<option value="' + escapeHtml(f) + '">' + escapeHtml(f) + "</option>").join("");
    select.value = files.includes(current) ? current : "";
}

// Why a run embedded everything again, in a sentence.
function fullBuildSentence(e) {
    const where = e.vector_store ? " in " + e.vector_store : "";
    const why = e.build_reason || "the index was rebuilt (no live index yet, or the embedding model changed)";
    return "Built a new index" + where + (e.collection ? " (" + e.collection + ")" : "") + " and embedded every file, because " +
        why + "." + (e.embedding_model ? " Embedding model: " + e.embedding_model + "." : "");
}

function historyChangeRows(e, latest) {
    if (e.full_build) {
        e = { ...e, warnings: [], documents: [{ doc_id: e.documents.length + " documents", path: "All files", action: "full build",
            reason: fullBuildSentence(e), source: {} }] };
    }
    const n = e.documents.length;
    const runCell = '<td rowspan="' + n + '" class="run-cell">' + escapeHtml(triggerLabel(e.trigger)) + "<br>" +
        '<span class="muted">' + (e.seconds ?? "?") + " s · " + e.chunks_embedded + " chunk(s) embedded" +
        (e.full_build ? " · full build" : "") + "</span><br>" +
        '<button type="button" class="link" data-run="' + escapeHtml(e.id) + '">Full plan</button></td>';
    const at = new Date(e.at);
    const whenCell = '<td rowspan="' + n + '" class="when-cell">' + (latest ? '<span class="badge badge-high">Latest</span><br>' : "") +
        "<b>" + escapeHtml(at.toLocaleTimeString()) + "</b><br>" +
        escapeHtml(at.toLocaleDateString()) + '<br><span class="muted">' + escapeHtml(ago(e.at)) +
        (e.started_at ? "<br>started " + escapeHtml(new Date(e.started_at).toLocaleTimeString()) : "") + "</span></td>";
    const rows = e.documents.map((d, i) =>
        "<tr" + (latest ? ' class="latest"' : "") + ">" + (i === 0 ? whenCell : "") +
        "<td><b>" + escapeHtml(d.path || d.doc_id) + '</b><br><span class="muted">' + escapeHtml(d.doc_id) + "</span></td>" +
        '<td><span class="badge badge-' + (ACTION_LEVEL[d.action] || "medium") + '">' + escapeHtml(d.action) + "</span></td>" +
        '<td class="did-cell">' + escapeHtml(d.action === "full build" ? d.reason : changeSentence(d)) + "</td>" +
        '<td class="src-cell">' + (sourceLine(d, e.at) || (d.source ? '<span class="muted">–</span>'
            : '<span class="muted" title="Reports written before this column existed do not have it.">not recorded</span>')) + "</td>" +
        (i === 0 ? runCell : "") + "</tr>").join("");
    const warn = e.warnings && e.warnings.length
        ? '<tr class="history-warn"><td></td><td colspan="5">⚠ ' + e.warnings.map(escapeHtml).join("<br>⚠ ") + "</td></tr>" : "";
    return rows + warn;
}

function historyQuietRow(e, path) {
    const span = e.from === e.to ? when(e.from) : when(e.from) + " → " + when(e.to);
    return '<tr class="quiet"><td colspan="6">' + e.runs + " run(s) " +
        (path ? "without a change to this file" : "found nothing new") + " · " + span + "</td></tr>";
}

// Purpose: the history table. force = redraw even if no new run landed (filter changed).
async function loadHistory(force = false) {
    const path = value("historyFile");
    let h;
    try {
        h = await api(withParams("/sync/history", { limit: 100, path: path }));
    } catch (err) {
        setOutput("historyOutput", errorBanner(err));
        return;
    }
    if (!force && h.last_run === historyDrawnFor) return;
    historyDrawnFor = h.last_run;
    fillHistoryFiles(h.files, path);
    document.getElementById("historySummary").innerHTML = h.total_runs
        ? h.total_runs + " applied run(s) since " + when(h.first_run) + " · " + h.runs_that_changed +
          " changed something · last run " + when(h.last_run)
        : "";
    if (!h.entries.length) {
        setOutput("historyOutput", '<p class="muted">No applied run yet. Tick “Apply” above, or wait for a tick.</p>');
        return;
    }
    setOutput("historyOutput", '<table class="history-table"><tr><th>When</th><th>File</th><th>Action</th>' +
        "<th>What the sync did</th><th>Changed in the source</th><th>Run</th></tr>" +
        h.entries.map(e => e.kind === "quiet" ? historyQuietRow(e, h.path)
            : historyChangeRows(e, e === h.entries.find(x => x.kind === "change"))).join("") + "</table>");
    if (scrollToChange) {
        scrollToChange = false;
        document.getElementById("historyCard").scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

async function showRunPlan(id) {
    const out = document.getElementById("historyDetail");
    out.innerHTML = '<p class="loading">Reading ' + escapeHtml(id) + "…</p>";
    try {
        const report = await api("/sync/runs/" + encodeURIComponent(id));
        out.innerHTML = '<div class="history-detail-head"><h4>Full plan of the run at ' + when(report.finished_at || report.started_at) +
            " · " + escapeHtml(triggerLabel(report.trigger)) + "</h4>" +
            '<button type="button" class="link" data-run-close>Close</button></div>' + renderSync(report);
        out.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
        out.innerHTML = errorBanner(err);
    }
}

function clickHistory(event) {
    const run = event.target.closest("button[data-run]");
    if (run) showRunPlan(run.dataset.run);
    if (event.target.closest("button[data-run-close]")) document.getElementById("historyDetail").innerHTML = "";
}

function flash(el) {
    el.classList.remove("flash");
    void el.offsetWidth;  // restart the animation
    el.classList.add("flash");
}

// Purpose: a new change since the last look. On the Sync tab the card already
// shows it, so it only flashes; on any other tab a toast says what happened.
function noticeChange(s, onSyncTab) {
    const c = s.last_change;
    updateChangeChip(c);
    if (!c) return;
    if (knownChangeId !== undefined && c.id !== knownChangeId) loadStatus();  // the chunk count moved
    knownChangeId = c.id;
    if (c.id === seenChange()) return;
    if (onSyncTab) {
        markChangeSeen(c.id);
        loadHistory(true);
        flash(document.getElementById("historyCard"));
    } else {
        showChangeToast(c);
    }
}

function showChangeToast(c) {
    const toast = document.getElementById("changeToast");
    if (!toast.hidden && toast.dataset.change === c.id) return;  // already up: don't restart it
    const docs = c.full_build
        ? "<li>" + escapeHtml(fullBuildSentence({ ...c, collection: null, embedding_model: null })) + "</li>"
        : c.documents.slice(0, 3).map(d => "<li><b>" + escapeHtml(d.path || d.doc_id) + "</b>: " + escapeHtml(changeShort(d)) + "</li>").join("") +
          (c.documents.length > 3 ? '<li class="muted">and ' + (c.documents.length - 3) + " more</li>" : "");
    const related = c.full_build ? [] : splitWarnings(c).related;
    toast.dataset.change = c.id;
    toast.innerHTML =
        '<div class="toast-head"><b>' + escapeHtml(triggerLabel(c.trigger)) + " updated the index</b>" +
        '<button type="button" class="toast-close" data-toast="close" aria-label="Dismiss">×</button></div>' +
        "<ul>" + docs + "</ul>" +
        (related.length ? '<p class="toast-warn">' + escapeHtml(related[0]) + (related.length > 1 ? " (+" + (related.length - 1) + " more)" : "") + "</p>" : "") +
        '<div class="toast-foot"><span class="muted">' + when(c.at) + " · " + escapeHtml(ago(c.at)) + "</span>" +
        '<button type="button" data-toast="open">See what changed</button></div>';
    toast.hidden = false;
    flash(toast);
}

// Purpose: a chip in the top bar, "Changed hr/leave-policy.md · 4 min ago", that opens Sync activity.
function changeChip(c) {
    const what = !c ? "" : c.full_build ? "the whole index" + (c.vector_store ? " in " + c.vector_store : "")
        : (c.documents[0].path || c.documents[0].doc_id) + (c.documents.length > 1 ? " +" + (c.documents.length - 1) : "");
    const span = chip(c && c.full_build ? "Rebuilt " : "Changed ", what, c ? " · " + ago(c.at) : "", "link");
    span.id = "changeChip";
    span.title = c ? triggerLabel(c.trigger) + " at " + new Date(c.at).toLocaleString() + ". Click to see what changed." : "";
    span.hidden = !c;
    span.addEventListener("click", openLastChange);
    return span;
}

function updateChangeChip(c) {
    const old = document.getElementById("changeChip");
    if (old) old.replaceWith(changeChip(c));
    else if (c) document.getElementById("status").append(changeChip(c));
}

function openLastChange() {
    const c = lastSchedStatus && lastSchedStatus.last_change;
    if (c) markChangeSeen(c.id);
    scrollToChange = true;
    historyDrawnFor = null;  // redraw, then scroll to it
    if (location.hash === "#sync") refreshScheduler();
    else location.hash = "#sync";
}

function clickToast(event) {
    const button = event.target.closest("button[data-toast]");
    if (!button) return;
    if (button.dataset.toast === "open") openLastChange();
    else markChangeSeen(event.currentTarget.dataset.change);
}

// ---------- Sync: see the difference (GET /sync/explain, /source-events/...) ----------

// The weekend's events and every doc_id, from GET /source-events/events.
// With SOURCE=drive that router is not mounted: people edit files in Drive
// instead, so the buttons give way to a note and the doc list comes from /documents.
let weekend = { events: [], documents: [] };
let sourceIsLocal = true;

async function loadWeekend(data) {
    if (data) {
        weekend = data;
    } else {
        try {
            weekend = await api("/source-events/events");
            sourceIsLocal = true;
        } catch (err) {
            sourceIsLocal = false;
            const docs = await api("/documents");
            weekend = { events: [], documents: docs.documents.map(d => d.doc_id) };
        }
    }
    renderEventButtons();
    fillExplainDocs();
}

function renderEventButtons() {
    if (!sourceIsLocal) {
        document.getElementById("eventButtons").innerHTML = '<span class="muted">The source is Google Drive. ' +
            "Edit, upload or trash a file there, then wait for the next tick (or press Run now above).</span>";
        return;
    }
    document.getElementById("eventButtons").innerHTML = weekend.events.map(e =>
        '<button type="button" class="event' + (e.applied ? " applied" : "") + '" data-event="' + e.id + '"' +
        ' title="' + escapeHtml(e.story) + '"' + (e.applied ? " disabled" : "") + ">" +
        (e.applied ? "✓ " : "") + e.id + ". " + escapeHtml(e.title) + "</button>"
    ).join("") + '<button type="button" class="event reset" data-event="reset">Reset to Friday</button>';
}

function fillExplainDocs() {
    const select = document.getElementById("explainDoc");
    const current = select.value || "HR-LEAVE";
    select.innerHTML = weekend.documents.map(id => "<option>" + escapeHtml(id) + "</option>").join("");
    select.value = weekend.documents.includes(current) ? current : weekend.documents[0] || "";
}

// Purpose: replay an event (or reset), then compare the document it touched.
async function clickEvent(event) {
    const button = event.target.closest("button[data-event]");
    if (!button) return;
    const id = button.dataset.event;
    button.disabled = true;
    try {
        await loadWeekend(await api(id === "reset" ? "/source-events/reset" : "/source-events/events/" + id, { method: "POST" }));
        const replayed = weekend.events.find(e => String(e.id) === id);
        if (replayed && replayed.docs.length) document.getElementById("explainDoc").value = replayed.docs[0];
        await submitExplain();
    } catch (err) {
        setOutput("explainOutput", errorBanner(err));
        button.disabled = false;
    }
}

async function submitExplain(event) {
    if (event) event.preventDefault();
    const form = document.getElementById("explainForm");
    await runWithBusy(form, "explainOutput", "Comparing…", async () => {
        const data = await api(withParams("/sync/explain", { doc_id: value("explainDoc") }));
        setOutput("explainOutput", renderExplain(data));
    });
}

// Purpose: one sentence that says what the two fingerprints mean together.
function explainVerdict(d) {
    if (!d.etag.index) return "Not in the index yet, so there is nothing to compare against: every line is new.";
    if (!d.etag.source) return "The file is gone from the source, so every chunk is deleted.";
    if (d.etag.index === d.etag.source) {
        return "Same eTag: the file did not change, so the sync stopped there and never downloaded it.";
    }
    if (d.hash.index === d.hash.source) {
        return "The eTag changed, the content hash did not: the file changed, but not the text we embed. " +
            "Nothing is re-embedded; the sync only stores the new eTag.";
    }
    return "Both changed: the text we embed is different, so this document's chunks are embedded again.";
}

// Purpose: "in the index" and "now" for one fingerprint, and whether they match.
function fingerprintTable(name, fp) {
    const show = h => h ? "<code>" + escapeHtml(h) + "</code>" : '<span class="muted">none</span>';
    let state = "";
    if (fp.index && fp.source) {
        state = fp.index === fp.source ? ' <span class="sig-same">= same</span>' : ' <span class="sig-diff">≠ changed</span>';
    }
    return '<table class="kv"><tr><th>' + name + " in the index</th><td>" + show(fp.index) + "</td></tr>" +
        "<tr><th>" + name + " now</th><td>" + show(fp.source) + state + "</td></tr></table>";
}

// Purpose: a line diff, red for removed lines and green for added ones.
function diffBlock(lines, emptyText) {
    if (!lines.length) return '<p class="diff-empty">' + emptyText + "</p>";
    const css = { "+": "add", "-": "del", "@": "gap", " ": "ctx" };
    return '<pre class="diff">' + lines.map(l =>
        '<span class="' + css[l.op] + '">' + escapeHtml(l.op === "@" ? "…" : l.op + " " + l.text) + "</span>"
    ).join("") + "</pre>";
}

function renderExplain(d) {
    const bytesSame = d.etag.index && d.etag.index === d.etag.source;
    const size = n => n == null ? "–" : n.toLocaleString() + " bytes";
    const notParsedBySync = d.etag.index && !d.hash.computed_by_sync
        ? '<p class="meta">The sync did not compute this hash: the eTag matched, so it never parsed the file. ' +
          "It is computed here only for the comparison.</p>"
        : "";

    const bytesCard = '<div class="card"><h3>The file → eTag</h3>' +
        '<p class="muted">A fingerprint of the bytes. Any byte counts: a footer, a timestamp, a re-save.</p>' +
        fingerprintTable("eTag", d.etag) +
        '<p class="meta">' + size(d.bytes.size_index) + " in the index · " + size(d.bytes.size_source) + " now</p>" +
        (d.bytes.note ? '<p class="diff-empty">' + escapeHtml(d.bytes.note) + "</p>"
            : diffBlock(d.bytes.diff, bytesSame ? "Identical bytes." : "No readable byte changes.")) + "</div>";

    const textCard = '<div class="card"><h3>The text we embed → content hash</h3>' +
        '<p class="muted">A fingerprint of the chunks, after parsing, PII redaction and chunking, headers included.</p>' +
        fingerprintTable("Hash", d.hash) + notParsedBySync +
        '<p class="meta">' + d.text.chunks_index + " chunk(s) in the index · " + d.text.chunks_source + " now</p>" +
        diffBlock(d.text.diff, "Identical text: same chunks, so the same vectors. Nothing to embed.") + "</div>";

    return '<div class="banner verdict"><span class="badge badge-' + ACTION_LEVEL[d.action] + '">' +
        escapeHtml(d.action) + "</span> <b>" + escapeHtml(d.doc_id) + "</b>: " + escapeHtml(explainVerdict(d)) +
        '<br><small>The sync says: ' + escapeHtml(d.reason) + "</small></div>" +
        '<div class="columns">' + bytesCard + textCard + "</div>" +
        '<p class="meta">Why two fingerprints? The eTag is free but fires on any byte. The content hash is exact ' +
        "but needs a download and a parse. So the sync checks the eTag first, to skip unchanged files, " +
        "and the hash next, to skip re-embedding unchanged text.</p>";
}

function stat(number, label) {
    return '<div class="stat"><b>' + number + "</b><span>" + label + "</span></div>";
}


// ---------- Store: GET /store/inspect ----------

async function submitStore(event) {
    if (event) event.preventDefault();
    const form = document.getElementById("storeForm");
    const url = withParams("/store/inspect", {
        collection: value("storeIndex"),  // "" = the live index
        source: value("storeSource"),
        limit: value("storeLimit"),
        show_embeddings: document.getElementById("storeEmbeddings").checked,
    });
    await runWithBusy(form, "storeOutput", "Reading the store…", async () => {
        const data = await api(url);
        // A filtered result only lists one source, so keep the full dropdown
        if (!value("storeSource")) fillSourceFilter(data.sources);
        setOutput("storeOutput", renderStore(data));
    });
}

// Purpose: switch between the live index and checkpoint 4's.
// Their source paths differ (finance/expense-policy.md vs
// expense-policy.md), so reset the file filter and reload.
function changeStoreIndex() {
    document.getElementById("storeSource").value = "";
    submitStore();
}

function renderStore(data) {
    if (data.total_stored === 0) {
        return value("storeIndex")
            ? '<div class="banner banner-none">Checkpoint 4\'s index is empty. Run <code>python sync.py --naive</code>.</div>'
            : '<div class="banner banner-none">The index is empty. Open the Sync tab first.</div>';
    }
    const dims = data.chunks.find(c => c.embedding_dimensions);
    const rows = data.chunks.map(c => {
        const vector = c.embedding_preview
            ? '<p class="vector">[' + c.embedding_preview.map(n => n.toFixed(4)).join(", ") +
              ", … ] · " + c.embedding_dimensions + " numbers</p>"
            : "";
        return chunkRow(c.id + " · " + (c.doc_type || "no doc_type, re-ingest"), c.text, null,
            chunkMetadata(c.metadata || {}) + vector);
    }).join("");

    return '<div class="card"><div class="stats">' +
            stat(data.total_stored, "chunks in store") +
            stat(data.sources.length, "source files") +
            stat(dims ? dims.embedding_dimensions : "–", "vector dimensions") +
            stat(data.chunks.length, "shown below") +
        '</div><p class="meta">Collection: ' + escapeHtml(data.collection) + "</p></div>" +
        '<div class="card"><h3>Chunks</h3>' + rows + "</div>";
}


// Fields the sync compares to decide what changed, shown first.
const FINGERPRINT_FIELDS = {
    etag: "eTag: the file's bytes. Same eTag next sync = not even downloaded.",
    content_hash: "Content hash: the chunks we stored. Same hash = same vectors, no re-embedding.",
    parser: "Parser used. Its version is part of the content hash.",
};

// Purpose: a chunk's metadata: fingerprints first, then the labels the
// search filters on. The acl_<group> flags become one "may read" line.
function chunkMetadata(meta) {
    const keys = Object.keys(meta);
    if (!keys.length) return "";
    const row = (k, v, tip = "") =>
        "<tr><th" + (tip ? ' title="' + escapeHtml(tip) + '"' : "") + ">" + escapeHtml(k) + "</th><td>" + v + "</td></tr>";
    const fingerprints = Object.keys(FINGERPRINT_FIELDS).filter(k => k in meta)
        .map(k => row(k, "<code>" + escapeHtml(meta[k]) + "</code>", FINGERPRINT_FIELDS[k])).join("");
    const groups = keys.filter(k => k.startsWith("acl_"));
    const readers = groups.filter(k => meta[k]).map(k => k.slice(4));
    const access = groups.length ? row("may read", escapeHtml(readers.join(", ") || "nobody")) : "";
    const labels = keys.filter(k => !(k in FINGERPRINT_FIELDS) && !k.startsWith("acl_")).sort()
        .map(k => row(k, escapeHtml(meta[k]))).join("");
    const head = fingerprints
        ? '<tr><td colspan="2" class="meta-group">Change detection</td></tr>' + fingerprints +
          '<tr><td colspan="2" class="meta-group">Labels (copied from the register, filtered on in every search)</td></tr>'
        : "";
    return '<div class="chunk-meta"><table class="kv">' + head + access + labels + "</table></div>";
}


// ---------- Visualize: GET /visualize ----------

async function submitVisualize(event) {
    if (event) event.preventDefault();
    const form = document.getElementById("visualizeForm");
    const method = value("visualizeMethod");
    await runWithBusy(form, "visualizeOutput", "Drawing " + method.toUpperCase() + " plot…", async () => {
        const response = await fetch("/visualize?method=" + method);
        if (!response.ok) throw new Error(response.status + ": " + (await response.text()));
        const url = URL.createObjectURL(await response.blob());
        setOutput("visualizeOutput",
            '<div class="card"><img class="plot" src="' + url + '" alt="2D map of chunk embeddings coloured by source file"></div>');
    });
}


// ---------- Tabs ----------

// Purpose: show the panel named in the URL hash (e.g. #search).
function showTab() {
    const name = location.hash.slice(1) || "query";
    document.querySelectorAll("section").forEach(s => s.classList.toggle("active", s.dataset.panel === name));
    document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("active", a.dataset.tab === name));

    // Data tabs load themselves the first time they open
    if (name === "store" && !document.getElementById("storeOutput").innerHTML) submitStore();
    if (name === "visualize" && !document.getElementById("visualizeOutput").innerHTML) submitVisualize();
    if (name === "sync") refreshScheduler();
    if (name === "sync" && !document.getElementById("explainOutput").innerHTML) {
        loadWeekend().then(() => submitExplain())
            .catch(err => setOutput("explainOutput", errorBanner(err)));
    }

    const firstInput = document.querySelector("section.active input[type=text]");
    if (firstInput) firstInput.focus();
}

// Purpose: clicking a sample question fills the box and submits it.
function wireSamples() {
    document.querySelectorAll(".samples").forEach(group => {
        group.addEventListener("click", event => {
            if (event.target.tagName !== "SPAN") return;
            const input = document.getElementById(group.dataset.target);
            input.value = event.target.textContent;
            input.form.requestSubmit();
        });
    });
}


// ---------- Start ----------

document.getElementById("queryForm").addEventListener("submit", submitQuery);
document.getElementById("compareForm").addEventListener("submit", submitCompare);
document.getElementById("llmForm").addEventListener("submit", submitLlm);
document.getElementById("searchForm").addEventListener("submit", submitSearch);
document.getElementById("embedForm").addEventListener("submit", submitEmbed);
document.getElementById("syncForm").addEventListener("submit", submitSync);
document.getElementById("storeForm").addEventListener("submit", submitStore);
document.getElementById("storeIndex").addEventListener("change", changeStoreIndex);
document.getElementById("explainForm").addEventListener("submit", submitExplain);
document.getElementById("eventButtons").addEventListener("click", clickEvent);
document.getElementById("schedulerButtons").addEventListener("click", clickScheduler);
document.getElementById("changeToast").addEventListener("click", clickToast);
document.getElementById("historyFile").addEventListener("change", () => loadHistory(true));
document.getElementById("historyOutput").addEventListener("click", clickHistory);
document.getElementById("historyDetail").addEventListener("click", clickHistory);
document.getElementById("visualizeForm").addEventListener("submit", submitVisualize);
window.addEventListener("hashchange", showTab);

wireSamples();
loadStatus();
showTab();
if (location.hash !== "#sync") refreshScheduler();  // a change since your last visit shows up at once
