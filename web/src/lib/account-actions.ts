"use server";

import { revalidatePath } from "next/cache";
import { getUserAndTenant } from "@/lib/tenant";
import type { AccountType } from "@/lib/account";

/** Set or switch the workspace mode (used by onboarding + settings). */
export async function setAccountType(
  type: AccountType
): Promise<{ error?: string }> {
  if (type !== "personal" && type !== "recruiter") {
    return { error: "Invalid workspace type" };
  }
  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase
    .from("tenants")
    .update({ account_type: type, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}
