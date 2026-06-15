/**
 * Delete-CV behavior: deleting a CV keeps its past evaluations (FK unlinked,
 * not cascaded), and deleting the PRIMARY CV promotes another to primary.
 * Drives the real dialog in the browser.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL_ = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const anon = createClient(URL_, ANON);
const { data: signup } = await anon.auth.signUp({
  email: `e2e-cvdel-${Date.now()}@test.local`,
  password: "test-password-123",
});
const { data: m } = await anon
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", signup.user.id)
  .single();
const tenantId = m.tenant_id;

const cv = (v, label, role, primary) => ({
  tenant_id: tenantId,
  version: v,
  label,
  primary_role: role,
  content_md: `# T\n\n## Summary\n${role}.\n\n## Skills\nX, Y, Z and more skills here`,
  content_hash: `h${v}`,
  is_current: primary,
});
await anon
  .from("cv_versions")
  .insert([
    cv(1, "Primary CV", "Backend Engineer", true),
    cv(2, "Other CV", "Data Engineer", false),
  ]);
const { data: primaryRow } = await anon
  .from("cv_versions")
  .select("id")
  .eq("tenant_id", tenantId)
  .eq("label", "Primary CV")
  .single();

// An evaluation linked to the primary CV version (must survive deletion)
const { data: ev } = await anon
  .from("evaluations")
  .insert({
    tenant_id: tenantId,
    cv_version_id: primaryRow.id,
    company_name: "Acme",
    role: "Engineer",
    score: 4.2,
    blocks: {},
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies(
  [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    domain: "localhost",
    path: "/",
  }))
);
const page = await ctx.newPage();

// Delete the PRIMARY CV via the dialog
await page.goto("http://localhost:3000/cv?cv=Primary%20CV", {
  waitUntil: "networkidle",
});
await page.getByRole("button", { name: "Delete" }).click();
await page.getByRole("button", { name: "Delete CV" }).click();
await page.waitForTimeout(1500);

// Verify DB state
const { data: remaining } = await anon
  .from("cv_versions")
  .select("label, is_current")
  .eq("tenant_id", tenantId);
check(
  "deleted CV is gone",
  !remaining.some((r) => r.label === "Primary CV"),
  remaining.map((r) => r.label).join(", ")
);
check(
  "remaining CV exists and was promoted to primary",
  remaining.length === 1 &&
    remaining[0].label === "Other CV" &&
    remaining[0].is_current === true
);

const { data: evAfter } = await anon
  .from("evaluations")
  .select("cv_version_id")
  .eq("id", ev.id)
  .single();
check(
  "evaluation survived, CV link nulled (not cascade-deleted)",
  evAfter !== null && evAfter.cv_version_id === null
);

await browser.close();
console.log(failures === 0 ? "\n🎉 CV delete test passed" : `\n💥 ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
