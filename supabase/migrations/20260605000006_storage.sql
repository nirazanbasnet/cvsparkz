-- ============================================================
-- 0006 — Storage buckets. Private; access via server-minted
-- signed URLs only (service role), so no storage RLS policies.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('documents', 'documents', false, 10485760),
  ('exports', 'exports', false, 52428800)
on conflict (id) do nothing;
