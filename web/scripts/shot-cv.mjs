import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL_ = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const anon = createClient(URL_, ANON);
const { data: signup } = await anon.auth.signUp({
  email: `shot-cv-${Date.now()}@test.local`,
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
  content_md: `# Tester\n\n## Summary\n${role} with strong delivery record.\n\n## Experience\n### Senior ${role} — Acme (2022–now)\n- Shipped things\n\n## Skills\nPython, TypeScript, Postgres`,
  content_hash: `h${v}`,
  is_current: primary,
});
await anon.from("cv_versions").insert([
  cv(1, "Backend CV", "Senior Backend Engineer", true),
  cv(2, "AI CV", "AI Engineer", false),
  cv(3, "Data CV", "Data Engineer", false),
]);

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
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  deviceScaleFactor: 1.5,
});
await ctx.addCookies(
  [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    domain: "localhost",
    path: "/",
  }))
);
const page = await ctx.newPage();
await page.goto("http://localhost:3000/cv?cv=AI%20CV", {
  waitUntil: "networkidle",
});
await page.screenshot({ path: "/tmp/cv-2col.png", fullPage: true });

// Open the delete dialog
await page.getByRole("button", { name: "Delete" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/cv-delete.png" });

console.log("shots saved; user:", signup.user.email);
await browser.close();
