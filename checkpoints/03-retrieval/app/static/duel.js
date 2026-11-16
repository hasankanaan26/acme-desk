// ============================================================
// Side by side — two retrieval strategies, one question, same moment
// ============================================================
// Teaching flow for every example:
//   1. PREDICT  read the question and the two strategies, guess the winner
//   2. RUN      both strategies fire at the same time (Promise.all on
//               GET /search, plus POST /query when answers are on)
//   3. EXPLAIN  the verdict is computed from the live results, then the
//               "why" card explains the mechanism behind it
//
// Ported from the Week 7 lab (rag-week-bootcamp, checkpoint 6). No new
// endpoint: this tab only calls GET /search and POST /query, as the
// signed-in user, the same contract scoreboard.py measures. Each
// example's "expected" text was observed in the lab (user eng-manager)
// on 2026-11-11. The verdict is live, so if this index differs the page
// tells you instead of repeating stale claims.
//
// Uses helpers from app.js (api, withParams, escapeHtml, value,
// setOutput, provenance, errorBanner, runWithBusy): load it after app.js.
// ============================================================

// What each strategy does, in one line (mirrors app/rag/retriever.py)
const STRATEGY_INFO = {
    dense: "Embed the question, return the nearest chunks (pgvector).",
    keyword: "Keyword search (Postgres full-text): exact words count, no embeddings at all. The lab called it bm25.",
    hybrid: "Dense top 20 + keyword top 20, fused by rank with RRF.",
    rerank: "Dense top 20, re-scored by a cross-encoder that reads question and chunk together.",
    hybrid_rerank: "Hybrid top 20, then the cross-encoder keeps the best.",
    parent: "Match small child sentences (≤ 220 chars), return the section they came from.",
    hyde: "LLM writes a hypothetical answer; search with that instead of the question.",
    multi_query: "LLM writes 3 rewrites; search all 4, fuse the rankings with RRF.",
    routed: "A model picks the question's shape from a menu. Lists → SQL over every matching record; everything else → hybrid_rerank.",
};

// /search does not count LLM calls, so the cost line uses what each strategy makes per question.
const STRATEGY_LLM_CALLS = { hyde: 1, multi_query: 1, routed: 1 };

