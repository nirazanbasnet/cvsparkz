/**
 * CV Score (Ascend): score a CV against the gold standard, persist on the
 * version, and re-load. Verifies the absolute 0-100 score + category rewrites.
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
  email: `e2e-cvscore-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: m } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = m.tenant_id;

// A deliberately mediocre CV (weak verbs, no metrics) so rewrites are meaningful
await anon.from("cv_versions").insert({
  tenant_id: tenantId,
  version: 1,
  label: "My CV",
  primary_role: "Backend Engineer",
  content_md: `# Sita Sharma

## Summary
Worked on web apps for a few years. Responsible for backend stuff.

## Experience
### Backend Developer — SomeCo (2021-now)
- Worked on the API
- Responsible for the database
- Helped with deployments

## Skills
JavaScript, Python, SQL, Docker`,
  content_hash: "score-h1",
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
const cookie = [...jar.entries()]
  .map(([n, v]) => `${n}=${encodeURIComponent(v)}`)
  .join("; ");

console.log("⏳ scoring CV (gold-standard rubric)…");
const t0 = Date.now();
const res = await fetch(`${APP}/api/cv-score`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ label: "My CV" }),
});
const json = await res.json();
check(
  "scoring succeeds",
  res.ok && json.score,
  res.ok ? `${((Date.now() - t0) / 1000).toFixed(1)}s` : JSON.stringify(json)
);

if (json.score) {
  const s = json.score;
  check("overall score in 0-100", s.score >= 0 && s.score <= 100, `score=${s.score}`);
  check("market avg present", typeof s.averageMarketScore === "number", `avg=${s.averageMarketScore}`);
  check("role category detected", !!s.roleCategory, s.roleCategory);
  check("has category breakdown", Array.isArray(s.categories) && s.categories.length >= 1, `${s.categories?.length} categories`);
  const hasRewrite = s.categories.some(
    (c) => c.improvements?.some((i) => i.originalText && i.recommendedText)
  );
  check("at least one do/don't rewrite", hasRewrite);
  const firstImp = s.categories.flatMap((c) => c.improvements || [])[0];
  if (firstImp) console.log(`   e.g. "${firstImp.originalText}" → "${firstImp.recommendedText}"`);
}

// Persisted on the version?
const { data: row } = await anon
  .from("cv_versions")
  .select("score_overall, score_data, scored_at")
  .eq("tenant_id", tenantId)
  .eq("label", "My CV")
  .single();
check(
  "score persisted on cv version",
  row.score_overall != null && row.score_data?.roleCategory && row.scored_at,
  `stored ${row.score_overall}`
);

// Score page renders with the persisted score
const pageRes = await fetch(`${APP}/cv/score?cv=My%20CV`, { headers: { Cookie: cookie } });
const html = await pageRes.text();
check("score page renders breakdown", pageRes.ok && html.includes("CV score"));

console.log(failures === 0 ? "\n🎉 CV score test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
