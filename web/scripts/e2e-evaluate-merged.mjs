/**
 * Merged Evaluate: Quick check (JD analyze) + Full evaluation share one entry,
 * a CV picker, and URL support. Key assertion: Full uses the CHOSEN CV, not the
 * primary one.
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
  email: `e2e-evalmerge-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: m } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = m.tenant_id;

const mkCv = (v, label, role, body, primary) =>
  anon.from("cv_versions").insert({
    tenant_id: tenantId, version: v, label, primary_role: role,
    content_md: body, content_hash: `h${v}`, is_current: primary,
  });
await mkCv(1, "Primary CV", "Backend Engineer",
  "# Backend Dev\n\n## Summary\nBackend engineer: Node.js, TypeScript, Postgres, AWS.\n\n## Experience\n### Senior Backend Engineer — Acme (2021-now)\n- Built REST APIs\n\n## Skills\nTypeScript, Node.js, Postgres, AWS", true);
await mkCv(2, "Data CV", "Data Engineer",
  "# Data Dev\n\n## Summary\nData engineer: Python, Spark, Airflow, dbt, BigQuery.\n\n## Experience\n### Data Engineer — DataCo (2020-now)\n- Built Spark pipelines, 2B events/day\n\n## Skills\nPython, Spark, Airflow, dbt, BigQuery", false);

const { data: cvRows } = await anon
  .from("cv_versions").select("id, label").eq("tenant_id", tenantId);
const dataCvId = cvRows.find((c) => c.label === "Data CV").id;
const primaryCvId = cvRows.find((c) => c.label === "Primary CV").id;

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

const DATA_JD = "Senior Data Engineer — need Python, Spark, Airflow, dbt, BigQuery; build batch + streaming pipelines at scale.";

// 1. Quick check against the Data CV
console.log("⏳ Quick check (Data CV)…");
const q = await fetch(`${APP}/api/jd-analyze`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ cvLabel: "Data CV", jdText: DATA_JD }),
});
const qj = await q.json();
check("quick check returns analysis", q.ok && qj.analysis?.skillMatchPercentage >= 0,
  q.ok ? `${qj.analysis.skillMatchPercentage}% ${qj.analysis.verdict}` : JSON.stringify(qj));

// 2. Full evaluation against the Data CV — must use the CHOSEN cv, not primary
console.log("⏳ Full evaluation (cv_label = Data CV)…");
const f = await fetch(`${APP}/api/evaluations`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ cv_label: "Data CV", jd_text: DATA_JD }),
});
const fj = await f.json();
check("full evaluation succeeds", f.ok && fj.evaluation_id, f.ok ? "" : JSON.stringify(fj));

if (fj.evaluation_id) {
  const { data: ev } = await anon
    .from("evaluations").select("cv_version_id, score").eq("id", fj.evaluation_id).single();
  check("full eval used the CHOSEN CV (Data), not primary",
    ev.cv_version_id === dataCvId && ev.cv_version_id !== primaryCvId,
    `cv_version_id=${ev.cv_version_id === dataCvId ? "Data CV ✓" : "WRONG"}`);
}

// 3. Quick check via URL (greenhouse fetch path) against primary CV
console.log("⏳ Quick check via URL (fetch path)…");
const u = await fetch(`${APP}/api/jd-analyze`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ cvLabel: "Primary CV", url: "https://job-boards.greenhouse.io/anthropic" }),
});
// anthropic board URL is a board (not a single job) — fetch may yield list text; accept ok OR a clear fetch error
const uj = await u.json();
check("quick check accepts a URL (fetch attempted)",
  u.status === 200 || u.status === 422,
  u.status === 200 ? `${uj.analysis?.skillMatchPercentage}% match` : `fetch fallback: ${uj.error?.slice(0,40)}`);

// 4. evaluate page renders with CV picker
const page = await fetch(`${APP}/evaluate`, { headers: { Cookie: cookie } });
const html = await page.text();
check("merged Evaluate page renders (Quick + Full)",
  page.ok && html.includes("Quick check") && html.includes("Full evaluation"));

console.log(failures === 0 ? "\n🎉 Merged Evaluate test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
