import { notFound } from "next/navigation";
import { getUserAndTenant } from "@/lib/tenant";
import { OpeningDetail, type FitRowData } from "./opening-detail";

export default async function OpeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, tenantId } = await getUserAndTenant();

  const { data: opening } = await supabase
    .from("job_openings")
    .select("id, title, jd_text, location, status, created_at")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!opening) notFound();

  const { data: fits } = await supabase
    .from("candidate_fits")
    .select(
      "id, status, fit_score, verdict, summary, strengths, gaps, deep, notes, scored_at, candidates ( id, name, email, headline, source_filename )"
    )
    .eq("tenant_id", tenantId)
    .eq("opening_id", id)
    .order("fit_score", { ascending: false, nullsFirst: false });

  const rows: FitRowData[] = (fits ?? []).map((f) => {
    const c = Array.isArray(f.candidates) ? f.candidates[0] : f.candidates;
    return {
      fitId: f.id,
      candidateId: c?.id ?? "",
      name: c?.name ?? "(unknown)",
      email: c?.email ?? null,
      headline: c?.headline ?? null,
      status: f.status,
      fitScore: f.fit_score != null ? Number(f.fit_score) : null,
      verdict: (f.verdict as string | null) ?? null,
      summary: (f.summary as string | null) ?? null,
      strengths: (f.strengths as string[]) ?? [],
      gaps: (f.gaps as string[]) ?? [],
      deep: (f.deep as FitRowData["deep"]) ?? null,
      notes: (f.notes as string | null) ?? "",
      scored: f.scored_at != null,
    };
  });

  return (
    <OpeningDetail
      opening={{
        id: opening.id,
        title: opening.title,
        jdText: opening.jd_text,
        location: opening.location,
        status: opening.status,
        createdAt: opening.created_at,
      }}
      initialRows={rows}
    />
  );
}
