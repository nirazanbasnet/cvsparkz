/**
 * Quick fit scoring: after a scan, pending inbox items carry fit_score +
 * fit_reason rated against the primary CV, and the inbox ranks by score.
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
  email: `e2e-qs-${Date.now()}@test.local`,
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
  content_md:
    "# QS Tester\n\n## Summary\nAI engineer, 6 years: LLM evals, RAG, Python/TypeScript, Postgres.\n\n## Experience\n### Senior AI Engineer — Acme AI (2022–now)\n- Built LLM eval pipelines and RAG retrieval\n\n## Skills\nPython, TypeScript, LLMs, RAG, Postgres",
  content_hash: "qs-h1",
  is_current: true,
});
await anon.from("tracked_companies").insert({
  tenant_id: tenantId,
  display_name: "ElevenLabs",
  provider: "ashby",
  provider_config: { careers_url: "https://jobs.ashbyhq.com/elevenlabs" },
  enabled: true,
});
// broad filter so we get a mixed bag of titles to rank
await anon.from("scan_configs").upsert(
  { tenant_id: tenantId, title_positive: ["engineer", "scientist", "manager"] },
  { onConflict: "tenant_id" }
);

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

console.log("⏳ scanning + quick-scoring (Cerebras)…");
const t0 = Date.now();
const scan = await (
  await fetch(`${APP_URL}/api/scan`, { method: "POST", headers: { Cookie: cookie } })
).json();
check(
  "scan adds and scores items",
  scan.added > 0 && scan.scored === scan.added,
  `added=${scan.added}, scored=${scan.scored} in ${((Date.now() - t0) / 1000).toFixed(1)}s`
);

const { data: items } = await anon
  .from("pipeline_items")
  .select("fit_score, fit_reason, job_postings(title)")
  .eq("tenant_id", tenantId)
  .eq("state", "pending")
  .order("fit_score", { ascending: false });

check(
  "all items have scores in range",
  items.length > 0 &&
    items.every((i) => i.fit_score >= 1 && i.fit_score <= 5 && i.fit_reason)
);

console.log("   top 3 by fit:");
for (const i of items.slice(0, 3)) {
  const t = Array.isArray(i.job_postings) ? i.job_postings[0] : i.job_postings;
  console.log(`   · ${i.fit_score} — ${t.title} (${i.fit_reason})`);
}
console.log("   bottom 2:");
for (const i of items.slice(-2)) {
  const t = Array.isArray(i.job_postings) ? i.job_postings[0] : i.job_postings;
  console.log(`   · ${i.fit_score} — ${t.title} (${i.fit_reason})`);
}

// AI-ish titles should outrank clearly unrelated ones
const top = items[0];
const topTitle = (Array.isArray(top.job_postings) ? top.job_postings[0] : top.job_postings).title;
check(
  "ranking is sensible (top item is AI/ML-related)",
  /ai|ml|machine|research|llm/i.test(topTitle),
  topTitle
);

console.log(failures === 0 ? "\n🎉 Quick-score test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