// ---------- The examples ----------
// docs:   doc_ids that answer the question (all needed)
// chunks: exact chunks that must be retrieved (list questions, or one answer line)
// expect: "A" | "B" | "tie" | "neither" — used by "Check all examples"
const SBS_EXAMPLES = [
    {
        id: "identifier", group: "Keywords vs meaning", title: "An exact identifier",
        question: "What fixed INC-2024-017?", k: 5,
        a: "dense", b: "keyword", docs: ["ENG-RELEASE-4.2"], expect: "B", answers: true,
        predict: "An incident ID is an arbitrary string. Does an embedding model know what <code>INC-2024-017</code> means? Which side finds the release note that fixed it?",
        expected: "<b>dense</b>: the release note is not in the top 5. All five chunks are IT helpdesk tickets and an expense rule, and the answer says it has no information. <b>keyword</b>: release note #1, and the answer gives the fix (a startup check for database credentials, release 4.2).",
        why: "An embedding encodes <i>meaning</i>, and <code>INC-2024-017</code> has none. The model reads it as \"some incident, some ticket number\", so the nearest vectors are other ticket-shaped chunks (IT-4112, IT-4120…): close in meaning, wrong in fact. Keyword search matches exact words. The ID appears in exactly one document, so that one exact match beats any amount of similar-sounding text.",
        lookAt: "Left: every result <i>looks like</i> a ticket. Right: keyword search returns fewer chunks, because chunks that share no word with the question do not match at all.",
        takeaway: "IDs, error codes, SKUs and product names need keyword search. That is why production systems keep keyword search next to the vectors.",
        cost: "keyword is the fastest strategy here: no embedding call at all.",
    },
    {
        id: "casual", group: "Keywords vs meaning", title: "Casual phrasing",
        question: "How fast am I expected to reply on Slack?", k: 5,
        a: "keyword", b: "hybrid", docs: ["HR-REMOTE"], chunks: ["HR-REMOTE::002"], expect: "B",
        predict: "Now flip it. The rule says <i>\"Respond to Slack messages within 2 hours\"</i>. The question shares only the word <i>Slack</i> with it. What does keyword search put first?",
        expected: "<b>keyword</b>: the dress-code FAQ is #1, and the Slack rule (Remote Work › Communication Expectations) sits below chunks that merely share <i>Slack</i> or <i>expected</i> (#3–#4 depending on the sync). <b>hybrid</b>: the Slack rule is #1.",
        why: "\"How fast… expected to reply\" and \"respond… within 2 hours\" mean the same thing with different words. Keyword search sees only overlapping words: <i>Slack</i> appears in several documents, and the generic word <i>expected</i> matches \"Business casual is <i>expected</i> for client meetings\". Hybrid runs dense and keyword search and fuses the two rankings with Reciprocal Rank Fusion: <code>score = Σ 1 / (60 + rank)</code>. A chunk ranked high in <i>both</i> lists beats a chunk ranked high in only one, and dense ranks the Slack rule #1.",
        lookAt: "Compare the traces: the keyword step vs the dense + keyword -> RRF step. Then compare result #1 on each side.",
        takeaway: "Put this next to the previous example: dense loses on identifiers, keyword search loses on paraphrase. Hybrid is cheap insurance that rarely loses to either.",
        cost: "Hybrid ≈ dense + keyword: about the latency of one embedding call, 0 LLM calls.",
    },
    {
        id: "buried", group: "Re-score what you found", title: "A rule buried in a long page",
        question: "How many reviewers does a change to the billing code need?", k: 3,
        a: "dense", b: "rerank", docs: ["ENG-HANDBOOK"], expect: "B", answers: true,
        predict: "The rule is one sentence on a handbook page about deployments and on-call. Coding Standards has a whole section on code review. With only the top 3, which side gets the handbook?",
        expected: "<b>dense</b>: Coding Standards chunks and the <code>billing-api</code> service-catalog entry, but no handbook (it is #5). Answer: <i>\"at least one reviewer\"</i>. <b>rerank</b>: handbook #1. Answer: <i>\"two reviewers\"</i>.",
        why: "Dense is a <b>bi-encoder</b>: question and chunk are embedded <i>separately</i>, then two vectors are compared. Every line of the Code Review section is about reviews, so its vector is closest. The handbook page mentions billing reviewers in one sentence out of ~900 characters on other topics, so its vector is diluted. A <b>cross-encoder</b> reads question and chunk <i>together</i> and scores \"does this passage answer this question?\". It sees <i>billing … two reviewers</i> and lifts the page from dense #5 to #1. Note the <code>billing-api</code> catalog entry on the left: it shares the word <i>billing</i> but says nothing about reviews.",
        lookAt: "Turn on answers. Both answers are faithful to their context, and the left one is wrong. A faithfulness check cannot catch a retrieval failure.",
        takeaway: "Rerank = retrieve wide (20), judge carefully, keep few (3). It can only promote what the first stage found. With <code>HYBRID_CANDIDATES=5</code> the handbook never reaches the reranker.",
        cost: "+1–2 s on a laptop CPU (20 cross-encoder passes), 0 LLM calls.",
    },
    {
        id: "distractor", group: "Re-score what you found", title: "A topic-shaped distractor",
        question: "Which database do we use for primary data?", k: 3,
        a: "dense", b: "hybrid_rerank", docs: ["ENG-STACK"], chunks: ["ENG-STACK::000"], expect: "B", answers: true,
        predict: "A wiki page explains what vector <i>databases</i> are. The tech stack says <i>\"Database: PostgreSQL 16 for primary data storage\"</i> in one bullet of a list. Which looks closer to the question?",
        expected: "<b>dense</b>: the vector-database wiki is #1, followed by a tech-stack section <i>without</i> the database line and a service-catalog entry. The answer blends in pgvector. <b>hybrid_rerank</b>: the tech-stack Backend section (the answer line) is #1. Answer: <i>\"PostgreSQL 16\"</i>.",
        why: "Dense matches <i>topic</i>: the wiki is about databases from top to bottom, so it is the nearest neighbour. The Backend section is a bullet list (Python, FastAPI, Celery, PostgreSQL…), and its vector averages many topics. Note the trap: dense <i>does</i> retrieve the right document (ENG-STACK at #2), but the wrong sections of it. Doc-level Hit@k would call this a hit. Hybrid's keyword side pulls the Backend list into the 20 candidates on the tokens <i>database</i> and <i>primary</i>, and the cross-encoder then reads the bullet and puts it first.",
        lookAt: "Left: the ENG-STACK chunk is <i>Data and AI</i>, not <i>Backend</i>. The scoreboard here counts the answer chunk, not just the document.",
        takeaway: "Score retrieval at the level the answer lives at. The right document with the wrong section still produces a wrong or muddled answer.",
        cost: "≈ +0.5 s for the cross-encoder, 0 LLM calls.",
    },
    {
        id: "parent", group: "Change what you store", title: "Match small, return big",
        question: "How many reviewers does a change to the billing code need?", k: 3,
        a: "dense", b: "parent", docs: ["ENG-HANDBOOK"], expect: "B", answers: true,
        predict: "Same buried rule, different lever. Instead of re-scoring, we search tiny pieces (one sentence each) but hand the LLM the whole page. Does that rescue the handbook?",
        expected: "<b>dense</b>: Coding Standards and the <code>billing-api</code> catalog entry, no handbook. <b>parent</b>: handbook page at #2, returned whole (~905 chars), found through one ≤ 220-character child sentence.",
        why: "Parent-document retrieval keeps two indexes. The <b>children</b> are sentence-sized pieces (≤ 220 chars): each is about one thing, so its vector is sharp. The <b>parents</b> are the full sections or pages that the LLM reads. Embedded alone, the billing sentence matches the question well. Embedded inside its 900-character page, it was diluted. So you match on the child and return the parent: small chunks for precise search, big chunks for complete context.",
        lookAt: "Expand the handbook result on the right: the whole page comes back, not just the sentence. Trace: <code>small chunks: dense top 20 -> N distinct section(s) -> top 3</code>.",
        takeaway: "The previous example fixed this failure by re-scoring; this one fixes it by changing what is stored. Exercise: set <code>CHILD_MAX_CHARS</code> to 120 and to 400 and watch this example.",
        cost: "One extra (derived) index to build and keep in sync; same latency as dense, 0 LLM calls.",
    },
    {
        id: "hyde-win", group: "Change what you search with", title: "HyDE: a wrong guess that helps",
        question: "What fixed INC-2024-017?", k: 5,
        a: "dense", b: "hyde", docs: ["ENG-RELEASE-4.2"], expect: "B",
        predict: "HyDE asks the LLM to <i>write a fake answer</i>, then searches with it. The LLM has never seen INC-2024-017, so its guess will be fiction. Can fiction find the right document?",
        expected: "<b>dense</b>: release note missing from the top 5. <b>hyde</b>: release note #2, although the LLM's passage is wrong (it invents a payment-module timeout fix).",
        why: "Questions don't look like answers, but documents look like documents. The hypothetical is wrong in <i>content</i> and right in <i>shape</i>: it reads like an incident write-up (\"INC-2024-017 was resolved by updating…\"). That shape is closer to a release announcement than the bare question was. HyDE does not need the guess to be true, only shaped like the document you want.",
        lookAt: "Right trace: <code>LLM wrote: …</code>. Read it out loud: it is invented. Then look at which document it found anyway.",
        takeaway: "Compare with the first example: keyword search won this question outright in the lab (#1 vs #2, ~25 ms vs ~2.7 s, 0 vs 1 LLM call). A clever lever is not always the best lever.",
        cost: "1 LLM call per question (≈ 2–3 s uncached), on every question you ask.",
    },
    {
        id: "hyde-lose", group: "Change what you search with", title: "HyDE: a wrong guess that hurts",
        question: "I work remotely: what are my core hours, and how much is the home office allowance?", k: 3,
        a: "dense", b: "hyde", docs: ["HR-REMOTE", "FIN-EXP-2026"], expect: "A",
        predict: "Two facts from two documents: core hours live in the Remote Work Guidelines, the allowance in the Expense Policy. HyDE writes <i>one</i> imagined document. Whose voice will it write in?",
        expected: "<b>dense</b>: both documents (core hours #1, the Expense Policy's home-office section #2). <b>hyde</b>: three Remote Work chunks and no Expense Policy, so the allowance is lost.",
        why: "The LLM wrote one HR-style policy: <i>\"core hours from 10:00 AM to 3:00 PM… a monthly home office allowance of $100… submit a reimbursement form through the HR portal\"</i>. The hours happen to be right and the allowance is invented, but the bigger problem is the <i>voice</i>. A single passage that reads like the remote-work policy embeds next to the remote-work policy, so all three slots go there. The real allowance ($1,500, one-time) sits in a finance document that the imagined HR text never resembles. The plain question, which names both topics, was closer to both.",
        lookAt: "Right trace: <code>LLM wrote: …</code>. Spot the invented $100 a month, then notice that every result on the right comes from one document.",
        takeaway: "Same technique as the previous example, opposite result. One hypothetical document takes on one document's voice, so HyDE hurts on questions that span documents. Example 9 runs the same question with multi_query, which keeps both. Measure per <i>kind</i> of question.",
        cost: "1 LLM call, and a worse result.",
    },
    {
        id: "multi-lose", group: "Change what you search with", title: "Multi-query: more searches, worse result",
        question: "How many reviewers does a change to the billing code need?", k: 5,
        a: "dense", b: "multi_query", docs: ["ENG-HANDBOOK"], expect: "A",
        predict: "Multi-query searches with the question plus 3 rewrites and fuses the results. Four searches must beat one… right?",
        expected: "<b>dense</b>: handbook #5, just inside the top 5. <b>multi_query</b>: handbook gone. Coding Standards, the <code>billing-api</code> catalog entry and Expense Policy fill all 5 slots.",
        why: "Read the rewrites: <i>\"required number of approvers\"</i>, <i>\"approval process count\"</i>… All four phrasings drift towards approval-process language. Each is searched (top 20), then RRF rewards chunks that appear in <i>many</i> lists. The Code Review section ranks high in all four, while the handbook page ranks high in few. The consensus voted the right answer out.",
        lookAt: "Right trace: the 4 queries. Does any of them keep <i>billing</i> as the key idea?",
        takeaway: "Multi-query fixes phrasing problems. This failure is a buried sentence, so more phrasings only reinforce the popular wrong answer. Know which failure you have before you pick the lever.",
        cost: "1 LLM call + 4 searches (≈ 5 s uncached), for a worse result.",
    },
    {
        id: "tie", group: "Change what you search with", title: "A tie, with a bill attached",
        question: "I work remotely: what are my core hours, and how much is the home office allowance?", k: 5,
        a: "dense", b: "multi_query", docs: ["HR-REMOTE", "FIN-EXP-2026"], expect: "tie",
        predict: "A two-part question: core hours (Remote Work Guidelines) and the allowance (Expense Policy). Surely rewriting it several ways helps?",
        expected: "Both sides retrieve both documents. <b>dense</b>: ~1 s, 0 LLM calls. <b>multi_query</b>: ~5 s, 1 LLM call.",
        why: "The question names both topics in plain words (<i>core hours</i>, <i>home office allowance</i>), so one embedding already lands near both documents. The rewrites add nothing the original lacked.",
        lookAt: "Ignore the chunks for a moment and read the stats rows: latency and LLM calls.",
        takeaway: "This is the most common result on the scoreboard: no change. An extra LLM call costs latency and money on <i>every</i> question, forever. Keep a technique only if <code>scoreboard.py</code> shows it pays.",
        cost: "multi_query: +1 LLM call and ~5× the latency, for the same retrieval.",
    },
    {
        id: "list", group: "Route by question shape", title: "A list question: top-k is a ceiling",
        question: "Who works in our San Francisco office?", k: 5,
        a: "hybrid_rerank", b: "routed", docs: ["PEOPLE-DIRECTORY"],
        chunks: ["PEOPLE-DIRECTORY::000", "PEOPLE-DIRECTORY::001", "PEOPLE-DIRECTORY::004", "PEOPLE-DIRECTORY::007", "PEOPLE-DIRECTORY::008", "PEOPLE-DIRECTORY::011"],
        expect: "B", answers: true,
        predict: "Six people work in San Francisco. We retrieve the top 5 with the best top-k strategy we have. How many can it return?",
        expected: "<b>hybrid_rerank</b>: at most 5 of 6 by construction. Since the office guide (<code>COMPANY-OFFICES</code>) was synced it is only 3 of 6, because two office-guide pages also look like \"San Francisco office\". The answer lists the people it got as if that were everyone. <b>routed</b>: all 6 records, and the answer lists six.",
        why: "\"Who works in San Francisco?\" is not a similarity question. It is a filter: <code>office = San Francisco</code>. Top-k returns the k most similar chunks, so with 6 right answers and k = 5, at least one is cut however good the ranking. Anything else that is <i>about</i> the San Francisco office (a page on desks and rooms) competes for the same 5 slots. The router recognises the shape (an aggregation over people records), extracts the filter and returns <i>every</i> matching record.",
        lookAt: "Right trace: the route line, an aggregation on office = San Francisco and how many records matched. Left answer: fluent, confident, incomplete, and nothing tells the user that someone is missing.",
        takeaway: "Lists, counts and \"all X where Y\" need a structured lookup (metadata filter or SQL), not vector search. Then try <i>\"Who works remotely?\"</i> in Custom: every top-k strategy finds 0 of 3.",
        cost: "routed: 1 small router call to pick the shape, then a SQL lookup. No k, no reranker.",
    },
    {
        id: "blind-spot", group: "Route by question shape", title: "The router's blind spot",
        question: "How much will the home office setup allowance cost in total for everyone who works remotely?", k: 5,
        a: "dense", b: "routed", docs: ["FIN-EXP-2026", "PEOPLE-DIRECTORY"], expect: "neither", answers: true,
        predict: "To answer, you need the allowance per person (Expense Policy) <i>and</i> the list of remote employees (People Directory). Which side gets both?",
        expected: "Neither. <b>dense</b>: the $1,500 home-office rule, no people. <b>routed</b>: the three remote employees, no policy. Each answer says the other half is missing.",
        why: "This is a compound question: a list (who is remote), a policy (how much each gets) and arithmetic. The router picks <i>one</i> path. It sees \"everyone who works remotely\", goes to the people lookup and drops the policy. Dense finds the policy, but a list of people is not <i>similar</i> to a question about an allowance.",
        lookAt: "Turn on answers. Both are honest about what is missing, and neither can multiply 3 × $1,500.",
        takeaway: "Routing by question shape works when a question has one shape. Compound questions need decomposition: split them, route each part, then combine (Session 1: query decomposition, agentic RAG). No single retrieval strategy fixes this.",
        cost: "Both are cheap. The failure is architectural, not a tuning problem.",
    },
];

