"use server";

import { revalidatePath } from "next/cache";
import { getUserAndTenant } from "@/lib/tenant";

const STATUSES = [
  "new",
  "reviewing",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "rejected",
];

export async function createOpening(input: {
  title: string;
  jdText: string;
  location?: string;
}): Promise<{ id?: string; error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();
  if (!input.title?.trim() || !input.jdText?.trim()) {
    return { error: "Title and job description are required" };
  }
  const { data, error } = await supabase
    .from("job_openings")
    .insert({
      tenant_id: tenantId,
      title: input.title.trim(),
      jd_text: input.jdText.trim(),
      location: input.location?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create opening" };
  revalidatePath("/openings");
  return { id: data.id };
}

export async function setOpeningStatus(
  id: string,
  status: "open" | "closed"
): Promise<{ error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase
    .from("job_openings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/openings/${id}`);
  revalidatePath("/openings");
  return {};
}

export async function deleteOpening(id: string): Promise<{ error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase
    .from("job_openings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/openings");
  return {};
}

export async function setCandidateStatus(
  fitId: string,
  status: string
): Promise<{ error?: string }> {
  if (!STATUSES.includes(status)) return { error: "Invalid status" };
  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase
    .from("candidate_fits")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", fitId);
  if (error) return { error: error.message };
  return {};
}

export async function saveCandidateNotes(
  fitId: string,
  notes: string
): Promise<{ error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase
    .from("candidate_fits")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", fitId);
  if (error) return { error: error.message };
  return {};
}

/** Remove a candidate from an opening (deletes the fit + the candidate row). */
export async function removeCandidate(
  fitId: string,
  candidateId: string
): Promise<{ error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();
  await supabase
    .from("candidate_fits")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", fitId);
  await supabase
    .from("candidates")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", candidateId);
  return {};
}

/** Bulk delete by fit id (also removes the underlying candidate rows). */
export async function removeCandidatesBulk(
  fitIds: string[]
): Promise<{ error?: string }> {
  if (fitIds.length === 0) return {};
  const { supabase, tenantId } = await getUserAndTenant();
  const { data: fits } = await supabase
    .from("candidate_fits")
    .select("candidate_id")
    .eq("tenant_id", tenantId)
    .in("id", fitIds);
  const candidateIds = [...new Set((fits ?? []).map((f) => f.candidate_id))];
  await supabase
    .from("candidate_fits")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", fitIds);
  if (candidateIds.length > 0) {
    await supabase
      .from("candidates")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", candidateIds);
  }
  return {};
}

export async function setCandidateStatusBulk(
  fitIds: string[],
  status: string
): Promise<{ error?: string }> {
  if (fitIds.length === 0) return {};
  if (!STATUSES.includes(status)) return { error: "Invalid status" };
  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase
    .from("candidate_fits")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .in("id", fitIds);
  if (error) return { error: error.message };
  return {};
}
