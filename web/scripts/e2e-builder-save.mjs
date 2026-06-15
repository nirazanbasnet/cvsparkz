/**
 * Builder save loop in the browser: open a blank builder, type a name + summary,
 * wait for autosave, then verify the DB stored structured JSON AND the derived
 * markdown (so eval/scan/PDF keep working).
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL_ = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let failures = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) failures++;
};

const anon = createClient(URL_, ANON);
const { data: signup } = await anon.auth.signUp({
  email: `e2e-bsave-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: m } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = m.tenant_id;

// Seed a CV with NO structured data so the builder shows the empty state → Start blank
await anon.from("cv_versions").insert({
  tenant_id: tenantId,
  version: 1,
  label: "Fresh CV",
  primary_role: "Engineer",
  content_md: "# Placeholder\n\nseed",
  content_hash: "bsave-h1",
  is_current: true,
  score_overall: 88, // pre-set a score so we can verify edits reset it
  score_data: { roleCategory: "Engineer", averageMarketScore: 70, marketFitSummary: "x", categories: [] },
  scored_at: new Date().toISOString(),
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies(
  [...jar.entries()].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" }))
);
const page = await ctx.newPage();

await page.goto("http://localhost:3000/cv/builder?cv=Fresh%20CV", { waitUntil: "networkidle" });

// content_md is just a placeholder (>50 chars) → "canExtract" true, so we click Start blank
await page.getByRole("button", { name: "Start blank" }).click();
await page.waitForTimeout(500);

// Basics tab is default — fill name + headline
await page.getByPlaceholder("Ada Lovelace").fill("Builder Tester");
await page.getByPlaceholder("Senior Backend Engineer").fill("Platform Engineer");
await page.getByPlaceholder(/3-4 line summary/).fill("Platform engineer who ships reliable infrastructure.");

// Wait out the 1.5s autosave debounce + server roundtrip
await page.waitForTimeout(3500);

// Verify "Saved" appears
const savedVisible = await page.getByText(/Saved · markdown synced/).isVisible().catch(() => false);
check("UI shows saved state", savedVisible);

// Screenshot the builder
await page.screenshot({ path: "/tmp/cv-builder.png" });

// Verify DB: newest version has structured + derived markdown + score reset
const { data: rows } = await anon
  .from("cv_versions")
  .select("version, structured, content_md, score_overall")
  .eq("tenant_id", tenantId)
  .eq("label", "Fresh CV")
  .order("version", { ascending: false });
const latest = rows[0];

check(
  "structured JSON saved as source of truth",
  latest.structured?.basics?.name === "Builder Tester",
  `name=${latest.structured?.basics?.name}`
);
check(
  "markdown derived & synced from structured",
  latest.content_md.includes("# Builder Tester") &&
    latest.content_md.includes("Platform Engineer"),
  latest.content_md.split("\n")[0]
);
check("edit reset the stale score", latest.score_overall === null);
check("created a new version", latest.version > 1, `v${latest.version}`);

await browser.close();
console.log(failures === 0 ? "\n🎉 Builder save loop passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