const SBS_STRATEGIES = Object.keys(STRATEGY_INFO);
let sbsCurrent = null;   // the example (or custom setup) on stage


// ---------- Scoring (computed from the live results) ----------

function chunkKey(r) {
    return r.doc_id + "::" + String(r.chunk_index).padStart(3, "0");
}

// Purpose: where did the expected docs / chunks land? null when nothing is expected.
function sbsScore(results, ex) {
    if (ex.chunks && ex.chunks.length) {
        const keys = results.map(chunkKey);
        const ranks = ex.chunks.map(c => keys.indexOf(c) + 1);
        return { items: ex.chunks, ranks, found: ranks.filter(Boolean).length, total: ex.chunks.length,
                 unit: ex.chunks.length > 1 ? "records" : "answer chunk" };
    }
    if (ex.docs && ex.docs.length) {
        const docs = results.map(r => r.doc_id);
        const ranks = ex.docs.map(d => docs.indexOf(d) + 1);
        return { items: ex.docs, ranks, found: ranks.filter(Boolean).length, total: ex.docs.length,
                 unit: ex.docs.length > 1 ? "documents" : "document" };
    }
    return null;
}

function rankSum(s) {
    return s.ranks.filter(Boolean).reduce((a, b) => a + b, 0);
}

// Purpose: A, B, tie or neither, plus one sentence saying why.
function sbsVerdict(sa, sb, ra, rb) {
    if (!sa || !sb) return null;
    const qa = sa.found / sa.total, qb = sb.found / sb.total;
    const frac = s => s.found + "/" + s.total;
    if (qa > qb) return { winner: "A", text: "A wins on coverage: " + frac(sa) + " vs " + frac(sb) + " " + sa.unit + "." };
    if (qb > qa) return { winner: "B", text: "B wins on coverage: " + frac(sb) + " vs " + frac(sa) + " " + sb.unit + "." };
    if (qa < 1) return { winner: "neither", text: "Neither side has everything: both " + frac(sa) + " " + sa.unit + ". No retrieval strategy alone answers this." };
    const ka = rankSum(sa), kb = rankSum(sb);
    if (ka < kb) return { winner: "A", text: "A wins on rank: both found " + frac(sa) + ", A ranks it higher (" + rankText(sa) + " vs " + rankText(sb) + ")." };
    if (kb < ka) return { winner: "B", text: "B wins on rank: both found " + frac(sb) + ", B ranks it higher (" + rankText(sb) + " vs " + rankText(sa) + ")." };
    return { winner: "tie", text: "Tie on retrieval (" + frac(sa) + " each). Compare the cost: A " + costText(ra) + "; B " + costText(rb) + "." };
}

