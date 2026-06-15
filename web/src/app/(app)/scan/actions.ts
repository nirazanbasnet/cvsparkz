"use server";

import { revalidatePath } from "next/cache";
import { getUserAndTenant } from "@/lib/tenant";
import { detectProvider } from "@/lib/scan/providers";

/* Server actions RETURN errors instead of throwing — production builds mask
   thrown error messages ("digest" errors), which hides validation feedback. */
export type ActionResult = { error?: string };

export async function addCompany(
  displayName: string,
  careersUrl: string
): Promise<ActionResult> {
  const name = displayName.trim();
  const url = careersUrl.trim();
  if (!name || !url) return { error: "Name and careers URL are required." };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "That doesn't look like a valid URL." };
  }
  if (parsed.protocol !== "https:") {
    return { error: "Careers URL must use https://" };
  }

  // ATS boards get the fast zero-LLM API path; anything else becomes a
  // "custom" company scanned via headless browser + LLM extraction.
  const provider = detectProvider({ name, careersUrl: url });

  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase.from("tracked_companies").upsert(
    {
      tenant_id: tenantId,
      display_name: name,
      provider: provider?.id ?? "custom",
      provider_config: { careers_url: url },
      enabled: true,
    },
    { onConflict: "tenant_id,display_name" }
  );
  if (error) return { error: error.message };
  revalidatePath("/scan");
  return {};
}

export async function removeCompany(id: string): Promise<ActionResult> {
  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase
    .from("tracked_companies")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/scan");
  return {};
}

export async function toggleCompany(
  id: string,
  enabled: boolean
): Promise<ActionResult> {
  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase
    .from("tracked_companies")
    .update({ enabled })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/scan");
  return {};
}

export async function saveScanConfig(form: {
  title_positive: string;
  title_negative: string;
  loc_always_allow: string;
  loc_allow: string;
  loc_block: string;
}): Promise<ActionResult> {
  const toList = (s: string) =>
    s.split("\n").map((l) => l.trim()).filter(Boolean);

  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase.from("scan_configs").upsert(
    {
      tenant_id: tenantId,
      title_positive: toList(form.title_positive),
      title_negative: toList(form.title_negative),
      loc_always_allow: toList(form.loc_always_allow),
      loc_allow: toList(form.loc_allow),
      loc_block: toList(form.loc_block),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" }
  );
  if (error) return { error: error.message };
  revalidatePath("/scan");
  return {};
}

/** Well-known AI companies on scannable ATS boards (from the CLI's portals.example.yml). */
const DEFAULT_COMPANIES: Array<{ name: string; url: string }> = [
  { name: "Anthropic", url: "https://job-boards.greenhouse.io/anthropic" },
  { name: "Intercom", url: "https://job-boards.greenhouse.io/intercom" },
  { name: "Hume AI", url: "https://job-boards.greenhouse.io/humeai" },
  { name: "ElevenLabs", url: "https://jobs.ashbyhq.com/elevenlabs" },
  { name: "Deepgram", url: "https://jobs.ashbyhq.com/deepgram" },
  { name: "Vapi", url: "https://jobs.ashbyhq.com/vapi" },
  { name: "Airtable", url: "https://job-boards.greenhouse.io/airtable" },
  { name: "Vercel", url: "https://job-boards.greenhouse.io/vercel" },
  { name: "Temporal", url: "https://job-boards.greenhouse.io/temporal" },
  { name: "Arize AI", url: "https://job-boards.greenhouse.io/arizeai" },
  { name: "RunPod", url: "https://job-boards.greenhouse.io/runpod" },
  { name: "CoreWeave", url: "https://job-boards.greenhouse.io/coreweave" },
  { name: "Glean", url: "https://job-boards.greenhouse.io/gleanwork" },
  { name: "Ada", url: "https://job-boards.greenhouse.io/ada" },
  { name: "Sierra", url: "https://jobs.ashbyhq.com/sierra" },
  { name: "Decagon", url: "https://jobs.ashbyhq.com/decagon" },
];

export async function seedDefaultCompanies(): Promise<ActionResult> {
  const { supabase, tenantId } = await getUserAndTenant();
  const rows = DEFAULT_COMPANIES.map((c) => ({
    tenant_id: tenantId,
    display_name: c.name,
    provider: detectProvider({ name: c.name, careersUrl: c.url })!.id,
    provider_config: { careers_url: c.url },
    enabled: true,
  }));
  const { error } = await supabase
    .from("tracked_companies")
    .upsert(rows, { onConflict: "tenant_id,display_name" });
  if (error) return { error: error.message };
  revalidatePath("/scan");
  return {};
}
