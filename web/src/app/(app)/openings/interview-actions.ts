"use server";

import { getUserAndTenant } from "@/lib/tenant";
import type { InterviewQuestion, FollowUp } from "@/lib/recruiter/interview";

export async function scheduleInterview(
  fitId: string,
  input: { stage: string; interviewer?: string; scheduledAt?: string | null }
): Promise<{ id?: string; error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();
  const { data: fit } = await supabase
    .from("candidate_fits")
    .select("opening_id, candidate_id")
    .eq("tenant_id", tenantId)
    .eq("id", fitId)
    .maybeSingle();
  if (!fit) return { error: "Candidate not found" };

  const { data, error } = await supabase
    .from("interviews")
    .insert({
      tenant_id: tenantId,
      fit_id: fitId,
      opening_id: fit.opening_id,
      candidate_id: fit.candidate_id,
      stage: input.stage || "screening",
      interviewer: input.interviewer?.trim() || null,
      scheduled_at: input.scheduledAt || null,
      status: "planned",
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to schedule" };
  return { id: data.id };
}

export async function saveInterview(
  interviewId: string,
  patch: {
    questions?: InterviewQuestion[];
    followUps?: FollowUp[];
    status?: string;
    interviewer?: string | null;
    scheduledAt?: string | null;
    stage?: string;
  }
): Promise<{ error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.questions !== undefined) upd.questions = patch.questions;
  if (patch.followUps !== undefined) upd.follow_ups = patch.followUps;
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.interviewer !== undefined) upd.interviewer = patch.interviewer;
  if (patch.scheduledAt !== undefined) upd.scheduled_at = patch.scheduledAt;
  if (patch.stage !== undefined) upd.stage = patch.stage;
  const { error } = await supabase
    .from("interviews")
    .update(upd)
    .eq("tenant_id", tenantId)
    .eq("id", interviewId);
  if (error) return { error: error.message };
  return {};
}

export async function deleteInterview(
  interviewId: string
): Promise<{ error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();
  const { error } = await supabase
    .from("interviews")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", interviewId);
  if (error) return { error: error.message };
  return {};
}
