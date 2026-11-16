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

// ---------- Switch to (ACME_ROLE_SWITCHER=true only, local testing) ----------
// Not "Ask as": the server ends this session and starts a real one for
// the other person, then the page reloads as them. Every switch is in
// the audit log. Off on the server, GET /auth/switch says so and the
// menu stays hidden.

let switchable = [];    // GET /auth/switch: the accounts in this tenant

async function loadSwitcher() {
    try {
        const data = await api("/auth/switch");
        switchable = data.enabled ? data.accounts : [];
    } catch (err) { switchable = []; }
    document.getElementById("switchLabel").hidden = !switchable.length;
    if (!switchable.length) return;
    document.getElementById("switchTo").innerHTML = switchable.map(a =>
        '<option value="' + escapeHtml(a.email) + '"' + (a.email === me.email ? " selected" : "") + ">" +
        escapeHtml(a.display_name + (a.role === "admin" ? " (admin)" : "") + " · " + (a.groups.join(", ") || "no groups")) +
        "</option>").join("");
}

function canSwitchTo(email) { return switchable.some(a => a.email === email); }

async function switchTo(email) {
    if (!email || email === me.email) return;
    try {
        await api("/auth/switch", { method: "POST", json: { email } });
        location.reload();   // every tab, every cached result: start again as them
    } catch (err) {
        alert("Could not switch: " + err.message);
        document.getElementById("switchTo").value = me.email;
    }
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
        trace.map(escapeHtml).join("\n") + "</pre>";
}

function chunkRow(title, text, distance, link, found, matched) {
    let distanceHtml = "";
    if (distance !== undefined && distance !== null) {
        distanceHtml = distanceBar(distance, thresholds.no_result * 1.25, distanceLevel(distance)) +
            '<span class="dist">' + distance.toFixed(3) + "</span>";
    }
    const open = link && /^https?:/.test(link)
        ? '<p class="meta chunk-link"><a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">Open the source</a></p>' : "";
    // parent (Part 3): the small chunk that picked this section
    const picked = matched ? '<p class="meta">Matched by the small chunk: <em>' + escapeHtml(matched) + "</em></p>" : "";
    return '<details class="chunk"><summary><span class="name">' + escapeHtml(title) + "</span>" + foundBy(found) +
        distanceHtml + "</summary>" + picked + "<pre>" + escapeHtml(text) + "</pre>" + open + "</details>";
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
    if (step.node === "guardrails") detail = step.allowed ? (step.error ? " · not checked" : " · passed") : " · blocked by " + step.blocked_by;
    const span = document.createElement("span");
    span.className = "step done" + (step.node === "guardrails" && !step.allowed ? " blocked" : "");
    if (step.node === "guardrails") {
        span.title = step.error || (step.rails || []).map(r => r.rail + ": " + (r.model_reply || "?")).join("\n");
    }
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
    const g = data.guardrails;
    if (g && g.checked && !g.allowed) {
        return '<div class="banner banner-error"><b>Blocked by the guardrails (' + escapeHtml(g.blocked_by) + ").</b> " +
            escapeHtml(data.answer) + "</div>" + guardRailsTable(g) + asked;
    }
    const guardNote = !g || !g.enabled ? "" : g.checked
        ? '<p class="meta">Guardrails passed: ' + escapeHtml(g.rails.map(r => r.rail).join(", ")) + " · " + g.ms + " ms</p>"
        : '<p class="meta">Guardrails not checked, let through: ' + escapeHtml(g.error || "") + "</p>";
    if (data.no_result) {
        return '<div class="banner banner-none"><b>Nothing you may read answers this.</b> ' + escapeHtml(data.answer) + "</div>" + guardNote + asked;
    }
    let html = guardNote;
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
        const rows = data.results.map((r, i) => chunkRow("#" + (i + 1) + "  " + provenance(r), r.text, r.distance, r.source_url, r.found_by, r.matched)).join("");
        setOutput("searchOutput", '<div class="card"><h3>' + data.total_results + " closest chunks " + asked + "</h3>" + rows +
            traceBlock(data.strategy, data.trace, data.ms) +
            '<p class="meta">Green ≤ ' + thresholds.high + ", amber ≤ " + thresholds.low + ", red ≤ " + thresholds.no_result +
            ", grey = no result.</p></div>");
    });
}

// ---------- Part 3 examples: the slides' questions, compared side by side ----------
// "Compare" runs every strategy of a row in place: GET /search (what came back, how, how fast)
// and POST /query (the answer), as you, then checks each answer against the facts a person
// wrote down, the way answers.py does (no LLM judge):
//   correct           every fact is in the answer (or, when nothing answers it: it says so)
//   retrieval miss    wrong, and the context never held what the answer needs
//   generation miss   wrong, although the context held it
//   made it up        nothing answers it, and it answered anyway
// Checked on 16 Nov against Monday's documents, local MiniLM and gpt-4.1-mini
// (instructor-notes/fallbacks/part3/ui-examples.txt). Answers are not cached: wording can change.

const EXAMPLE_USER = "intern@acme.test";
const REMOTE = ["Maria Garcia", "Michael Brown", "Ahmed Hassan"];
const NEW_YORK = ["David Kim", "Lisa Wang", "Rachel Adams"];
const SAN_FRANCISCO = ["Sarah Chen", "James Wilson", "Emily Johnson", "Robert Taylor", "Jennifer Lee", "Tom Martinez"];
const names = list => list.map(n => [n]);
const MARIA_TICKETS = ["IT-4101", "IT-4109", "IT-4122", "IT-4133"];
const OPEN_TICKETS = ["IT-4124", "IT-4133", "IT-4135", "IT-4137"];
const RESOLVED_TICKETS = ["IT-4101", "IT-4103", "IT-4107", "IT-4109", "IT-4112", "IT-4116", "IT-4120", "IT-4126", "IT-4128"];
const DISPUTED_TICKETS = ["IT-4114", "IT-4122", "IT-4131"];

