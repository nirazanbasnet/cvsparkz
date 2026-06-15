"use server";

import { revalidatePath } from "next/cache";
import { getUserAndTenant } from "@/lib/tenant";
import { STATUS_OPTIONS } from "@/lib/ui";

export async function updateApplicationStatus(
  applicationId: string,
  newStatus: string
) {
  if (!(STATUS_OPTIONS as readonly string[]).includes(newStatus)) {
    return; // UI only offers canonical statuses; ignore anything else
  }

  const { supabase, tenantId } = await getUserAndTenant();

  const { data: app } = await supabase
    .from("applications")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("id", applicationId)
    .single();

  if (!app || app.status === newStatus) return;

  await supabase
    .from("applications")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...(newStatus === "applied" ? { applied_at: new Date().toISOString().slice(0, 10) } : {}),
    })
    .eq("id", app.id);

  await supabase.from("application_status_events").insert({
    tenant_id: tenantId,
    application_id: app.id,
    from_status: app.status,
    to_status: newStatus,
  });

  revalidatePath("/tracker");
  revalidatePath("/dashboard");
}

export async function updateApplicationNotes(
  applicationId: string,
  notes: string
) {
  const { supabase, tenantId } = await getUserAndTenant();
  await supabase
    .from("applications")
    .update({ notes: notes.slice(0, 2000), updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", applicationId);
  revalidatePath("/tracker");
}
