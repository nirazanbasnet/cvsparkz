import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractStructured } from "@/lib/cv/extract-structured";
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

  const { data: cv } = await supabase
    .from("cv_versions")
    .select("content_md")
    .eq("tenant_id", membership.tenant_id)
    .eq("label", body.label)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cv?.content_md) {
    return NextResponse.json({ error: "CV not found or empty" }, { status: 404 });
  }

  try {
    const structured = await withUsage(
      { tenantId: membership.tenant_id, feature: "cv_extract" },
      () => extractStructured(cv.content_md)
    );
    return NextResponse.json({ structured });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