function rankText(s) {
    return s.ranks.map(r => r ? "#" + r : "–").join(", ");
}

function llmCalls(r) {
    return STRATEGY_LLM_CALLS[r.strategy] || 0;
}

function costText(r) {
    return r ? Math.round(r.ms).toLocaleString() + " ms, " + llmCalls(r) + " LLM call" + (llmCalls(r) === 1 ? "" : "s") : "?";
}


// ---------- Picker ----------

function renderSbsPicker() {
    const groups = [];
    SBS_EXAMPLES.forEach((ex, i) => {
        let g = groups.find(x => x.name === ex.group);
        if (!g) groups.push(g = { name: ex.group, items: [] });
        g.items.push([ex, i]);
    });
    const html = groups.map(g =>
        '<div class="sbs-group"><p class="sbs-group-name">' + escapeHtml(g.name) + "</p>" +
        g.items.map(([ex, i]) =>
            '<button type="button" class="sbs-pick" data-index="' + i + '">' +
                '<span class="sbs-num">' + (i + 1) + "</span>" +
                '<span class="sbs-pick-body"><b>' + escapeHtml(ex.title) + "</b>" +
                "<span><code>" + ex.a + "</code> vs <code>" + ex.b + "</code></span></span></button>"
        ).join("") + "</div>"
    ).join("") +
        '<div class="sbs-group"><p class="sbs-group-name">Your own</p>' +
        '<button type="button" class="sbs-pick" data-index="custom"><span class="sbs-num">+</span>' +
        '<span class="sbs-pick-body"><b>Custom duel</b><span>any question, any two strategies</span></span></button>' +
        '<button type="button" class="sbs-pick sbs-check" id="sbsCheckAll"><span class="sbs-num">✓</span>' +
        '<span class="sbs-pick-body"><b>Check all examples</b><span>pre-class: do the expected results still hold?</span></span></button></div>';
    document.getElementById("sbsPicker").innerHTML = html;
}

