-- ============================================================
-- 0014 — Backfill: existing inbox items marked 'processed' with NO
-- evaluation were dismissals (Evaluate always writes an evaluation
-- row; Dismiss did not). Reclassify them so they show up in the
-- new "Dismissed" list and can be restored. Evaluated items keep
-- 'processed' (they live in the tracker).
-- ============================================================

update pipeline_items pi
set state = 'dismissed'
where pi.state = 'processed'
  and not exists (
    select 1 from evaluations e
    where e.tenant_id = pi.tenant_id
      and e.posting_id = pi.posting_id
  );
