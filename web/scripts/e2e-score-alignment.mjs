/**
 * Score-alignment test: JD text is captured at scan time, quick scores are
 * JD-based, and a quick score lands close to the FULL evaluation score of
 * the same posting (the user's complaint was wide mismatches).
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
  email: `e2e-align-${Date.now()}@test.local`,
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
    "# Align Tester\n\n## Summary\nAI engineer, 6 years: LLM evals, RAG (Postgres + pgvector), Python/TypeScript. Shipped LLM products end to end.\n\n## Experience\n### Senior AI Engineer — Acme AI (2022–now)\n- Built RAG retrieval over 12k docs, p95 380ms\n- Eval harness: 200+ golden cases, regression-gated CI\n### Backend Engineer — DataCo (2019–2022)\n- Node/TypeScript APIs for 2M MAU\n\n## Skills\nPython, TypeScript, Postgres, pgvector, LLM evals, RAG, AWS",
  content_hash: "align-h1",
  is_current: true,
});
await anon.from("tracked_companies").insert({
  tenant_id: tenantId,
  display_name: "ElevenLabs",
  provider: "ashby",
  provider_config: { careers_url: "https://jobs.ashbyhq.com/elevenlabs" },
  enabled: true,
});
await anon.from("scan_configs").upsert(
  { tenant_id: tenantId, title_positive: ["engineer"] },
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

console.log("⏳ scanning + JD capture + quick-scoring…");
const scan = await (
  await fetch(`${APP_URL}/api/scan`, { method: "POST", headers: { Cookie: cookie } })
).json();
check("scan adds and scores", scan.added > 0 && scan.scored > 0, `added=${scan.added}, scored=${scan.scored}`);

// JD capture check
const { data: postings } = await anon
  .from("job_postings")
  .select("jd_text")
  .eq("tenant_id", tenantId);
const withJd = postings.filter((p) => p.jd_text && p.jd_text.length > 300).length;
check(
  "JD text captured for most postings",
  withJd / postings.length > 0.8,
  `${withJd}/${postings.length} have JD text`
);

// Pick the highest and lowest scored items and run FULL evaluations
const { data: ranked } = await anon
  .from("pipeline_items")
  .select("id, fit_score, fit_reason, job_postings(title)")
  .eq("tenant_id", tenantId)
  .eq("state", "pending")
  .order("fit_score", { ascending: false });
const top = ranked[0];
const bottom = ranked[ranked.length - 1];

async function fullEval(item) {
  const res = await fetch(`${APP_URL}/api/evaluations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ pipeline_item_id: item.id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  const { data: ev } = await anon
    .from("evaluations")
    .select("score, role")
    .eq("id", json.evaluation_id)
    .single();
  return Number(ev.score);
}

const title = (i) =>
  (Array.isArray(i.job_postings) ? i.job_postings[0] : i.job_postings).title;

console.log(`⏳ full-evaluating TOP item: ${title(top)} (quick ~${top.fit_score})…`);
const topEval = await fullEval(top);
const topDiff = Math.abs(Number(top.fit_score) - topEval);
check(
  "top item: quick ≈ full (within 0.7)",
  topDiff <= 0.7,
  `quick ~${top.fit_score} vs full ${topEval} (Δ${topDiff.toFixed(1)})`
);

console.log(`⏳ full-evaluating BOTTOM item: ${title(bottom)} (quick ~${bottom.fit_score})…`);
const bottomEval = await fullEval(bottom);
check(
  "ranking direction holds (top full-eval ≥ bottom full-eval)",
  topEval >= bottomEval,
  `top=${topEval}, bottom=${bottomEval}`
);

console.log(failures === 0 ? "\n🎉 Score alignment test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