function selectSbs(index) {
    document.querySelectorAll(".sbs-pick").forEach(b => b.classList.toggle("active", b.dataset.index === String(index)));
    setOutput("sbsOutput", "");
    if (index === "custom") {
        sbsCurrent = null;
        renderCustomStage();
        return;
    }
    sbsCurrent = SBS_EXAMPLES[index];
    renderExampleStage(sbsCurrent, index);
}


// ---------- Stage: one example, before running ----------

function strategyChip(side, name) {
    return '<span class="sbs-vs-side sbs-' + side.toLowerCase() + '"><span class="sbs-tag">' + side + "</span><code>" +
        escapeHtml(name) + "</code><small>" + escapeHtml(STRATEGY_INFO[name] || "") + "</small></span>";
}

function renderExampleStage(ex, index) {
    document.getElementById("sbsStage").innerHTML =
        '<div class="card sbs-lesson">' +
            '<p class="sbs-eyebrow">Example ' + (index + 1) + " of " + SBS_EXAMPLES.length + " · " + escapeHtml(ex.group) + "</p>" +
            "<h3>" + escapeHtml(ex.title) + "</h3>" +
            '<p class="sbs-question">“' + escapeHtml(ex.question) + "”</p>" +
            '<div class="sbs-vs">' + strategyChip("A", ex.a) + '<span class="sbs-vs-word">vs</span>' + strategyChip("B", ex.b) + "</div>" +
            '<p class="meta">top ' + ex.k + " · asked as <b>you</b> (the lab used eng-manager) · today's documents · looking for " +
                escapeHtml(ex.chunks ? ex.chunks.length + " chunk(s) of " + ex.docs.join(", ") : ex.docs.join(" + ")) + "</p>" +
        "</div>" +
        '<div class="card sbs-step"><h3><span class="sbs-step-num">1</span> Predict</h3>' +
            '<p>' + ex.predict + "</p>" +
            '<details class="sbs-reveal"><summary>Reveal the expected result</summary><p>' + ex.expected + "</p>" +
            '<p class="meta">Observed in the Week 7 lab on 2026-11-11. The verdict after you run is computed live, on this index, as you.</p></details>' +
        "</div>" +
        runControls(ex.answers);
    wireRun();
}

