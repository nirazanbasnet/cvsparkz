# Development Plan — Career-Ops Cloud

**Stack:** Supabase · Next.js (App Router) · shadcn/ui · Tailwind CSS · Node worker · Claude API · Stripe
**Spec:** [PRD](../../docs/saas/01-PRD.md) · [TRD](../../docs/saas/02-TRD.md) · [Architecture](ARCHITECTURE.md)

The plan is organized into **11 phases** grouped into 4 releases. Each phase lists: **Goal · Tasks · Deliverables · Exit criteria**. Durations assume ~2 engineers; adjust to your team. Phases 0–6 = **MVP**, the smallest thing that's a real, billable product.

> **Build order rationale:** stand up the foundation (auth + DB + tenancy) first, then the single highest-value loop (paste a JD → get an evaluation → generate a tailored CV → track it), then monetize it, *then* add discovery/scale. Don't build scanning before the evaluation engine — the engine is the product.

---

## Release 1 — MVP (Phases 0–6)

### Phase 0 — Project setup & infrastructure
**Goal:** Reproducible local + CI environment; everything boots.
**Duration:** ~3–5 days.

**Tasks**
- [ ] Initialize `web/` with `create-next-app` (TS, App Router, src dir, Tailwind, ESLint).
- [ ] `shadcn init`; add base components (button, input, card, dialog, table, toast, dropdown, tabs, badge).
- [ ] Initialize `worker/` (TS Node project, tsx/esbuild, Playwright + Chromium).
- [ ] `packages/shared/` for zod schemas + TypeScript types shared by web + worker.
- [ ] `supabase init`; drop in provided `migrations/` + `seed.sql`; `supabase start` + `db reset` works locally.
- [ ] `.env.example` → real env wiring; secrets via Vercel/host + worker host.
- [ ] CI (GitHub Actions): typecheck, lint, `supabase db reset` against ephemeral PG, unit tests.
- [ ] Deploy skeleton: web → Vercel, worker → Fly.io/Railway, Supabase project (staging).

**Deliverables:** running `web` (landing + empty dashboard), running `worker` (no-op consumer), green CI, staging deploy.
**Exit:** `npm run dev` (web) + worker both start; migrations apply cleanly on a fresh DB; staging URL loads.

---

### Phase 1 — Auth, tenancy & data layer
**Goal:** Users sign up, get an isolated workspace; RLS proven.
**Duration:** ~1 week. **Maps to:** FR-1.x.

**Tasks**
- [ ] Supabase Auth: email/password + Google + GitHub; `@supabase/ssr` cookie session in Next.js middleware.
- [ ] Verify `handle_new_user` trigger provisions `users` + `tenants` + `tenant_members` on signup.
- [ ] Typed Supabase clients: browser (anon), server (anon w/ user cookie), admin (service role, server-only).
- [ ] Generate DB types (`supabase gen types typescript`) into `packages/shared`.
- [ ] Auth UI: sign-in / sign-up / callback / sign-out; protected route group.
- [ ] **RLS isolation tests** (critical): seed two tenants, assert tenant A cannot read tenant B's rows via anon client.
- [ ] App shell: nav, workspace switcher (stub), settings skeleton.

**Deliverables:** working auth, auto-provisioned workspace, generated types, passing RLS tests.
**Exit:** new signup lands in a private workspace; automated test confirms zero cross-tenant leakage.

---

### Phase 2 — Profile & CV
**Goal:** A user has a structured profile + a canonical, versioned CV.
**Duration:** ~1.5 weeks. **Maps to:** FR-2.x.

**Tasks**
- [ ] Profile form (shadcn + react-hook-form + zod): contact, target roles, archetypes, narrative, comp, location → `candidate_profiles`.
- [ ] Personalization form → `personalizations` (archetype map, framing, negotiation, location policy).
- [ ] CV editor (markdown + structured sections); save creates a new `cv_versions` row (immutable, `is_current` flip), compute `content_hash`.
- [ ] CV import job (`cv_import` queue): paste / PDF upload (parse via Claude Haiku) / LinkedIn-URL paste → structured CV draft for review.
- [ ] Proof points CRUD → `proof_points` (+ embeddings backfill).
- [ ] CV-sync indicator (warn when reports were built on an older version).

**Deliverables:** onboarding wizard producing a complete profile + v1 CV; importer.
**Exit:** a new user goes from signup → filled profile → editable CV in < 10 min.

---

### Phase 3 — Evaluation engine (the core) ⭐
**Goal:** Paste a URL/JD → full A–G evaluation + persisted structured report.
**Duration:** ~2 weeks. **Maps to:** FR-3.x.

