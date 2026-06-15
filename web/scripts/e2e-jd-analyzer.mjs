/**
 * JD Analyzer (Ascend Phase 2): pick a CV + paste a JD → match %, verdict,
 * strengths, and gap analysis. Tests a strong-fit and a poor-fit JD.
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL_ = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const APP = "http://localhost:3000";

let failures = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) failures++;
};

const anon = createClient(URL_, ANON);
const { data: signup } = await anon.auth.signUp({
  email: `e2e-jd-${Date.now()}@test.local`,
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
  label: "Backend CV",
  primary_role: "Backend Engineer",
  content_md: `# Test Dev

## Summary
Backend engineer, 6 years: Node.js/TypeScript APIs, PostgreSQL, Docker, AWS. Built LLM eval pipelines and RAG (pgvector).

## Experience
### Senior Backend Engineer — Acme (2021-now)
- Built REST + GraphQL APIs in Node.js/TypeScript for 2M MAU
- Designed Postgres schemas and pgvector retrieval, p95 380ms
- Owned CI/CD, on-call for the Postgres cluster

## Skills
TypeScript, Node.js, Python, PostgreSQL, pgvector, Docker, AWS, RAG, LLM evals`,
  content_hash: "jd-h1",
  is_current: true,
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
const cookie = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
const post = async (jdText) => {
  const res = await fetch(`${APP}/api/jd-analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ cvLabel: "Backend CV", jdText }),
  });
  return { ok: res.ok, json: await res.json() };
};

// Strong fit
console.log("⏳ analyzing a STRONG-fit JD…");
const strong = await post(`Senior Backend Engineer — Nimbus (Remote)
We need a backend engineer with Node.js/TypeScript, PostgreSQL, Docker, AWS, and experience building LLM/RAG retrieval pipelines. You'll own APIs serving millions of users and the CI/CD pipeline.`);
check("strong-fit analysis returns", strong.ok && strong.json.analysis, JSON.stringify(strong.json).slice(0, 120));
if (strong.json.analysis) {
  const a = strong.json.analysis;
  check("strong fit has high match %", a.skillMatchPercentage >= 65, `${a.skillMatchPercentage}%`);
  check("verdict is apply-ish", ["Strong Apply", "Apply"].includes(a.verdict), a.verdict);
  check("has strengths", a.strengths.length > 0, `${a.strengths.length} strengths`);
}

// Poor fit
console.log("⏳ analyzing a POOR-fit JD…");
const poor = await post(`Senior iOS Engineer — AppCo
We need 6+ years of native iOS: Swift, SwiftUI, UIKit, Core Data, and App Store release experience. Mobile-only role.`);
check("poor-fit analysis returns", poor.ok && poor.json.analysis);
if (poor.json.analysis) {
  const a = poor.json.analysis;
  check("poor fit has lower match %", a.skillMatchPercentage < strong.json.analysis.skillMatchPercentage, `${a.skillMatchPercentage}% < ${strong.json.analysis.skillMatchPercentage}%`);
  check("poor fit flags critical/high gaps", a.gapAnalysis.some((g) => ["Critical", "High"].includes(g.importance)), `${a.gapAnalysis.length} gaps`);
  const swiftGap = a.gapAnalysis.find((g) => /swift|ios|uikit/i.test(g.missingSkill));
  if (swiftGap) console.log(`   gap: ${swiftGap.missingSkill} (${swiftGap.importance})`);
}

// Page renders
const pageRes = await fetch(`${APP}/jd-analyzer`, { headers: { Cookie: cookie } });
check("JD analyzer page renders", pageRes.ok && (await pageRes.text()).includes("JD analyzer"));

console.log(failures === 0 ? "\n🎉 JD Analyzer test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
