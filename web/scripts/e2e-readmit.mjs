/**
 * Regression test for "matched but missing from inbox": postings that are
 * already known (dedup) but have NO inbox item and NO evaluation must be
 * re-admitted on scan. Dismissed (processed) postings must stay out.
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
  email: `e2e-readmit-${Date.now()}@test.local`,
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
  label: "AI CV",
  primary_role: "AI Engineer",
  content_md: "# T\n\n## Summary\nAI engineer.\n\n## Skills\nPython, LLMs",
  content_hash: "h1",
  is_current: true,
});
await anon.from("tracked_companies").insert({
  tenant_id: tenantId,
  display_name: "ElevenLabs",
  provider: "ashby",
  provider_config: { careers_url: "https://jobs.ashbyhq.com/elevenlabs" },
  enabled: true,
});

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

const scan = async () =>
  (await fetch(`${APP_URL}/api/scan`, { method: "POST", headers: { Cookie: cookie } })).json();

// 1. First scan — N items land in inbox
console.log("⏳ scan #1…");
const s1 = await scan();
check("first scan adds items", s1.added > 1, `added=${s1.added}`);

// 2. Simulate the user's situation: one item dismissed, the rest wiped
//    (like the old prune/cleanup did)
const { data: items } = await anon
  .from("pipeline_items")
  .select("id")
  .eq("tenant_id", tenantId);
const [dismissed, ...others] = items;
await anon
  .from("pipeline_items")
  .update({ state: "processed", processed_at: new Date().toISOString() })
  .eq("id", dismissed.id);
await anon
  .from("pipeline_items")
  .delete()
  .in("id", others.map((i) => i.id));
console.log(`   setup: 1 dismissed, ${others.length} wiped from inbox`);

// 3. Rescan — wiped items must come back, dismissed must not
console.log("⏳ scan #2 (re-admit)…");
const s2 = await scan();
check(
  "wiped matches re-admitted to inbox",
  s2.added === others.length,
  `added=${s2.added}, expected=${others.length}`
);

const { count: pendingNow } = await anon
  .from("pipeline_items")
  .select("*", { count: "exact", head: true })
  .eq("tenant_id", tenantId)
  .eq("state", "pending");
check("inbox shows the re-admitted items", pendingNow === others.length, `pending=${pendingNow}`);

const { count: dismissedCount } = await anon
  .from("pipeline_items")
  .select("*", { count: "exact", head: true })
  .eq("tenant_id", tenantId)
  .eq("state", "processed");
check("dismissed posting stayed out", dismissedCount === 1);

// 4. Third scan — steady state, nothing duplicated
console.log("⏳ scan #3 (steady state)…");
const s3 = await scan();
const { count: pendingAfter } = await anon
  .from("pipeline_items")
  .select("*", { count: "exact", head: true })
  .eq("tenant_id", tenantId)
  .eq("state", "pending");
check(
  "no duplicates on rescan",
  s3.added === 0 && pendingAfter === others.length,
  `added=${s3.added}, pending=${pendingAfter}`
);

console.log(failures === 0 ? "\n🎉 Re-admit test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
