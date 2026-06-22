-- ============================================================
-- 0015 — Recruiter mode. A tenant is either a 'personal' (job
-- seeker) or 'recruiter' (hiring) workspace, switchable in
-- Settings. Recruiters create job openings, bulk-upload candidate
-- CVs, and screen/track them per opening.
-- ============================================================

-- Account mode. NULL = not yet onboarded (app shows the role picker).
alter table tenants add column if not exists account_type text
  check (account_type in ('personal', 'recruiter'));

-- Existing workspaces have been used as personal job-seeker accounts.
update tenants set account_type = 'personal' where account_type is null;

-- ---------- job openings (recruiter's JDs) ----------
create table if not exists job_openings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  title       text not null,
  jd_text     text not null,
  location    text,
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists job_openings_tenant_idx on job_openings (tenant_id, created_at desc);

-- ---------- candidates (uploaded CVs) ----------
create table if not exists candidates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null,
  email           text,
  phone           text,
  location        text,
  headline        text,
  content_md      text not null default '',
  source_filename text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists candidates_tenant_idx on candidates (tenant_id, created_at desc);

-- ---------- candidate ⇄ opening fit + pipeline ----------
create table if not exists candidate_fits (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  opening_id   uuid not null references job_openings(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  -- quick screen (tiered: cheap batched pass)
  fit_score    numeric,                 -- 0–100
  verdict      text,                    -- Strong | Good | Fair | Low
  summary      text,
  strengths    jsonb not null default '[]',
  gaps         jsonb not null default '[]',
  scored_at    timestamptz,
  -- pipeline
  status       text not null default 'new'
               check (status in ('new','reviewing','shortlisted','interview','offer','hired','rejected')),
  -- deep eval (on-demand) + recruiter notes
  deep         jsonb,
  deep_at      timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (opening_id, candidate_id)
);
create index if not exists candidate_fits_opening_idx
  on candidate_fits (tenant_id, opening_id, fit_score desc nulls last);

-- ---------- RLS: tenant isolation (mirrors 0004) ----------
do $$
declare t text;
begin
  foreach t in array array['job_openings','candidates','candidate_fits']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$
      create policy tenant_rw on %I
        using (public.is_tenant_member(tenant_id))
        with check (public.is_tenant_member(tenant_id));
    $p$, t);
  end loop;
end $$;

-- ---------- grants (explicit; matches 0005 posture) ----------
grant all on job_openings, candidates, candidate_fits to authenticated, service_role;
grant select on job_openings, candidates, candidate_fits to anon;
