-- ============================================================
-- 0011 — Absolute CV score (Ascend, ported from CV Spark).
-- Scores a CV against a gold-standard benchmark, independent of
-- any job. Attached to the CV version it was computed for; a new
-- version (edit) leaves these null = "not scored yet".
-- The existing `structured jsonb` column becomes the builder's
-- source of truth; `content_md` is kept in sync (derived).
-- ============================================================

alter table cv_versions
  add column if not exists score_overall int;          -- 0-100 vs gold standard
alter table cv_versions
  add column if not exists score_data jsonb;            -- {averageMarketScore, roleCategory, marketFitSummary, categories[]}
alter table cv_versions
  add column if not exists scored_at timestamptz;
