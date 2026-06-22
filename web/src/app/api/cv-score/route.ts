import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scoreAndStore } from "@/lib/cv/score";
import { withUsage } from "@/lib/llm/usage-context";

export const maxDuration = 120;

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

  let body: { label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.label) {
    return NextResponse.json({ error: "label required" }, { status: 400 });
  }

  try {
    const { cvVersionId, score } = await withUsage(
      { tenantId: membership.tenant_id, feature: "cv_score" },
      () =>
        scoreAndStore({
          supabase,
          tenantId: membership.tenant_id,
          label: body.label!,
        })
    );
    return NextResponse.json({ cv_version_id: cvVersionId, score });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scoring failed" },
      { status: 500 }
    );
  }
}
