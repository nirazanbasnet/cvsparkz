-- ============================================================
-- 0001 — Extensions, enums, identity & tenancy
-- ============================================================

create extension if not exists "pgcrypto";        -- gen_random_uuid()
create extension if not exists "citext";
create extension if not exists "pg_trgm";          -- fuzzy company/role dedup
create extension if not exists "vector";           -- pgvector semantic match

-- ---------- enums ----------
create type application_status as enum
  ('evaluated','applied','responded','interview','offer','rejected','discarded','skip');
create type legitimacy_tier as enum
  ('high_confidence','proceed_with_caution','suspicious');
create type pipeline_item_state as enum ('pending','processing','processed','error');
create type ats_provider as enum
  ('greenhouse','ashby','lever','recruitee','smartrecruiters','workable','local_parser','manual');
create type job_kind as enum
  ('evaluation','scan','pdf','analytics','followup','interview_prep','outreach','cv_import');
create type job_status as enum ('queued','running','succeeded','failed','canceled');
create type cv_lang as enum ('en','de','fr','ja','pt','ru','ua','tr','es');
create type plan_tier as enum ('free','pro','power','team');
create type usage_metric as enum ('evaluation','scan','pdf','deep_research','interview_prep');

-- ---------- tenancy ----------
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        plan_tier not null default 'free',
  data_region text not null default 'us',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Mirror of auth.users for convenient joins (id == auth.users.id)
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       citext unique not null,
  full_name   text,
  created_at  timestamptz not null default now()
);

create table tenant_members (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references users(id)  on delete cascade,
  role       text not null default 'owner',       -- 'owner' | 'member'
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index on tenant_members (user_id);

create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  key_hash     text not null,
  key_prefix   text not null,
  scopes       text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index on api_keys (tenant_id);

create table tenant_integrations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  kind       text not null,            -- 'anthropic_key' | 'gemini_key' | 'slack_webhook'
  secret_enc bytea,
  config     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on tenant_integrations (tenant_id);

-- ---------- auto-provision: on signup, mirror user + create personal workspace ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_tenant uuid;
begin
  insert into public.users (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data->>'full_name')
    on conflict (id) do nothing;
  insert into public.tenants (name) values (coalesce(new.email, 'Workspace'))
    returning id into new_tenant;
  insert into public.tenant_members (tenant_id, user_id, role)
    values (new_tenant, new.id, 'owner');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
