/**
 * Verifies the browserless scan: Oracle Recruiting Cloud (Verisk) via its JSON
 * API, and Recruitee-behind-a-custom-domain (Leapfrog) via {origin}/api/offers/.
 * Both used to require Playwright. Fresh test tenant so we don't touch real data.
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL_ = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const APP = "http://localhost:3000";

const anon = createClient(URL_, ANON);
const { data: signup } = await anon.auth.signUp({
  email: `e2e-scan-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: m } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = m.tenant_id;

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
// Limit matched jobs (→ fast quick-score) while fetched still proves both providers worked.
await anon.from("scan_configs").insert({
  tenant_id: tenantId,
  title_positive: [],
  title_negative: [],
  loc_always_allow: [],
  loc_allow: ["Nepal"],
  loc_block: [],
});

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

console.log("⏳ scanning (Oracle + Recruitee, browserless)…");
const res = await fetch(`${APP}/api/scan`, {
  method: "POST",
  headers: { Cookie: cookie },
});
const s = await res.json();
if (!res.ok) {
  console.log("❌ scan failed:", JSON.stringify(s));
  process.exit(1);
}
console.log(
  `companies=${s.companies} fetched=${s.fetched} matched=${s.matched} added=${s.added}`
);
if (s.errors?.length) console.log("errors:", JSON.stringify(s.errors));
const ok = s.fetched > 100 && s.errors.length === 0;
console.log(
  ok
    ? `\n🎉 Browserless scan works — ${s.fetched} postings fetched, 0 errors`
    : `\n💥 expected >100 fetched and 0 errors`
);
process.exit(ok ? 0 : 1);
