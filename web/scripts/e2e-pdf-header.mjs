/**
 * Fix #4: the generated CV must carry the candidate's name/email/phone sourced
 * from the CV's own basics — even when the candidate_profiles row is EMPTY.
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
  email: `e2e-pdfhdr-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: m } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = m.tenant_id;

const NAME = "Ravi Koirala";
const EMAIL = "ravi.koirala@example.com";
const PHONE = "+977-9801234567";

// CV with structured basics (name/email/phone) — and NO candidate_profiles row
await anon.from("cv_versions").insert({
  tenant_id: tenantId,
  version: 1,
  label: "My CV",
  primary_role: "Backend Engineer",
  content_md: `# ${NAME}\n\n## Summary\nBackend engineer, 6 years. Built LLM eval pipelines and RAG. TypeScript, Postgres, AWS.\n\n## Experience\n### Senior Backend Engineer — Acme (2021-now)\n- Built REST APIs in Node.js for 2M MAU\n- Designed Postgres + pgvector retrieval, p95 380ms\n\n## Skills\nTypeScript, Node.js, Postgres, AWS`,
  structured: {
    basics: {
      name: NAME,
      label: "Senior Backend Engineer",
      email: EMAIL,
      phone: PHONE,
      location: "Kathmandu, Nepal",
      links: { github: "https://github.com/ravik" },
    },
    skills: { programming: ["TypeScript", "Node.js"], frameworks: [], devOps: [], testing: [], security: [], cloud: ["AWS"], databases: ["Postgres"] },
    experience: [{ role: "Senior Backend Engineer", company: "Acme", duration: "2021-now", focusAreas: [], bullets: ["Built REST APIs in Node.js for 2M MAU"] }],
    education: [],
    openSourceProjects: [],
    customSections: [],
  },
  content_hash: "pdfhdr-h1",
  is_current: true,
});

// An evaluation to generate the PDF from
const { data: ev } = await anon
  .from("evaluations")
  .insert({
    tenant_id: tenantId,
    company_name: "Nimbus",
    role: "Senior Backend Engineer",
    score: 4.2,
    archetype: "AI Platform / LLMOps",
    blocks: { jd_text: "Senior Backend Engineer. Node.js, Postgres, AWS, LLM/RAG.", keywords: ["Node.js", "Postgres", "AWS", "RAG"] },
  })
  .select("id")
  .single();

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

console.log("⏳ generating tailored PDF (empty profile, basics-sourced header)…");
const gen = await fetch(`${APP}/api/documents`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ evaluation_id: ev.id }),
});
const genJson = await gen.json();
check("PDF generated", gen.ok && genJson.document_id, gen.ok ? "" : JSON.stringify(genJson));

if (genJson.document_id) {
  const dl = await fetch(`${APP}/api/documents/${genJson.document_id}/download`, {
    headers: { Cookie: cookie },
    redirect: "follow",
  });
  const buf = Buffer.from(await dl.arrayBuffer());
  const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
  const text = (await pdfParse(buf)).text;

  // name renders uppercase (matches builder header), so compare case-insensitively
  check("PDF contains the name from CV basics", text.toUpperCase().includes(NAME.toUpperCase()), NAME);
  check("PDF contains the email from CV basics", text.includes(EMAIL), EMAIL);
  check("PDF contains the phone from CV basics", text.includes(PHONE), PHONE);
  check("PDF does NOT fall back to 'Candidate'", !text.includes("Candidate"));
}

console.log(failures === 0 ? "\n🎉 PDF header test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
