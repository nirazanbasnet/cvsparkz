-- ============================================================
-- 0004 — Row-Level Security. Every tenant table is locked to
--        members of its tenant. The worker uses the service-role
--        key (bypasses RLS) and MUST scope by tenant_id in code.
-- ============================================================

-- helper: is the current auth user a member of tenant tid?
create or replace function public.is_tenant_member(tid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = tid and tm.user_id = auth.uid()
  );
$$;

-- users: a user sees only their own row
alter table users enable row level security;
create policy users_self on users
  using (id = auth.uid()) with check (id = auth.uid());

-- tenants: members can read their tenant
alter table tenants enable row level security;
create policy tenants_member_read on tenants
  for select using (public.is_tenant_member(id));
create policy tenants_owner_update on tenants
  for update using (public.is_tenant_member(id)) with check (public.is_tenant_member(id));

-- tenant_members: a user sees membership rows for tenants they belong to
alter table tenant_members enable row level security;
create policy tm_self on tenant_members
  using (public.is_tenant_member(tenant_id));

-- Generic tenant isolation for all tenant-scoped tables.
do $$
declare t text;
begin
  foreach t in array array[
    'api_keys','tenant_integrations',
    'candidate_profiles','cv_versions','personalizations','proof_points',
    'tracked_companies','scan_configs','job_postings','pipeline_items',
    'evaluations','applications','application_status_events',
    'generated_documents','stories','interview_preps','follow_ups','contacts',
    'jobs','usage_events','subscriptions','notifications','audit_log'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$
      create policy tenant_rw on %I
        using (public.is_tenant_member(tenant_id))
        with check (public.is_tenant_member(tenant_id));
    $p$, t);
  end loop;
end $$;

-- Reference tables: readable by any authenticated user, no writes via RLS.
do $$
declare t text;
begin
  foreach t in array array['ref_statuses','ref_archetypes','prompt_templates','companies']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy ref_read on %I for select to authenticated using (true);', t);
  end loop;
end $$;
