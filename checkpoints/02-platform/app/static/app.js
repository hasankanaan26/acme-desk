// ============================================================
// Acme Desk, Part 2 — vanilla JS, one small function per job
// ============================================================
// Same pattern as Part 1: read the form, call the endpoint with
// api(), render the JSON. Two things are new:
//   - api() sends X-Acme-Request: 1 on every write (the CSRF guard)
//     and sends you to /login on a 401
//   - there is no "Ask as": the server knows who you are from the
//     session cookie, which this script cannot even read (HttpOnly)
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

function chunkRow(title, text, distance, link) {
    let distanceHtml = "";
    if (distance !== undefined && distance !== null) {
        distanceHtml = distanceBar(distance, thresholds.no_result * 1.25, distanceLevel(distance)) +
            '<span class="dist">' + distance.toFixed(3) + "</span>";
    }
    const open = link && /^https?:/.test(link)
        ? '<p class="meta chunk-link"><a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">Open the source</a></p>' : "";
    return '<details class="chunk"><summary><span class="name">' + escapeHtml(title) + "</span>" +
        distanceHtml + "</summary><pre>" + escapeHtml(text) + "</pre>" + open + "</details>";
}

function sourcesList(sources) {
    return sources.map((src, i) => chunkRow("#" + (i + 1) + "  " + provenance(src), src.text, src.distance, src.source_url)).join("");
}

// ---------- Ask: POST /query ----------

async function submitQuery(event) {
    event.preventDefault();
    const url = withParams("/query", {
        as_of: value("asOf"), top_k: value("queryTopK"),
        prompt_style: value("queryPromptStyle"), doc_filter: value("queryDocFilter"),
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
        html += '<div class="card"><h3>Sources · ' + data.chunks_used + " chunks</h3>" + sourcesList(data.sources) + "</div>";
    }
    return html;
}

// ---------- Search: GET /search ----------

async function submitSearch(event) {
    event.preventDefault();
    const url = withParams("/search", { q: value("searchQuery"), top_k: value("searchTopK"), as_of: value("asOf") });
    await runWithBusy(event.target, "searchOutput", "Searching…", async () => {
        const data = await api(url);
        const asked = "as " + escapeHtml(data.user) + " (" + escapeHtml(data.groups.join(", ") || "no groups") + ")" +
            (data.as_of ? ", as of " + escapeHtml(data.as_of) : ", today");
        if (!data.results.length) {
            setOutput("searchOutput", '<div class="banner banner-none">Nothing you may read matches, ' + asked + ".</div>");
            return;
        }
        const rows = data.results.map((r, i) => chunkRow("#" + (i + 1) + "  " + provenance(r), r.text, r.distance, r.source_url)).join("");
        setOutput("searchOutput", '<div class="card"><h3>' + data.total_results + " closest chunks " + asked + "</h3>" + rows +
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
    const last = s.last_run
        ? "Last sync " + when(s.last_run) + " · " + s.last_seconds + "s · " + (summary.chunks_in_index ?? "?") + " chunks in the index"
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
}

let lastRunShown = null;

async function refreshSync() {
    try {
        renderScheduler(await api("/sync/status"));
        const runs = await api("/sync/runs?limit=15");
        setOutput("runsOutput", "<table><tr><th>#</th><th>Trigger</th><th>By</th><th>Started</th><th>Seconds</th><th>Result</th><th>Counts</th></tr>" +
            runs.map(r => '<tr data-run="' + r.id + '" class="clickable"><td>' + r.id + "</td><td>" + escapeHtml(r.trigger) + "</td><td>" +
                escapeHtml(r.requested_by || "") + "</td><td>" + when(r.started_at) + '</td><td class="num">' + (r.seconds ?? "") +
                "</td><td>" + runResult(r) + "</td><td>" + escapeHtml(Object.entries(r.counts || {}).map(([k, v]) => k + " " + v).join(", ")) +
                "</td></tr>").join("") + "</table>" + '<p class="meta">Click a run to see its plan.</p>');
        const latest = runs.find(r => r.finished_at && r.ok !== null);
        if (latest && latest.id !== lastRunShown) showRun(latest.id);
    } catch (err) {
        setOutput("syncOutput", errorBanner(err));
    }
}

function runResult(r) {
    if (!r.finished_at) return '<span class="badge badge-high">running</span>';
    if (r.skipped_reason) return '<span class="badge badge-none">skipped</span> ' + escapeHtml(r.skipped_reason);
    if (r.ok) return '<span class="badge badge-high">ok</span>';
    return '<span class="badge badge-low">failed</span> ' + escapeHtml(r.error || "");
}

async function showRun(id) {
    lastRunShown = id;
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
            (same ? '<p class="meta">' + same + " unchanged: same eTag, not even downloaded.</p>" : "") + warnings + "</div>");
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
    try {
        if (button.dataset.act === "save") {
            const body = { role: row.querySelector('select[name="role"]').value, groups: checked(row, "group") };
            const active = row.querySelector('input[name="active"]');
            if (!active.disabled) body.is_active = active.checked;
            const u = await api("/admin/users/" + id, { method: "PATCH", json: body });
            message(okBanner(name + " saved: " + u.role + ", groups " + (u.groups.join(", ") || "none") + ". Live on their next question."));
        } else if (button.dataset.act === "password") {
            const pw = prompt("New temporary password for " + name + " (at least 12 characters). Their sessions end.");
            if (!pw) return;
            await api("/admin/users/" + id, { method: "PATCH", json: { password: pw } });
            message(okBanner("Password reset for " + name + ". They are signed out everywhere."));
        } else if (button.dataset.act === "remove") {
            if (!confirm("Remove " + name + " from this tenant? Their sessions here end now.")) return;
            await api("/admin/users/" + id, { method: "DELETE" });
            await loadPeople();
            message(okBanner(name + " removed."));
            return;
        }
        await loadPeople();
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

const LOADERS = { documents: loadDocuments, sync: refreshSync, people: loadPeople, access: loadAccess, audit: loadAudit };

function showTab() {
    let name = location.hash.slice(1) || "query";
    const link = document.querySelector('#tabs a[data-tab="' + name + '"]');
    if (!link || link.hidden) name = "query";
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
