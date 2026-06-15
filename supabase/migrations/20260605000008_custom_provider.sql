-- ============================================================
-- 0008 — Custom careers-page provider: branded pages scanned
-- via headless browser + LLM extraction (no ATS API needed).
-- ============================================================

alter type ats_provider add value if not exists 'custom';