const EXAMPLES = [
    { part: "A · The router", intro: "hybrid_rerank next to routed: the same search, with and without the router, so the route is the only difference. (The first row uses dense, as on the slide.) A list goes to the directory, every match, no k.", items: [
        { slide: "Why search can't list", q: "Who works remotely?", runs: ["dense", "routed"],
          rules: "aggregation, office = Remote (right)",
          answer: "Three people: Maria Garcia, Michael Brown and Ahmed Hassan.",
          facts: names(REMOTE), evidence: { words: REMOTE },
          why: "Search returns text about remote work: the policy says who MAY work remotely, not who does. The names are three rows of the directory, and only a lookup returns every matching row." },
        { slide: "Shapes: aggregation", q: "How many people are based in New York?", runs: ["hybrid_rerank", "routed"],
          rules: "aggregation, office = New York (right)",
          answer: "Three: David Kim, Lisa Wang and Rachel Adams.",
          facts: [["three", "3"]], evidence: { words: NEW_YORK },
          why: "\"How many\" is the same lookup, counted. Search can tie here only by luck: New York has exactly 3 people and k is 3. The next row has 6." },
        { slide: "Top-k is a budget", q: "Who works in the San Francisco office?", runs: ["hybrid_rerank", "routed"],
          rules: "aggregation, office = San Francisco (right)",
          answer: "Six people: Sarah Chen, James Wilson, Emily Johnson, Robert Taylor, Jennifer Lee and Tom Martinez.",
          facts: names(SAN_FRANCISCO), evidence: { words: SAN_FRANCISCO },
          why: "Six right answers, and top 3 can hold three of them, however good the ranking. The lookup ignores k and returns all six." },
        { slide: "Shapes: pointwise", q: "I'm locked out of my laptop. Who do I ring?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise (right)",
          answer: "The IT hotline, extension 4357: an account lockout counts as urgent.",
          facts: [["4357"]], evidence: { doc: "COMPANY-FAQ", words: ["4357"] },
          why: "\"Who\" doesn't make it a list: it wants one contact. The router keeps it pointwise, so routed runs exactly the hybrid_rerank search: the same answer, plus one model call for the route." },
        { slide: "The rules read words", q: "Show me all remote staff", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise: no who / list / how many, so the list is sent to search (the hybrid column)",
          answer: "Maria Garcia, Michael Brown and Ahmed Hassan.",
          facts: names(REMOTE), evidence: { words: REMOTE },
          why: "The rules look for words; this list has none of them. The model reads the meaning and routes it to the directory." },
        { slide: "The rules read words", q: "Which people in Engineering work from NYC?", runs: ["hybrid_rerank", "routed"],
          rules: "department = Engineering: every engineer (NYC isn't \"New York\" to a regex)",
          answer: "David Kim, Lisa Wang and Rachel Adams (all three New York people are in Engineering).",
          facts: names(NEW_YORK), evidence: { words: NEW_YORK },
          why: "Two filters: department and office. The model maps NYC to the menu's \"New York\"; code checks both values before the lookup runs. If search ties here, it's luck: the answer is exactly 3 people and k is 3." },
        { slide: "The rules read words", q: "Who do I talk to on the Engineering team about a deploy?", runs: ["hybrid_rerank", "routed"],
          rules: "department = Engineering: every engineer, instead of one contact",
          answer: "No named contact: engineers deploy their own changes, and the on-call engineer handles production incidents (Engineering Handbook).",
          facts: [["deploy their own"], ["on call"]], evidence: { doc: "ENG-HANDBOOK", words: ["deploy their own"] },
          why: "who + team + Engineering fooled the rules into a list. The model reads \"who do I talk to\" as one contact: pointwise." },
        { slide: "The rules read words", q: "Can anyone in the New York office expense a parking spot?", runs: ["hybrid_rerank", "routed"],
          rules: "office = New York: every New Yorker, for a policy question",
          answer: "Nothing in the documents covers parking: the answer should say so.",
          abstain: true,
          why: "A policy question that mentions an office. Pointwise is right; the answer step then has to admit the policy doesn't cover parking." },
        { slide: "The menu: NYC → New York", q: "Which engineers are based in NYC?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise: \"engineers\" and \"NYC\" match nothing in the rules' lists",
          answer: "David Kim, Lisa Wang and Rachel Adams: the Engineering department in New York.",
          facts: names(NEW_YORK), evidence: { words: NEW_YORK },
          why: "NYC isn't on the menu; New York is. On 16 Nov the lookup returned all three, and the model's answer dropped Rachel Adams (a Technical Writer): it read \"engineers\" as a job title. If you see that: a generation miss, the context was right." },
        { slide: "Step 3: not on the menu", q: "Who works in London?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise (no group word with a value it knows)",
          answer: "Nobody: Acme has no London office. The answer should say it has no information, not list people.",
          abstain: true,
          why: "London isn't on the menu, so the model doesn't write it; it calls the list unindexed on \"office\". Code knows office IS a column: search, never an empty list that reads \"nobody\", and nothing logged." },
        { slide: "Step 3: not even a column", q: "Who speaks Spanish?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise (\"speaks\" isn't a belonging word)",
          answer: "The directory doesn't record languages: the answer should say so.",
          abstain: true,
          why: "language isn't a column at all: aggregation_unindexed. Routed searches like hybrid and also writes the question to runs/router_misses.jsonl: the backlog of columns worth adding." },
        { slide: "Unindexed", q: "Who in the New York office has a parking permit?", runs: ["hybrid_rerank", "routed"],
          rules: "office = New York: a confident list of every New Yorker, none of it about permits",
          answer: "Nothing records parking permits: the answer should say so (and not list every New Yorker).",
          abstain: true,
          why: "The rules would answer with three wrong names. The model sees permits aren't a column: unindexed, searched, logged." },
        { slide: "R22: a column nobody stores", q: "Who joined the company this year?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise",
          answer: "The directory has no start dates: the answer should say so.",
          abstain: true,
          why: "Unindexed: no start date in the directory, so routed searches and logs it. (Before 16 Nov's prompt the model called this pointwise, its one miss of 23: the answer was the same, only the backlog line was lost, which is why route_eval.py counts it.)" },
    ] },
    { part: "A · The router: tickets", intro: "The helpdesk export is a second record set: 16 tickets, listable by reporter and by status (open, resolved or disputed: a fixed list in router.ROUTABLE). hybrid_rerank next to routed, top 3.", items: [
        { slide: "Tickets by reporter", q: "How many tickets did Maria Garcia open?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise: the rules only ever knew the directory",
          answer: "Four: IT-4101, IT-4109, IT-4122 and IT-4133.",
          facts: [["four", "4"]], evidence: { doc: "IT-HELPDESK-EXPORT", words: MARIA_TICKETS },
          why: "\"Open\" is a verb here: who reported them, not their status, so the plan filters on reporter only. Four tickets and k is 3: on 16 Nov hybrid_rerank returned three of them and answered \"three\". The lookup returns all four." },
        { slide: "Tickets by status", q: "How many tickets are still open?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise",
          answer: "Four: IT-4124, IT-4133, IT-4135 and IT-4137.",
          facts: [["four", "4"]], evidence: { doc: "IT-HELPDESK-EXPORT", words: OPEN_TICKETS },
          why: "Here \"open\" is the status. The menu offers status: open, resolved, disputed, and the lookup is fields->>'status' = 'open'. On 16 Nov search's top 3 held two open tickets and a disputed one, and the answer said \"two\"." },
        { slide: "Tickets by status", q: "How many tickets have been resolved?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise",
          answer: "Nine: IT-4101, IT-4103, IT-4107, IT-4109, IT-4112, IT-4116, IT-4120, IT-4126 and IT-4128.",
          facts: [["nine", "9"]], evidence: { doc: "IT-HELPDESK-EXPORT", words: RESOLVED_TICKETS },
          why: "Nine right answers, and top 3 can hold three. Search counts what it was handed (\"all three tickets shown\"); the lookup hands over all nine." },
        { slide: "Tickets by status", q: "How many tickets are disputed?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise",
          answer: "Three: IT-4114, IT-4122 and IT-4131.",
          facts: [["three", "3"]], evidence: { doc: "IT-HELPDESK-EXPORT", words: DISPUTED_TICKETS },
          why: "Search ties here by luck: exactly three disputed tickets, and k is 3. The same question with a fourth disputed ticket would come back one short, and nothing in the answer would say so." },
        { slide: "Two filters", q: "Which of Maria Garcia's tickets are still open?", runs: ["hybrid_rerank", "routed"],
          rules: "pointwise",
          answer: "One: IT-4133, keys sticking on the company laptop keyboard.",
          facts: [["IT-4133"]], evidence: { doc: "IT-HELPDESK-EXPORT", words: ["IT-4133"] },
          why: "Reporter AND status: both must match, as office and department do for the directory. Search can get this right (one answer, inside k); the lookup gets it right by construction." },
    ] },
    { part: "B · The evals", intro: "The same question through different searches. Green rows hold what the answer needs.", items: [
        { slide: "Scoring one question (S09)", q: "How many reviewers does a change to the billing code need?", runs: ["dense", "keyword", "hybrid"], topK: 5,
          answer: "Two: changes that touch billing or authentication need two reviewers (Engineering Handbook).",
          facts: [["two", "2"]], evidence: { doc: "ENG-HANDBOOK", words: ["two reviewers"] },
          why: "\"Billing\" and \"reviewers\" are rare words: keyword finds the handbook first. Dense finds the coding standards' \"at least one reviewer\", close in meaning and wrong for billing code: a faithful, wrong answer." },
        { slide: "doc@5 yes, Hit@5 no (S13)", q: "What do I need to do in my first week?", runs: ["dense", "keyword"], topK: 5,
          answer: "Collect your laptop and badge (IT desk, Floor 2), set up email and Slack, do the security awareness training, a 1-on-1 with your manager about your 30-day goals, and join #general, #engineering and your team's channels.",
          facts: [["badge"], ["security awareness"], ["30 day", "first 30"], ["slack"]],
          evidence: { doc: "HR-ONBOARDING", words: ["laptop and access badge", "security awareness training", "first 30-day goals", "#general"] },
          why: "Keyword matches \"first\" and \"week\" in the wrong places: the checklist's Week 3 (\"First Contributions\") and the engineering guide. The right document came back, the wrong piece of it." },
        { slide: "Leaks: 0 (S26)", q: "What is the salary range for a senior developer?", runs: ["dense", "hybrid"],
          answer: "For the intern, nothing: the salary bands are for HR and managers only, and nothing may leak.",
          abstain: true, forbidden: "HR-SALARY-BANDS-2026",
          why: "The bands exist, but the intern may not read them: no technique may return them, and the answer must say it doesn't know. Sign in as hr-partner to see the same question answered." },
    ] },
    { part: "C · Correct, not only faithful", intro: "Answers checked against the facts, not against their context.", items: [
        { slide: "Faithful, and wrong (S20)", q: "How many days of unused vacation can I carry over now?", runs: ["dense", "hybrid"],
          answer: "Up to 10 days (the Leave Policy as edited on 2 November; the FAQ still says 5).",
          facts: [["10 days", "ten days"]], evidence: { doc: "HR-LEAVE", words: ["maximum of 10 days"] },
          why: "Every search ranks the stale FAQ (\"up to 5 days\") first. If the answer says 10, it's the prompt's rule (when sources disagree, use the later effective date) that saved it, not the search. If it says 5: faithful, and wrong." },
        { slide: "Sure of itself (S27)", q: "How many weeks of parental leave will primary caregivers get in 2027?", runs: ["dense", "hybrid"], as: "hr-partner@acme.test",
          answer: "Nothing in force covers 2027 (only a draft, never indexed). Today's policy gives 16 weeks; the answer should say that's today's.",
          check: text => /(don.t|do not|no) (have )?information|not (yet )?(specif|state|mention|cover)|current(ly)?|today/i.test(text) && !/in 2027\W*$|will receive 16 weeks of paid parental leave in 2027/i.test(text),
          why: "Today's policy is very close to the question, so every search is \"sure of itself\" (0.50). A distance can say \"about this topic\", never \"answers this question\": the answer step has to notice 2027." },
    ] },
];

