"use server";

import { revalidatePath } from "next/cache";
import { getUserAndTenant } from "@/lib/tenant";

export async function dismissPipelineItem(id: string) {
  const { supabase, tenantId } = await getUserAndTenant();
  await supabase
    .from("pipeline_items")
    .update({ state: "processed", processed_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  revalidatePath("/inbox");
}
