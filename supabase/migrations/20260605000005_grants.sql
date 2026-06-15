-- ============================================================
-- 0005 — Table-level grants for PostgREST roles.
-- Row access is enforced by RLS (0004); these grants follow the
-- standard Supabase posture: roles may touch the tables, RLS
-- decides which rows.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
grant all on all sequences in schema public to authenticated, service_role;

-- Future tables created by migrations get the same grants.
alter default privileges in schema public
  grant all on tables to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant all on sequences to authenticated, service_role;
