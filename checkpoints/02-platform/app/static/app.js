// ============================================================
// Acme Desk, Part 2 — vanilla JS, one small function per job
// ============================================================
// Same pattern as Part 1: read the form, call the endpoint with
// api(), render the JSON. Two things are new:
//   - api() sends X-Acme-Request: 1 on every write (the CSRF guard)
//     and sends you to /login on a 401
//   - there is no "Ask as": the server knows who you are from the
//     session cookie, which this script cannot even read (HttpOnly)
//   - the Chat tab reads a streamed reply (Server-Sent Events)
// ============================================================

let thresholds = { high: 0.8, low: 1.4, no_result: 1.6 };
let me = null;          // GET /auth/me
let allGroups = [];     // admin: GET /admin/groups

// ---------- Helpers ----------

async function api(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (method !== "GET") headers["X-Acme-Request"] = "1";
    if (options.json !== undefined) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(options.json);
    }
    const response = await fetch(path, { ...options, method, headers });
    if (response.status === 401) {
        location.href = "/login";
        throw new Error("Signed out.");
    }
    if (!response.ok) {
        const body = await response.text();
        let detail = body;
        try { detail = JSON.parse(body).detail || body; } catch (e) { /* plain text */ }
        if (typeof detail !== "string") detail = JSON.stringify(detail);
        throw new Error(response.status + ": " + detail);
    }
    return response.json();
}

function withParams(path, params) {
    const query = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
        if (val !== "" && val !== null && val !== undefined) query.set(key, val);
    }
    const text = query.toString();
    return text ? path + "?" + text : path;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function value(id) { return document.getElementById(id).value.trim(); }
function setOutput(id, html) { document.getElementById(id).innerHTML = html; }
function errorBanner(err) { return '<div class="banner banner-error">' + escapeHtml(err.message) + "</div>"; }
function okBanner(text) { return '<div class="banner banner-high">' + escapeHtml(text) + "</div>"; }
function when(iso) { return iso ? escapeHtml(new Date(iso).toLocaleString()) : "–"; }

async function runWithBusy(form, outputId, busyText, task) {
    const button = form.querySelector("button[type=submit]") || form.querySelector("button");
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    if (outputId) setOutput(outputId, '<p class="loading">' + busyText + "</p>");
    try {
        await task();
    } catch (err) {
        if (outputId) setOutput(outputId, errorBanner(err));
    } finally {
        button.disabled = false;
        button.textContent = label;
    }
}

function chip(before, bold, after = "", extraClass = "") {
    const span = document.createElement("span");
    span.className = "chip" + (extraClass ? " " + extraClass : "");
    const b = document.createElement("b");
    b.textContent = bold;
    span.append(document.createTextNode(before), b, document.createTextNode(after));
    return span;
}

function stat(number, label) {
    return '<div class="stat"><b>' + escapeHtml(number) + "</b><span>" + escapeHtml(label) + "</span></div>";
}

function groupChips(names) {
    return (names || []).map(g => '<span class="badge badge-doctype">' + escapeHtml(g) + "</span>").join(" ");
}

// ---------- Who am I ----------

async function loadMe() {
    me = await api("/auth/me");
    document.getElementById("tenantName").textContent = me.tenant.name + " · Part 2: the platform";
    document.querySelectorAll(".admin-only").forEach(el => { el.hidden = me.role !== "admin"; });
    const status = document.getElementById("status");
    status.replaceChildren(
        chip("", me.display_name, " · " + me.email, "ok"),
        chip("Role ", me.role),
        chip("Groups ", me.groups.join(", ") || "none", "", me.groups.length ? "" : "bad"),
    );
    renderAccount();
}

async function loadHealth() {
    try {
        const health = await api("/health");
        if (health.thresholds) thresholds = health.thresholds;
        if (health.doc_types) fillDocFilter(health.doc_types);
        document.getElementById("status").append(
            chip("LLM ", health.llm_provider, " · " + health.model),
            chip("Store ", health.vector_store),
            chip("Retrieval ", health.retrieval),
        );
    } catch (err) { /* the identity chips are enough */ }
}

function fillDocFilter(docTypes) {
    const select = document.getElementById("queryDocFilter");
    const current = select.value;
    select.innerHTML =
        '<option value="off">off: search all documents</option>' +
        '<option value="auto">auto: LLM picks the doc type</option>' +
        docTypes.map(t => '<option value="' + escapeHtml(t) + '">force: ' + escapeHtml(t) + "</option>").join("");
    select.value = current;
}

