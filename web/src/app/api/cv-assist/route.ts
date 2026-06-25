import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  improveBullet,
  suggestBullet,
  generateSummary,
  groupAccomplishments,
} from "@/lib/cv/assist";
import { withUsage } from "@/lib/llm/usage-context";

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
  const tenantId = membership.tenant_id;

  let body: {
    action?: string;
    text?: string;
    role?: string;
    company?: string;
    taskHeading?: string;
    existingBullets?: string[];
    bullets?: string[];
    experience?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    // Group accomplishments into task/project areas → structured result.
    if (body.action === "group") {
      const bullets = Array.isArray(body.bullets)
        ? body.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
        : [];
      if (bullets.length < 2) {
        return NextResponse.json(
          { error: "Add at least 2 accomplishments to group." },
          { status: 400 }
        );
      }
      const result = await withUsage({ tenantId, feature: "cv_assist" }, () =>
        groupAccomplishments({
          role: body.role ?? "",
          company: body.company,
          bullets,
        })
      );
      return NextResponse.json(result);
    }

    let text: string;
    if (body.action === "improve") {
      if (!body.text || body.text.trim().length < 5) {
        return NextResponse.json({ error: "Text too short" }, { status: 400 });
      }
      text = await withUsage({ tenantId, feature: "cv_assist" }, () =>
        improveBullet(body.text!)
      );
    } else if (body.action === "suggest") {
      if (!body.role) {
        return NextResponse.json({ error: "role required" }, { status: 400 });
      }
      text = await withUsage({ tenantId, feature: "cv_assist" }, () =>
        suggestBullet({
          role: body.role!,
          taskHeading: body.taskHeading,
          existingBullets: body.existingBullets,
        })
      );
    } else if (body.action === "summary") {
      if (!body.experience) {
        return NextResponse.json({ error: "experience required" }, { status: 400 });
      }
      text = await withUsage({ tenantId, feature: "cv_assist" }, () =>
        generateSummary(body.experience)
      );
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Assist failed" },
      { status: 500 }
    );
  }
}
