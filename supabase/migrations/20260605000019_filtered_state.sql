-- ============================================================
-- 0019 — 'filtered' state for inbox items that were scanned but
-- didn't match the user's title/location filters. Kept instead of
-- discarded, so the user can still find and apply to them with a
-- different CV — surfaced under "Other openings" in the Inbox.
-- ============================================================

alter type pipeline_item_state add value if not exists 'filtered';
