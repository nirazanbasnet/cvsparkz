-- ============================================================
-- 0018 — Preserve the originally-uploaded CV file (PDF/DOCX) so
-- users can view their CV in its real layout via the "View
-- original" button. Stored in the private `documents` bucket;
-- access only through server-minted signed URLs (service role).
--
-- Columns are per-version; saveCv/saveStructuredCv carry them
-- forward when a newer version is saved without a fresh upload,
-- so editing the markdown doesn't drop the original file link.
-- ============================================================

alter table cv_versions
  add column if not exists original_object_key text,
  add column if not exists original_filename   text,
  add column if not exists original_mime        text;
