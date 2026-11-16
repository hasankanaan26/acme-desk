-- ============================================================
-- Part 3, a tour of Postgres: what the router and the evals read
-- ============================================================
-- Run it all:      docker exec -i acme-desk-db-1 psql -U postgres -d acme_part3 < instructor-notes/fallbacks/part3/db-tour.sql
-- Or one at a time: docker exec -it acme-desk-db-1 psql -U postgres -d acme_part3   (then paste a query)
-- (Class database: acme_part3, Monday's documents, local MiniLM. On the main database use -d acme,
--  after db.py migrate (007) and sync.py --apply.)
-- Every query reads; nothing here writes.

\pset pager off

-- ------------------------------------------------------------
-- 1. Where the directory lives. Each row of team-directory.csv is ONE chunk:
--    text (for search, like any policy section) AND fields (jsonb, for
--    lookups). The sync writes both from the same parsed row (007).
--    A policy's chunks have fields = NULL.
-- ------------------------------------------------------------
\echo '\n1. The team directory: one chunk per person, with its fields'
SELECT id, fields
FROM chunks
WHERE doc_id = 'PEOPLE-DIRECTORY' AND parent_id IS NULL AND status = 'current'
ORDER BY chunk_index;

-- ------------------------------------------------------------
-- 2. The menu. store.record_menu() runs this (plus the access check, section 4)
--    on every routed question: every column and its distinct values. Then
--    router.ROUTABLE keeps the filter columns (office, department, role).
-- ------------------------------------------------------------
\echo '\n2. The menu, exactly as store.record_menu() builds it'
SELECT c.doc_id, f.key AS "column", array_agg(DISTINCT f.value ORDER BY f.value) AS "values"
FROM chunks c CROSS JOIN LATERAL jsonb_each_text(c.fields) AS f
WHERE c.fields IS NOT NULL AND c.parent_id IS NULL AND c.status = 'current'
  AND c.doc_id = 'PEOPLE-DIRECTORY'
GROUP BY c.doc_id, f.key
ORDER BY c.doc_id, f.key;

-- ------------------------------------------------------------
-- 3. The lookup. Once the plan is checked, store.lookup_records() runs this:
--    every row whose fields match ALL the filters. No ranking, no k.
-- ------------------------------------------------------------
\echo '\n3a. office = Remote  ("Who works remotely?")'
SELECT fields->>'name' AS name, fields->>'role' AS role
FROM chunks
WHERE doc_id = 'PEOPLE-DIRECTORY' AND parent_id IS NULL AND status = 'current'
  AND fields->>'office' = ANY(ARRAY['Remote']);

\echo '\n3b. office = San Francisco  (6 rows: more than top 3 can ever hold)'
SELECT fields->>'name' AS name, fields->>'role' AS role
FROM chunks
WHERE doc_id = 'PEOPLE-DIRECTORY' AND parent_id IS NULL AND status = 'current'
  AND fields->>'office' = ANY(ARRAY['San Francisco']);

\echo '\n3c. department = Engineering AND office = New York  ("Which people in Engineering work from NYC?")'
SELECT fields->>'name' AS name, fields->>'role' AS role
FROM chunks
WHERE doc_id = 'PEOPLE-DIRECTORY' AND parent_id IS NULL AND status = 'current'
  AND fields->>'department' = ANY(ARRAY['Engineering'])
  AND fields->>'office' = ANY(ARRAY['New York']);

\echo '\n3d. office = London  (no row: why check() searches instead of returning this empty list)'
SELECT count(*) AS rows_with_london
FROM chunks
WHERE doc_id = 'PEOPLE-DIRECTORY' AND parent_id IS NULL
  AND fields->>'office' = 'London';

-- ------------------------------------------------------------
-- 4. Access. The menu and the lookup only read rows when one of YOUR groups
--    is in document_acl for the directory. The same check guards every
--    search, which is why the scoreboard's leak column is 0.
-- ------------------------------------------------------------
\echo '\n4a. Who may read the directory, and the salary bands'
SELECT a.doc_id, string_agg(g.name, ', ' ORDER BY g.name) AS readable_by_groups
FROM document_acl a JOIN groups g ON g.id = a.group_id
WHERE a.doc_id IN ('PEOPLE-DIRECTORY', 'HR-SALARY-BANDS-2026')
GROUP BY a.doc_id;

\echo '\n4b. Which groups each demo account is in'
SELECT u.email, string_agg(g.name, ', ' ORDER BY g.name) AS groups
FROM users u
JOIN group_members m ON m.user_id = u.id
JOIN groups g ON g.id = m.group_id
GROUP BY u.email ORDER BY u.email;

-- ------------------------------------------------------------
-- 5. The register: the facts the evals rely on.
--    S20: the leave policy was edited (v2, 2 Nov); the FAQ that quotes it was not.
--    S27: the 2027 parental leave policy is a draft: 0 chunks, never searchable.
-- ------------------------------------------------------------
\echo '\n5. The register for S20 and S27 (and how many chunks each has in the index)'
SELECT d.doc_id, d.title, d.status, d.version, d.effective_from, d.depends_on,
       (SELECT count(*) FROM chunks c WHERE c.doc_id = d.doc_id AND c.parent_id IS NULL) AS chunks
FROM documents d
WHERE d.doc_id IN ('HR-LEAVE', 'COMPANY-FAQ') OR d.title ILIKE '%parental%'
ORDER BY d.doc_id;

\echo '\n5b. S20: the two chunks that disagree (stale FAQ "5 days", policy "10 days")'
SELECT doc_id, left(text, 220) AS text
FROM chunks
WHERE parent_id IS NULL AND status = 'current'
  AND (text ILIKE '%carried over%' OR text ILIKE '%carry over%');

-- ------------------------------------------------------------
-- 6. The audit log: what your demo just did. Every search and question is
--    logged with the strategy and the documents that came back (never the text).
-- ------------------------------------------------------------
\echo '\n6. The last 12 searches and questions'
SELECT to_char(at, 'HH24:MI:SS') AS at, actor, action,
       detail->>'strategy' AS strategy, detail->'doc_ids' AS doc_ids
FROM audit_log
WHERE action IN ('search', 'query')
ORDER BY at DESC
LIMIT 12;

-- ------------------------------------------------------------
-- 7. The tickets (the live build). Also a CSV, so also stored with fields,
--    the contact already redacted. Listable as soon as router.ROUTABLE says so.
-- ------------------------------------------------------------
\echo '\n7. The helpdesk tickets: stored with their fields, waiting for one ROUTABLE entry'
SELECT id, fields->>'reporter' AS reporter, fields->>'contact' AS contact, left(fields->>'summary', 50) AS summary
FROM chunks
WHERE doc_id = 'IT-HELPDESK-EXPORT' AND fields IS NOT NULL
ORDER BY chunk_index;
