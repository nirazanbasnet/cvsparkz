-- ============================================================
-- 0013 — Distinct 'dismissed' state for inbox items, so dismissed
-- jobs can be listed and restored separately from evaluated ones
-- (both previously collapsed into 'processed').
-- ============================================================

alter type pipeline_item_state add value if not exists 'dismissed';
