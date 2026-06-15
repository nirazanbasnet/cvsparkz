/**
 * E2E for the scanning + PDF features (run after scripts/e2e.mjs basics):
 *   track company → scan (live Greenhouse API) → dedup on rescan →
 *   evaluate from inbox → generate tailored PDF → signed download.
 *
 * Run: node scripts/e2e-features.mjs   (app on :3000, supabase local up)
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const APP_URL = "http://localhost:3000";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ── Setup: user + CV + profile ───────────────────────────────
const anon = createClient(SUPABASE_URL, ANON_KEY);
const email = `e2e-feat-${Date.now()}@test.local`;
const { data: signup } = await anon.auth.signUp({
  email,
  password: "test-password-123",
  options: { data: { full_name: "Feature Tester" } },
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
  content_md: `# Feature Tester

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

## Education
- BSc Computer Science — State University (2019)

## Skills
TypeScript, Node.js, Python, Postgres, pgvector, Redis, Docker, AWS, LLM evals, RAG`,
  content_hash: "e2e-feat-hash",
  is_current: true,
});
await anon.from("candidate_profiles").upsert(
  {
    tenant_id: tenantId,
    full_name: "Feature Tester",
    email,
    location_city: "Austin",
    location_country: "USA",
    linkedin_url: "https://linkedin.com/in/feature-tester",
    target_roles: [{ title: "AI Engineer" }],
  },
  { onConflict: "tenant_id" }
);

// auth cookies for the Next API
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

// ── 1. Track a company + scan config ─────────────────────────
await anon.from("tracked_companies").insert({
  tenant_id: tenantId,
  display_name: "Anthropic",
  provider: "greenhouse",
  provider_config: { careers_url: "https://job-boards.greenhouse.io/anthropic" },
  enabled: true,
});
await anon.from("scan_configs").upsert(
  {
    tenant_id: tenantId,
    title_positive: ["engineer"],
    title_negative: ["intern", "manager, "],
    loc_block: ["india"],
  },
  { onConflict: "tenant_id" }
);

// ── 2. Scan (live Greenhouse API) ────────────────────────────
console.log("⏳ scanning Anthropic via Greenhouse boards-api…");
const scanRes = await fetch(`${APP_URL}/api/scan`, {
  method: "POST",
  headers: { Cookie: cookie },
});
const scan = await scanRes.json();
check(
  "scan finds matching postings",
  scanRes.ok && scan.added > 0,
  scanRes.ok
    ? `${scan.fetched} fetched, ${scan.matched} matched, ${scan.added} added`
    : JSON.stringify(scan)
);

const { count: postings } = await anon
  .from("job_postings")
  .select("*", { count: "exact", head: true })
  .eq("tenant_id", tenantId);
const { count: inboxCount } = await anon
  .from("pipeline_items")
  .select("*", { count: "exact", head: true })
  .eq("tenant_id", tenantId)
  .eq("state", "pending");
check(
  "postings + inbox items persisted",
  (postings ?? 0) > 0 && inboxCount === scan.added,
  `${postings} postings, ${inboxCount} inbox items`
);

// ── 3. Rescan → full dedup ───────────────────────────────────
console.log("⏳ rescanning (dedup)…");
const scan2 = await (
  await fetch(`${APP_URL}/api/scan`, { method: "POST", headers: { Cookie: cookie } })
).json();
check(
  "rescan dedups everything",
  scan2.added === 0 && scan2.alreadySeen >= scan.added,
  `added=${scan2.added}, alreadySeen=${scan2.alreadySeen}`
);

// ── 4. Evaluate one item from the inbox ──────────────────────
const { data: item } = await anon
  .from("pipeline_items")
  .select("id, url")
  .eq("tenant_id", tenantId)
  .eq("state", "pending")
  .limit(1)
  .single();
console.log(`⏳ evaluating from inbox: ${item.url} (Groq, may wait on rate limits)…`);
const evalRes = await fetch(`${APP_URL}/api/evaluations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ pipeline_item_id: item.id }),
});
const evalJson = await evalRes.json();
check(
  "inbox item evaluates",
  evalRes.ok && !!evalJson.evaluation_id,
  evalRes.ok ? evalJson.evaluation_id : JSON.stringify(evalJson)
);

const { data: itemAfter } = await anon
  .from("pipeline_items")
  .select("state")
  .eq("id", item.id)
  .single();
check("pipeline item marked processed", itemAfter.state === "processed", itemAfter.state);

const { data: ev } = await anon
  .from("evaluations")
  .select("id, posting_id, company_name, role, score")
  .eq("id", evalJson.evaluation_id)
  .single();
check(
  "evaluation linked to posting",
  !!ev?.posting_id,
  ev ? `${ev.company_name} — ${ev.role}: ${ev.score}/5` : ""
);

// ── 5. Generate tailored PDF ─────────────────────────────────
console.log("⏳ generating tailored PDF (Groq tailoring + Playwright)…");
const t0 = Date.now();
const pdfRes = await fetch(`${APP_URL}/api/documents`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ evaluation_id: evalJson.evaluation_id }),
});
const pdfJson = await pdfRes.json();
check(
  "PDF generated",
  pdfRes.ok && !!pdfJson.document_id,
  pdfRes.ok ? `${((Date.now() - t0) / 1000).toFixed(1)}s` : JSON.stringify(pdfJson)
);

if (pdfJson.document_id) {
  const { data: doc } = await anon
    .from("generated_documents")
    .select("id, kind, page_format, file_size, object_key")
    .eq("id", pdfJson.document_id)
    .single();
  check(
    "document recorded",
    doc?.kind === "cv_pdf" && doc.file_size > 10000,
    doc ? `${doc.page_format}, ${(doc.file_size / 1024).toFixed(0)} KB` : ""
  );

  // download via signed URL redirect
  const dl = await fetch(`${APP_URL}/api/documents/${pdfJson.document_id}/download`, {
    headers: { Cookie: cookie },
    redirect: "follow",
  });
  const buf = Buffer.from(await dl.arrayBuffer());
  check(
    "signed download returns a real PDF",
    dl.ok && buf.subarray(0, 5).toString() === "%PDF-",
    `${(buf.length / 1024).toFixed(0)} KB`
  );

  const { data: app } = await anon
    .from("applications")
    .select("has_pdf")
    .eq("tenant_id", tenantId)
    .eq("latest_evaluation_id", evalJson.evaluation_id)
    .single();
  check("application has_pdf flipped", app?.has_pdf === true);
}

console.log(failures === 0 ? "\n🎉 Feature E2E passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
