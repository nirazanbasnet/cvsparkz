/**
 * Recruiter flow E2E: recruiter mode → create opening → bulk-upload 2 CVs →
 * tiered screen (ranks strong>weak) → deep eval → pipeline status.
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
  email: `e2e-recruiter-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: m } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = m.tenant_id;

// Recruiter mode + an opening (RLS allows the owner)
await anon.from("tenants").update({ account_type: "recruiter" }).eq("id", tenantId);
const { data: opening } = await anon
  .from("job_openings")
  .insert({
    tenant_id: tenantId,
    title: "Senior Backend Engineer",
    jd_text:
      "Senior Backend Engineer. Must have 5+ years with Node.js, TypeScript, PostgreSQL, REST API design, and AWS. You'll own backend services at scale.",
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

const strong = `# Alice Backend
alice@example.com
Senior Backend Engineer
## Experience
- 7 years building Node.js + TypeScript services on AWS
- Designed REST APIs and PostgreSQL schemas at scale
## Skills
Node.js, TypeScript, PostgreSQL, AWS, REST, Docker`;
const weak = `# Bob Designer
bob@example.com
Senior Graphic Designer
## Experience
- 8 years brand identity, print and packaging design
## Skills
Photoshop, Illustrator, InDesign, typography`;

// 1. Bulk upload
const fd = new FormData();
fd.append("openingId", opening.id);
fd.append("file", new File([strong], "alice.md", { type: "text/markdown" }));
fd.append("file", new File([weak], "bob.md", { type: "text/markdown" }));
console.log("⏳ uploading 2 CVs…");
const up = await fetch(`${APP}/api/recruiter/candidates`, {
  method: "POST",
  headers: { Cookie: cookie },
  body: fd,
});
const upj = await up.json();
check("bulk upload created 2 candidates", up.ok && upj.created === 2, JSON.stringify(upj));

// 2. Tiered screen
console.log("⏳ screening…");
const sc = await fetch(`${APP}/api/recruiter/screen`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ openingId: opening.id }),
});
const scj = await sc.json();
check("screened both candidates", sc.ok && scj.scored === 2, JSON.stringify(scj));

const { data: fits } = await anon
  .from("candidate_fits")
  .select("id, fit_score, verdict, candidates(name)")
  .eq("opening_id", opening.id)
  .order("fit_score", { ascending: false, nullsFirst: false });
const top = fits?.[0];
const bottom = fits?.[fits.length - 1];
const nm = (f) => (Array.isArray(f.candidates) ? f.candidates[0] : f.candidates)?.name;
check(
  "strong candidate ranks above weak",
  top && bottom && Number(top.fit_score) > Number(bottom.fit_score),
  `${nm(top)} ${top?.fit_score} > ${nm(bottom)} ${bottom?.fit_score}`
);
check("backend dev is top match", nm(top)?.toLowerCase().includes("alice"), nm(top));

// 3. Deep eval on the top candidate
console.log("⏳ deep eval…");
const dp = await fetch(`${APP}/api/recruiter/deep`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ fitId: top.id }),
});
const dpj = await dp.json();
check(
  "deep eval returns recommendation + interview focus",
  dp.ok && dpj.deep?.recommendation && Array.isArray(dpj.deep?.interviewFocus),
  dp.ok ? `${dpj.deep.verdict} (${dpj.deep.fitScore})` : JSON.stringify(dpj)
);

// 4. Pipeline status persists
await anon.from("candidate_fits").update({ status: "shortlisted" }).eq("id", top.id);
const { data: chk } = await anon.from("candidate_fits").select("status").eq("id", top.id).single();
check("pipeline status update persists", chk?.status === "shortlisted");

console.log(fail === 0 ? "\n🎉 Recruiter flow passed" : `\n💥 ${fail} failure(s)`);
process.exit(fail === 0 ? 0 : 1);
