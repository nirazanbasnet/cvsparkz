# CVSparkz — Deployment Guide (Vercel + Supabase)

Deploy the `cvsparkz` app as a standalone product:

- **Frontend + API** → Vercel (the Next.js app in `web/`)
- **Backend** (Postgres, Auth, Storage, RLS) → Supabase Cloud

```
Browser ──> Vercel (Next.js 16 app: SSR pages + /api routes)
                │
                ├─ @supabase/ssr  ──> Supabase Cloud (Auth + Postgres + Storage, RLS)
                ├─ Cerebras / Groq ─> LLM gateway (CV score, evaluate, assists)
                └─ Tavily ─────────> web research (eval blocks D/G)
```

> The repo root (`career-ops-main`) is **not** a git repo and is not what gets deployed.
> Only the `cvsparkz/web` subdirectory is the Vercel project. Supabase is configured
> from `cvsparkz/supabase`.

---

## Prerequisites

- A [Supabase](https://supabase.com) account
- A [Vercel](https://vercel.com) account
- A GitHub account (recommended) **or** the Vercel CLI (`npm i -g vercel`)
- The Supabase CLI: `npm i -g supabase` (or `brew install supabase/tap/supabase`)
- Your LLM + research keys: **Cerebras** (active), **Groq** (fallback), **Tavily**

---

## Part 1 — Supabase backend (production)

### 1.1 Create the project
1. Supabase dashboard → **New project**.
2. Name it (e.g. `cvsparkz`), pick a **region close to your Vercel region**, set a strong **database password** (save it).
3. Wait for provisioning. Postgres 17 is fine (matches `supabase/config.toml`).

### 1.2 Grab the keys
Project → **Settings → API**:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` / `publishable` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **server-only, never `NEXT_PUBLIC_`**

### 1.3 Push the schema (the 11 migrations)
From `cvsparkz/`:
```bash
supabase login                       # opens browser, creates access token
supabase link --project-ref <ref>    # <ref> = the project ref from the dashboard URL
supabase db push                     # applies supabase/migrations/* to the remote DB
```
This applies identity, core, ops, **RLS**, grants, **storage buckets** (0006), document meta,
custom-provider enum, multi-CV, inbox fit score, and CV score (0011).

- **Do NOT run `seed.sql`** — that's local-dev seed data only.
- Verify in the dashboard: **Table editor** shows the tables, **Storage** shows the buckets,
  **Authentication → Policies** shows RLS enabled.

### 1.4 Configure Auth
Authentication → **URL Configuration**:
- **Site URL**: your Vercel URL (set the real one after Part 2, e.g. `https://cvsparkz.vercel.app`)
- **Redirect URLs**: add `https://<your-domain>/**`

Authentication → **Providers → Email**: the app uses **email + password**. For an MVP without
custom SMTP, either:
- turn **"Confirm email" OFF** (users can sign in immediately — fine for testing), or
- keep it ON and configure SMTP (Settings → Auth → SMTP) so confirmation emails actually send.

**Google sign-in** is also wired up (login page + `/auth/callback`). To enable it for local and
production, follow `docs/GOOGLE_AUTH.md` (Google Cloud OAuth client → Supabase provider config).
Make sure your app callback `https://<your-domain>/auth/callback` is in the **Redirect URLs** above.

### 1.5 (Only if you use Edge Functions)
If `supabase/functions/` contains functions you rely on:
```bash
supabase functions deploy <name>
```
(The core app does not require this for the MVP.)

---

## Part 2 — Vercel (the Next.js app)

### 2.1 Get the code into git
The deployable app is `cvsparkz/web`. Easiest: make `cvsparkz` its own repo.
```bash
cd cvsparkz
git init && git add -A && git commit -m "CVSparkz cloud app"
gh repo create cvsparkz --private --source=. --push   # or push to a repo you made in the UI
```
`.env*` is already gitignored, so your keys won't be committed. ✅

### 2.2 Import into Vercel
1. Vercel → **Add New → Project** → import the repo.
2. **Root Directory**: set to **`web`** (this is the critical monorepo step — the Next.js app
   lives in the `web/` subfolder). If you made the *repo* at `cvsparkz`, root = `web`.
   If you somehow rooted the repo higher up, root = `cvsparkz/web`.
3. Framework preset: **Next.js** (auto-detected). Leave build command (`next build`) and output as default.

### 2.3 Environment variables
Project → **Settings → Environment Variables**. Add these for **Production** (and Preview if you want):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | from 1.2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | from 1.2 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | **secret, server-only** |
| `CEREBRAS_API_KEY` | your `csk-…` key | active LLM |
| `LLM_BASE_URL` | `https://api.cerebras.ai/v1` | matches your `.env.local` |
| `LLM_MODEL` | e.g. `gpt-oss-120b` | matches your `.env.local` |
| `LLM_TPM_LIMIT` | e.g. `30000` | tokens-per-min budget |
| `LLM_MAX_TOKENS` | e.g. `8000` | per-call ceiling |
| `GROQ_API_KEY` | your `gsk_…` key | fallback provider |
| `TAVILY_API_KEY` | your `tvly-…` key | web research |
| `NEXT_PUBLIC_APP_URL` | your final Vercel URL | set after first deploy, then redeploy |

> Copy the exact values from `cvsparkz/web/.env.local` — but point
> `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` at the **remote** project, not local `127.0.0.1:54321`.

### 2.4 Deploy
Click **Deploy**. First build takes a few minutes.

---

## Part 3 — Post-deploy wiring

1. Copy the live URL Vercel gives you (e.g. `https://cvsparkz.vercel.app`).
2. Set `NEXT_PUBLIC_APP_URL` to that URL in Vercel → **redeploy** (so links/metadata are correct).
3. In Supabase → Auth → **Site URL** + **Redirect URLs**, replace the placeholder with the real URL.
4. Sign up a test account on the live site and confirm a session is created.

---

## Part 4 — Playwright / Chromium on Vercel — ✅ ALREADY APPLIED

`web/src/lib/browser.ts` is the shared headless-Chromium singleton used by:

| Feature | File |
|---|---|
| PDF generation (tailored CV) | `lib/pdf/generate.ts` |
| Scanning **custom/branded** careers pages | `lib/scan/custom-provider.ts` |
| JS-rendered JD fetch **fallback** | `lib/eval/fetch-jd.ts` |

> **Note on scanning:** the 6 ATS providers (Greenhouse, Ashby, Lever, Recruitee,
> SmartRecruiters, Workable) use plain `fetch()` to public JSON APIs — **no browser**, so they
> always worked on Vercel. Chromium is only needed for the **custom-page** scan branch.

### What was done
`browser.ts` now picks its browser by environment (committed):
- **Local / real server** → full `playwright` with its bundled Chromium (dev is unchanged).
- **Serverless** (`process.env.VERCEL` or `AWS_LAMBDA_FUNCTION_NAME`) → `playwright-core` +
  `@sparticuz/chromium` (a slim Chromium that fits a serverless function).

Dependencies added: `@sparticuz/chromium@^149`, `playwright-core@1.60.0` (pinned to match
`playwright@1.60.0`). `next.config.ts` `serverExternalPackages` now also lists `playwright-core`
and `@sparticuz/chromium` so the compressed binary isn't bundled. Verified: `next build` passes;
local launch + serverless-dep wiring smoke-tested.

### Vercel-side settings you still need to set
These are dashboard/config settings, not code:

1. **Function memory ≥ 1024 MB** for the routes that launch Chromium (`/api/documents`,
   `/api/scan`, `/api/evaluations`). Chromium needs the headroom. Set per-project in
   **Settings → Functions**, or add a `vercel.json`:
   ```json
   {
     "functions": {
       "src/app/api/documents/**":   { "memory": 1769, "maxDuration": 60 },
       "src/app/api/scan/**":        { "memory": 1769, "maxDuration": 60 },
       "src/app/api/evaluations/**": { "memory": 1769, "maxDuration": 60 }
     }
   }
   ```
2. Routes stay on the **Node.js runtime** (default) — do **not** set them to `edge`.
3. The `@sparticuz/chromium` binary ships brotli-compressed (~50 MB) and decompresses to `/tmp`
   at runtime, so it stays under Vercel's 250 MB unzipped function limit.

### If PDF/custom-scan misbehave on Vercel
Chromium-version drift between `@sparticuz/chromium` and `playwright-core` is the usual culprit.
Pin `@sparticuz/chromium` to the release whose Chromium matches `playwright-core@1.60`, or switch
to `@sparticuz/chromium-min` + a hosted brotli pack. As a fallback, move PDF + custom-scan to a
small always-on worker (Railway / Render / Fly.io) — see `docs/FEATURE_BACKLOG.md`.

### Function duration limits
Routes set `maxDuration = 300` (evaluations, scan, documents). Vercel **Hobby caps at 60s** —
typical evaluations (~20s) are fine, but large multi-company scans may time out until you're on **Pro**.

---

## Part 5 — Security (do this)

- **Rotate the keys that were shared in chat** (Cerebras, Groq, Tavily) before/after going live —
  treat them as compromised. Put the new values only in Vercel env vars + local `.env.local`.
- `SUPABASE_SERVICE_ROLE_KEY` must **never** be a `NEXT_PUBLIC_` var and never reach the browser.
- Confirm `.env*` stays gitignored (it is). Never commit real keys.
- The guest scoring endpoint (`/api/public/cv-score`) is intentionally no-auth with a soft
  cookie cap of 2 (`cvsparkz_guest_scores`). Clearing cookies / incognito resets it — expected for a demo.

---

## Part 6 — Smoke test (after deploy)

- [ ] Landing page loads, wordmark reads **CVSparkz**
- [ ] Guest "Score my CV free" returns a score (and blocks after 2)
- [ ] Sign up → redirected into the app; nav shows **CVSparkz**
- [ ] CV score + builder work
- [ ] Evaluate: Quick check returns a match %; Full evaluation saves to tracker
- [ ] Scan a Greenhouse/Ashby/Lever company → results in inbox
- [ ] (If Option B applied) Generate a tailored PDF; scan a custom careers page

---

## Quick command reference

```bash
# Supabase (from cvsparkz/)
supabase login
supabase link --project-ref <ref>
supabase db push

# App to git + Vercel (from cvsparkz/)
git init && git add -A && git commit -m "CVSparkz cloud app"
gh repo create cvsparkz --private --source=. --push
# then import in Vercel UI, Root Directory = web, add env vars, Deploy

# OR deploy straight from the CLI (from cvsparkz/web/)
vercel            # first run links/creates the project
vercel --prod     # production deploy
```