**Tasks**
- [ ] **LLM Gateway** in worker: model routing, retries, token metering → `usage_events`; provider abstraction (Claude primary).
- [ ] Port `modes/oferta.md` + `modes/_shared.md` → `prompt_templates` (seed `oferta`/`en` v1). Use **tool-use/JSON schema** to force the Machine Summary.
- [ ] JD ingestion: fetch URL (worker fetch → fallback Claude web research) + **liveness check** (port `liveness-core.mjs`); store `job_postings`.
- [ ] `evaluation` job handler: assemble context (CV, profile, personalization, JD) → call gateway → persist `evaluations` (promoted columns + blocks JSONB + `report_md`).
- [ ] Upsert `applications` (dedup via `company_norm`/`role_norm` + `pg_trgm`), set status `evaluated`.
- [ ] API: `POST /api/evaluations` (202 + job_id), `GET /api/jobs/:id`, `GET /api/evaluations/:id`.
- [ ] UI: evaluate page (paste URL/JD, live job progress via Realtime), A–G report viewer with expandable evidence + legitimacy banner + low-fit warning.
- [ ] **Golden-set eval harness**: fixed JDs+CV → snapshot scores; regression-gate prompt changes in CI.

**Deliverables:** end-to-end evaluation; report viewer; golden-set tests.
**Exit:** pasting a real job URL produces a correct, persisted A–G report in p95 < 60s; report fields are queryable.

---

### Phase 4 — Tailored CV / PDF generation
**Goal:** One-click ATS-optimized PDF tailored to a JD.
**Duration:** ~1.5 weeks. **Maps to:** FR-4.x.

**Tasks**
- [ ] Port `modes/pdf.md` logic + `templates/cv-template.html` + fonts into worker.
- [ ] `pdf` job handler: rewrite summary (inject JD keywords, never invent), reorder bullets, competency grid, archetype framing → HTML → **Playwright** → PDF.
- [ ] Letter/A4 auto-detection; upload to Storage `documents` bucket; record `generated_documents`.
- [ ] Auto-PDF trigger when `score ≥ auto_pdf_score_threshold` (from `cv_prefs`).
- [ ] API + UI: generate/download (signed URL), list tailored docs per application.
- [ ] (Could) LaTeX export path (port `generate-latex.mjs`).

**Deliverables:** tailored PDF generation + download.
**Exit:** generate a keyword-tailored, ATS-parseable PDF from an evaluation in p95 < 20s.

---

### Phase 5 — Pipeline & tracker
**Goal:** Single pipeline of record, discovery→offer.
**Duration:** ~1 week. **Maps to:** FR-6.x.

**Tasks**
- [ ] Applications API: list (filters), `PATCH` status/notes, timeline (`application_status_events`).
- [ ] Kanban (drag between canonical states) + table view (sort/filter); inline notes.
- [ ] Status-change side effects (hooks): entering `interview` → suggest interview prep; `applied` → start follow-up clock.
- [ ] Dedup enforcement surfaced in UI (update existing, never duplicate).
- [ ] Dashboard v1: counts by status + simple funnel.

**Deliverables:** kanban + table tracker, status timeline.
**Exit:** user can move an app through all states; no duplicate company+role can be created.

---

### Phase 6 — Billing & quotas (completes MVP)
**Goal:** Monetize; enforce plan limits.
**Duration:** ~1 week. **Maps to:** FR-11.x.

**Tasks**
- [ ] Stripe: products/prices (Free, Pro, Power); Checkout + Billing Portal.
- [ ] `webhooks/stripe` route (signature-verified) → sync `subscriptions` + `tenants.plan`.
- [ ] Quota gate: before enqueuing metered jobs, aggregate `usage_events` vs plan (Redis/PG cache); `402` + upgrade CTA on exceed; soft warnings at 80%.
- [ ] Usage dashboard (evaluations/scans/PDFs this period).
- [ ] BYO-Anthropic-key option (encrypted `tenant_integrations`) at reduced platform fee.

**Deliverables:** working subscriptions + metering + quota enforcement.
**Exit:** a user can subscribe, hit a quota, and upgrade — all self-serve. **🎉 MVP launchable.**

---

## Release 2 — Discovery (Phase 7)

### Phase 7 — Scanning, scheduling & alerts
**Goal:** Automatically surface new matching jobs.
**Duration:** ~2 weeks. **Maps to:** FR-5.x, FR-10.x.

