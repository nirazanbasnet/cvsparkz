/**
 * Screenshot the redesigned evaluation report page using the most recent
 * e2e test user that has a PDF-bearing evaluation (password is shared
 * across e2e fixtures). No LLM calls.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
// newest PDF-bearing evaluation owned by an e2e fixture account (known password)
const { data: docs } = await admin
  .from("generated_documents")
  .select("evaluation_id, tenant_id")
  .order("created_at", { ascending: false })
  .limit(20);
let doc = null;
let userRow = null;
for (const d of docs ?? []) {
  const { data: member } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", d.tenant_id)
    .single();
  const { data: u } = await admin
    .from("users")
    .select("email")
    .eq("id", member.user_id)
    .single();
  if (u.email.endsWith("@test.local")) {
    doc = d;
    userRow = u;
    break;
  }
}
if (!doc) throw new Error("no e2e-owned evaluation with a PDF found");

const anon = createClient(SUPABASE_URL, ANON_KEY);
const { data: session, error } = await anon.auth.signInWithPassword({
  email: userRow.email,
  password: "test-password-123",
});
if (error) throw new Error(`signin failed for ${userRow.email}: ${error.message}`);

const jar = new Map();
const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)),
  },
});
await ssr.auth.setSession({
  access_token: session.session.access_token,
  refresh_token: session.session.refresh_token,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies(
  [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    domain: "localhost",
    path: "/",
  }))
);
const page = await ctx.newPage();
await page.goto(`http://localhost:3000/evaluations/${doc.evaluation_id}`, {
  waitUntil: "networkidle",
});
await page.screenshot({ path: "/tmp/report-redesign.png", fullPage: true });
console.log(`screenshot saved for evaluation ${doc.evaluation_id} (user ${userRow.email})`);
await browser.close();
