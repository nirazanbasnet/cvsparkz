# Architecture — Career-Ops Cloud (Supabase + Next.js)

This adapts the TRD ([../../docs/saas/02-TRD.md](../../docs/saas/02-TRD.md)) to the chosen stack.

## High-level

```
                ┌────────────────────────────────────────────┐
  Browser ─────►│  Next.js (Vercel)                           │
                │   • App Router pages (shadcn/ui + Tailwind) │
                │   • Route Handlers / Server Actions = API   │
                │   • @supabase/ssr (auth cookies)            │
                └───────┬───────────────────────┬─────────────┘
                        │ anon key (RLS)         │ enqueue (service role, server-only)
                        ▼                        ▼
                ┌───────────────┐        ┌──────────────────┐
                │   Supabase    │        │  pgmq queue       │
                │  • Postgres   │◄───────┤  (table in PG)    │
                │    + RLS      │        └────────┬──────────┘
                │  • Auth       │                 │ poll
                │  • Storage    │        ┌────────▼───────────────────────┐
                │  • pg_cron    │        │  Node Worker (Fly/Railway)      │
                └──────┬────────┘        │  • eval (LLM Gateway → Claude)  │
                       │ pg_cron enqueue │  • pdf  (Playwright/Chromium)   │
                       └────────────────►│  • scan (ATS connectors)        │
                                         │  • analytics / followup         │
                                         │  service-role key → scope by    │
                                         │  tenant_id in code              │
                                         └─────────┬───────────────────────┘
                                                   ▼
                                        Anthropic Claude API · ATS public APIs · Stripe
```

## Why this split

| Concern | Where | Reason |
|---|---|---|
| CRUD, auth, fast reads | Next.js + Supabase (RLS via anon key) | Client/server read directly; RLS isolates tenants |
| Privileged writes (enqueue jobs, Stripe) | Next.js Server Actions / Route Handlers w/ **service-role key** | Never expose service key to client |
| Long/side-effect jobs (LLM eval, PDF, scan) | **Node worker container** | Edge Functions can't run Chromium & time out; workers are durable |
| Scheduling (recurring scans) | `pg_cron` enqueues into `pgmq` | Native Postgres, no extra infra |
| PDFs, exports | Supabase Storage (private buckets, signed URLs) | Per-tenant objects |

## Tenant isolation (two layers)
1. **RLS** (anon/auth requests): policies in `migrations/...0004_rls.sql` check `is_tenant_member(tenant_id)`. A browser can never read another tenant's rows.
2. **Worker code discipline** (service-role key bypasses RLS): every worker query MUST filter by the `tenant_id` carried in the job payload. Add automated tests asserting cross-tenant isolation.

## LLM Gateway (in `worker/` + shared)
- Loads `prompt_templates` (mode + lang + active version).
- Assembles context: current `cv_versions`, `candidate_profiles`, `personalizations`, JD text, comp research.
- Calls Claude with model routing (`MODEL_CHEAP|BALANCED|PREMIUM`) and **tool-use/JSON schema** to force the Machine Summary shape → persisted into `evaluations` columns.
- Records `usage_events` (tokens + cost) for quota/billing.
- Provider-abstracted (Gemini pluggable; BYO key from `tenant_integrations`).

## ATS connectors (`worker/src/providers/`)
Port `../../providers/*.mjs` (greenhouse, ashby, lever, recruitee, smartrecruiters, workable, local_parser). Each exports `{ id, detect(entry), fetch(entry, ctx) }`. Scan worker: fetch → title/location filter → dedup vs `job_postings.url_hash` → insert new + `pipeline_items` + notifications.

## Job lifecycle
`POST /api/evaluations` → insert `jobs(queued)` + `pgmq.send('jobs', payload)` → return `job_id` → worker consumes → updates `jobs.status`, writes `evaluations`/`generated_documents` → client polls `GET /api/jobs/:id` or subscribes via Supabase Realtime on `jobs`.

## Storage buckets
- `documents` (private): tailored CV PDFs, rendered reports. Path: `{tenant_id}/{kind}/{id}.pdf`.
- `exports` (private): GDPR data-export bundles.
Access via short-lived signed URLs minted server-side.