function runControls(answersOn) {
    return '<form class="sbs-run" id="sbsRunForm">' +
        '<button type="submit"><span class="sbs-step-num inverse">2</span> Run both at once</button>' +
        '<label class="check"><input type="checkbox" id="sbsAnswers"' + (answersOn ? " checked" : "") + "> " +
            "Also generate both answers (<code>POST /query</code>, +2 LLM calls)</label>" +
        "</form>";
}

function renderCustomStage() {
    const options = sel => SBS_STRATEGIES.map(s => "<option" + (s === sel ? " selected" : "") + ">" + s + "</option>").join("");
    document.getElementById("sbsStage").innerHTML =
        '<div class="card sbs-lesson"><p class="sbs-eyebrow">Custom duel</p>' +
            "<h3>Any question, any two strategies</h3>" +
            '<div class="option-grid sbs-custom">' +
                '<label class="sbs-wide">Question<input type="text" id="sbsQ" autocomplete="off" placeholder="Who works remotely?"></label>' +
                '<label>Strategy A<select id="sbsA">' + options("dense") + "</select></label>" +
                '<label>Strategy B<select id="sbsB">' + options("hybrid_rerank") + "</select></label>" +
                '<label>Top k<input type="number" id="sbsK" min="1" max="20" value="5"></label>' +
                '<label>Expected doc_id(s), optional<input type="text" id="sbsDocs" placeholder="HR-REMOTE, FIN-EXP-2026"></label>' +
            "</div>" +
            '<p class="meta">Runs as you, with “As of” from the top bar. With expected doc_ids, the page scores both sides and picks a winner.</p>' +
        "</div>" + runControls(false);
    wireRun();
}

function wireRun() {
    document.getElementById("sbsRunForm").addEventListener("submit", event => {
        event.preventDefault();
        runSbs(event.target);
    });
}


// ---------- Run: both strategies at the same time ----------

async function runSbs(form) {
    // The session decides who asks. Examples run on today's documents; a custom duel uses "As of".
    let ex = sbsCurrent, asOf = "";
    if (!ex) {
        const question = value("sbsQ");
        if (!question) { document.getElementById("sbsQ").focus(); return; }
        const docs = value("sbsDocs").split(",").map(s => s.trim()).filter(Boolean);
        ex = { question, a: value("sbsA"), b: value("sbsB"), k: Math.min(Number(value("sbsK")) || 5, 20), docs, custom: true };
        asOf = value("asOf");
    }
    const withAnswers = document.getElementById("sbsAnswers").checked;

    const searchUrl = s => withParams("/search", { q: ex.question, strategy: s, top_k: ex.k, as_of: asOf });
    const queryUrl = s => withParams("/query", { as_of: asOf, strategy: s, top_k: ex.k, doc_filter: "off", prompt_style: "default" });
    const ask = s => api(queryUrl(s), { method: "POST", json: { question: ex.question } });

    await runWithBusy(form, "sbsOutput", "Running " + ex.a + " and " + ex.b + " at the same time…", async () => {
        const started = performance.now();
        // All requests leave together: the server runs them in parallel threads.
        const calls = [api(searchUrl(ex.a)), api(searchUrl(ex.b))];
        if (withAnswers) calls.push(ask(ex.a), ask(ex.b));
        const settled = await Promise.allSettled(calls);
        const wall = performance.now() - started;
        const [ra, rb, qa, qb] = settled.map(s => s.status === "fulfilled" ? s.value : { error: s.reason });
        setOutput("sbsOutput", renderSbsResults(ex, ra, rb, withAnswers ? qa : null, withAnswers ? qb : null, wall));
    });
}

