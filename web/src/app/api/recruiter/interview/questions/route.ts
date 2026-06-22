import { NextResponse } from "next/server";
import { getUserAndTenant } from "@/lib/tenant";
import { generateInterviewQuestions } from "@/lib/recruiter/interview";
import { withUsage } from "@/lib/llm/usage-context";

export const maxDuration = 120;

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

export async function POST(req: Request) {
  const { supabase, tenantId } = await getUserAndTenant();
  const body = await req.json().catch(() => ({}));
  const interviewId = body.interviewId;
  if (typeof interviewId !== "string") {
    return NextResponse.json({ error: "interviewId required" }, { status: 400 });
  }

  const { data: iv } = await supabase
    .from("interviews")
    .select(
      "id, stage, job_openings ( title, jd_text ), candidates ( name, headline, content_md )"
    )
    .eq("tenant_id", tenantId)
    .eq("id", interviewId)
    .maybeSingle();
  if (!iv) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  const opening = one(iv.job_openings);
  const cand = one(iv.candidates);
  if (!opening || !cand) {
    return NextResponse.json({ error: "Incomplete record" }, { status: 422 });
  }

  try {
    const generated = await withUsage(
      { tenantId, feature: "recruiter:interview" },
      () =>
        generateInterviewQuestions(
          { title: opening.title, jdText: opening.jd_text },
          {
            name: cand.name,
            headline: cand.headline ?? null,
            contentMd: cand.content_md ?? "",
          },
          iv.stage
        )
    );
    const questions = generated.map((q, i) => ({
      id: `q${i + 1}`,
      category: q.category,
      question: q.question,
      why: q.why,
      answer: "",
      score: null,
      notes: "",
    }));
    const { error } = await supabase
      .from("interviews")
      .update({
        questions,
        status: "in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", interviewId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ questions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to generate questions" },
      { status: 500 }
    );
  }
}
