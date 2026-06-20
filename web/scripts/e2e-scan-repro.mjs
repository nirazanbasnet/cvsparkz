/**
 * Reproduce the user's "matched but inbox empty" with their exact filter
 * (primary CV role "AI Engineer (Lead Developer)" → derived keyword "ai",
 * no manual scan_config). Surfaces insert errors now that run.ts reports them.
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL_ = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const APP = "http://localhost:3000";

const anon = createClient(URL_, ANON);
const { data: signup } = await anon.auth.signUp({
  email: `e2e-repro-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: m } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = m.tenant_id;

await anon.from("cv_versions").insert({
  tenant_id: tenantId,
  version: 1,
  label: "Main CV",
  primary_role: "AI Engineer (Lead Developer)",
  content_md: "# Dev\n\n## Summary\nAI engineer.\n\n## Skills\nPython, LLMs",
  content_hash: "h1",
  is_current: true,
});
await anon.from("tracked_companies").insert([
  {
    tenant_id: tenantId,
    display_name: "Leapfrog",
    provider: "custom",
    provider_config: { careers_url: "https://career.lftechnology.com" },
    enabled: true,
  },
  {
    tenant_id: tenantId,
    display_name: "Verisk",
    provider: "custom",
    provider_config: {
      careers_url:
        "https://fa-ewmy-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs",
    },
    enabled: true,
  },
]);

const jar = new Map();
const ssr = createServerClient(URL_, ANON, {
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

console.log("⏳ scanning with role-derived 'ai' filter…");
const res = await fetch(`${APP}/api/scan`, { method: "POST", headers: { Cookie: cookie } });
const s = await res.json();
console.log(JSON.stringify(s, null, 2));

// What actually landed in the inbox?
const { data: items } = await anon
  .from("pipeline_items")
  .select("state, job_postings(title)")
  .eq("tenant_id", tenantId);
console.log(`\ninbox pipeline_items: ${items?.length ?? 0}`);
for (const i of items ?? [])
  console.log(" -", i.state, "|", (Array.isArray(i.job_postings) ? i.job_postings[0] : i.job_postings)?.title);