const VERDICT_BADGE = { "correct": "badge-high", "generation miss": "badge-medium", "retrieval miss": "badge-low", "made it up": "badge-low", "leak": "badge-low", "error": "badge-none" };
const VERDICT_RANK = { "correct": 0, "generation miss": 1, "retrieval miss": 2, "made it up": 2, "error": 3, "leak": 4 };
const ABSTAINS = /don.t have information|do not have information|no information/i;
const exampleRuns = {};   // "g-i" -> [{strategy, search, query, ms, verdict, ...}]

function normWords(text) { return " " + ((text || "").toLowerCase().match(/[a-z0-9$%]+/g) || []).join(" ") + " "; }
function hasWords(text, words) { return normWords(text).includes(normWords(words)); }

// What one strategy did for one example, judged like answers.py.
function judge(ex, search, query) {
    const results = search.results;
    const pool = results.filter(r => !ex.evidence || !ex.evidence.doc || r.doc_id === ex.evidence.doc);
    const context = pool.map(r => r.text).join("\n");
    const words = ex.evidence ? ex.evidence.words : [];
    const held = words.filter(w => hasWords(context, w));
    const holding = new Set(results.filter(r => words.some(w => hasWords(r.text, w)) &&
        (!ex.evidence || !ex.evidence.doc || r.doc_id === ex.evidence.doc)).map((r, i) => r.chunk_index + "|" + r.doc_id));
    const leaked = ex.forbidden && results.some(r => r.doc_id === ex.forbidden);
    let verdict;
    const answer = query.answer || "";
    if (leaked) verdict = "leak";
    else if (ex.check) verdict = ex.check(answer) ? "correct" : "made it up";
    else if (ex.abstain) verdict = query.no_result || ABSTAINS.test(answer) ? "correct" : "made it up";
    else if (ex.facts.every(alts => alts.some(f => hasWords(answer, f)))) verdict = "correct";
    else verdict = words.length && held.length === words.length ? "generation miss" : "retrieval miss";
    const routerCall = (search.trace || []).some(t => /decided by the model/.test(t)) ? 1 : 0;
    return { verdict, held: held.length, needed: words.length, holding, leaked, routerCall,
             answerCall: query.no_result || !query.llm_available ? 0 : 1 };
}

function winnerLine(ex, runs) {
    const ok = runs.filter(r => r.verdict);
    if (!ok.length) return "";
    const best = Math.min(...ok.map(r => VERDICT_RANK[r.verdict]));
    const top = ok.filter(r => VERDICT_RANK[r.verdict] === best);
    const losers = ok.filter(r => !top.includes(r)).map(r => escapeHtml(r.strategy) + ": " + escapeHtml(r.verdict)).join("; ");
    if (best > 0) return "<b>No winner:</b> no strategy answered correctly (" +
        ok.map(r => escapeHtml(r.strategy) + ": " + escapeHtml(r.verdict)).join("; ") + "). Compare each answer with the right answer above.";
    if (top.length === ok.length && ok.length > 1) {
        const cheap = top.slice().sort((a, b) => (a.routerCall - b.routerCall) || (a.search.ms - b.search.ms))[0];
        return "<b>A tie on the answer:</b> every strategy is correct, so cost decides: <b>" + escapeHtml(cheap.strategy) + "</b> is cheaper (" +
            (cheap.routerCall ? "1 router call" : "no router call") + ", " + Math.round(cheap.search.ms) + " ms to retrieve).";
    }
    const names = top.map(r => escapeHtml(r.strategy));
    return "<b>Winner: " + names.join(" and ") + "</b>. " + (names.length > 1 ? "Both answer" : "The only one to answer") +
        " correctly. " + losers + ".";
}

