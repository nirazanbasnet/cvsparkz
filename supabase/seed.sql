-- ============================================================
-- Seed: canonical statuses + archetype catalog (from CLI).
-- Applied by `supabase db reset`.
-- ============================================================

insert into ref_statuses (id, label, dashboard_group, sort_order) values
  ('evaluated','Evaluated','evaluated',1),
  ('applied','Applied','applied',2),
  ('responded','Responded','responded',3),
  ('interview','Interview','interview',4),
  ('offer','Offer','offer',5),
  ('rejected','Rejected','rejected',6),
  ('discarded','Discarded','discarded',7),
  ('skip','SKIP','skip',8)
on conflict (id) do nothing;

insert into ref_archetypes (id, name, description, axes) values
  ('platform_llmops','AI Platform / LLMOps Engineer',
   'Puts AI in production with metrics, observability, reliability.',
   array['evaluation','observability','reliability','pipelines']),
  ('agentic_automation','Agentic Workflows / Automation',
   'Builds reliable agent systems with human-in-the-loop.',
   array['HITL','tooling','orchestration','multi-agent']),
  ('technical_ai_pm','Technical AI PM',
   'Bridges product and applied AI.',
   array['product','roadmap','applied-ai']),
  ('ai_solutions_architect','AI Solutions Architect',
   'Designs AI systems for enterprise integration.',
   array['architecture','integration','enterprise']),
  ('ai_forward_deployed','AI Forward Deployed Engineer',
   'Customer-facing applied AI delivery.',
   array['delivery','customer','prototyping']),
  ('ai_transformation','AI Transformation',
   'Drives org-wide AI adoption.',
   array['strategy','change','enablement'])
on conflict (id) do nothing;
