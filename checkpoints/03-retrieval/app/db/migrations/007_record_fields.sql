-- ============================================================
-- 007 — records: a row of a spreadsheet keeps its fields
-- ============================================================
-- A CSV row (one person, one ticket) is already one chunk: its text is
-- "name: Maria Garcia; role: ...; office: Remote; ...". Until now the
-- router split that text back into fields on every question.
--
-- Now the sync keeps the fields it parsed, as jsonb, on the same chunk:
--
--   fields = {"name": "Maria Garcia", "office": "Remote", ...}
--
--   - the router's menu is one SQL query: the distinct values of each
--     column, for every record set you may read (store.record_menu)
--   - a lookup is one SQL query: fields ->> 'office' = ANY(...)
--     (store.lookup_records), every match, no k
--   - a new column in the CSV is just data: it is stored on the next sync
--
-- WHY A COLUMN ON chunks, NOT A NEW TABLE:
--   Everything that protects a chunk protects its fields for free: the
--   tenant's Row-Level Security, the document_acl join, status and
--   effective dates, blue/green index flips, and deletes. A separate
--   table would need each of those again, and one forgotten is a leak.
--
-- Prose chunks and small chunks have fields = NULL.
-- ============================================================

ALTER TABLE chunks ADD COLUMN fields jsonb;

CREATE INDEX chunks_by_fields ON chunks USING gin (fields) WHERE fields IS NOT NULL;
