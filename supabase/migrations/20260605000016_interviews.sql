-- ============================================================
-- 0016 — Interview screening. Per candidate⇄opening, a recruiter
-- can schedule interviews, generate role-tailored questions, record
-- answers + per-question scores, track follow-ups, and synthesize a
-- final hiring decision report (exported as PDF).
-- ============================================================

create table if not exists interviews (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  fit_id       uuid not null references candidate_fits(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  opening_id   uuid not null references job_openings(id) on delete cascade,
  stage        text not null default 'screening'
               check (stage in ('screening','technical','final','culture','other')),
  interviewer  text,
  scheduled_at timestamptz,
  status       text not null default 'planned'
               check (status in ('planned','in_progress','completed','cancelled')),
  -- [{ id, category, question, why, answer, score (0-5|null), notes }]
  questions    jsonb not null default '[]',
  -- [{ id, due_date, note, done }]
  follow_ups   jsonb not null default '[]',
  -- generated hiring decision report (verdict, scorecard, strengths, concerns…)
  report       jsonb,
  report_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists interviews_fit_idx
  on interviews (tenant_id, fit_id, created_at desc);

alter table interviews enable row level security;
create policy tenant_rw on interviews
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

grant all on interviews to authenticated, service_role;
grant select on interviews to anon;
