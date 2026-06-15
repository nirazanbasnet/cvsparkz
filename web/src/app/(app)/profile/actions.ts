"use server";

import { revalidatePath } from "next/cache";
import { getUserAndTenant } from "@/lib/tenant";

export interface ProfileFormData {
  full_name: string;
  email: string;
  location_city: string;
  location_country: string;
  timezone: string;
  location_flexibility: string;
  comp_currency: string;
  comp_target_min: string;
  comp_target_max: string;
  comp_minimum: string;
  target_roles: string; // comma-separated
  headline: string;
  superpowers: string; // one per line
  dealbreakers: string; // one per line
}

function toNumber(s: string): number | null {
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toLines(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function saveProfile(
  form: ProfileFormData
): Promise<{ error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();

  const targetRoles = form.target_roles
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((title) => ({ title }));

  const { error } = await supabase.from("candidate_profiles").upsert(
    {
      tenant_id: tenantId,
      full_name: form.full_name.trim() || null,
      email: form.email.trim() || null,
      location_city: form.location_city.trim() || null,
      location_country: form.location_country.trim() || null,
      timezone: form.timezone.trim() || null,
      location_flexibility: form.location_flexibility.trim() || null,
      comp_currency: form.comp_currency.trim() || "USD",
      comp_target_min: toNumber(form.comp_target_min),
      comp_target_max: toNumber(form.comp_target_max),
      comp_minimum: toNumber(form.comp_minimum),
      target_roles: targetRoles,
      narrative: {
        headline: form.headline.trim() || null,
        superpowers: toLines(form.superpowers),
        dealbreakers: toLines(form.dealbreakers),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" }
  );

  if (error) return { error: `Failed to save profile: ${error.message}` };
  revalidatePath("/profile");
  return {};
}
