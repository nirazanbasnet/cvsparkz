import { NextResponse } from "next/server";
import { getUserAndTenant } from "@/lib/tenant";
import { screenCandidates } from "@/lib/recruiter/screen";
import { withUsage } from "@/lib/llm/usage-context";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { supabase, tenantId } = await getUserAndTenant();
  const body = await req.json().catch(() => ({}));
  const openingId = body.openingId;
  const onlyUnscored = body.onlyUnscored !== false; // default: only score new ones
  if (typeof openingId !== "string") {
    return NextResponse.json({ error: "openingId required" }, { status: 400 });
  }

  const { data: opening } = await supabase
    .from("job_openings")
    .select("id, title, jd_text")
    .eq("tenant_id", tenantId)
    .eq("id", openingId)
    .maybeSingle();
  if (!opening) {
    return NextResponse.json({ error: "Opening not found" }, { status: 404 });
  }

  const { data: fits } = await supabase
    .from("candidate_fits")
    .select("id, candidate_id, scored_at, candidates ( id, name, headline, content_md )")
    .eq("tenant_id", tenantId)
    .eq("opening_id", openingId);

  const targets = (fits ?? []).filter((f) =>
    onlyUnscored ? f.scored_at == null : true
  );
  if (targets.length === 0) return NextResponse.json({ scored: 0, total: 0 });

  const candidates = targets.map((f) => {
    const c = Array.isArray(f.candidates) ? f.candidates[0] : f.candidates;
    return {
      id: c!.id as string,
      name: c!.name as string,
      headline: (c!.headline as string | null) ?? null,
      contentMd: (c!.content_md as string | null) ?? "",
    };
  });

  const results = await withUsage(
    { tenantId, feature: "recruiter:screen" },
    () =>
      screenCandidates(
        { title: opening.title, jdText: opening.jd_text },
        candidates
      )
  );

  const fitByCandidate = new Map(targets.map((f) => [f.candidate_id, f.id]));
  let scored = 0;
  for (const r of results) {
    const fitId = fitByCandidate.get(r.candidateId);
    if (!fitId) continue;
    const { error } = await supabase
      .from("candidate_fits")
      .update({
        fit_score: r.fitScore,
        verdict: r.verdict,
        summary: r.summary,
        strengths: r.strengths,
        gaps: r.gaps,
        scored_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", fitId);
    if (!error) scored++;
  }

  return NextResponse.json({ scored, total: targets.length });
}