function renderAccount() {
    setOutput("accountCard",
        '<table class="kv">' +
        "<tr><th>Name</th><td>" + escapeHtml(me.display_name) + "</td></tr>" +
        "<tr><th>Email</th><td>" + escapeHtml(me.email) + "</td></tr>" +
        "<tr><th>Tenant</th><td>" + escapeHtml(me.tenant.name) + " <code>" + escapeHtml(me.tenant.slug) + "</code></td></tr>" +
        "<tr><th>Role</th><td>" + escapeHtml(me.role) + "</td></tr>" +
        "<tr><th>Groups</th><td>" + (groupChips(me.groups) || '<span class="muted">none: you can read nothing</span>') + "</td></tr>" +
        "</table>");
}

async function submitPassword(event) {
    event.preventDefault();
    await runWithBusy(event.target, "passwordOutput", "Changing…", async () => {
        await api("/auth/password", { method: "POST",
            json: { current_password: value("currentPassword"), new_password: value("newPassword") } });
        event.target.reset();
        setOutput("passwordOutput", okBanner("Password changed. Your other sessions were signed out."));
    });
}

async function signOut() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    location.href = "/login";
}

// ---------- Distances and sources (from Part 1) ----------

function provenance(src) {
    if (!src.title) return src.source;
    return src.title + " · v" + src.version + " · " + src.status + " · from " + src.effective_from +
        (src.section ? " · " + src.section : "");
}

function distanceLevel(distance) {
    if (distance <= thresholds.high) return "high";
    if (distance <= thresholds.low) return "medium";
    if (distance <= thresholds.no_result) return "low";
    return "none";
}

function distanceBar(distance, max, level) {
    const width = Math.max(4, Math.min(100, (distance / max) * 100));
    return '<span class="bar"><i class="' + level + '" style="width:' + width + '%"></i></span>';
}

function badge(confidence) {
    return '<span class="badge badge-' + escapeHtml(confidence) + '">' + escapeHtml(confidence) + " confidence</span>";
}

function foundBy(list) {
    if (!list || !list.length) return "";
    const label = list.length > 1 ? list.join(" + ") : list[0];
    return '<span class="found" title="Found by its ' + escapeHtml(list.join(" and its ")) + '">' + escapeHtml(label) + "</span>";
}

