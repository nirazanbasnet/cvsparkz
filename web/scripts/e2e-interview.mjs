/**
 * Interview flow E2E: schedule → generate tailored questions → record answers
 * + scores → synthesize hiring report → download PDF.
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL_ = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const APP = "http://localhost:3000";
let fail = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) fail++;
};

const anon = createClient(URL_, ANON);
const { data: signup } = await anon.auth.signUp({
  email: `e2e-interview-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: mem } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = mem.tenant_id;
await anon.from("tenants").update({ account_type: "recruiter" }).eq("id", tenantId);

const { data: opening } = await anon
  .from("job_openings")
  .insert({
    tenant_id: tenantId,
    title: "Senior Backend Engineer",
    jd_text:
      "Senior Backend Engineer: Node.js, TypeScript, PostgreSQL, REST APIs, AWS, system design, 5+ years.",
  })
  .select("id")
  .single();
const { data: cand } = await anon
  .from("candidates")
  .insert({
    tenant_id: tenantId,
    name: "Alice Backend",
    headline: "Senior Backend Engineer",
    content_md:
      "Senior Backend Engineer with 7 years of Node.js, TypeScript, PostgreSQL and AWS. Designed REST APIs and event-driven services at scale.",
  })
  .select("id")
  .single();
const { data: fit } = await anon
  .from("candidate_fits")
  .insert({
    tenant_id: tenantId,
    opening_id: opening.id,
    candidate_id: cand.id,
    status: "interview",
  })
  .select("id")
  .single();
const { data: iv } = await anon
  .from("interviews")
  .insert({
    tenant_id: tenantId,
    fit_id: fit.id,
    opening_id: opening.id,
    candidate_id: cand.id,
    stage: "technical",
    interviewer: "Kiran",
    scheduled_at: new Date("2026-05-12T10:00:00Z").toISOString(),
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
const json = (b) => ({ method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(b) });

// 1. Generate tailored questions
console.log("⏳ generating questions…");
const q = await fetch(`${APP}/api/recruiter/interview/questions`, json({ interviewId: iv.id }));
const qj = await q.json();
check("tailored questions generated", q.ok && Array.isArray(qj.questions) && qj.questions.length >= 4,
  q.ok ? `${qj.questions.length} questions across ${new Set(qj.questions.map((x) => x.category)).size} categories` : JSON.stringify(qj));

// 2. Record answers + scores (interviewer fills them in)
const answered = (qj.questions ?? []).map((x, i) => ({
  ...x,
  answer: i % 2 === 0 ? "Strong, detailed answer with real examples." : "Partial answer, some gaps.",
  score: i % 2 === 0 ? 4.5 : 2.5,
}));
await anon.from("interviews").update({ questions: answered }).eq("id", iv.id);

// 3. Synthesize report
console.log("⏳ synthesizing hiring report…");
const r = await fetch(`${APP}/api/recruiter/interview/report`, json({ interviewId: iv.id }));
const rj = await r.json();
check("hiring report synthesized", r.ok && rj.report?.verdict && ["strong_hire","hire","conditional_hire","no_hire"].includes(rj.report.decision),
  r.ok ? `${rj.report.decision} · ${rj.report.overallScore}/5 · ${rj.report.scorecard.length} dimensions` : JSON.stringify(rj));
check("report has scorecard + recommendation", r.ok && rj.report.scorecard.length > 0 && !!rj.report.recommendation);

// 4. PDF download
console.log("⏳ generating PDF…");
const pdf = await fetch(`${APP}/api/recruiter/interview/pdf?interviewId=${iv.id}`, { headers: { Cookie: cookie } });
const buf = Buffer.from(await pdf.arrayBuffer());
check("hiring report PDF generated", pdf.ok && buf.subarray(0, 5).toString("latin1") === "%PDF-", `${buf.length} bytes`);

console.log(fail === 0 ? "\n🎉 Interview flow passed" : `\n💥 ${fail} failure(s)`);
process.exit(fail === 0 ? 0 : 1);
