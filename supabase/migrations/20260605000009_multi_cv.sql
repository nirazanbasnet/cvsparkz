-- ============================================================
-- 0009 — Multiple named CVs per tenant. Each label is one CV
-- (rows still version it); is_current marks the PRIMARY CV used
-- for evaluations, PDFs, and scan role-filtering. primary_role
-- is the role title extracted from the CV — when scan filters
-- are empty, jobs are matched against it.
-- ============================================================

alter table cv_versions
  add column if not exists label text not null default 'Main CV';
alter table cv_versions
  add column if not exists primary_role text;
