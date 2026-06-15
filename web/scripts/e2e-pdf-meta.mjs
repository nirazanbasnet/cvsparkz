/**
 * Test the PDF transparency feature: generated_documents.meta must carry
 * change_log + keyword coverage after generating a tailored PDF.
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
  email: `e2e-meta-${Date.now()}@test.local`,
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
  content_md: `# Meta Tester

## Summary
Backend engineer, 6 years. Built LLM evaluation pipelines at scale (40M requests/mo). Postgres, TypeScript, Python.

## Experience
### Senior Backend Engineer — Acme AI (2022–now)
- Built RAG retrieval service over 12k docs (Postgres + pgvector), p95 380ms
- Designed eval harness for LLM outputs: 200+ golden cases, regression-gated CI
- Led migration of job queue to pgmq, cut infra cost 35%

### Backend Engineer — DataCo (2019–2022)
- Shipped REST + GraphQL APIs in Node.js/TypeScript for 2M MAU product

## Education
- BSc Computer Science — State University (2019)

## Skills
TypeScript, Node.js, Python, Postgres, pgvector, Redis, Docker, AWS, LLM evals, RAG`,
  content_hash: "meta-hash",
  is_current: true,
});
await anon.from("candidate_profiles").upsert(
  { tenant_id: tenantId, full_name: "Meta Tester", email: signup.user.email },
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

const JD = `Senior AI Engineer — Nimbus Health (Remote, US)
LLM Platform team. Own LLM evaluation infrastructure: golden datasets, regression gates. Build retrieval pipelines (Postgres + pgvector). Harden agent workflows with human-in-the-loop review under HIPAA.
Requirements: 5+ years backend (TypeScript or Python), production LLM evals, strong SQL/Postgres, vector search.
Compensation: $165,000–$195,000.`;

console.log("⏳ evaluating…");
const evalRes = await fetch(`${APP_URL}/api/evaluations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ jd_text: JD }),
});
const evalJson = await evalRes.json();
check("evaluation ok", evalRes.ok, evalRes.ok ? "" : JSON.stringify(evalJson));

console.log("⏳ generating PDF (may wait on rate limits)…");
const pdfRes = await fetch(`${APP_URL}/api/documents`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ evaluation_id: evalJson.evaluation_id }),
});
const pdfJson = await pdfRes.json();
check("pdf ok", pdfRes.ok, pdfRes.ok ? "" : JSON.stringify(pdfJson));

const { data: doc } = await anon
  .from("generated_documents")
  .select("meta")
  .eq("id", pdfJson.document_id)
  .single();
const meta = doc?.meta ?? {};
check(
  "change_log present",
  Array.isArray(meta.change_log) && meta.change_log.length >= 3,
  `${meta.change_log?.length ?? 0} entries; first: ${JSON.stringify(meta.change_log?.[0] ?? "").slice(0, 90)}`
);
check(
  "keyword coverage computed",
  meta.coverage && typeof meta.coverage.pct === "number" && meta.coverage.total > 0,
  meta.coverage
    ? `${meta.coverage.matched.length}/${meta.coverage.total} (${meta.coverage.pct}%), missing: ${meta.coverage.missing.slice(0, 3).join(", ")}`
    : "absent"
);

console.log(failures === 0 ? "\n🎉 PDF meta test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
