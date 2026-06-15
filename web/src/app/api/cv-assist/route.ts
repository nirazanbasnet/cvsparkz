import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { improveBullet, suggestBullet, generateSummary } from "@/lib/cv/assist";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    action?: string;
    text?: string;
    role?: string;
    taskHeading?: string;
    existingBullets?: string[];
    experience?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    let text: string;
    if (body.action === "improve") {
      if (!body.text || body.text.trim().length < 5) {
        return NextResponse.json({ error: "Text too short" }, { status: 400 });
      }
      text = await improveBullet(body.text);
    } else if (body.action === "suggest") {
      if (!body.role) {
        return NextResponse.json({ error: "role required" }, { status: 400 });
      }
      text = await suggestBullet({
        role: body.role,
        taskHeading: body.taskHeading,
        existingBullets: body.existingBullets,
      });
    } else if (body.action === "summary") {
      if (!body.experience) {
        return NextResponse.json({ error: "experience required" }, { status: 400 });
      }
      text = await generateSummary(body.experience);
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