function renderSbsResults(ex, ra, rb, qa, qb, wall) {
    const okA = ra && !ra.error, okB = rb && !rb.error;
    const sa = okA ? sbsScore(ra.results, ex) : null;
    const sb = okB ? sbsScore(rb.results, ex) : null;
    const verdict = sbsVerdict(sa, sb, okA ? ra : null, okB ? rb : null);
    const keysA = new Set(okA ? ra.results.map(chunkKey) : []);
    const keysB = new Set(okB ? rb.results.map(chunkKey) : []);
    const shared = [...keysA].filter(k => keysB.has(k)).length;

    let html = "";
    if (verdict) {
        const level = { A: "a", B: "b", tie: "tie", neither: "neither" }[verdict.winner];
        let check = "";
        if (ex.expect) {
            check = verdict.winner === ex.expect
                ? '<span class="badge badge-high">as expected</span>'
                : '<span class="badge badge-medium">differs from the expected result: the index or model changed. Read the results closely.</span>';
        }
        html += '<div class="sbs-verdict sbs-verdict-' + level + '"><b>' + escapeHtml(verdict.text) + "</b> " + check + "</div>";
    }
    html += '<p class="meta sbs-overlap">Both requests ran concurrently: ' + Math.round(wall).toLocaleString() + " ms wall time. Overlap: " +
        shared + " chunk(s) in both · " + (keysA.size - shared) + " only in A · " + (keysB.size - shared) + " only in B.</p>";

    html += '<div class="sbs-cols">' +
        sideCard("A", ex.a, ra, sa, qa, keysB, ex) +
        sideCard("B", ex.b, rb, sb, qb, keysA, ex) +
        "</div>";

    if (!ex.custom) html += explainCard(ex);
    return html;
}

function sideCard(side, strategy, r, score, q, otherKeys, ex) {
    const head = '<h3><span class="sbs-tag">' + side + "</span><code>" + escapeHtml(strategy) + "</code>" + scoreBadge(score) + "</h3>" +
        '<p class="muted">' + escapeHtml(STRATEGY_INFO[strategy] || "") + "</p>";
    if (!r || r.error) {
        return '<div class="card sbs-side sbs-' + side.toLowerCase() + '">' + head + errorBanner(r ? r.error : new Error("no result")) + "</div>";
    }
    const chars = r.results.reduce((n, c) => n + c.text.length, 0);
    const stats = '<div class="sbs-stats">' +
        sbsStat(score ? scoreText(score) : r.results.length, score ? score.unit : "chunks") +
        sbsStat(Math.round(r.ms).toLocaleString() + " ms", "latency") +
        sbsStat(llmCalls(r), "LLM calls") +
        sbsStat(chars.toLocaleString(), "chars to the LLM") +
        "</div>";
    const trace = '<p class="sbs-label">What it did</p><ol class="trace">' +
        r.trace.map(line => "<li>" + escapeHtml(line) + "</li>").join("") + "</ol>";

    let answer = "";
    if (q) {
        answer = q.error
            ? '<p class="sbs-label">Answer</p>' + errorBanner(q.error)
            : '<p class="sbs-label">Answer <span class="badge badge-' + escapeHtml(q.confidence) + '">' + escapeHtml(q.confidence) + "</span></p>" +
              '<p class="answer sbs-answer">' + escapeHtml(q.answer) + "</p>";
    }

    const wantedChunks = new Set(ex.chunks || []);
    const wantedDocs = new Set(ex.docs || []);
    const rows = r.results.map((c, i) => {
        const key = chunkKey(c);
        const isAnswer = ex.chunks ? wantedChunks.has(key) : wantedDocs.has(c.doc_id);
        const tags = (isAnswer ? '<span class="sbs-mark sbs-mark-hit" title="expected">✓ expected</span>' : "") +
            (otherKeys.has(key) ? "" : '<span class="sbs-mark sbs-mark-only">only ' + side + "</span>");
        const dist = c.distance > 0 ? '<span class="dist">' + c.distance.toFixed(3) + "</span>" : "";
        return '<details class="chunk' + (isAnswer ? " sbs-hit" : "") + '"><summary>' +
            '<span class="sbs-rank">#' + (i + 1) + "</span>" +
            '<span class="name">' + escapeHtml(c.doc_id) + " · " + escapeHtml(c.section || "chunk " + c.chunk_index) + "</span>" +
            tags + dist + "</summary>" +
            '<p class="sbs-prov">' + escapeHtml(provenance(c)) + " · " + c.text.length + " chars</p>" +
            "<pre>" + escapeHtml(c.text) + "</pre></details>";
    }).join("");

    return '<div class="card sbs-side sbs-' + side.toLowerCase() + '">' + head + stats + trace + answer +
        '<p class="sbs-label">Retrieved, in rank order</p>' + (rows || '<p class="muted">Nothing retrieved.</p>') + "</div>";
}