// What the retrieval strategy did, one line per step (rerank time, LLM rewrites, the route).
function traceBlock(strategy, trace, ms) {
    if (!trace || !trace.length) return "";
    const timing = ms ? " · " + Math.round(ms) + " ms" : "";
    return '<p class="meta">Strategy <code>' + escapeHtml(strategy || "") + "</code>" + timing + "</p><pre>" +
        trace.map(escapeHtml).join("
") + "</pre>";
}

function chunkRow(title, text, distance, link, found) {
    let distanceHtml = "";
    if (distance !== undefined && distance !== null) {
        distanceHtml = distanceBar(distance, thresholds.no_result * 1.25, distanceLevel(distance)) +
            '<span class="dist">' + distance.toFixed(3) + "</span>";
    }
    const open = link && /^https?:/.test(link)
        ? '<p class="meta chunk-link"><a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">Open the source</a></p>' : "";
    return '<details class="chunk"><summary><span class="name">' + escapeHtml(title) + "</span>" + foundBy(found) +
        distanceHtml + "</summary><pre>" + escapeHtml(text) + "</pre>" + open + "</details>";
}

function sourcesList(sources) {
    return sources.map((src, i) => chunkRow("#" + (i + 1) + "  " + provenance(src), src.text, src.distance, src.source_url, src.found_by)).join("");
}

// ---------- Chat: /chat/threads, streamed as Server-Sent Events ----------
// The reply arrives as a stream of small messages:
//   event: step   a node finished (identify, retrieve, answer, finalize)
//   event: token  a few characters of the answer
//   event: done   the final answer and its sources
// EventSource can only GET, and asking is a POST, so we read the stream
// ourselves: fetch(), then a reader, split on blank lines.

let currentThread = null;

async function loadThreads() {
    try {
        const list = await api("/chat/threads");
        const ul = document.getElementById("threadList");
        ul.innerHTML = list.length ? list.map(t => '<li data-thread="' + escapeHtml(t.id) + '"' +
            (t.id === currentThread ? ' class="active"' : "") + ' title="' + escapeHtml(t.title) + '">' + escapeHtml(t.title) + "</li>").join("")
            : '<li class="muted">No conversations yet</li>';
        if (!currentThread) renderLog([]);
    } catch (err) {
        setOutput("chatLog", errorBanner(err));
    }
}

async function openThread(id) {
    currentThread = id;
    try {
        const thread = await api("/chat/threads/" + id);
        renderLog(thread.messages);
        loadThreads();
    } catch (err) {
        setOutput("chatLog", errorBanner(err));
    }
}

function newChat() {
    currentThread = null;
    renderLog([]);
    loadThreads();
    document.getElementById("chatInput").focus();
}

function renderLog(messages) {
    const log = document.getElementById("chatLog");
    if (!messages.length) {
        log.innerHTML = '<p class="chat-empty">A new conversation. Ask anything about Acme&rsquo;s documents; follow-ups work.</p>';
        return;
    }
    log.innerHTML = "";
    for (const m of messages) {
        log.append(m.role === "user" ? userBubble(m.text) : assistantBubble(m));
    }
}

function userBubble(text) {
    const div = document.createElement("div");
    div.className = "msg msg-user";
    div.textContent = text;
    return div;
}

function assistantBubble(m) {
    const div = document.createElement("div");
    div.className = "msg msg-assistant" + (m.hidden ? " hidden" : "");
    div.innerHTML = '<div class="steps"></div><div class="answer"></div><div class="sources"></div>';
    div.querySelector(".answer").textContent = m.text || "";
    if (m.sources) fillSources(div, m);
    return div;
}

function fillSources(bubble, m) {
    const box = bubble.querySelector(".sources");
    if (!m.sources || !m.sources.length) { box.innerHTML = ""; return; }
    box.innerHTML = "<details><summary>" + m.sources.length + " sources" +
        (m.confidence ? " · " + escapeHtml(m.confidence) + " confidence" : "") + "</summary>" + sourcesList(m.sources) + "</details>";
}

function showStep(bubble, step) {
    let detail = "";
    if (step.node === "identify") detail = " as " + step.user;
    if (step.node === "retrieve") detail = " · " + step.chunks + " chunks" +
        (step.hidden_documents ? " · " + step.hidden_documents + " doc(s) no longer yours" : "");
    if (step.node === "answer" && step.outcome !== "answered") detail = " · " + step.outcome;
    const span = document.createElement("span");
    span.className = "step done";
    span.innerHTML = "<b>" + escapeHtml(step.node) + "</b>" + escapeHtml(detail);
    if (step.node === "retrieve" && step.search_query) {
        span.title = "Searched for: " + step.search_query + "\n" + (step.documents || []).join("\n");
    }
    bubble.querySelector(".steps").append(span);
}

async function* readEvents(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { value: bytes, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(bytes, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const event = (block.match(/^event: (.*)$/m) || [])[1];
            const data = (block.match(/^data: (.*)$/m) || [])[1];
            if (event && data) yield { event, data: JSON.parse(data) };
        }
    }
}

async function sendChat(event) {
    event.preventDefault();
    const input = document.getElementById("chatInput");
    const question = input.value.trim();
    if (!question) return;
    const button = event.target.querySelector("button");
    button.disabled = true;
    input.value = "";
    const log = document.getElementById("chatLog");
    if (log.querySelector(".chat-empty")) log.innerHTML = "";
    try {
        if (!currentThread) currentThread = (await api("/chat/threads", { method: "POST" })).id;
        log.append(userBubble(question));
        const bubble = assistantBubble({ text: "" });
        const answer = bubble.querySelector(".answer");
        answer.classList.add("cursor");
        log.append(bubble);
        const response = await fetch("/chat/threads/" + currentThread + "/messages", {
            method: "POST", headers: { "Content-Type": "application/json", "X-Acme-Request": "1" },
            body: JSON.stringify({ message: question }),
        });
        if (response.status === 401) { location.href = "/login"; return; }
        if (!response.ok) throw new Error(response.status + ": " + await response.text());
        for await (const { event: name, data } of readEvents(response)) {
            if (name === "step") showStep(bubble, data);
            if (name === "token") answer.textContent += data.text;
            if (name === "done") { answer.textContent = data.answer; fillSources(bubble, data); }
            if (name === "error") throw new Error(data.message + " (request " + data.request_id + ")");
        }
        loadThreads();
    } catch (err) {
        log.insertAdjacentHTML("beforeend", errorBanner(err));
    } finally {
        button.disabled = false;
        document.querySelectorAll("#chatLog .cursor").forEach(el => el.classList.remove("cursor"));
    }
}

// ---------- Ask: POST /query ----------

async function submitQuery(event) {
    event.preventDefault();
    const url = withParams("/query", {
        as_of: value("asOf"), top_k: value("queryTopK"),
        prompt_style: value("queryPromptStyle"), doc_filter: value("queryDocFilter"),
        strategy: value("queryStrategy"),
    });
    await runWithBusy(event.target, "queryOutput", "Retrieving and generating…", async () => {
        const data = await api(url, { method: "POST", json: { question: value("queryQuestion") } });
        setOutput("queryOutput", renderRagAnswer(data));
    });
}

function renderRagAnswer(data) {
    const asked = '<p class="meta">Answered for ' + escapeHtml(data.user) + (data.as_of ? ", as of " + escapeHtml(data.as_of) : "") +
        " · model " + escapeHtml(data.model) + " · request " + escapeHtml(data.request_id) + "</p>";
    if (data.no_result) {
        return '<div class="banner banner-none"><b>Nothing you may read answers this.</b> ' + escapeHtml(data.answer) + "</div>" + asked;
    }
    let html = "";
    if (data.llm_available === false) {
        html += '<div class="banner banner-low"><b>No written answer:</b> the AI model is not available ' +
            "(an admin needs to set an API key in .env). The closest passages you may read are below.</div>";
    }
    if (data.confidence === "low") {
        html += '<div class="banner banner-low">Weak evidence: the retrieved chunks may not answer this. Try rephrasing.</div>';
    }
    if (data.llm_available !== false) {
        html += '<div class="card"><h3>Answer ' + badge(data.confidence) + '</h3><p class="answer">' + escapeHtml(data.answer) + "</p>" + asked + "</div>";
    }
    if (data.sources && data.sources.length) {
        html += '<div class="card"><h3>Sources · ' + data.chunks_used + " chunks</h3>" + sourcesList(data.sources) +
            traceBlock(data.strategy, data.trace) + "</div>";
    }
    return html;
}

// ---------- Search: GET /search ----------

async function submitSearch(event) {
    event.preventDefault();
    const url = withParams("/search", { q: value("searchQuery"), top_k: value("searchTopK"), as_of: value("asOf"),
        strategy: value("searchStrategy") });
    await runWithBusy(event.target, "searchOutput", "Searching…", async () => {
        const data = await api(url);
        const asked = "as " + escapeHtml(data.user) + " (" + escapeHtml(data.groups.join(", ") || "no groups") + ")" +
            (data.as_of ? ", as of " + escapeHtml(data.as_of) : ", today") + ", ranked " + escapeHtml(data.strategy);
        if (!data.results.length) {
            setOutput("searchOutput", '<div class="banner banner-none">Nothing you may read matches, ' + asked + ".</div>");
            return;
        }
        const rows = data.results.map((r, i) => chunkRow("#" + (i + 1) + "  " + provenance(r), r.text, r.distance, r.source_url, r.found_by)).join("");
        setOutput("searchOutput", '<div class="card"><h3>' + data.total_results + " closest chunks " + asked + "</h3>" + rows +
            traceBlock(data.strategy, data.trace, data.ms) +
            '<p class="meta">Green ≤ ' + thresholds.high + ", amber ≤ " + thresholds.low + ", red ≤ " + thresholds.no_result +
            ", grey = no result.</p></div>");
    });
}

// ---------- Documents: GET /documents ----------

async function loadDocuments() {
    try {
        const data = await api("/documents");
        document.getElementById("documentsHint").innerHTML = me.role === "admin"
            ? "You are an admin, so you see the whole register; “readable by you” is still your own access. <code>GET /documents</code>"
            : "Only the documents you may read are listed. Others are not just hidden from search: their titles are hidden too. <code>GET /documents</code>";
        const rows = data.documents.map(d =>
            "<tr><td><code>" + escapeHtml(d.doc_id) + "</code></td><td>" + escapeHtml(d.title) + '<br><span class="muted">' +
            escapeHtml(d.path) + "</span></td><td>" + escapeHtml(d.status) + "</td><td>" + escapeHtml(d.effective_from) +
            "</td><td>" + groupChips(d.allowed_groups) + "</td><td>" +
            (d.readable_by_you ? '<span class="badge badge-high">yes</span>' : '<span class="badge badge-low">no</span>') +
            '</td><td class="num">' + d.chunks_in_index + "</td></tr>").join("");
        setOutput("documentsOutput", '<div class="card scroll-x"><table><tr><th>Doc</th><th>Title</th><th>Status</th>' +
            "<th>In force from</th><th>Readable by</th><th>Readable by you</th><th>Chunks</th></tr>" + rows + "</table></div>");
    } catch (err) {
        setOutput("documentsOutput", errorBanner(err));
    }
}

// ---------- Admin: Sync ----------

const ACTION_LEVEL = { add: "high", change: "high", relabel: "medium", touch: "medium",
    remove: "low", quarantine: "low", skip: "none", unchanged: "none" };
const SCHED_LEVEL = { offline: "low", paused: "medium", running: "high", on: "high", manual: "none" };

function renderScheduler(s) {
    const card = document.getElementById("schedulerCard");
    const state = !s.enabled ? ["offline", "no worker has checked in. Start one: python worker.py"]
        : s.running ? ["running", "a sync is executing right now"]
        : s.paused ? ["paused", "scheduled ticks skip this tenant; Run now still works"]
        : s.interval <= 0 ? ["manual", "the worker has no timer (SYNC_INTERVAL_SECONDS=0): it syncs on Run now"]
        : ["on", "every " + s.interval + "s · next sync in " + (s.seconds_to_next_run ?? "?") + "s · worker " + s.worker];
    const summary = s.last_summary || {};
    const counts = Object.entries(summary.counts || {}).map(([action, n]) => stat(n, action)).join("");
    const last = summary.at
        ? "Last sync " + when(summary.at) + " · " + summary.seconds + "s · " + (summary.chunks_in_index ?? "?") + " chunks in the index" +
          (s.last_run && s.last_run !== summary.at ? " · last check " + when(s.last_run) : "")
        : "No sync yet.";
    const pending = s.pending_requests ? " · " + s.pending_requests + " Run now waiting for the worker" : "";
    card.querySelector(".scheduler-state").innerHTML =
        '<span class="badge badge-' + SCHED_LEVEL[state[0]] + '">' + state[0] + "</span> " +
        '<span class="muted">' + escapeHtml(state[1]) + "</span>";
    card.querySelector(".scheduler-last").innerHTML =
        '<p class="meta">' + last + " · " + s.runs + " run(s), " + s.errors + " error(s)" + escapeHtml(pending) + "</p>" +
        (counts ? '<div class="stats">' + counts + "</div>" : "") +
        (s.last_error ? errorBanner(new Error("Last sync failed, index untouched: " + s.last_error)) : "");
    document.getElementById("schedPause").disabled = s.paused;
    document.getElementById("schedResume").disabled = !s.paused;
    renderGate(s.gate);
}

// ---------- The change gate (app/ingest/gate.py) ----------

function duration(seconds) {
    if (seconds == null) return "?";
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    return h ? h + "h " + m + "m" : m ? m + "m " + s + "s" : s + "s";
}

function calls(n) { return n == null ? "?" : n + " Drive call" + (n === 1 ? "" : "s"); }

function renderGate(g) {
    const card = document.getElementById("gateCard");
    if (!g) return;
    const state = !g.change_log ? ["off", "none", "this source has no change log (the local folder): every tick walks it, as before"]
        : !g.bookmark ? ["no bookmark", "medium", "the next sync takes one, then quiet ticks are skipped"]
        : g.last_decision === "skip" ? ["quiet", "high", "last check " + new Date(g.last_check).toLocaleTimeString() + ": nothing changed, so nothing was walked"]
        : ["opened", "medium", "last check " + (g.last_check ? new Date(g.last_check).toLocaleTimeString() : "–") + ": " + (g.last_reason || "")];
    card.querySelector(".scheduler-state").innerHTML =
        '<span class="badge badge-' + state[1] + '">' + state[0] + '</span> <span class="muted">' + escapeHtml(state[2]) + "</span>";
    if (!g.change_log) {
        card.querySelector(".scheduler-last").innerHTML = "";
        return;
    }
    const stats = [
        stat(g.skipped_since_last_sync, "quiet ticks skipped since the last sync"),
        stat(calls(g.check_calls), "per quiet tick (the check)"),
        stat(calls(g.walk_calls), "per tick that syncs (the walk)"),
        stat(g.full_sync_due_at ? duration(g.seconds_to_full_sync) : "–", "until the safety-net full sync"),
    ].join("");
    card.querySelector(".scheduler-last").innerHTML = '<div class="stats">' + stats + "</div>" +
        (g.quiet_since ? '<p class="meta">Quiet since ' + when(g.quiet_since) + ".</p>" : "");
}

function gateCell(g) {
    if (!g) return '<span class="muted">–</span>';
    const badge = g.decision === "skip" ? '<span class="badge badge-none">skip</span>'
        : g.change_log ? '<span class="badge badge-medium">run</span>' : '<span class="badge badge-none">no log</span>';
    const n = g.changes != null ? " · " + g.changes + " change" + (g.changes === 1 ? "" : "s") : "";
    return badge + ' <span class="muted">' + escapeHtml(calls(g.drive_calls) + n) + "</span>";
}

function gateDetail(g) {
    if (!g) return "";
    const files = (g.changed_files || []).map(f => "<li><code>" + escapeHtml(f.name) + "</code> " + escapeHtml(f.kind) + "</li>").join("");
    const more = g.changes > (g.changed_files || []).length ? "<li>… and " + (g.changes - g.changed_files.length) + " more</li>" : "";
    return '<h4>The change gate</h4><p><span class="badge badge-' + (g.decision === "skip" ? "none" : "medium") + '">' +
        escapeHtml(g.decision) + "</span> " + escapeHtml(g.reason) + "</p>" +
        '<p class="meta">' + escapeHtml(calls(g.drive_calls)) + " in this run" +
        (g.changes != null ? " · " + g.changes + " change(s) in Drive's log since the bookmark" : "") +
        (g.register_changed ? " · the register changed" : "") + "</p>" +
        (files ? "<ul>" + files + more + "</ul>" : "");
}

let lastRunShown = null;
let runsById = {};

async function refreshSync() {
    try {
        renderScheduler(await api("/sync/status"));
        const runs = await api("/sync/runs?limit=15");
        runsById = Object.fromEntries(runs.map(r => [r.id, r]));
        setOutput("runsOutput", "<table><tr><th>#</th><th>Trigger</th><th>By</th><th>Started</th><th>Seconds</th><th>Gate</th><th>Result</th><th>Counts</th></tr>" +
            runs.map(r => '<tr data-run="' + r.id + '" class="clickable"><td>' + r.id + "</td><td>" + escapeHtml(r.trigger) + "</td><td>" +
                escapeHtml(r.requested_by || "") + "</td><td>" + when(r.started_at) + '</td><td class="num">' + (r.seconds ?? "") +
                "</td><td>" + gateCell(r.gate) + "</td><td>" + runResult(r) + "</td><td>" +
                escapeHtml(Object.entries(r.counts || {}).map(([k, v]) => k + " " + v).join(", ")) +
                "</td></tr>").join("") + "</table>" + '<p class="meta">Click a run to see its plan, or why the gate skipped it.</p>');
        const latest = runs.find(r => r.finished_at && r.ok !== null);
        if (latest && latest.id !== lastRunShown) showRun(latest.id);
    } catch (err) {
        setOutput("syncOutput", errorBanner(err));
    }
}

function runResult(r) {
    if (!r.finished_at) return '<span class="badge badge-high">running</span>';
    if (r.skipped_reason && r.gate && r.gate.decision === "skip") return '<span class="badge badge-none">skipped</span>';
    if (r.skipped_reason) return '<span class="badge badge-none">skipped</span> ' + escapeHtml(r.skipped_reason);
    if (r.ok) return '<span class="badge badge-high">ok</span>';
    return '<span class="badge badge-low">failed</span> ' + escapeHtml(r.error || "");
}

async function showRun(id) {
    lastRunShown = id;
    const row = runsById[id];
    if (row && row.skipped_reason) {   // no plan: the gate (or another worker) skipped it
        setOutput("syncOutput", '<div class="card"><h3>Sync run #' + id + " · skipped</h3>" +
            (row.gate ? gateDetail(row.gate) : "<p>" + escapeHtml(row.skipped_reason) + "</p>") + "</div>");
        return;
    }
    try {
        const data = await api("/sync/runs/" + id);
        const rows = data.documents.filter(d => d.action !== "unchanged").map(d =>
            '<tr><td><span class="badge badge-' + ACTION_LEVEL[d.action] + '">' + escapeHtml(d.action) + "</span></td><td>" +
            escapeHtml(d.doc_id) + "</td><td>" + escapeHtml(d.reason) + "</td></tr>").join("");
        const same = data.documents.filter(d => d.action === "unchanged").length;
        const warnings = data.warnings.length ? '<h4>For a human to look at</h4><ul>' +
            data.warnings.map(w => "<li>" + escapeHtml(w) + "</li>").join("") + "</ul>" : "";
        setOutput("syncOutput", '<div class="card"><h3>Sync run #' + id + " · " + escapeHtml(data.collection) + "</h3>" +
            '<div class="stats">' + Object.entries(data.counts).map(([a, n]) => stat(n, a)).join("") + "</div>" +
            (rows ? '<table class="plan"><tr><th>Action</th><th>Document</th><th>Why</th></tr>' + rows + "</table>" : "") +
            (same ? '<p class="meta">' + same + " unchanged: same eTag, not even downloaded.</p>" : "") + warnings +
            gateDetail(row && row.gate) + "</div>");
    } catch (err) {
        setOutput("syncOutput", errorBanner(err));
    }
}

async function clickScheduler(event) {
    const button = event.target.closest("button[data-sched]");
    if (!button) return;
    button.disabled = true;
    try {
        renderScheduler(await api("/sync/" + button.dataset.sched, { method: "POST" }));
    } catch (err) {
        setOutput("syncOutput", errorBanner(err));
    } finally {
        button.disabled = false;
        setTimeout(refreshSync, 1500);
    }
}

// ---------- Admin: People and groups ----------

function groupPicker(selected, name) {
    return allGroups.map(g => '<label class="check"><input type="checkbox" name="' + name + '" value="' + escapeHtml(g.name) + '"' +
        (selected.includes(g.name) ? " checked" : "") + "> " + escapeHtml(g.name) + "</label>").join("");
}

function checked(container, name) {
    return [...container.querySelectorAll('input[name="' + name + '"]:checked')].map(i => i.value);
}

async function loadGroups() {
    allGroups = await api("/admin/groups");
    document.getElementById("newGroups").innerHTML = '<span class="muted">Groups</span>' + groupPicker(["employees"], "newGroup");
    setOutput("groupsOutput", "<table><tr><th>Group</th><th>What for</th><th>Members</th><th>Documents</th></tr>" +
        allGroups.map(g => "<tr><td><b>" + escapeHtml(g.name) + "</b></td><td>" + escapeHtml(g.description) +
            '</td><td class="num">' + g.members + '</td><td class="num">' + g.documents + "</td></tr>").join("") + "</table>");
}

async function loadPeople() {
    try {
        await loadGroups();
        const users = await api("/admin/users");
        setOutput("peopleOutput", '<table class="people"><tr><th>Person</th><th>Role</th><th>Groups</th><th>Active</th><th>Last sign-in</th><th></th></tr>' +
            users.map(u => {
                const self = u.email === me.email;
                const lock = u.other_tenants ? ' title="Also in another tenant: name, password and active flag are not ours to change"' : "";
                return '<tr data-user="' + escapeHtml(u.id) + '"><td><b>' + escapeHtml(u.display_name) + '</b><br><span class="muted">' +
                    escapeHtml(u.email) + (self ? " (you)" : "") + "</span></td>" +
                    '<td><select name="role"' + (self ? " disabled" : "") + ">" +
                    ["member", "admin"].map(r => "<option" + (u.role === r ? " selected" : "") + ">" + r + "</option>").join("") + "</select></td>" +
                    '<td class="group-picker">' + groupPicker(u.groups, "group") + "</td>" +
                    '<td><input type="checkbox" name="active"' + (u.is_active ? " checked" : "") + (self || u.other_tenants ? " disabled" : "") + lock + "></td>" +
                    "<td>" + when(u.last_login_at) + "</td>" +
                    '<td class="actions"><button type="button" data-act="save">Save</button>' +
                    '<button type="button" class="secondary" data-act="password"' + (u.other_tenants ? " disabled" + lock : "") + ">Reset password</button>" +
                    (self ? "" : '<button type="button" class="danger" data-act="remove">Remove</button>') + "</td></tr>";
            }).join("") + "</table><div id=\"peopleMessage\"></div>");
    } catch (err) {
        setOutput("peopleOutput", errorBanner(err));
    }
}

async function clickPeople(event) {
    const button = event.target.closest("button[data-act]");
    if (!button) return;
    const row = button.closest("tr");
    const id = row.dataset.user;
    const name = row.querySelector("b").textContent;
    const message = text => setOutput("peopleMessage", text);
    let done = null;   // shown AFTER the table is redrawn: the redraw replaces #peopleMessage
    try {
        if (button.dataset.act === "save") {
            const body = { role: row.querySelector('select[name="role"]').value, groups: checked(row, "group") };
            const active = row.querySelector('input[name="active"]');
            if (!active.disabled) body.is_active = active.checked;
            const u = await api("/admin/users/" + id, { method: "PATCH", json: body });
            done = name + " saved: " + u.role + ", groups " + (u.groups.join(", ") || "none") + ". Live on their next question.";
        } else if (button.dataset.act === "password") {
            const pw = prompt("New temporary password for " + name + " (at least 12 characters). Their sessions end.");
            if (!pw) return;
            await api("/admin/users/" + id, { method: "PATCH", json: { password: pw } });
            done = "Password reset for " + name + ". They are signed out everywhere.";
        } else if (button.dataset.act === "remove") {
            if (!confirm("Remove " + name + " from this tenant? Their sessions here end now.")) return;
            await api("/admin/users/" + id, { method: "DELETE" });
            done = name + " removed.";
        }
        await loadPeople();
        if (done) message(okBanner(done));
    } catch (err) {
        message(errorBanner(err));
    }
}

async function submitAddUser(event) {
    event.preventDefault();
    await runWithBusy(event.target, "addUserOutput", "Adding…", async () => {
        const u = await api("/admin/users", { method: "POST", json: {
            email: value("newEmail"), display_name: value("newName"), password: value("newUserPassword"),
            role: value("newRole"), groups: checked(event.target, "newGroup"),
        } });
        event.target.reset();
        setOutput("addUserOutput", okBanner(u.email + " added. They can sign in now and should change the password in My account."));
        await loadPeople();
    });
}

async function submitAddGroup(event) {
    event.preventDefault();
    await runWithBusy(event.target, null, "Creating…", async () => {
        try {
            await api("/admin/groups", { method: "POST", json: { name: value("newGroupName"), description: value("newGroupDescription") } });
            event.target.reset();
            await loadPeople();
        } catch (err) {
            setOutput("addUserOutput", errorBanner(err));
        }
    });
}

// ---------- Admin: Document access ----------

const STATUSES = ["current", "superseded", "draft", "withdrawn"];

async function loadAccess() {
    try {
        await loadGroups();
        const data = await api("/documents");
        setOutput("accessOutput", '<table class="access"><tr><th>Document</th><th>Status</th><th>Readable by</th><th></th></tr>' +
            data.documents.map(d => '<tr data-doc="' + escapeHtml(d.doc_id) + '" data-status="' + escapeHtml(d.status) + '"><td><b>' +
                escapeHtml(d.title) + '</b><br><span class="muted">' + escapeHtml(d.doc_id) + " · " + d.chunks_in_index + " chunks</span></td>" +
                '<td><select name="status">' + STATUSES.map(s => "<option" + (d.status === s ? " selected" : "") + ">" + s + "</option>").join("") + "</select></td>" +
                '<td class="group-picker">' + groupPicker(d.allowed_groups, "acl") + "</td>" +
                '<td><button type="button" data-act="save-doc">Save</button></td></tr>').join("") +
            '</table><div id="accessMessage"></div>');
    } catch (err) {
        setOutput("accessOutput", errorBanner(err));
    }
}

async function clickAccess(event) {
    const button = event.target.closest("button[data-act=save-doc]");
    if (!button) return;
    const row = button.closest("tr");
    const body = { allowed_groups: checked(row, "acl") };
    const status = row.querySelector('select[name="status"]').value;
    if (status !== row.dataset.status) body.status = status;
    try {
        const r = await api("/admin/documents/" + encodeURIComponent(row.dataset.doc), { method: "PATCH", json: body });
        setOutput("accessMessage", okBanner(r.doc_id + ": readable by " + (r.allowed_groups.join(", ") || "nobody") +
            " (live now)" + (r.status_change ? "; status " + r.status + " " + r.status_change : "") + "."));
        row.dataset.status = r.status;
    } catch (err) {
        setOutput("accessMessage", errorBanner(err));
    }
}

// ---------- Admin: Audit ----------

async function loadAudit(event) {
    if (event) event.preventDefault();
    try {
        const rows = await api(withParams("/admin/audit", { limit: 200, action: value("auditAction") }));
        setOutput("auditOutput", "<table><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>Detail</th><th>IP</th></tr>" +
            rows.map(e => "<tr><td>" + when(e.at) + "</td><td>" + escapeHtml(e.actor) + "</td><td><code>" + escapeHtml(e.action) +
                "</code></td><td>" + escapeHtml(e.target || "") + '</td><td class="detail">' +
                escapeHtml(Object.keys(e.detail).length ? JSON.stringify(e.detail) : "") + "</td><td>" + escapeHtml(e.ip || "") +
                "</td></tr>").join("") + "</table>");
    } catch (err) {
        setOutput("auditOutput", errorBanner(err));
    }
}

// ---------- Tabs ----------

const LOADERS = { chat: loadThreads, documents: loadDocuments, sync: refreshSync, people: loadPeople, access: loadAccess, audit: loadAudit };

function showTab() {
    let name = location.hash.slice(1) || "chat";
    const link = document.querySelector('#tabs a[data-tab="' + name + '"]');
    if (!link || link.hidden) name = "chat";
    document.querySelectorAll("section").forEach(s => s.classList.toggle("active", s.dataset.panel === name));
    document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("active", a.dataset.tab === name));
    if (LOADERS[name]) LOADERS[name]();
    const firstInput = document.querySelector("section.active input[type=text]");
    if (firstInput) firstInput.focus();
}

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

