import { notFound } from "next/navigation";
import { getUserAndTenant } from "@/lib/tenant";
import { FitDetail } from "./fit-detail";
import type { DeepData } from "../opening-detail";
import type {
  InterviewQuestion,
  FollowUp,
  HiringReport,
} from "@/lib/recruiter/interview";

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

export default async function FitDetailPage({
  params,
}: {
  params: Promise<{ id: string; fitId: string }>;
}) {
  const { id, fitId } = await params;
  const { supabase, tenantId } = await getUserAndTenant();

  const { data: fit } = await supabase
    .from("candidate_fits")
    .select(
      "id, status, fit_score, verdict, summary, strengths, gaps, deep, notes, candidates ( name, email, phone, headline, source_filename ), job_openings ( id, title )"
    )
    .eq("tenant_id", tenantId)
    .eq("id", fitId)
    .maybeSingle();
  if (!fit) notFound();

  const cand = one(fit.candidates);
  const op = one(fit.job_openings);

  const { data: interviews } = await supabase
    .from("interviews")
    .select(
      "id, stage, interviewer, scheduled_at, status, questions, follow_ups, report, report_at"
    )
    .eq("tenant_id", tenantId)
    .eq("fit_id", fitId)
    .order("created_at", { ascending: false });

  return (
    <FitDetail
      openingId={id}
      openingTitle={op?.title ?? ""}
      fit={{
        fitId: fit.id,
        name: cand?.name ?? "(unknown)",
        email: cand?.email ?? null,
        phone: cand?.phone ?? null,
        headline: cand?.headline ?? null,
        sourceFilename: cand?.source_filename ?? null,
        status: fit.status,
        fitScore: fit.fit_score != null ? Number(fit.fit_score) : null,
        verdict: (fit.verdict as string | null) ?? null,
        summary: (fit.summary as string | null) ?? null,
        strengths: (fit.strengths as string[]) ?? [],
        gaps: (fit.gaps as string[]) ?? [],
        deep: (fit.deep as DeepData | null) ?? null,
        notes: (fit.notes as string | null) ?? "",
      }}
      interviews={(interviews ?? []).map((iv) => ({
        id: iv.id,
        stage: iv.stage,
        interviewer: (iv.interviewer as string | null) ?? null,
        scheduledAt: (iv.scheduled_at as string | null) ?? null,
        status: iv.status,
        questions: ((iv.questions as InterviewQuestion[]) ?? []),
        followUps: ((iv.follow_ups as FollowUp[]) ?? []),
        report: (iv.report as HiringReport | null) ?? null,
        reportAt: (iv.report_at as string | null) ?? null,
      }))}
    />
  );
}