function scoreBadge(s) {
    if (!s) return "";
    const level = s.found === s.total ? "high" : s.found ? "medium" : "low";
    const label = s.found === s.total ? (s.total === 1 ? "found #" + s.ranks[0] : "all " + s.total) : s.found ? s.found + "/" + s.total : "missed";
    return '<span class="badge badge-' + level + '">' + label + "</span>";
}

function scoreText(s) {
    if (s.total === 1) return s.ranks[0] ? "#" + s.ranks[0] : "–";
    return s.found + "/" + s.total;
}

function sbsStat(number, label) {
    return '<div class="stat"><b>' + escapeHtml(number) + "</b><span>" + escapeHtml(label) + "</span></div>";
}

function explainCard(ex) {
    return '<div class="card sbs-step sbs-explain"><h3><span class="sbs-step-num">3</span> Why</h3>' +
        "<p>" + ex.why + "</p>" +
        '<div class="sbs-explain-grid">' +
            '<div><p class="sbs-label">Point at</p><p>' + ex.lookAt + "</p></div>" +
            '<div><p class="sbs-label">Takeaway</p><p>' + ex.takeaway + "</p></div>" +
            '<div><p class="sbs-label">Cost</p><p>' + ex.cost + "</p></div>" +
        "</div></div>";
}


// ---------- Check all examples (retrieval only, no answers) ----------

async function checkAllSbs(button) {
    document.querySelectorAll(".sbs-pick").forEach(b => b.classList.toggle("active", b === button));
    sbsCurrent = null;
    document.getElementById("sbsStage").innerHTML = "";
    setOutput("sbsOutput", '<p class="loading">Running ' + SBS_EXAMPLES.length * 2 + " retrievals (HyDE and multi-query answers are cached after the first run)…</p>");
    button.disabled = true;
    try {
        const rows = [];
        // Three examples at a time keeps the CPU reranker from queueing too long.
        for (let i = 0; i < SBS_EXAMPLES.length; i += 3) {
            const batch = SBS_EXAMPLES.slice(i, i + 3).map(async (ex, j) => {
                const url = s => withParams("/search", { q: ex.question, strategy: s, top_k: ex.k });
                const [ra, rb] = await Promise.all([api(url(ex.a)), api(url(ex.b))]);
                const sa = sbsScore(ra.results, ex), sb = sbsScore(rb.results, ex);
                return { i: i + j, ex, sa, sb, v: sbsVerdict(sa, sb, ra, rb) };
            });
            rows.push(...await Promise.all(batch));
        }
        const ok = rows.filter(r => r.v.winner === r.ex.expect).length;
        const label = w => ({ A: "A wins", B: "B wins", tie: "tie", neither: "neither" })[w];
        setOutput("sbsOutput",
            '<div class="sbs-verdict sbs-verdict-' + (ok === rows.length ? "tie" : "neither") + '"><b>' + ok + " of " + rows.length +
                " examples behave as described.</b> Click a row to open it.</div>" +
            '<div class="card"><table class="sbs-table"><tr><th>#</th><th>Example</th><th>A</th><th>B</th><th>Live</th><th>Expected</th></tr>' +
            rows.map(r =>
                '<tr data-index="' + r.i + '"><td>' + (r.i + 1) + "</td><td>" + escapeHtml(r.ex.title) + "</td>" +
                "<td><code>" + r.ex.a + "</code> " + scoreBadge(r.sa) + "</td><td><code>" + r.ex.b + "</code> " + scoreBadge(r.sb) + "</td>" +
                "<td>" + label(r.v.winner) + "</td><td>" + label(r.ex.expect) + " " +
                (r.v.winner === r.ex.expect ? '<span class="badge badge-high">ok</span>' : '<span class="badge badge-medium">check</span>') + "</td></tr>"
            ).join("") + "</table></div>");
    } catch (err) {
        setOutput("sbsOutput", errorBanner(err));
    } finally {
        button.disabled = false;
    }
}


// ---------- Start ----------

renderSbsPicker();
document.getElementById("sbsPicker").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.id === "sbsCheckAll") { checkAllSbs(button); return; }
    selectSbs(button.dataset.index === "custom" ? "custom" : Number(button.dataset.index));
});
document.getElementById("sbsOutput").addEventListener("click", event => {
    const row = event.target.closest(".sbs-table tr[data-index]");
    if (row) selectSbs(Number(row.dataset.index));
});
selectSbs(0);
