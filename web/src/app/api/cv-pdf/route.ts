import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasStructuredContent, parseStructuredCv } from "@/lib/cv/structured";
import { renderCvPdf } from "@/lib/pdf/pdf-document";
import { structuredToHeader, structuredToTailored } from "@/lib/pdf/from-structured";

export const maxDuration = 60;

function slugify(s: string): string {
  return (
    s.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "cv"
  );
}

/**
 * Download a CV as a PDF, rendered straight from the builder's structured
 * data — no tailoring, no LLM. Requires the CV to have structured content
 * (i.e. it's been opened/built in the builder at least once).
 */
export async function GET(req: NextRequest) {
  const label = req.nextUrl.searchParams.get("label");
  if (!label) {
    return NextResponse.json({ error: "label required" }, { status: 400 });
  }

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

  const [{ data: row }, { data: profile }] = await Promise.all([
    supabase
      .from("cv_versions")
      .select("label, structured")
      .eq("tenant_id", membership.tenant_id)
      .eq("label", label)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("candidate_profiles")
      .select("*")
      .eq("tenant_id", membership.tenant_id)
      .maybeSingle(),
  ]);

  if (!row) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }
  if (!hasStructuredContent(row.structured)) {
    return NextResponse.json(
      { error: "Open this CV in the builder once to enable PDF download." },
      { status: 409 }
    );
  }

  try {
    const cv = parseStructuredCv(row.structured);
    const pdf = await renderCvPdf(
      structuredToHeader(cv, profile),
      structuredToTailored(cv)
    );
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slugify(row.label)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF generation failed" },
      { status: 500 }
    );
  }
}