**Tasks**
- [ ] Port `providers/*.mjs` → `worker/src/providers/` (greenhouse, ashby, lever, recruitee, smartrecruiters, workable, local_parser) with contract tests.
- [ ] `scan` job: fetch per tracked company → title/location filters → dedup vs `job_postings` → insert new + `pipeline_items` + `notifications`.
- [ ] Scan config UI (tracked companies, filters) → `tracked_companies` + `scan_configs`; seed from `templates/portals.example.yml`.
- [ ] Scheduler: `pg_cron` reads `scan_configs.next_run_at`/`schedule_cron` → `pgmq.send`.
- [ ] Inbox UI: discovered postings, bulk-select → evaluate.
- [ ] Alerts: in-app + email digest (Resend/Postmark) + optional Slack webhook on strong matches.

**Deliverables:** recurring scans, inbox, alerts.
**Exit:** a scheduled scan finds new postings, dedups, and notifies; user bulk-evaluates from the inbox.

---

## Release 3 — Depth & scale (Phases 8–9)

### Phase 8 — Interview prep, follow-ups, analytics, outreach
**Goal:** Full lifecycle support beyond apply.
**Duration:** ~2.5 weeks. **Maps to:** FR-7.x, FR-8.x, FR-9.x.

**Tasks**
- [ ] Interview prep job (port `modes/interview-prep.md`): research → `interview_preps`; story bank CRUD + embedding-based suggestion of relevant `stories`.
- [ ] Follow-up cadence (port `followup-cadence.mjs` → SQL/worker): urgency, next-action dates, draft messages; dashboard.
- [ ] Pattern analytics (port `analyze-patterns.mjs`): funnel, blockers, archetype performance, recommended threshold; report + recommendations to update profile/scan config.
- [ ] Outreach (port `modes/contacto.md`): contact suggestions + ≤300-char drafts → `contacts` (never auto-send).

**Deliverables:** prep, follow-ups, analytics, outreach drafting.
**Exit:** every pipeline stage has an assistive action; analytics produce actionable recommendations.

---

### Phase 9 — Public API, multi-language, observability, hardening
**Goal:** Power-user parity + production-grade ops.
**Duration:** ~2 weeks. **Maps to:** FR-1.4, FR-4.3, NFRs.

**Tasks**
- [ ] Public REST API + API-key auth (`api_keys`, hashed, scoped, rate-limited); OpenAPI docs.
- [ ] CLI parity / migration tool: import existing OSS `career-ops` data (applications.md, reports, profile.yml, etc.) → upload-zip flow.
- [ ] Multi-language CV/eval (port `modes/{de,fr,ja,pt,ru,ua,tr}`) via `prompt_templates` lang variants.
- [ ] Observability: OpenTelemetry traces (API→queue→worker→LLM), Sentry, usage/cost dashboards, structured logs w/ PII redaction.
- [ ] Security hardening: prompt-injection sandboxing of fetched JD/web content, dependency/secret scanning, load test, penetration test of RLS.
- [ ] GDPR: data export bundle + hard-delete flows.

**Deliverables:** public API, importer, i18n, full observability, security pass.
**Exit:** external API usable with keys; OSS users can migrate; SLOs + alerts in place.

---

## Release 4 — Teams (Phase 10, v2)

### Phase 10 — Multi-member workspaces (coaches/teams)
**Goal:** Coaches manage multiple clients; pooled billing.
**Duration:** ~2–3 weeks. **Maps to:** PRD §3 (coach persona), FR-1.2.

**Tasks**
- [ ] Multi-member `tenant_members` UI (invite, roles); per-client sub-views.
- [ ] Pooled quotas + team billing in Stripe.
- [ ] Coach dashboard across client pipelines (RLS already supports it).

**Exit:** a coach invites clients and manages several pipelines under one subscription.

---

## Cross-cutting workstreams (run continuously)

| Workstream | Practice |
|---|---|
| **Testing** | Unit (logic), integration (API+DB), RLS isolation tests, connector contract tests, golden-set eval regression in CI |
| **Prompt versioning** | Never edit an active `prompt_templates` row; create a new version, pass golden-set, then activate |
| **Cost control** | Model routing, quotas, cache deterministic steps, per-tenant worker concurrency caps |
| **Security** | Service-role key server-only; signed URLs; argon2 API keys; untrusted-content sandboxing; audit_log |
| **DX** | `supabase db reset` parity local/CI/staging; typed end-to-end (zod + generated DB types) |

## Suggested timeline (2 engineers)

| Release | Phases | Calendar |
|---|---|---|
| R1 — MVP | 0–6 | ~8–9 weeks |
| R2 — Discovery | 7 | ~2 weeks |
| R3 — Depth & scale | 8–9 | ~4–5 weeks |
| R4 — Teams | 10 | ~2–3 weeks |

**First milestone to aim for:** end of Phase 3 (evaluation engine) — that's the moment the product is demonstrably valuable, even before billing.
