-- ============================================================
-- 0012 — Oracle Recruiting Cloud (Fusion HCM "Candidate
-- Experience") as a scan source. Enterprises on a branded
-- *.oraclecloud.com careers site expose a public JSON API.
-- ============================================================

alter type ats_provider add value if not exists 'oracle';
