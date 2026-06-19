import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth (PKCE) callback. Google redirects here with a `?code=...`; we exchange
 * it for a session (stored in cookies via the SSR client) and send the user on
 * to `next`. Works on both local and production:
 *   - `origin` covers localhost.
 *   - behind Vercel's proxy we trust `x-forwarded-host` so the final redirect
 *     lands on the real domain, not the internal one.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const oauthError =
    searchParams.get("error_description") ?? searchParams.get("error");

  // Only allow internal redirects — never an attacker-controlled absolute URL.
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") ? nextParam : "/dashboard";

  const redirectTo = (path: string) => {
    const forwardedHost = req.headers.get("x-forwarded-host");
    const isLocal = process.env.NODE_ENV === "development";
    const base = !isLocal && forwardedHost ? `https://${forwardedHost}` : origin;
    return NextResponse.redirect(`${base}${path}`);
  };

  if (oauthError) {
    return redirectTo(`/login?error=${encodeURIComponent(oauthError)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(next);
    return redirectTo(`/login?error=${encodeURIComponent(error.message)}`);
  }

  return redirectTo(`/login?error=${encodeURIComponent("Missing auth code")}`);
}
