import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runScan } from "@/lib/scan/run";
import { withUsage } from "@/lib/llm/usage-context";

export const maxDuration = 300;

export async function POST() {
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

  try {
    const summary = await withUsage(
      { tenantId: membership.tenant_id, feature: "scan" },
      () => runScan({ supabase, tenantId: membership.tenant_id })
    );
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed" },
      { status: 500 }
    );
  }
}
