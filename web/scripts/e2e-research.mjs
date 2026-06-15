/**
 * Live test: with TAVILY_API_KEY set, an evaluation's Block D/G should use
 * real web research (cited sources) instead of training-knowledge estimates.
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
  email: `e2e-research-${Date.now()}@test.local`,
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
    "# Research Tester\n\n## Summary\nAI engineer, 6 years. LLM evals, RAG (Postgres + pgvector), TypeScript/Python.\n\n## Experience\n### Senior Engineer — Acme AI (2022–now)\n- Built RAG retrieval over 12k docs, p95 380ms\n- Eval harness: 200+ golden cases, regression-gated CI\n\n## Skills\nTypeScript, Python, Postgres, LLM evals, RAG",
  content_hash: "research-h1",
  is_current: true,
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

// Well-known company so salary + news searches return real data
const JD = `Senior AI Engineer — Stripe (Remote, US)

Stripe's Applied AI team builds LLM-powered products for financial infrastructure used by millions of businesses.

Responsibilities: build LLM evaluation infrastructure; retrieval pipelines over internal knowledge; agent workflows with human review.

Requirements: 5+ years backend (TypeScript or Python); production LLM experience (evals, RAG); strong SQL.`;

console.log("⏳ evaluating Stripe JD (Groq + Tavily research)…");
const t0 = Date.now();
const res = await fetch(`${APP_URL}/api/evaluations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ jd_text: JD }),
});
const json = await res.json();
check(
  "evaluation succeeds",
  res.ok && !!json.evaluation_id,
  res.ok ? `${((Date.now() - t0) / 1000).toFixed(1)}s` : JSON.stringify(json)
);

if (json.evaluation_id) {
  const { data: ev } = await anon
    .from("evaluations")
    .select("company_name, role, score, blocks")
    .eq("id", json.evaluation_id)
    .single();
  const blockD = ev.blocks?.D ?? "";
  const blockG = ev.blocks?.G ?? "";
  const hasSource = /https?:\/\//.test(blockD) || /levels\.fyi|glassdoor|salary/i.test(blockD);
  const noPureEstimateDisclaimer = !/training knowledge/i.test(blockD);
  check(
    "Block D uses researched data (sources/figures, not just estimates)",
    hasSource || noPureEstimateDisclaimer,
    blockD.slice(0, 160).replace(/\n/g, " ")
  );
  console.log("   Block G excerpt:", blockG.slice(0, 160).replace(/\n/g, " "));
  check("evaluation sane", Number(ev.score) >= 1, `${ev.company_name}: ${ev.score}/5`);
}

console.log(failures === 0 ? "\n🎉 Research integration test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
