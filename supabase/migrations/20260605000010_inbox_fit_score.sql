-- ============================================================
-- 0010 — Quick fit score on inbox items: batch-scored against
-- the primary CV at scan time so the inbox can rank jobs before
-- the user spends full evaluations.
-- ============================================================

alter table pipeline_items
  add column if not exists fit_score numeric(2,1);
alter table pipeline_items
  add column if not exists fit_reason text;
