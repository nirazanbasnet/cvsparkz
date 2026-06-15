import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTailoredPdf } from "@/lib/pdf/generate";

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

  let body: { evaluation_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.evaluation_id) {
    return NextResponse.json({ error: "evaluation_id required" }, { status: 400 });
  }

  try {
    const { documentId } = await generateTailoredPdf({
      supabase,
      tenantId: membership.tenant_id,
      evaluationId: body.evaluation_id,
    });
    return NextResponse.json({ document_id: documentId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("NO_CV") ? 409 : 500 }
    );
  }
}