function resultRow(r, i, run) {
    const lookup = (r.found_by || []).includes("records");
    const level = !lookup && r.distance != null ? distanceLevel(r.distance) : "none";
    const holds = run.holding.has(r.chunk_index + "|" + r.doc_id);
    const leak = run.leaked && r.doc_id === run.forbidden;
    const how = (r.found_by || []).includes("records") ? "lookup" : (r.distance != null ? r.distance.toFixed(2) : "");
    const where = r.doc_id + (r.section ? " · " + r.section : "");
    const preview = r.text.replace(/\s+/g, " ").slice(0, 200);
    return '<details class="cmp-row' + (holds ? " holds" : "") + (leak ? " leak" : "") + '"><summary><span class="cmp-rank">#' + (i + 1) +
        '</span><span class="cmp-where">' + escapeHtml(where) + '</span><span class="cmp-dist dist-' + level + '">' + escapeHtml(how) +
        "</span></summary><p>" + escapeHtml(preview) + (r.text.length > 200 ? "…" : "") + "</p></details>";
}

function columnHtml(ex, run, isWinner) {
    if (run.error) return '<div class="cmp-col"><div class="cmp-head"><code>' + escapeHtml(run.strategy) + "</code></div>" + errorBanner(run.error) + "</div>";
    if (!run.search) return '<div class="cmp-col"><div class="cmp-head"><code>' + escapeHtml(run.strategy) + '</code></div><p class="muted">Running…</p></div>';
    const s = run.search, q = run.query;
    const route = (s.trace || []).filter(t => /^(route|router)/.test(t));
    const steps = (s.trace || []).filter(t => !/^(route|router)/.test(t));
    const need = run.needed ? '<p class="cmp-need ' + (run.held === run.needed ? "ok" : "bad") + '">Context holds what the answer needs: <b>' +
        run.held + " of " + run.needed + "</b></p>" : "";
    return '<div class="cmp-col' + (isWinner ? " winner" : "") + '"><div class="cmp-head"><code>' + escapeHtml(run.strategy) + "</code>" +
        (isWinner ? '<span class="badge badge-high">wins</span>' : "") +
        '<span class="badge ' + VERDICT_BADGE[run.verdict] + '">' + escapeHtml(run.verdict) + "</span></div>" +
        (route.length ? '<pre class="cmp-trace">' + route.map(escapeHtml).join("\n") + "</pre>" : "") +
        '<p class="cmp-label">Retrieved: ' + s.total_results + (route.some(t => /aggregation on/.test(t)) ? " (every match, no k)" : " (top " + (ex.topK || 3) + ")") + "</p>" +
        (s.results.length ? s.results.map((r, i) => resultRow(r, i, { ...run, forbidden: ex.forbidden })).join("") : '<p class="muted">nothing</p>') +
        need +
        '<p class="cmp-label">Answer ' + (q.no_result ? '<span class="badge badge-none">no result: no model call</span>'
            : route.some(t => /aggregation on/.test(t)) ? '<span class="badge badge-none">from a lookup: no distance to judge</span>'
            : badge(q.confidence)) + "</p>" +
        '<div class="cmp-answer">' + escapeHtml(q.answer) + "</div>" +
        '<p class="meta">' + escapeHtml(steps.join(" · ") || "") + (steps.length ? "<br>" : "") + "retrieve " + Math.round(s.ms) + " ms · total " +
        (run.ms / 1000).toFixed(1) + " s · model calls: " + (run.routerCall ? "1 router + " : "") + run.answerCall + " answer</p></div>";
}

function renderCompare(id) {
    const [g, i] = id.split("-").map(Number);
    const ex = EXAMPLES[g].items[i];
    const runs = exampleRuns[id];
    const box = document.getElementById("cmp-" + id);
    if (!runs) { box.innerHTML = ""; return; }
    const done = runs.every(r => r.verdict || r.error);
    const best = done ? Math.min(...runs.filter(r => r.verdict).map(r => VERDICT_RANK[r.verdict])) : -1;
    const winners = runs.filter(r => r.verdict && VERDICT_RANK[r.verdict] === best && best === 0);
    const tie = winners.length === runs.length && runs.length > 1;
    const meantFor = ex.as || EXAMPLE_USER;
    box.innerHTML = (me && me.email !== meantFor ? '<div class="banner banner-low">You are signed in as ' + escapeHtml(me.email) +
            "; this example is meant for " + escapeHtml(meantFor) + ". Your results can differ." + switchButton(meantFor) + "</div>" : "") +
        '<div class="cmp-grid">' + runs.map(r => columnHtml(ex, r, !tie && winners.includes(r))).join("") + "</div>" +
        (done ? '<div class="cmp-verdict">' + winnerLine(ex, runs) + '<p class="cmp-why"><b>Why:</b> ' + escapeHtml(ex.why) + "</p></div>" : "");
}

async function runExample(id) {
    const [g, i] = id.split("-").map(Number);
    const ex = EXAMPLES[g].items[i];
    const k = ex.topK || 3;
    exampleRuns[id] = ex.runs.map(strategy => ({ strategy }));
    renderCompare(id);
    await Promise.all(exampleRuns[id].map(async run => {
        const start = performance.now();
        try {
            const [search, query] = await Promise.all([
                api(withParams("/search", { q: ex.q, top_k: k, strategy: run.strategy })),
                api(withParams("/query", { top_k: k, strategy: run.strategy, doc_filter: "off", prompt_style: "default" }),
                    { method: "POST", json: { question: ex.q } }),
            ]);
            Object.assign(run, { search, query, ms: performance.now() - start }, judge(ex, search, query));
        } catch (err) {
            run.error = err;
        }
        renderCompare(id);
    }));
}

function renderExamples() {
    if (document.querySelector("#examplesOutput .example")) return;   // keep results when you come back to the tab
    const html = '<div class="examples-bar"><button type="button" id="runAllExamples">Compare every example</button>' +
        '<span class="muted">One click per row below. Each runs every strategy side by side: retrieval, the answer, and a verdict against the right answer.</span></div>' +
        EXAMPLES.map((group, g) => '<div class="card"><h3>' + escapeHtml(group.part) + '</h3><p class="muted example-intro">' + escapeHtml(group.intro) + "</p>" +
        group.items.map((ex, i) => {
            const id = g + "-" + i;
            const meantFor = ex.as || EXAMPLE_USER;
            const other = me && me.email !== meantFor ? ' <span class="chip bad">meant for ' + escapeHtml(meantFor) + "</span>" + switchButton(meantFor) : "";
            return '<div class="example" id="ex-' + id + '"><div><div class="example-slide">' + escapeHtml(ex.slide) + other + "</div>" +
                '<div class="example-q">' + escapeHtml(ex.q) + '</div></div><div class="example-runs"><button type="button" data-example="' + id + '">Compare ' +
                ex.runs.map(escapeHtml).join(" · ") + (ex.topK ? " · top " + ex.topK : "") + "</button></div>" +
                '<p class="example-answer"><b>The right answer:</b> ' + escapeHtml(ex.answer) + "</p>" +
                (ex.rules ? '<p class="example-look"><b>The rules (version 1) would say:</b> ' + escapeHtml(ex.rules) + "</p>" : "") +
                '<div class="cmp" id="cmp-' + id + '"></div></div>';
        }).join("") + "</div>").join("");
    setOutput("examplesOutput", html);
}

function switchButton(email) {
    return canSwitchTo(email) ? ' <button type="button" class="secondary switch-now" data-switch="' + escapeHtml(email) +
        '">Switch to ' + escapeHtml(email.split("@")[0]) + "</button>" : "";
}

