/**
 * Inbox pruning: pending items that don't match the CURRENT filters
 * (here: primary CV role "DevOps Engineer") are removed on scan.
 * No companies tracked → no network/LLM; prune still runs.
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
  email: `e2e-prune-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: membership } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = membership.tenant_id;

await anon.from("cv_versions").insert({
  tenant_id: tenantId,
  version: 1,
  label: "DevOps CV",
  primary_role: "DevOps Engineer",
  content_md: "# T\n\n## Summary\nDevOps engineer.\n\n## Skills\nTerraform",
  content_hash: "h1",
  is_current: true,
});

// Seed inbox items as if discovered under older, looser filters
const postings = [
  { title: "Senior DevOps Engineer", keep: true },
  { title: "Data Analyst", keep: false },
  { title: "Machine Learning Engineer", keep: false },
  { title: "Product Manager", keep: false },
];
for (const [i, p] of postings.entries()) {
  const { data: posting } = await anon
    .from("job_postings")
    .insert({
      tenant_id: tenantId,
      url: `https://example.com/jobs/${i}`,
      url_hash: `hash-${i}`,
      title: p.title,
      company_name: "OldScanCo",
      location: "Remote",
      source: "manual",
    })
    .select("id")
    .single();
  await anon.from("pipeline_items").insert({
    tenant_id: tenantId,
    posting_id: posting.id,
    url: `https://example.com/jobs/${i}`,
    state: "pending",
  });
}

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

const scan = await (
  await fetch(`${APP_URL}/api/scan`, { method: "POST", headers: { Cookie: cookie } })
).json();
check("scan reports pruned items", scan.pruned === 3, `pruned=${scan.pruned}`);

const { data: remaining } = await anon
  .from("pipeline_items")
  .select("id, job_postings(title)")
  .eq("tenant_id", tenantId)
  .eq("state", "pending");
check(
  "only the DevOps item remains",
  remaining.length === 1 &&
    (Array.isArray(remaining[0].job_postings)
      ? remaining[0].job_postings[0]
      : remaining[0].job_postings
    ).title === "Senior DevOps Engineer",
  remaining
    .map((r) =>
      (Array.isArray(r.job_postings) ? r.job_postings[0] : r.job_postings)?.title
    )
    .join(" | ")
);

console.log(failures === 0 ? "\n🎉 Prune test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
