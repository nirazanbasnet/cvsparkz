/**
 * End-to-end smoke test against the running app + local Supabase:
 *   signup → tenant provisioning → CV + profile → evaluate JD via API →
 *   report page renders → tracker row exists → re-evaluate dedups.
 *
 * Run: node scripts/e2e.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const APP_URL = "http://localhost:3000";

const email = `e2e-${Date.now()}@test.local`;
const password = "test-password-123";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ── 1. Sign up ───────────────────────────────────────────────
const anon = createClient(SUPABASE_URL, ANON_KEY);
const { data: signup, error: signupError } = await anon.auth.signUp({
  email,
  password,
  options: { data: { full_name: "E2E Tester" } },
});
check("signup returns session", !!signup?.session, signupError?.message);
if (!signup?.session) process.exit(1);
const userId = signup.user.id;

// ── 2. Tenant auto-provisioned ───────────────────────────────
const { data: membership } = await anon
  .from("tenant_members")
  .select("tenant_id, role")
  .eq("user_id", userId)
  .single();
check("tenant auto-provisioned on signup", !!membership?.tenant_id);
const tenantId = membership.tenant_id;

// ── 3. RLS isolation: cannot see other tenants' data ─────────
const { count: foreignRows } = await anon
  .from("applications")
  .select("*", { count: "exact", head: true })
  .neq("tenant_id", tenantId);
check("RLS: zero foreign-tenant rows visible", (foreignRows ?? 0) === 0);

// ── 4. CV + profile via authenticated client ─────────────────
const CV = `# E2E Tester

## Summary
Backend engineer, 6 years. Built LLM evaluation pipelines at scale (40M requests/mo). Postgres, TypeScript, Python.

## Experience
### Senior Backend Engineer — Acme AI (2022–now)
- Built RAG retrieval service over 12k docs (Postgres + pgvector), p95 380ms
- Designed eval harness for LLM outputs: 200+ golden cases, regression-gated CI
- Led migration of job queue to pgmq, cut infra cost 35%

### Backend Engineer — DataCo (2019–2022)
- Shipped REST + GraphQL APIs in Node.js/TypeScript for 2M MAU product
- On-call owner for Postgres cluster, 99.95% uptime

## Skills
TypeScript, Node.js, Python, Postgres, pgvector, Redis, Docker, AWS, LLM evals, RAG`;

await anon.from("cv_versions").insert({
  tenant_id: tenantId,
  version: 1,
  content_md: CV,
  content_hash: "e2e-hash",
  is_current: true,
});
const { data: cvRow } = await anon
  .from("cv_versions")
  .select("id")
  .eq("tenant_id", tenantId)
  .single();
check("CV inserted via RLS path", !!cvRow);

await anon.from("candidate_profiles").upsert(
  {
    tenant_id: tenantId,
    full_name: "E2E Tester",
    email,
    comp_currency: "USD",
    comp_target_min: 90000,
    comp_target_max: 130000,
    target_roles: [{ title: "Senior Backend Engineer" }, { title: "AI Engineer" }],
    narrative: { headline: "Backend engineer who ships LLM systems to production" },
  },
  { onConflict: "tenant_id" }
);

// ── 5. Build auth cookies exactly as @supabase/ssr would ─────
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
const cookieHeader = [...jar.entries()]
  .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  .join("; ");
check("auth cookies generated", jar.size > 0, `${jar.size} cookie(s)`);

// ── 6. Evaluate a JD through the real API ────────────────────
const JD = `Senior AI Engineer — Nimbus Health (Remote, US)

Nimbus Health builds clinical documentation AI for 400+ hospitals. We're hiring a Senior AI Engineer for our LLM Platform team (8 engineers, reports to Director of AI Platform).

What you'll do:
- Own our LLM evaluation infrastructure: golden datasets, regression gates, online metrics
- Build retrieval pipelines (Postgres + pgvector) over clinical knowledge bases
- Harden multi-step agent workflows with human-in-the-loop review
- Partner with clinical informatics to ship safely under HIPAA

Requirements:
- 5+ years backend engineering (TypeScript or Python)
- Production LLM experience: evals, observability, prompt pipelines
- Strong SQL/Postgres; vector search a plus
- US remote, occasional travel (quarterly onsites)

Compensation: $165,000–$195,000 + equity. Full health coverage, 401k match.`;

console.log("⏳ running evaluation through /api/evaluations (Groq call)…");
const t0 = Date.now();
const evalRes = await fetch(`${APP_URL}/api/evaluations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieHeader },
  body: JSON.stringify({ jd_text: JD }),
});
const evalJson = await evalRes.json();
const secs = ((Date.now() - t0) / 1000).toFixed(1);
check(
  "POST /api/evaluations succeeds",
  evalRes.ok && !!evalJson.evaluation_id,
  evalRes.ok ? `${secs}s` : JSON.stringify(evalJson)
);
if (!evalJson.evaluation_id) process.exit(1);

// ── 7. Evaluation persisted with promoted fields ─────────────
const { data: ev } = await anon
  .from("evaluations")
  .select("company_name, role, score, archetype, legitimacy, final_decision, report_md, model_used")
  .eq("id", evalJson.evaluation_id)
  .single();
check(
  "evaluation persisted",
  !!ev && Number(ev.score) >= 1 && Number(ev.score) <= 5,
  ev ? `${ev.company_name} — ${ev.role}: ${ev.score}/5, ${ev.legitimacy}, model=${ev.model_used}` : ""
);
check(
  "report has all A–G blocks",
  ["## A)", "## B)", "## C)", "## D)", "## E)", "## F)", "## G)"].every((h) =>
    ev.report_md.includes(h)
  )
);

// ── 8. Application row created ───────────────────────────────
const { data: apps } = await anon
  .from("applications")
  .select("id, status, score")
  .eq("tenant_id", tenantId);
check("application created with status=evaluated", apps?.length === 1 && apps[0].status === "evaluated");

// ── 9. Report page renders ───────────────────────────────────
const pageRes = await fetch(`${APP_URL}/evaluations/${evalJson.evaluation_id}`, {
  headers: { Cookie: cookieHeader },
});
const html = await pageRes.text();
check(
  "report page renders with company name",
  pageRes.ok && html.includes(ev.company_name)
);

// ── 10. Tracker page shows the row ───────────────────────────
const trackerRes = await fetch(`${APP_URL}/tracker`, {
  headers: { Cookie: cookieHeader },
});
const trackerHtml = await trackerRes.text();
check("tracker page shows application", trackerRes.ok && trackerHtml.includes(ev.company_name));

// ── 11. Re-evaluate same JD → no duplicate application ───────
console.log("⏳ re-evaluating same JD (dedup check)…");
const evalRes2 = await fetch(`${APP_URL}/api/evaluations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieHeader },
  body: JSON.stringify({ jd_text: JD }),
});
const evalJson2 = await evalRes2.json();
const { data: apps2 } = await anon
  .from("applications")
  .select("id, latest_evaluation_id")
  .eq("tenant_id", tenantId);
check(
  "re-evaluation updates existing application (no duplicate)",
  evalRes2.ok && apps2?.length === 1 && apps2[0].latest_evaluation_id === evalJson2.evaluation_id
);

// ── 12. Usage metered ────────────────────────────────────────
const { data: usage } = await anon
  .from("usage_events")
  .select("metric, tokens_in, tokens_out")
  .eq("tenant_id", tenantId);
check(
  "usage events recorded with token counts",
  usage?.length === 2 && usage.every((u) => u.tokens_in > 0 && u.tokens_out > 0),
  usage?.map((u) => `${u.tokens_in}in/${u.tokens_out}out`).join(", ")
);

console.log(failures === 0 ? "\n🎉 E2E passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
