/**
 * Regression test for the inbox FETCH_FAILED bug: scan an Ashby board
 * (JS-rendered job pages) and evaluate one item — the JD must come through
 * the Ashby posting-api fast path.
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
  email: `e2e-ashby-${Date.now()}@test.local`,
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
  content_md:
    "# Ashby Tester\n\n## Summary\nFull-stack engineer, 6 years: TypeScript, React, Node.js, Python, Postgres. Built LLM products (RAG, evals) end to end.\n\n## Experience\n### Senior Engineer — Acme AI (2022–now)\n- Shipped LLM-powered search (RAG over 12k docs), p95 380ms\n- Built React front-ends and Node APIs for 2M MAU\n\n## Skills\nTypeScript, React, Node.js, Python, Postgres, AWS",
  content_hash: "ashby-hash",
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

// Track ElevenLabs (Ashby) and scan
await anon.from("tracked_companies").insert({
  tenant_id: tenantId,
  display_name: "ElevenLabs",
  provider: "ashby",
  provider_config: { careers_url: "https://jobs.ashbyhq.com/elevenlabs" },
  enabled: true,
});
await anon.from("scan_configs").upsert(
  { tenant_id: tenantId, title_positive: ["engineer"] },
  { onConflict: "tenant_id" }
);

console.log("⏳ scanning ElevenLabs (Ashby)…");
const scan = await (
  await fetch(`${APP_URL}/api/scan`, { method: "POST", headers: { Cookie: cookie } })
).json();
check("ashby scan finds postings", scan.added > 0, `${scan.added} added`);

const { data: item } = await anon
  .from("pipeline_items")
  .select("id, url")
  .eq("tenant_id", tenantId)
  .eq("state", "pending")
  .limit(1)
  .single();

console.log(`⏳ evaluating ${item.url} from inbox (Ashby JD fast path + Groq)…`);
const res = await fetch(`${APP_URL}/api/evaluations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ pipeline_item_id: item.id }),
});
const json = await res.json();
check(
  "ashby inbox item evaluates (no FETCH_FAILED)",
  res.ok && !!json.evaluation_id,
  res.ok ? json.evaluation_id : JSON.stringify(json)
);

if (json.evaluation_id) {
  const { data: ev } = await anon
    .from("evaluations")
    .select("company_name, role, score, blocks")
    .eq("id", json.evaluation_id)
    .single();
  const jd = ev?.blocks?.jd_text ?? "";
  check(
    "JD captured via Ashby API (clean text)",
    jd.length > 1000 && jd.startsWith("Title:"),
    `${jd.length} chars, starts: ${JSON.stringify(jd.slice(0, 60))}`
  );
  check("evaluation sane", Number(ev.score) >= 1, `${ev.company_name} — ${ev.role}: ${ev.score}/5`);
}

console.log(failures === 0 ? "\n🎉 Ashby regression test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
