-- ============================================================
-- 0003 — Jobs, usage metering, billing, notifications, audit,
--        reference/seed tables, and the pgmq queue
-- ============================================================

create table jobs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        job_kind not null,
  status      job_status not null default 'queued',
  input       jsonb not null default '{}',
  result      jsonb, error text, attempts int not null default 0,
  started_at  timestamptz, finished_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on jobs (tenant_id, status);

create table usage_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  metric      usage_metric not null,
  quantity    int not null default 1,
  tokens_in   int, tokens_out int, cost_usd numeric(10,4),
  job_id      uuid references jobs(id),
  occurred_at timestamptz not null default now()
);
create index on usage_events (tenant_id, metric, occurred_at);

create table subscriptions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  stripe_customer_id text, stripe_subscription_id text,
  plan          plan_tier not null default 'free',
  status        text not null default 'active',
  current_period_end timestamptz,
  created_at    timestamptz not null default now(),
  unique (tenant_id)
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid references users(id),
  kind        text not null,            -- 'strong_match' | 'followup_due' | 'scan_done'
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on notifications (tenant_id, read_at);

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade,
  actor_user_id uuid,
  action        text not null, target text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- ---------- reference (global, read-only) ----------
create table ref_statuses (
  id              application_status primary key,
  label           text not null,
  dashboard_group text not null,
  sort_order      int not null
);

create table ref_archetypes (
  id          text primary key,
  name        text not null,
  description text,
  axes        text[] not null default '{}'
);

create table prompt_templates (
  id          uuid primary key default gen_random_uuid(),
  mode        text not null,            -- 'oferta','pdf','interview_prep',...
  lang        cv_lang not null default 'en',
  version     int not null,
  template    text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (mode, lang, version)
);

-- ---------- background queue (Supabase Queues / pgmq) ----------
-- Enable in Supabase dashboard or: create extension if not exists pgmq;
-- create extension if not exists pg_cron;
-- select pgmq.create('jobs');   -- worker consumes this; scheduler enqueues scans
