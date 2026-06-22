-- ============================================================
-- 0017 — Token usage metering for the header "Usage" badge.
--
-- The usage_events table (0003) was never written to. This wires it
-- up as the system of record for LLM token spend and adds the columns
-- the UI needs:
--   role    — which mode the spend belongs to ('personal' | 'recruiter')
--   feature — the granular operation (evaluation, cv_score, recruiter:screen, …)
--   model   — the model that served the call
-- `metric` (the coarse enum from 0003) becomes optional; `feature` is the
-- new source of truth, so older code paths that don't map to one of the
-- five enum values no longer need to invent one.
--
-- Each tenant also gets a per-role monthly token budget so the badge can
-- show "used vs. left" for both personal and recruiter usage.
-- ============================================================

alter table usage_events
  alter column metric drop not null;

alter table usage_events
  add column if not exists role text
    check (role in ('personal', 'recruiter')),
  add column if not exists feature text,
  add column if not exists model text;

-- Per-role monthly token allowance. Applied independently to each role's
-- monthly total (personal and recruiter each get this many tokens/month).
alter table tenants
  add column if not exists monthly_token_budget int not null default 500000;

-- The badge always queries "this tenant, this month, grouped by role".
create index if not exists usage_events_tenant_role_time_idx
  on usage_events (tenant_id, role, occurred_at);

-- New columns inherit the table grants from 0005; nothing else to grant.
