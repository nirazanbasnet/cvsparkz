/**
 * Multi-CV + role-driven scan filtering:
 *   two CVs with different target roles → scan filters by PRIMARY CV's role
 *   → switch primary → rescan filters by the new role.
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
  email: `e2e-multicv-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: membership } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = membership.tenant_id;

// Two CVs: research-focused (primary) and product-focused
await anon.from("cv_versions").insert([
  {
    tenant_id: tenantId,
    version: 1,
    label: "Research CV",
    primary_role: "Senior Research Engineer",
    content_md: "# T\n\n## Summary\nResearch engineer.\n\n## Skills\nPython, ML",
    content_hash: "h1",
    is_current: true,
  },
  {
    tenant_id: tenantId,
    version: 2,
    label: "Product CV",
    primary_role: "Product Manager",
    content_md: "# T\n\n## Summary\nProduct manager.\n\n## Skills\nRoadmaps",
    content_hash: "h2",
    is_current: false,
  },
]);

await anon.from("tracked_companies").insert({
  tenant_id: tenantId,
  display_name: "Anthropic",
  provider: "greenhouse",
  provider_config: { careers_url: "https://job-boards.greenhouse.io/anthropic" },
  enabled: true,
});
// No scan_configs → title filter must come from the primary CV's role

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

// ── 1. Scan with "Senior Research Engineer" primary ──────────
console.log("⏳ scan #1 (primary = Research CV)…");
const scan1 = await (
  await fetch(`${APP_URL}/api/scan`, { method: "POST", headers: { Cookie: cookie } })
).json();
check(
  "scan derives filter from primary CV role",
  scan1.roleFilter?.role === "Senior Research Engineer" &&
    scan1.roleFilter.keywords.includes("research"),
  JSON.stringify(scan1.roleFilter)
);
check("research jobs found", scan1.added > 0, `${scan1.added} added of ${scan1.fetched} fetched`);

const { data: postings1 } = await anon
  .from("job_postings")
  .select("title")
  .eq("tenant_id", tenantId);
check(
  "all matched titles contain 'research'",
  postings1.length > 0 && postings1.every((p) => /research/i.test(p.title)),
  postings1.slice(0, 3).map((p) => p.title).join(" | ")
);

// ── 2. Switch primary to Product CV → rescan ─────────────────
await anon.from("cv_versions").update({ is_current: false }).eq("tenant_id", tenantId);
await anon
  .from("cv_versions")
  .update({ is_current: true })
  .eq("tenant_id", tenantId)
  .eq("label", "Product CV");

console.log("⏳ scan #2 (primary = Product CV)…");
const scan2 = await (
  await fetch(`${APP_URL}/api/scan`, { method: "POST", headers: { Cookie: cookie } })
).json();
check(
  "filter follows new primary CV",
  scan2.roleFilter?.role === "Product Manager" &&
    scan2.roleFilter.keywords.includes("product"),
  JSON.stringify(scan2.roleFilter)
);
check("product jobs found", scan2.added > 0, `${scan2.added} added`);

const { data: postings2 } = await anon
  .from("job_postings")
  .select("title")
  .eq("tenant_id", tenantId)
  .order("first_seen_at", { ascending: false })
  .limit(scan2.added);
check(
  "newly added titles contain 'product'",
  postings2.every((p) => /product/i.test(p.title)),
  postings2.slice(0, 3).map((p) => p.title).join(" | ")
);

console.log(failures === 0 ? "\n🎉 Multi-CV scan test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