async function clickExample(event) {
    const switcher = event.target.closest("button[data-switch]");
    if (switcher) { switcher.disabled = true; await switchTo(switcher.dataset.switch); return; }
    if (event.target.id === "runAllExamples") {
        event.target.disabled = true;
        for (const el of document.querySelectorAll("#examplesOutput button[data-example]")) await runExample(el.dataset.example);
        event.target.disabled = false;
        return;
    }
    const button = event.target.closest("button[data-example]");
    if (!button) return;
    button.disabled = true;
    try { await runExample(button.dataset.example); } finally { button.disabled = false; button.textContent = button.textContent.replace(/^Compare/, "Run again:"); }
}

// ---------- Part 3 evals: the scripts' last saved runs (admins) ----------
// Read-only: GET /evals/* returns what scoreboard.py, route_eval.py and
// answers.py saved in runs/. Nothing here runs an eval.
//
// The page leads with four numbers, RAGAS's names: two grade the search
// (context recall, context precision), two grade the answer
// (faithfulness, answer correctness). Everything finer is under
// "More detail", closed.

const SCRIPTS = "checkpoints/03-retrieval/";

const METRICS = [
    { key: "recall", name: "Context recall", side: "search", q: "Did search bring everything the answer needs?",
      how: "The share of the answer key's needs that the top 5 holds. 1.00 = everything arrived." },
    { key: "precision", name: "Context precision", side: "search", q: "Was the useful material near the top?",
      how: "Useful chunk at #1 = 1.00, first useful at #2 = 0.50, nothing useful = 0. (RAGAS: precision averaged over the useful ranks.)" },
    { key: "faithfulness", name: "Faithfulness", side: "answer", q: "Does the answer stick to what it was given?",
      how: "An LLM judge splits the answer into claims and checks each against the context: supported claims / all claims." },
    { key: "correctness", name: "Answer correctness", side: "answer", q: "Is the answer actually right?",
      how: "The share of answers that hold every fact a person wrote down (or say \"I don't know\" when nothing answers). No judge." },
];

// Hover help on the detail tables' column headers.
const COL_HELP = {
    "recall": METRICS[0].how, "precision": METRICS[1].how,
    "Hit@1": "The first result alone holds everything the answer needs.",
    "Hit@5": "Everything the answer needs is somewhere in the top 5 (recall = 1.00).",
    "MRR": "1 / the position where the needs are complete: 1st = 1.0, 2nd = 0.5, never = 0.",
    "doc@5": "The right document is in the top 5, whatever piece of it came back.",
    "calm": "For questions nothing answers: the best result is NOT high confidence, so the answer step is warned. Higher is better.",
    "LLM/q": "Model calls the technique makes before searching, per question.",
    "ms/q": "Median search time per question, in milliseconds.",
    "Leaks": "Questions where a result came from a document this person may not read. Must be 0.",
};

function th(label, extra = "") {
    return COL_HELP[label] ? '<th class="has-help' + extra + '" title="' + escapeHtml(COL_HELP[label]) + '">' + label + "</th>" : "<th>" + label + "</th>";
}

function stampText(s) {
    return s && /^\d{8}-\d{6}$/.test(s) ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) + " " + s.slice(9, 11) + ":" + s.slice(11, 13) : (s || "?");
}

function num(v, digits = 2) { return v == null ? "–" : typeof v === "number" ? v.toFixed(digits) : escapeHtml(v); }
function sayThis(text) { return '<div class="say-this"><span>Say this</span>' + escapeHtml(text) + "</div>"; }
function howToRead(html) { return '<details class="explain how-to"><summary>How to read this</summary>' + html + "</details>"; }
function failedCard(title, err) { return '<div class="card"><h3>' + escapeHtml(title) + "</h3>" + errorBanner(err) + "</div>"; }
function runCommand(command) { return "<code>python " + escapeHtml(SCRIPTS + command) + "</code>"; }

// ---- 1. The four numbers ----

function overviewHtml(board, answers) {
    const title = "1 · The four numbers";
    if (!board && !answers) {
        return '<div class="card"><h3>' + title + '</h3><p class="muted">No saved runs yet. In a terminal: ' + runCommand("scoreboard.py --llm") +
            " (search, no model needed) and " + runCommand("answers.py --strategies dense,hybrid,parent") + " (answers), then Refresh.</p></div>";
    }
    const names = board ? board.techniques : Object.keys(answers.scores);
    const value = (n, key) => key === "recall" || key === "precision"
        ? (board && board.all_answerable[n] ? board.all_answerable[n][key] : null)
        : (answers && answers.scores[n] ? answers.scores[n][key] : null);
    const best = Object.fromEntries(METRICS.map(m => [m.key, Math.max(...names.map(n => value(n, m.key) ?? -1))]));
    const head = '<tr><th rowspan="2">Technique</th><th colspan="2" class="grp grp-search">Search</th><th colspan="2" class="grp grp-answer">Answer</th></tr><tr>' +
        METRICS.map(m => '<th class="has-help" title="' + escapeHtml(m.q + " " + m.how) + '">' + m.name + "</th>").join("") + "</tr>";
    const rows = names.map(n => "<tr><td><code>" + escapeHtml(n) + "</code></td>" + METRICS.map(m => {
        const v = value(n, m.key);
        return '<td class="num' + (v != null && v === best[m.key] ? " best" : "") + '">' + num(v) + "</td>";
    }).join("") + "</tr>").join("");
    const missing = !answers ? "Answer columns: run " + runCommand("answers.py --strategies dense,hybrid,parent") + ", then Refresh."
        : !answers.judged ? "Faithfulness: the last answers run skipped the judge (--no-judge)."
        : "– in the answer columns: that technique wasn't in the last answers run (" + escapeHtml(Object.keys(answers.scores).join(", ")) + ").";
    const leaks = board ? (board.leaks
        ? errorBanner(new Error(board.leaks + " question(s) put a document in front of someone who may not read it. A leak disqualifies a technique, whatever its numbers."))
        : '<p class="leak-ok"><span class="badge badge-high">0 leaks</span> No technique showed anyone a document they may not read. Better search never means more access.</p>') : "";
    return '<div class="card"><h3>' + title + "</h3>" +
        '<p class="meta">Over every question that has an answer' + (board ? " · search run " + escapeHtml(stampText(board.saved)) + ", " + board.questions.length + " questions, top " + board.top_k : "") +
        (answers ? " · answers by " + escapeHtml(answers.model || "?") : "") + "</p>" +
        '<div class="scroll-x"><table class="four">' + head + rows + "</table></div>" +
        '<p class="meta">Green: the best in its column. Hover a column for what it means. ' + missing + "</p>" + leaks +
        faithfulButWrong(answers) +
        sayThis("Search first: did it bring the facts, and near the top? Then the answer: did it stick to them, and is it right? " +
            "If recall is low, don't touch the prompt yet: no prompt can use facts that never arrived.") +
        howToRead(METRICS.map(m => '<p><b>' + m.name + "</b> " + escapeHtml(m.q) + ' <span class="muted">' + escapeHtml(m.how) + "</span></p>").join("") +
            '<h4>Work one out by hand</h4><p class="muted">Pick a question: each technique\'s top 5, the useful chunks in green, and the two search numbers.</p>' +
            '<div id="workedExample"></div>') + "</div>";
}