// Keep the Sync tab live: the countdown moves and a new run shows up by itself.
setInterval(() => {
    if (document.querySelector('section[data-panel="sync"].active')) refreshSync();
}, 5000);

// ---------- Start ----------

document.getElementById("chatForm").addEventListener("submit", sendChat);
document.getElementById("newChat").addEventListener("click", newChat);
document.getElementById("threadList").addEventListener("click", e => {
    const li = e.target.closest("li[data-thread]");
    if (li) openThread(li.dataset.thread);
});
document.getElementById("queryForm").addEventListener("submit", submitQuery);
document.getElementById("searchForm").addEventListener("submit", submitSearch);
document.getElementById("passwordForm").addEventListener("submit", submitPassword);
document.getElementById("signOut").addEventListener("click", signOut);
document.getElementById("schedulerButtons").addEventListener("click", clickScheduler);
document.getElementById("runsOutput").addEventListener("click", e => {
    const row = e.target.closest("tr[data-run]");
    if (row) showRun(Number(row.dataset.run));
});
document.getElementById("peopleOutput").addEventListener("click", clickPeople);
document.getElementById("addUserForm").addEventListener("submit", submitAddUser);
document.getElementById("addGroupForm").addEventListener("submit", submitAddGroup);
document.getElementById("accessOutput").addEventListener("click", clickAccess);
document.getElementById("auditForm").addEventListener("submit", loadAudit);
window.addEventListener("hashchange", showTab);

wireSamples();
loadMe().then(() => { loadHealth(); showTab(); }).catch(() => { /* api() already redirected to /login */ });
