import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeJd } from "@/lib/cv/jd-analyze";
import { fetchJdFromUrl } from "@/lib/eval/fetch-jd";

export const maxDuration = 60;

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

  let body: { cvLabel?: string; cvText?: string; jdText?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let jdText = body.jdText?.trim() ?? "";
  const url = body.url?.trim() || null;

  // No pasted JD but a URL? Fetch it (same path Full evaluation uses).
  if (jdText.length < 50 && url) {
    try {
      jdText = await fetchJdFromUrl(url);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not fetch the URL";
      return NextResponse.json({ error: message }, { status: 422 });
    }
  }

  if (jdText.length < 50) {
    return NextResponse.json(
      { error: "Paste a fuller job description (or a fetchable URL)." },
      { status: 400 }
    );
  }

  // CV comes from a saved CV (by label) or pasted text
  let cvText = body.cvText?.trim() ?? "";
  if (!cvText && body.cvLabel) {
    const { data: cv } = await supabase
      .from("cv_versions")
      .select("content_md")
      .eq("tenant_id", membership.tenant_id)
      .eq("label", body.cvLabel)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    cvText = cv?.content_md ?? "";
  }
  if (cvText.trim().length < 50) {
    return NextResponse.json(
      { error: "Pick a CV or paste your CV text first." },
      { status: 400 }
    );
  }

  try {
    const { analysis, tokensIn, tokensOut } = await analyzeJd({ cvText, jdText });
    await supabase.from("usage_events").insert({
      tenant_id: membership.tenant_id,
      metric: "evaluation",
      quantity: 1,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    });
    return NextResponse.json({ analysis });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
