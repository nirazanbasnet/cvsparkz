/**
 * Smoke test: CV file upload → markdown (txt → LLM path, pdf → pdf-parse path).
 * Run: node scripts/e2e-cv-import.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const APP_URL = "http://localhost:3000";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const anon = createClient(SUPABASE_URL, ANON_KEY);
const { data: signup } = await anon.auth.signUp({
  email: `e2e-cv-${Date.now()}@test.local`,
  password: "test-password-123",
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

async function importFile(name, type, content) {
  const form = new FormData();
  form.append("file", new File([content], name, { type }));
  const res = await fetch(`${APP_URL}/api/cv-import`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  return { status: res.status, json: await res.json() };
}

// ── 1. TXT → LLM conversion ──────────────────────────────────
const RAW_TXT = `JANE DOE
jane@example.com | Berlin, Germany

PROFESSIONAL EXPERIENCE

Senior Data Engineer    DataCorp GmbH    2021 - Present
Built streaming pipelines processing 2B events/day with Kafka and Flink. Cut
warehouse costs 40% by migrating to Iceberg. Led a team of 4 engineers.

Data Engineer    StartupX    2018 - 2021
Designed the company's first data warehouse (BigQuery, dbt). Shipped 30+ dbt
models powering exec dashboards.

EDUCATION
MSc Computer Science, TU Berlin, 2018

SKILLS
Python, SQL, Kafka, Flink, dbt, BigQuery, Airflow, Terraform`;

console.log("⏳ importing .txt CV (LLM conversion)…");
const txt = await importFile("cv.txt", "text/plain", RAW_TXT);
check(
  "txt import returns markdown",
  txt.status === 200 && txt.json.markdown?.includes("##"),
  txt.status === 200 ? `${txt.json.markdown.length} chars` : JSON.stringify(txt.json)
);
check(
  "facts preserved (employer + metric)",
  txt.status === 200 &&
    txt.json.markdown.includes("DataCorp") &&
    txt.json.markdown.includes("2B events/day")
);

// ── 2. MD → passthrough (no LLM) ─────────────────────────────
const md = await importFile("cv.md", "text/markdown", "# Jane Doe\n\n## Summary\n" + "Engineer. ".repeat(30));
check("md import passes through verbatim", md.status === 200 && md.json.markdown.startsWith("# Jane Doe"));

// ── 3. PDF → pdf-parse path (use a PDF we generated earlier) ─
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const { data: doc } = await admin
  .from("generated_documents")
  .select("object_key")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (doc) {
  const { data: blob } = await admin.storage.from("documents").download(doc.object_key);
  console.log("⏳ importing .pdf CV (pdf-parse + LLM)…");
  const pdf = await importFile("cv.pdf", "application/pdf", blob);
  check(
    "pdf import returns markdown",
    pdf.status === 200 && pdf.json.markdown?.includes("##"),
    pdf.status === 200 ? `${pdf.json.markdown.length} chars` : JSON.stringify(pdf.json)
  );
} else {
  console.log("⚠️ no generated PDF found in storage — skipping pdf path");
}

// ── 4. Unsupported type rejected ─────────────────────────────
const bad = await importFile("cv.png", "image/png", "not-a-cv");
check("unsupported type rejected (415)", bad.status === 415);

console.log(failures === 0 ? "\n🎉 CV import smoke test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
