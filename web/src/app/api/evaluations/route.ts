import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runEvaluation } from "@/lib/eval/run";
import { fetchJdFromUrl } from "@/lib/eval/fetch-jd";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  let body: {
    jd_text?: string;
    url?: string;
    pipeline_item_id?: string;
    cv_label?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tenantId = membership.tenant_id;
  let jdText = body.jd_text?.trim() ?? "";
  let url = body.url?.trim() || null;
  let postingId: string | null = null;
  const pipelineItemId = body.pipeline_item_id ?? null;
  const cvLabel = body.cv_label?.trim() || null;

  // Evaluating from the inbox: resolve URL/posting from the pipeline item.
  let companyHint: string | null = null;
  let roleHint: string | null = null;
  if (pipelineItemId) {
    const { data: item } = await supabase
      .from("pipeline_items")
      .select(
        "id, url, posting_id, raw_jd_text, job_postings ( title, company_name, jd_text )"
      )
      .eq("tenant_id", tenantId)
      .eq("id", pipelineItemId)
      .maybeSingle();
    if (!item) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }
    url = url ?? item.url;
    postingId = item.posting_id;
    if (!jdText && item.raw_jd_text) jdText = item.raw_jd_text;
    const posting = Array.isArray(item.job_postings)
      ? item.job_postings[0]
      : item.job_postings;
    // JD captured at scan time → no refetch, identical input to the quick score
    if (!jdText && posting?.jd_text) jdText = posting.jd_text;
    companyHint = posting?.company_name ?? null;
    roleHint = posting?.title ?? null;
    await supabase
      .from("pipeline_items")
      .update({ state: "processing" })
      .eq("id", item.id);
  }

  if (!jdText && !url) {
    return NextResponse.json(
      { error: "Provide jd_text or url" },
      { status: 400 }
    );
  }

  try {
    if (!jdText && url) {
      jdText = await fetchJdFromUrl(url);
    }

    const { evaluationId } = await runEvaluation({
      supabase,
      tenantId,
      jdText,
      url,
      postingId,
      companyHint,
      roleHint,
      cvLabel,
    });

    if (pipelineItemId) {
      await supabase
        .from("pipeline_items")
        .update({ state: "processed", processed_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", pipelineItemId);
    }

    return NextResponse.json({ evaluation_id: evaluationId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Evaluation failed";
    if (pipelineItemId) {
      await supabase
        .from("pipeline_items")
        .update({ state: "error", error: message.slice(0, 1000) })
        .eq("tenant_id", tenantId)
        .eq("id", pipelineItemId);
    }
    const status = message.startsWith("NO_CV")
      ? 409
      : message.startsWith("FETCH_FAILED")
        ? 422
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