// The point of having both answer numbers: faithful, and still wrong.
function faithfulButWrong(answers) {
    if (!answers || !answers.judged) return "";
    const hits = [];
    for (const [n, rows] of Object.entries(answers.results)) {
        for (const r of rows) if (r.faithfulness === 1 && r.verdict !== "correct" && r.verdict !== "made it up") hits.push([n, r]);
    }
    if (!hits.length) return "";
    const [n, r] = hits.find(([, x]) => x.id === "S09") || hits.find(([, x]) => x.id === "S20") || hits[0];
    const q = answers.questions[r.id] || {};
    return '<div class="callout"><span>Faithful, and wrong</span><p><code>' + escapeHtml(r.id) + "</code> with <code>" + escapeHtml(n) + "</code>: " +
        escapeHtml(q.question) + "</p><p><b>Said:</b> " + escapeHtml(r.answer) + "</p><p><b>Right answer:</b> " + escapeHtml(q.expected) + "</p>" +
        '<p class="muted">Faithfulness 1.00: every claim is in its context. Correct: no. The context was the wrong one (a ' + escapeHtml(r.verdict) +
        "). That's why faithfulness alone can't grade a RAG system." + (hits.length > 1 ? " " + (hits.length - 1) + " more like it under More detail." : "") + "</p></div>";
}

// The worked example: one question, every technique's top 5, the arithmetic in words.
let lastBoard = null;

function precisionWords(useful) {
    const at = useful.map((u, i) => u ? i + 1 : 0).filter(Boolean);
    if (!at.length) return "nothing useful in the top 5 → precision 0";
    const parts = at.map((p, i) => (i + 1) + "/" + p);
    return "useful at #" + at.join(", #") + " → precision " + (at.length > 1 ? "(" + parts.join(" + ") + ") / " + at.length : parts[0]) +
        " = " + num(at.reduce((s, p, i) => s + (i + 1) / p, 0) / at.length);
}

function workedExampleHtml(board, id) {
    const q = board.questions.find(x => x.id === id) || board.questions[0];
    if (!q) return "";
    const picker = '<select id="workedQ">' + board.questions.map(x => '<option value="' + escapeHtml(x.id) + '"' + (x.id === q.id ? " selected" : "") + ">" +
        escapeHtml(x.id + " · " + x.scenario + " · " + x.question) + "</option>").join("") + "</select>";
    const needs = q.needs && q.needs.length
        ? "<p><b>The key says it needs:</b> " + q.needs.map(n => "<code>" + escapeHtml([].concat(n.doc).join(" or ")) + "</code> holding " +
            n.evidence.map(e => '"' + escapeHtml(e) + '"').join(" and ")).join("; plus ") + '. <span class="muted">Asked as ' + escapeHtml(q.user) + ".</span></p>"
        : '<p><b>The key says:</b> nothing this person may read answers it. There is nothing to recall; the right behaviour is to not look sure ' +
            '(calm: the best distance is above ' + thresholds.high + '). <span class="muted">Asked as ' + escapeHtml(q.user) + ".</span></p>";
    const rows = board.techniques.map(name => {
        const r = q.by[name];
        if (!r) return "";
        const useful = r.useful || (r.docs || []).map((_, i) => r.ready === i + 1);   // runs saved before "useful" existed
        const slots = [0, 1, 2, 3, 4].map(i => {
            const doc = (r.docs || [])[i];
            return '<span class="slot' + (r.answerable && useful[i] ? " ready" : "") + (doc ? "" : " empty") + '"><i>' + (i + 1) + "</i>" + escapeHtml(doc || "–") + "</span>";
        }).join("");
        const words = !r.answerable
            ? (r.calm ? "best distance " + num(r.best_distance) + ": calm, the answer step is warned (good)"
                      : "best distance " + num(r.best_distance) + ": looks sure of itself, the answer step isn't warned")
            : "recall " + Math.round((r.recall ?? (r.ready ? 1 : 0)) * q.needs.length) + " of " + q.needs.length + " need" + (q.needs.length > 1 ? "s" : "") +
              " = " + num(r.recall ?? (r.ready ? 1 : 0)) + " · " + precisionWords(useful);
        return '<div class="worked-row"><code>' + escapeHtml(name) + '</code><div class="slots">' + slots + '</div><span class="worked-words">' + escapeHtml(words) + "</span></div>";
    }).join("");
    return picker + needs + '<div class="worked">' + rows + '</div><p class="meta">Each box is a result\'s document, in rank order. Green = useful: ' +
        "from the right document AND holding the key's words. The same document can appear twice: two different pieces of it.</p>";
}

function renderWorked(id) {
    const box = document.getElementById("workedExample");
    if (box && lastBoard) box.innerHTML = workedExampleHtml(lastBoard, id);
}

// ---- 2. No technique wins everything ----

function winnersHtml(board) {
    const title = "2 · No technique wins everything";
    if (!board) return "";
    const rows = board.scenarios.map(sc => {
        const s = sc.winner ? sc.table[sc.winner] : null;
        const q = !s ? "" : sc.name === "unanswerable" ? "calm " + num(s.calm) : "recall " + num(s.recall) + " · precision " + num(s.precision);
        return "<tr><td><b>" + escapeHtml(sc.name) + '</b><br><span class="muted">' + escapeHtml(sc.about) + "</span></td><td><code>" +
            escapeHtml(sc.winner || "(none)") + '</code></td><td class="num">' + q + "</td></tr>";
    }).join("");
    return '<div class="card"><h3>' + title + '</h3><p class="muted">The same numbers, split by kind of question. The winner has the best recall, then precision; ties go to the cheaper technique.</p>' +
        '<div class="scroll-x"><table><tr><th>Kind of question</th><th>Winner</th><th>Its numbers</th></tr>' + rows + "</table></div>" +
        sayThis("One average crowns one technique. Split by kind of question, different techniques win. That's why the app routes, " +
            "and why you never choose a technique from a single number.") + "</div>";
}

// ---- 3. Also measured: the router ----

function routesHtml(r) {
    const title = "3 · Also measured: the router";
    if (r === null) return '<div class="card"><h3>' + title + '</h3><p class="muted">No saved run yet: ' + runCommand("route_eval.py") + ", then Refresh.</p></div>";
    if (r instanceof Error) return failedCard(title, r);
    const routers = Object.keys(r.summary);
    const stats = routers.map(m => {
        const s = r.summary[m];
        const misses = Object.entries(s.misses || {}).map(([k, n]) => n + " " + k).join(", ");
        return '<div class="stat"><b>' + s.right + "/" + s.total + "</b><span>" + escapeHtml(m) + " right" + (misses ? ": " + escapeHtml(misses) : "") + "</span></div>";
    }).join("");
    const rows = r.questions.map(q => "<tr><td><code>" + escapeHtml(q.id) + "</code></td><td>" + escapeHtml(q.question) +
        "</td><td><code>" + escapeHtml(q.expected) + "</code></td>" + routers.map(m => {
            const p = q.routers[m];
            return "<td>" + (p.ok ? '<span class="badge badge-high">ok</span>' : '<span class="badge badge-low">wrong</span> <code>' + escapeHtml(p.said) + "</code>") +
                (p.why ? '<br><span class="muted">' + escapeHtml(p.why) + "</span>" : "") + "</td>";
        }).join("") + "</tr>").join("");
    return '<div class="card"><h3>' + title + '</h3><p class="muted">Before searching, the router decides: a list for the directory ("who works remotely?") or a passage for search. ' +
        "Same exam idea: each question labelled with the right route first, then both versions graded.</p>" +
        (r.no_model ? '<div class="banner banner-low">No model answered in this run, so the model column is the rules\' fallback.</div>' : "") +
        '<div class="stats">' + stats + '</div><p class="meta">Run ' + escapeHtml(stampText(r.saved)) + (r.model ? " · model " + escapeHtml(r.model) : "") + "</p>" +
        '<details class="eval-details"><summary>Question by question</summary><div class="scroll-x"><table><tr><th>Id</th><th>Question</th><th>Expected</th>' +
        routers.map(m => "<th>" + escapeHtml(m) + "</th>").join("") + "</tr>" + rows + "</table></div></details></div>";
}

