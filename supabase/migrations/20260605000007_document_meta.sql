-- ============================================================
-- 0007 — Tailoring transparency: what the PDF generator changed
-- (keyword coverage, change log) so users can judge the output.
-- ============================================================

alter table generated_documents
  add column if not exists meta jsonb not null default '{}';
