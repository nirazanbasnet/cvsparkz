/**
 * Regression test for json_validate_failed: a LARGE CV (~13k chars) used to
 * collapse the completion budget below what the A–G JSON needs. With input
 * trimming + compact-retry this must now succeed.
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
  email: `e2e-big-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: membership } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = membership.tenant_id;

// Build a realistic LONG CV (~13k chars): many roles, many bullets.
const role = (i) => `### ${["Senior", "Staff", "Lead"][i % 3]} Engineer — Company${i} Inc (${2010 + i}–${2011 + i})
- Designed and shipped a distributed data platform handling ${i + 1}B events per day across ${i + 2} regions with strict latency SLOs
- Reduced infrastructure spend by ${10 + i}% through capacity planning, autoscaling policies, and storage tiering across the fleet
- Led a team of ${3 + (i % 4)} engineers through quarterly planning, hiring, mentoring, and architecture reviews
- Built CI/CD pipelines with canary deployments, automated rollbacks, and contract tests for ${5 + i} microservices
- Partnered with product and design to deliver ${i + 2} customer-facing features with measurable adoption gains`;

const BIG_CV = `# Big CV Tester

## Summary
Engineering leader with 14 years across data platforms, distributed systems, and applied AI. Built LLM evaluation pipelines, RAG systems over Postgres + pgvector, and team processes that ship. Deep TypeScript, Python, SQL.

## Experience
${Array.from({ length: 12 }, (_, i) => role(i)).join("\n\n")}

## Projects
- **EvalHarness** — open-source LLM evaluation framework, 200+ golden cases, regression-gated CI
- **VectorSearch** — RAG retrieval service over 12k docs (Postgres + pgvector), p95 380ms

## Education
- MSc Computer Science — Tech University (2010)

## Skills
TypeScript, Node.js, Python, Postgres, pgvector, Kafka, Flink, Redis, Docker, Kubernetes, AWS, GCP, Terraform, LLM evals, RAG, dbt, Airflow`;

console.log(`CV size: ${BIG_CV.length} chars`);

await anon.from("cv_versions").insert({
  tenant_id: tenantId,
  version: 1,
  content_md: BIG_CV,
  content_hash: "big-hash",
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

const JD = `Staff Platform Engineer — CloudCo (Remote, US)

CloudCo builds developer infrastructure used by 50k companies. The platform team (12 engineers) owns compute, storage, and the internal deployment system.

Responsibilities: own reliability of a multi-region platform (5 regions, 99.99% SLO); design capacity planning and autoscaling; lead incident response; mentor senior engineers; partner with product on roadmap.

Requirements: 10+ years backend/infra; distributed systems at scale (billions of events/day); Kubernetes, Terraform, AWS or GCP; strong SQL; leadership of 3+ engineer teams.

Compensation: $200,000–$240,000 + equity.`;

console.log("⏳ evaluating with the big CV (used to fail json_validate_failed)…");
const t0 = Date.now();
const res = await fetch(`${APP_URL}/api/evaluations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ jd_text: JD }),
});
const json = await res.json();
check(
  "big-CV evaluation succeeds",
  res.ok && !!json.evaluation_id,
  res.ok ? `${((Date.now() - t0) / 1000).toFixed(1)}s` : JSON.stringify(json)
);

if (json.evaluation_id) {
  const { data: ev } = await anon
    .from("evaluations")
    .select("company_name, role, score, report_md")
    .eq("id", json.evaluation_id)
    .single();
  check(
    "report complete (all A–G blocks)",
    ["## A)", "## B)", "## C)", "## D)", "## E)", "## F)", "## G)"].every((h) =>
      ev.report_md.includes(h)
    ),
    `${ev.company_name} — ${ev.role}: ${ev.score}/5`
  );
}

console.log(failures === 0 ? "\n🎉 Big-CV regression test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
