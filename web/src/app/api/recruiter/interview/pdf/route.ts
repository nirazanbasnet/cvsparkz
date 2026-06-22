import { NextResponse } from "next/server";
import { getUserAndTenant } from "@/lib/tenant";
import { renderReportPdf } from "@/lib/recruiter/report-pdf";
import type { HiringReport } from "@/lib/recruiter/interview";

export const maxDuration = 60;

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null;

export async function GET(req: Request) {
  const { supabase, tenantId } = await getUserAndTenant();
  const interviewId = new URL(req.url).searchParams.get("interviewId");
  if (!interviewId) {
    return NextResponse.json({ error: "interviewId required" }, { status: 400 });
  }

  const { data: iv } = await supabase
    .from("interviews")
    .select(
      "id, stage, interviewer, scheduled_at, report, report_at, job_openings ( title ), candidates ( name )"
    )
    .eq("tenant_id", tenantId)
    .eq("id", interviewId)
    .maybeSingle();
  if (!iv) return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  if (!iv.report) {
    return NextResponse.json(
      { error: "Generate the report first" },
      { status: 422 }
    );
  }

  const opening = one(iv.job_openings);
  const cand = one(iv.candidates);
  const candidateName = cand?.name ?? "Candidate";

  const pdf = await renderReportPdf(iv.report as HiringReport, {
    candidate: candidateName,
    position: opening?.title ?? "—",
    interviewer: iv.interviewer ?? null,
    interviewDate: fmtDate(iv.scheduled_at),
    reportDate:
      fmtDate(iv.report_at) ??
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    stage: iv.stage,
  });

  const slug = candidateName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="hiring-report-${slug}.pdf"`,
    },
  });
}
