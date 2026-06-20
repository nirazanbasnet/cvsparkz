"use server";

import { revalidatePath } from "next/cache";
import { getUserAndTenant } from "@/lib/tenant";

export async function dismissPipelineItem(id: string) {
  const { supabase, tenantId } = await getUserAndTenant();
  await supabase
    .from("pipeline_items")
    .update({ state: "dismissed", processed_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  revalidatePath("/inbox");
}

/** Move a dismissed item back into the active inbox. */
export async function restorePipelineItem(id: string) {
  const { supabase, tenantId } = await getUserAndTenant();
  await supabase
    .from("pipeline_items")
    .update({ state: "pending", processed_at: null, error: null })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("state", "dismissed");
  revalidatePath("/inbox");
}
