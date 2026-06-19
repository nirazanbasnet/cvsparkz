# Google Sign-In (Supabase OAuth) — local + production

The code is already wired up:
- **Login button** → `signInWithOAuth({ provider: "google", redirectTo: \`${origin}/auth/callback\` })`
  in `web/src/app/login/page.tsx`. `origin` is the current site, so the same code works on
  localhost and the production domain.
- **Callback** → `web/src/app/auth/callback/route.ts` exchanges the `?code` for a session cookie,
  then redirects to `/dashboard` (`/auth` is already public in `middleware.ts`, so it isn't bounced
  to `/login`).
- **Local config** → `supabase/config.toml` has `[auth.external.google]` enabled, reading creds from
  env vars.

What's left is configuration in **Google Cloud** + **Supabase**. Do it once for each environment.

## The redirect chain (important — this trips everyone up)

```
Your app  ──signInWithOAuth──▶  Google consent screen
Google    ──redirects to──────▶  Supabase:  /auth/v1/callback   ← goes in Google Cloud "Redirect URIs"
Supabase  ──redirects to──────▶  Your app:  /auth/callback      ← goes in Supabase "Redirect URLs"
Your app  ──exchanges code────▶  session set, on to /dashboard
```

- **Google Cloud "Authorized redirect URIs"** = the **Supabase** callback (`…/auth/v1/callback`).
- **Supabase "Redirect URLs"** (or local `additional_redirect_urls`) = your **app** callback (`…/auth/callback`).

## Step 1 — Google Cloud Console (shared by local + prod)

1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → OAuth consent screen** → External → fill app name, support email, save.
   (While "Testing", add your Google account under **Test users**.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
4. **Authorized JavaScript origins** (your app origins):
   - `http://localhost:3000`
   - `https://YOUR-DOMAIN` (e.g. `https://cvsparkz.vercel.app`)
5. **Authorized redirect URIs** (the *Supabase* callbacks):
   - `http://127.0.0.1:54321/auth/v1/callback`  ← local Supabase
   - `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`  ← hosted Supabase
6. Save → copy the **Client ID** and **Client secret**.

> One OAuth client can serve both environments — just list all four URLs above.

## Step 2 — Local

1. `cp supabase/.env.example supabase/.env` and paste the Client ID + secret:
   ```
   SUPABASE_AUTH_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   SUPABASE_AUTH_GOOGLE_SECRET=xxxx
   ```
   (`supabase/.env` is gitignored.)
2. Load the vars and (re)start Supabase so `config.toml`'s `env(...)` resolves:
   ```bash
   set -a; source supabase/.env; set +a
   supabase stop && supabase start
   ```
3. Run the app (`cd web && npm run dev`) → open http://localhost:3000/login → **Continue with Google**.

`config.toml` already has `site_url = http://localhost:3000` and
`additional_redirect_urls = ["http://localhost:3000/auth/callback"]`, so the app callback is allowed.

## Step 3 — Production (hosted Supabase + Vercel)

1. **Supabase dashboard → Authentication → Providers → Google**: enable, paste the **same**
   Client ID + secret, save.
2. **Supabase dashboard → Authentication → URL Configuration**:
   - **Site URL**: `https://YOUR-DOMAIN`
   - **Redirect URLs**: add `https://YOUR-DOMAIN/auth/callback`
     (add `http://localhost:3000/auth/callback` too if you want Google login against the hosted DB
     from local; optional).
3. Deploy. The button uses `window.location.origin`, so no app env var is needed for the redirect.

## Troubleshooting

- **`redirect_uri_mismatch` (Google):** the Supabase `/auth/v1/callback` URL isn't in Google's
  Authorized redirect URIs (check http vs https, `127.0.0.1` vs `localhost`, trailing slash).
- **Redirected to `/login?error=…`:** the app callback (`/auth/callback`) isn't in Supabase's
  allowed redirect URLs, or the code exchange failed — the message is shown on the login page.
- **Local creds not picked up:** you didn't `source supabase/.env` before `supabase start`, or didn't
  restart Supabase after changing them.
- **`access_denied` / app still "Testing":** add your account under Google's OAuth **Test users**,
  or publish the consent screen.
