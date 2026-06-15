/**
 * Live test of the custom careers-page provider: track Leapfrog Technology
 * (branded Strapi-backed page, no ATS) → scan → jobs land in inbox.
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const APP_URL = "http://localhost:3000";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const anon = createClient(SUPABASE_URL, ANON_KEY);
const { data: signup } = await anon.auth.signUp({
  email: `e2e-custom-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: membership } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = membership.tenant_id;

const jar = new Map();
const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)),
  },
});
await ssr.auth.setSession({
  access_token: signup.session.access_token,
  refresh_token: signup.session.refresh_token,
});
const cookie = [...jar.entries()]
  .map(([n, v]) => `${n}=${encodeURIComponent(v)}`)
  .join("; ");

// Track Leapfrog as a custom company (no title filter — see everything)
await anon.from("tracked_companies").insert({
  tenant_id: tenantId,
  display_name: "Leapfrog",
  provider: "custom",
  provider_config: { careers_url: "https://www.lftechnology.com/careers" },
  enabled: true,
});

console.log("⏳ scanning Leapfrog's branded careers page (browser + LLM)…");
const t0 = Date.now();
const scanRes = await fetch(`${APP_URL}/api/scan`, {
  method: "POST",
  headers: { Cookie: cookie },
});
const scan = await scanRes.json();
const secs = ((Date.now() - t0) / 1000).toFixed(1);
check(
  "custom scan extracts jobs",
  scanRes.ok && scan.added > 0,
  scanRes.ok
    ? `${scan.added} jobs in ${secs}s${scan.errors.length ? `; errors: ${JSON.stringify(scan.errors)}` : ""}`
    : JSON.stringify(scan)
);

const { data: postings } = await anon
  .from("job_postings")
  .select("title, url, location, source")
  .eq("tenant_id", tenantId)
  .order("title");
for (const p of (postings ?? []).slice(0, 10)) {
  console.log(`   · ${p.title}${p.location ? ` (${p.location})` : ""} -> ${p.url}`);
}
check(
  "postings have titles and source=custom",
  (postings ?? []).length > 0 && postings.every((p) => p.title.length > 2 && p.source === "custom")
);

// Rescan → dedup
const scan2 = await (
  await fetch(`${APP_URL}/api/scan`, { method: "POST", headers: { Cookie: cookie } })
).json();
check(
  "rescan dedups",
  scan2.added === 0 && scan2.alreadySeen > 0,
  `added=${scan2.added}, alreadySeen=${scan2.alreadySeen}`
);

console.log(failures === 0 ? "\n🎉 Custom provider test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
