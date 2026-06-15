-- ============================================================
-- 0002 — Profile/CV, companies/scanning, evaluations/applications,
--        artifacts, interview prep, outreach, follow-ups
-- ============================================================

-- ---------- profile, CV, personalization ----------
create table candidate_profiles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  full_name     text, email text, phone text,
  location_city text, location_country text, timezone text,
  linkedin_url  text, portfolio_url text, github_url text, visa_status text,
  comp_currency text default 'USD',
  comp_target_min numeric, comp_target_max numeric, comp_minimum numeric,
  location_flexibility text,
  target_roles  jsonb not null default '[]',   -- [{title,level,fit}]
  archetypes    jsonb not null default '[]',   -- [{name,level,fit,axes[],what_they_buy}]
  narrative     jsonb not null default '{}',   -- {headline,exit_story,superpowers[],proof_points[]}
  cv_prefs      jsonb not null default '{}',   -- {output_format,auto_pdf_score_threshold,default_lang}
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id)
);

create table cv_versions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  version      int not null,
  content_md   text not null,
  structured   jsonb not null default '{}',
  content_hash text not null,
  is_current   boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, version)
);
create index on cv_versions (tenant_id, is_current);

create table personalizations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  archetype_map jsonb not null default '[]',
  framing_rules jsonb not null default '[]',
  negotiation_scripts jsonb not null default '{}',
  location_policy jsonb not null default '{}',
  scoring_overrides jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id)
);

create table proof_points (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null, url text, hero_metric text,
  status text, impact text, details_md text,
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);
create index on proof_points (tenant_id);

-- ---------- companies & scanning ----------
create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  careers_url text,
  created_at  timestamptz not null default now()
);

create table tracked_companies (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  company_id    uuid references companies(id),
  display_name  text not null,
  provider      ats_provider not null,
  provider_config jsonb not null default '{}',
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (tenant_id, display_name)
);

create table scan_configs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  title_positive   text[] not null default '{}',
  title_negative   text[] not null default '{}',
  seniority_boost  text[] not null default '{}',
  loc_always_allow text[] not null default '{}',
  loc_allow        text[] not null default '{}',
  loc_block        text[] not null default '{}',
  search_queries   text[] not null default '{}',
  schedule_cron text,
  next_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id)
);

create table job_postings (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  url          text not null,
  url_hash     text not null,
  title        text, company_name text, location text,
  jd_text      text, jd_lang cv_lang,
  is_live      boolean, liveness_checked_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  seen_count   int not null default 1,
  source       ats_provider not null default 'manual',
  embedding    vector(1536),
  unique (tenant_id, url_hash)
);
create index on job_postings (tenant_id, last_seen_at desc);

create table pipeline_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  posting_id  uuid references job_postings(id) on delete set null,
  url         text, raw_jd_text text,
  state       pipeline_item_state not null default 'pending',
  error       text,
  created_at  timestamptz not null default now(),
  processed_at timestamptz
);
create index on pipeline_items (tenant_id, state);

-- ---------- evaluations & applications ----------
create table evaluations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  posting_id      uuid references job_postings(id) on delete set null,
  cv_version_id   uuid references cv_versions(id),
  company_name    text not null, role text not null, url text,
  score           numeric(2,1) not null,
  archetype       text, legitimacy legitimacy_tier,
  final_decision  text, risk_level text, confidence text, next_action text,
  hard_stops      jsonb not null default '[]',
  soft_gaps       jsonb not null default '[]',
  top_strengths   jsonb not null default '[]',
  blocks          jsonb not null default '{}',   -- {A,B,C,D,E,F,G}
  report_md       text, report_object_key text,
  model_used      text, jd_lang cv_lang,
  created_at      timestamptz not null default now()
);
create index on evaluations (tenant_id, created_at desc);

create table applications (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  company_name  text not null, role text not null,
  company_norm  text not null, role_norm text not null,
  status        application_status not null default 'evaluated',
  score         numeric(2,1),
  latest_evaluation_id uuid references evaluations(id),
  applied_at    date, notes text,
  has_pdf       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, company_norm, role_norm)
);
create index on applications (tenant_id, status);
create index on applications using gin (company_norm gin_trgm_ops);

create table application_status_events (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  from_status    application_status, to_status application_status not null,
  note text,
  created_at     timestamptz not null default now()
);

-- ---------- generated artifacts ----------
create table generated_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  application_id uuid references applications(id) on delete set null,
  evaluation_id uuid references evaluations(id) on delete set null,
  cv_version_id uuid references cv_versions(id),
  kind          text not null,           -- 'cv_pdf' | 'cv_latex' | 'report_pdf'
  lang          cv_lang not null default 'en',
  page_format   text default 'letter',
  object_key    text not null, file_size int, tailored_for text,
  created_at    timestamptz not null default now()
);
create index on generated_documents (tenant_id);

-- ---------- interview prep, stories, outreach, follow-ups ----------
create table stories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  title       text not null,
  situation text, task text, action text, result text, reflection text,
  applies_to  text[] not null default '{}',
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);
create index on stories (tenant_id);

create table interview_preps (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  company_name  text not null, role text not null,
  process_overview jsonb, rounds jsonb not null default '[]',
  red_flags     jsonb not null default '[]', content_md text,
  created_at    timestamptz not null default now()
);

create table follow_ups (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  sent_at       date not null, channel text, note text,
  created_at    timestamptz not null default now()
);

create table contacts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  name text, contact_type text, linkedin_url text, draft_message text,
  created_at    timestamptz not null default now()
);
