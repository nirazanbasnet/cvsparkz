import { NextResponse } from "next/server";
import { getUserAndTenant } from "@/lib/tenant";
import { deepEvaluate } from "@/lib/recruiter/deep";
import { withUsage } from "@/lib/llm/usage-context";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { supabase, tenantId } = await getUserAndTenant();
  const body = await req.json().catch(() => ({}));
  const fitId = body.fitId;
  if (typeof fitId !== "string") {
    return NextResponse.json({ error: "fitId required" }, { status: 400 });
  }

  const { data: fit } = await supabase
    .from("candidate_fits")
    .select(
      "id, job_openings ( title, jd_text ), candidates ( name, content_md )"
    )
    .eq("tenant_id", tenantId)
    .eq("id", fitId)
    .maybeSingle();
  if (!fit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const opening = Array.isArray(fit.job_openings)
    ? fit.job_openings[0]
    : fit.job_openings;
  const cand = Array.isArray(fit.candidates)
    ? fit.candidates[0]
    : fit.candidates;
  if (!opening || !cand) {
    return NextResponse.json({ error: "Incomplete record" }, { status: 422 });
  }

  try {
    const deep = await withUsage(
      { tenantId, feature: "recruiter:deep" },
      () =>
        deepEvaluate(
          { title: opening.title, jdText: opening.jd_text },
          { name: cand.name, contentMd: cand.content_md ?? "" }
        )
    );
    const { error } = await supabase
      .from("candidate_fits")
      .update({
        deep,
        deep_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", fitId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ deep });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Deep evaluation failed" },
      { status: 500 }
    );
  }
}