// ---- More detail (closed): everything the first three cards leave out ----

function scenarioTable(sc, board) {
    const calm = sc.name === "unanswerable";
    const cols = calm ? [["calm", "calm"]] : [["recall", "recall"], ["precision", "precision"], ["hit@1", "Hit@1"], ["hit@5", "Hit@5"], ["mrr", "MRR"], ["doc@5", "doc@5"]];
    const head = "<tr><th>Technique</th>" + cols.map(c => th(c[1])).join("") + th("LLM/q") + th("ms/q") + th("Leaks") + "</tr>";
    const rows = board.techniques.map(name => {
        const s = sc.table[name];
        if (!s) return "";
        const fell = board.fell_back.includes(name);
        const win = name === sc.winner;
        return '<tr class="' + (win ? "eval-win" : "") + '"><td><code>' + escapeHtml(name) + (fell ? "*" : "") + "</code>" +
            (win ? ' <span class="badge badge-high">wins</span>' : "") + "</td>" +
            cols.map(c => '<td class="num">' + num(s[c[0]]) + "</td>").join("") +
            '<td class="num">' + num(s.llm, 1) + '</td><td class="num">' + num(s.ms, 0) + '</td><td class="num">' +
            (s.leaks ? '<span class="badge badge-low">' + s.leaks + "</span>" : "0") + "</td></tr>";
    }).join("");
    return '<div class="eval-table"><h4>' + escapeHtml(sc.name) + ' <span class="muted">' + escapeHtml(sc.about) + " · " + sc.questions +
        " question" + (sc.questions === 1 ? "" : "s") + '</span></h4><div class="scroll-x"><table>' + head + rows + "</table></div></div>";
}

function questionCell(r) {
    if (!r) return '<td class="muted">–</td>';
    const flags = r.flags && r.flags.length ? ' <span class="badge badge-low">' + escapeHtml(r.flags.join(", ")) + "</span>" : "";
    const docs = ' title="Top 3: ' + escapeHtml((r.docs || []).slice(0, 3).map(d => d || "?").join(", ")) + '"';
    let label, level;
    if (!r.answerable) {
        [label, level] = r.calm ? ["calm", "high"] : ["sure of itself", "low"];
    } else {
        const recall = r.recall ?? (r.ready ? 1 : 0);
        [label, level] = ["recall " + num(recall) + " · prec " + num(r.precision), recall === 1 ? "high" : recall > 0 ? "medium" : "low"];
    }
    return "<td" + docs + '><span class="badge badge-' + level + '">' + escapeHtml(label) + "</span>" + flags + "</td>";
}

const KIND_LEVEL = { "correct": "high", "retrieval miss": "low", "generation miss": "medium", "made it up": "low" };

function detailHtml(board, answers) {
    const parts = [];
    if (board) {
        parts.push('<h4>Search, by kind of question</h4><p class="muted">Context recall and precision, then the finer numbers: Hit@1, Hit@5, MRR, doc@5. ' +
            "Hover a column for its meaning.</p>" +
            '<div class="eval-grid">' + board.scenarios.map(sc => scenarioTable(sc, board)).join("") + "</div>" +
            (board.fell_back.length ? '<p class="meta">* ' + escapeHtml(board.fell_back.join(", ")) +
                ": ran without a model or reranker and fell back to plain search, so those rows are another technique's numbers and can't win.</p>" : ""));
        parts.push('<h4>Search, question by question</h4><div class="scroll-x"><table><tr><th>Id</th><th>As</th><th>Question</th>' +
            board.techniques.map(n => "<th><code>" + escapeHtml(n) + "</code></th>").join("") + "</tr>" +
            board.questions.map(q => "<tr><td><code>" + escapeHtml(q.id) + '</code><br><span class="muted">' + escapeHtml(q.scenario) + "</span></td><td>" +
                escapeHtml(q.user) + "</td><td>" + escapeHtml(q.question) + "</td>" + board.techniques.map(n => questionCell(q.by[n])).join("") + "</tr>").join("") +
            '</table></div><p class="meta">Hover a cell for its top 3 documents.</p>');
    }
    if (answers) {
        const names = Object.keys(answers.results);
        parts.push('<h4>Answers: whose fault is a wrong one?</h4><div class="scroll-x"><table><tr><th>Technique</th>' +
            answers.kinds.map(k => "<th>" + escapeHtml(k) + "</th>").join("") + "</tr>" +
            names.map(n => "<tr><td><code>" + escapeHtml(n) + "</code></td>" + answers.kinds.map(k => {
                const v = answers.counts[n][k];
                return '<td class="num">' + (v && k !== "correct" ? '<span class="badge badge-' + KIND_LEVEL[k] + '">' + v + "</span>" : v) + "</td>";
            }).join("") + "</tr>").join("") + "</table></div>" +
            '<p class="muted eval-legend">Retrieval miss: the facts never reached the model, no prompt could fix it. Generation miss: they did, and the model still got it wrong. ' +
            "Made it up: nothing answers it, and it answered anyway.</p>" +
            names.map(n => {
                const wrong = answers.results[n].filter(r => r.verdict !== "correct");
                return wrong.length ? "<h4><code>" + escapeHtml(n) + "</code>: every answer that was not correct</h4>" + wrong.map(r => {
                    const q = answers.questions[r.id] || {};
                    return '<div class="eval-answer"><p><code>' + escapeHtml(r.id) + '</code> <span class="badge badge-' + KIND_LEVEL[r.verdict] + '">' +
                        escapeHtml(r.verdict) + "</span>" + (r.faithfulness != null ? ' <span class="badge badge-none">faithfulness ' + num(r.faithfulness) + "</span>" : "") +
                        " " + escapeHtml(q.question) + ' <span class="muted">as ' + escapeHtml(q.user) + "</span></p>" +
                        '<p class="muted"><b>Said:</b> ' + escapeHtml(r.answer) + '</p><p class="muted"><b>Right answer:</b> ' + escapeHtml(q.expected) + "</p></div>";
                }).join("") : "";
            }).join(""));
    }
    if (!parts.length) return "";
    return '<details class="card more"><summary>More detail: every kind of question, every question, every wrong answer</summary>' + parts.join("") + "</details>";
}

