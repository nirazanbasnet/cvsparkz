import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountType = "personal" | "recruiter";

/** A tenant's mode, or null when the owner hasn't chosen yet (→ /onboarding). */
export async function getAccountType(
  supabase: SupabaseClient,
  tenantId: string
): Promise<AccountType | null> {
  const { data } = await supabase
    .from("tenants")
    .select("account_type")
    .eq("id", tenantId)
    .maybeSingle();
  return (data?.account_type as AccountType | null) ?? null;
}
