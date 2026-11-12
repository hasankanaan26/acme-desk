-- ============================================================
-- 006 — the second index: small chunks that point to their section
-- ============================================================
-- Part 3 cuts every document two ways, in the same index:
--
--   sections      what Parts 1 and 2 stored: one chunk per section,
--                 up to 900 characters, with a "<title> > <heading>"
--                 header line. parent_id IS NULL.
--   small chunks  each section split again into sentence-sized pieces
--                 (CHILD_MAX_CHARS, about 220), each embedded on its
--                 own. parent_id = the id of its section.
--
-- Search the small ones, hand the model their sections: that is
-- parent-document retrieval ("match small, return big").
--
-- WHY IN THE SAME TABLE, WRITTEN BY THE SAME SYNC:
--   The lab (RAG weeks, checkpoint 6) built its small chunks at QUERY
--   time, from whatever the live index held. Here the API runs as
--   acme_app, which cannot write chunks, and that is the point: the
--   worker (acme_sync) writes both cuts in ONE transaction, from the
--   same parsed text. They are never out of step, a blue/green flip
--   moves both, and a deleted document takes both with it.
--
--   The foreign key makes "a small chunk whose section is gone"
--   impossible: delete a section and its small chunks go too.
--   Row-Level Security and the access JOIN apply to every row, so a
--   small chunk is exactly as readable as the document it came from.
-- ============================================================

ALTER TABLE chunks ADD COLUMN parent_id text;

ALTER TABLE chunks ADD CONSTRAINT chunks_parent_section
    FOREIGN KEY (tenant_id, index_name, parent_id)
    REFERENCES chunks (tenant_id, index_name, id) ON DELETE CASCADE;

CREATE INDEX chunks_by_parent ON chunks (tenant_id, index_name, parent_id) WHERE parent_id IS NOT NULL;
