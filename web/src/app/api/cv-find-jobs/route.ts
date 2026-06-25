import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeTargetRole } from "@/lib/cv/target-role";
import { runScan } from "@/lib/scan/run";
import { withUsage } from "@/lib/llm/usage-context";

export const maxDuration = 300;

/**
 * "Find matching jobs" — analyze a CV for its best-fit job titles + locations,
 * write them onto the scanner's filters, then run a watchlist scan so fresh
 * matches land in the Inbox. On-demand (button-triggered) to control cost.
 */
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
  const tenantId = membership.tenant_id;

  let body: { label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.label) {
    return NextResponse.json({ error: "label required" }, { status: 400 });
  }

  // Load the CV (latest version) + profile for a location fallback.
  const [{ data: cv }, { data: profile }, { data: existingConfig }, { count: companies }] =
    await Promise.all([
      supabase
        .from("cv_versions")
        .select("id, content_md, structured")
        .eq("tenant_id", tenantId)
        .eq("label", body.label)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("candidate_profiles")
        .select("location_city, location_country")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("scan_configs")
        .select("title_negative, loc_always_allow, loc_block")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("tracked_companies")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("enabled", true),
    ]);

  if (!cv?.content_md || cv.content_md.trim().length < 50) {
    return NextResponse.json(
      { error: "This CV has no content to analyze yet." },
      { status: 400 }
    );
  }

  const basics = (cv.structured as { basics?: { location?: string } } | null)?.basics;
  const candidateLocation =
    basics?.location ||
    [profile?.location_city, profile?.location_country].filter(Boolean).join(", ") ||
    null;

  try {
    const analysis = await withUsage({ tenantId, feature: "cv_assist" }, () =>
      analyzeTargetRole({ cvMarkdown: cv.content_md, candidateLocation })
    );

    // Drive the scanner from the analysis: titles + locations the user wants.
    // Preserve their negative/block lists; titles & allowed locations are set.
    await supabase.from("scan_configs").upsert(
      {
        tenant_id: tenantId,
        title_positive: analysis.titleKeywords,
        title_negative: existingConfig?.title_negative ?? [],
        loc_always_allow: existingConfig?.loc_always_allow ?? [],
        loc_allow: analysis.locations,
        loc_block: existingConfig?.loc_block ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    );

    // Keep the CV's own target role aligned with the analysis.
    if (analysis.primaryRole) {
      await supabase
        .from("cv_versions")
        .update({ primary_role: analysis.primaryRole })
        .eq("id", cv.id);
    }

    // Run the watchlist scan now (if there's anything to scan).
    let scan = null;
    if ((companies ?? 0) > 0) {
      scan = await withUsage({ tenantId, feature: "scan" }, () =>
        runScan({ supabase, tenantId })
      );
    }

    return NextResponse.json({
      analysis,
      scan,
      companies: companies ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to find jobs" },
      { status: 500 }
    );
  }
}
