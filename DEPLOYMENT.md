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

### 1.3 Push the schema (the 12 migrations)
From `cvsparkz/`:
```bash
supabase login                       # opens browser, creates access token
supabase link --project-ref <ref>    # <ref> = the project ref from the dashboard URL
supabase db push                     # applies supabase/migrations/* to the remote DB
```
This applies identity, core, ops, **RLS**, grants, **storage buckets** (0006), document meta,
custom-provider enum, multi-CV, inbox fit score, CV score (0011), and the Oracle scan-provider
enum (0012). Re-run `supabase db push` whenever you add migrations so prod stays in sync.

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
| `BROWSER_WS_ENDPOINT` | hosted-browser CDP URL | **recommended** for the scanner on Vercel — see Part 4. Omit to use the `@sparticuz` fallback (Pro plan). |
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

## Part 4 — Browser/Chromium on Vercel (the scanner)

Most of the app is browser-free, but the **custom careers-page scanner is not** — branded
(non-ATS) pages render their listings client-side, so it drives a real headless browser via
Playwright. Everything else stays HTTP-only and deploys with zero browser config.

| Feature | How it works |
|---|---|
| Tailored-CV / generated-CV **PDF** (`lib/pdf/*`) | `@react-pdf/renderer` — pure JS, no browser. |
| **ATS scanning** (`lib/scan/providers.ts`) | Plain `fetch()` to Greenhouse/Ashby/Lever/Recruitee/SmartRecruiters/Workable/Oracle public APIs. **No browser.** |
| **Custom careers-page** scan (`lib/scan/custom-provider.ts` → `lib/browser.ts`) | **Headless browser** renders the JS page, then the LLM extracts the jobs. |

### Making the browser work on Vercel

`lib/browser.ts` picks a browser in this order:

1. **`BROWSER_WS_ENDPOINT` (recommended for Vercel).** A hosted browser — [Browserless](https://browserless.io),
   [Browserbase](https://browserbase.com), or Bright Data. The function connects over CDP, so
   **nothing Chromium ships in the bundle** and there's no size/memory/cold-start problem. Set it
   as a Production env var:
   ```
   BROWSER_WS_ENDPOINT=wss://production-sfo.browserless.io?token=YOUR_TOKEN
   ```
2. **Fallback: `@sparticuz/chromium`.** If `BROWSER_WS_ENDPOINT` is unset on Vercel, it loads a
   Lambda-sized Chromium. This needs **Vercel Pro**: the scan routes already set `maxDuration = 300`
   in code, but bump the function memory to **≥1024 MB** in **Project → Settings → Functions**.
   It's heavier and sensitive to Chromium version drift, so the hosted browser above is preferred.
3. **Local dev:** full `playwright` with its bundled Chromium — no config.

`web/vercel.json` overrides the install to **skip Playwright's browser download** at build time
(`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bun install`) — you never need Playwright's own browsers on
Vercel (CDP uses the remote one, the fallback uses `@sparticuz`).

**Tradeoff if you skip the browser entirely:** if you'd rather not run/host a browser at all, add
custom companies via their underlying **ATS board URL** (auto-detected → HTTP-only) instead of the
branded page, and the scan needs no browser. JS-only pages added as "custom" will simply find fewer
jobs without a browser available.

### Function duration limits (Vercel only)
Routes set `maxDuration = 300` (evaluations, scan, documents). Vercel **Hobby caps at 60s** —
typical evaluations (~20s) are fine, but large multi-company scans may time out until you're on
**Pro**. On Render (a long-running server) there's no such cap.

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
