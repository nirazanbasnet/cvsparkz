# Career-Ops Cloud

Multi-tenant SaaS for AI-powered job search — the hosted evolution of the `career-ops` CLI.

This folder is the **development project**, kept separate from the original CLI tool (which lives in the parent directory). The product spec lives in [../docs/saas/](../docs/saas/) (PRD + TRD); this folder contains the **implementation**.

## Status — MVP + discovery + PDF running ✅

Implemented and tested end-to-end:
- **Core loop:** sign up → profile + versioned CV (markdown editor **or file upload**: PDF/DOCX/TXT/MD → clean markdown) → paste a JD → A–G evaluation (Groq) → report viewer → tracker
- **Portal scanning:** tracked companies (Greenhouse/Ashby/Lever/Recruitee/SmartRecruiters/Workable public APIs, zero LLM cost) → title/location filters → dedup vs `job_postings` → Inbox → one-click evaluate
- **Tailored CV PDFs:** evaluation → LLM keyword tailoring (never invents) → branded HTML template (Space Grotesk + DM Sans) → Playwright → private Storage bucket → signed download

```bash
# 1. Start the backend (Docker required)
supabase start          # from this directory; db reset applies migrations + seed

# 2. Start the app
cd web && npm run dev   # http://localhost:3000

# 3. Sanity checks (optional)
node scripts/e2e.mjs            # core loop (12 checks)
node scripts/e2e-features.mjs   # scan + inbox eval + PDF (10 checks)
node scripts/e2e-cv-import.mjs  # CV file upload paths
```

Config lives in `web/.env.local` (Supabase local keys + `GROQ_API_KEY` + `LLM_MODEL`).

**Deferred from the full plan (see DEVELOPMENT_PLAN.md):** Stripe billing, scheduled scans (`pg_cron`), alerts/digests, and the separate worker container — evaluations, scans, and PDFs run inline in Next.js route handlers with `jobs` rows for observability. The `pgmq` worker split becomes necessary at multi-tenant scale, not before.

## Stack

| Layer | Choice |
|---|---|
| Frontend + API | **Next.js 16** (App Router, Route Handlers + Server Actions) |
| UI | **shadcn/ui** (Base UI) + **Tailwind CSS v4** |
| Database / Auth / Storage | **Supabase** (Postgres 17 + RLS, Supabase Auth, Supabase Storage) |
| Background jobs (deferred) | **Node worker container** (Playwright PDF + long LLM jobs) pulling from **Supabase Queues (pgmq)**; `pg_cron` for scheduling |
| AI | **LLM gateway** — Groq (dev/testing, free tier) now; Claude API for production, provider-abstracted via `LLM_BASE_URL`/`LLM_MODEL` |
| Billing (deferred) | **Stripe** |
| Vector / fuzzy | `pgvector`, `pg_trgm` (Supabase extensions) |

> **Why a separate worker?** Supabase Edge Functions cannot run headless Chromium and have short execution limits. PDF generation and multi-step evaluations run in a long-lived Node worker (deployable on Fly.io/Railway/Render) that consumes a pgmq queue. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repo layout (target)

```
career-ops-cloud/
├── web/                      # Next.js app (created via create-next-app)
│   ├── src/app/              # routes (App Router)
│   ├── src/components/ui/    # shadcn components
│   └── src/lib/              # supabase client, llm gateway client, etc.
├── worker/                   # Node background worker (Playwright, LLM, scan)
│   ├── src/jobs/             # eval, pdf, scan, analytics handlers
│   └── src/providers/        # ATS connectors (ported from ../providers/*.mjs)
├── packages/
│   └── shared/               # shared types, zod schemas, prompt templates
├── supabase/
│   ├── config.toml
│   ├── migrations/           # runnable SQL (provided here)
│   └── seed.sql              # reference data
└── docs/
    ├── ARCHITECTURE.md
    └── DEVELOPMENT_PLAN.md   # phased build plan
```

## Bootstrap (one-time)

Run these from inside `career-ops-cloud/`:

```bash
# 1. Supabase local stack + link
npm i -g supabase
supabase init                       # if not already (migrations/ already provided)
supabase start                      # local Postgres + Auth + Storage
supabase db reset                   # applies migrations/ + seed.sql

# 2. Next.js web app
npx create-next-app@latest web \
  --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd web && npx shadcn@latest init && cd ..

# 3. Supabase client + helpers in web
cd web && npm i @supabase/supabase-js @supabase/ssr zod @anthropic-ai/sdk stripe && cd ..

# 4. Worker
mkdir -p worker && cd worker && npm init -y \
  && npm i @supabase/supabase-js playwright @anthropic-ai/sdk js-yaml \
  && npx playwright install chromium && cd ..
```

Copy `.env.example` → `.env.local` (web) / `.env` (worker) and fill in keys.

## Next step

Follow [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) — start at **Phase 0**.