async function loadEvals(event) {
    if (event) event.preventDefault();
    const select = document.getElementById("evalsRun");
    let runs;
    try {
        runs = await api("/evals/runs");
    } catch (err) {
        setOutput("evalsOutput", errorBanner(err));
        return;
    }
    const wanted = select.value;
    select.innerHTML = runs.scoreboard.map((s, i) => '<option value="' + escapeHtml(s) + '">Search run ' + escapeHtml(stampText(s)) +
        (i === 0 ? " (latest)" : "") + "</option>").join("") +
        (runs.baseline ? '<option value="baseline">Baseline (' + escapeHtml(stampText(runs.baseline)) + ")</option>" : "");
    select.hidden = !select.options.length;
    if ([...select.options].some(o => o.value === wanted)) select.value = wanted;
    setOutput("evalsOutput", '<p class="loading">Loading the saved runs…</p>');
    const [board, routes, answers] = await Promise.all([
        runs.scoreboard.length || runs.baseline ? api(withParams("/evals/scoreboard", { run: select.value })).catch(e => e) : null,
        runs.routes ? api("/evals/routes").catch(e => e) : null,
        runs.answers ? api("/evals/answers").catch(e => e) : null,
    ]);
    const errors = [board, answers].filter(x => x instanceof Error);
    const b = board instanceof Error ? null : board, a = answers instanceof Error ? null : answers;
    lastBoard = b;
    setOutput("evalsOutput", errors.map(errorBanner).join("") + overviewHtml(b, a) + winnersHtml(b) + routesHtml(routes) + detailHtml(b, a));
    renderWorked("S09");   // the billing question: the slide's example
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

// ---------- Admin: Guardrails (NeMo Guardrails, input rails) ----------

let guard = null;   // GET /guardrails

function renderGuardrails() {
    document.getElementById("grEnabled").checked = guard.enabled;
    document.getElementById("grSelfCheck").checked = guard.self_check;
    document.getElementById("grTopicControl").checked = guard.topic_control;
    const rails = guard.active_rails.length ? guard.active_rails.join(" + ") : "no rail";
    setOutput("grStatus", guard.enabled
        ? '<div class="banner banner-high"><b>On.</b> Ask and Chat run ' + escapeHtml(rails) + " on every question (model " + escapeHtml(guard.model) + ").</div>"
        : '<div class="banner banner-none"><b>Off.</b> Questions go straight to retrieval. The test box below still works.</div>');
    if (guard.topic_control && !guard.topics.length) {
        document.getElementById("grStatus").insertAdjacentHTML("beforeend",
            '<div class="banner banner-low">Topic control is on but there are no topics: it is skipped until you add one.</div>');
    }
    setOutput("grTopics", guard.topics.length
        ? guard.topics.map((t, i) => "<li><span>" + escapeHtml(t) + '</span><button type="button" class="secondary" data-remove="' + i +
            '" title="Remove this topic">Remove</button></li>').join("")
        : '<li class="muted">No topics yet.</li>');
    document.getElementById("grConfig").textContent = guard.config_yaml;
}

async function loadGuardrails() {
    try {
        guard = await api("/guardrails");
        renderGuardrails();
    } catch (err) {
        setOutput("grStatus", errorBanner(err));
    }
}

async function saveGuardrails(change) {
    try {
        guard = await api("/guardrails", { method: "PUT", json: change });
        renderGuardrails();
    } catch (err) {
        setOutput("grStatus", errorBanner(err));
        loadGuardrails();
    }
}

async function submitTopic(event) {
    event.preventDefault();
    const input = document.getElementById("grNewTopic");
    const topic = input.value.trim();
    if (!topic) return;
    await saveGuardrails({ topics: [...guard.topics, topic] });
    input.value = "";
}

function clickTopics(event) {
    const button = event.target.closest("button[data-remove]");
    if (!button) return;
    const i = Number(button.dataset.remove);
    saveGuardrails({ topics: guard.topics.filter((_, j) => j !== i) });
}

function guardVerdict(g) {
    if (g.error && !g.checked) return '<div class="banner banner-low"><b>Not checked, let through:</b> ' + escapeHtml(g.error) + "</div>";
    if (g.allowed) return '<div class="banner banner-high"><b>Allowed.</b> Every rail passed it, in ' + g.ms + " ms.</div>";
    return '<div class="banner banner-error"><b>Blocked by ' + escapeHtml(g.blocked_by) + ".</b> The user would see: " + escapeHtml(g.answer) + "</div>";
}

function guardRailsTable(g) {
    if (!g.rails || !g.rails.length) return "";
    return '<table class="checks"><tr><th>Rail</th><th>Verdict</th><th>Model reply</th><th>ms</th></tr>' +
        g.rails.map(r => "<tr><td><b>" + escapeHtml(r.rail) + "</b></td><td>" +
            (r.blocked ? '<span class="badge badge-low">blocked</span>' : '<span class="badge badge-high">passed</span>') +
            "</td><td><code>" + escapeHtml(r.model_reply || "–") + '</code></td><td class="num">' + r.ms + "</td></tr>").join("") + "</table>";
}

async function submitGuardTest(event) {
    event.preventDefault();
    const earlier = value("grTestHistory");
    await runWithBusy(event.target, "grTestOutput", "Checking…", async () => {
        const g = await api("/guardrails/check", { method: "POST", json: { message: value("grTestInput"), history: earlier ? [earlier] : [] } });
        setOutput("grTestOutput", guardVerdict(g) + guardRailsTable(g));
    });
}

// ---------- Tabs ----------

const LOADERS = { chat: loadThreads, examples: renderExamples, evals: () => loadEvals(), documents: loadDocuments, sync: refreshSync, people: loadPeople, access: loadAccess, audit: loadAudit, guardrails: loadGuardrails };

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

// "How routing works": pick a worked example; "Run it" sends it to Search as `routed`.
function wireRoutingExplainer() {
    const panel = document.querySelector('section[data-panel="routing"]');
    if (!panel) return;
    panel.addEventListener("click", event => {
        const pick = event.target.closest("#routeExPicker button[data-ex]");
        if (pick) {
            panel.querySelectorAll("#routeExPicker button").forEach(b => b.classList.toggle("active", b === pick));
            panel.querySelectorAll("div.ex[data-ex]").forEach(d => { d.hidden = d.dataset.ex !== pick.dataset.ex; });
            return;
        }
        const tryIt = event.target.closest("button[data-try]");
        if (tryIt) {
            document.getElementById("searchQuery").value = tryIt.dataset.try;
            document.getElementById("searchStrategy").value = "routed";
            location.hash = "#search";
            document.getElementById("searchForm").requestSubmit();
        }
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
document.getElementById("examplesOutput").addEventListener("click", clickExample);
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
document.getElementById("evalsForm").addEventListener("submit", loadEvals);
document.getElementById("evalsRun").addEventListener("change", () => loadEvals());
document.getElementById("evalsOutput").addEventListener("change", e => { if (e.target.id === "workedQ") renderWorked(e.target.value); });
document.getElementById("switchTo").addEventListener("change", e => switchTo(e.target.value));
document.getElementById("grEnabled").addEventListener("change", e => saveGuardrails({ enabled: e.target.checked }));
document.getElementById("grSelfCheck").addEventListener("change", e => saveGuardrails({ self_check: e.target.checked }));
document.getElementById("grTopicControl").addEventListener("change", e => saveGuardrails({ topic_control: e.target.checked }));
document.getElementById("grTopicForm").addEventListener("submit", submitTopic);
document.getElementById("grTopics").addEventListener("click", clickTopics);
document.getElementById("grTestForm").addEventListener("submit", submitGuardTest);
window.addEventListener("hashchange", showTab);

wireSamples();
wireRoutingExplainer();
loadMe().then(loadSwitcher).then(() => { loadHealth(); showTab(); }).catch(() => { /* api() already redirected to /login */ });
