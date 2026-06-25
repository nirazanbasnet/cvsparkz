import { NextRequest, NextResponse } from "next/server";
import { scoreCvMarkdown } from "@/lib/cv/score";
import { detectKind, extractText } from "@/lib/cv/extract";

export const maxDuration = 120;

/**
 * PUBLIC, no-auth CV scoring for the landing-page "try it free" demo.
 * Runs the same gold-standard scoring engine but persists nothing — there is
 * no tenant. Accepts a pasted text body or an uploaded PDF/DOCX/TXT/MD file.
 *
 * Guardrail: inputs are length-capped. (For production, add rate limiting /
 * a captcha here — this is open by design for the local demo.)
 */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 12000;

// Free guest trial: N scores per visitor, tracked in an httpOnly cookie.
// After the cap, the user must sign up (clearing cookies resets it — the
// standard soft-gate tradeoff for a no-login demo).
const GUEST_LIMIT = 2;
const GUEST_COOKIE = "cvsparkz_guest_scores";

export async function POST(req: NextRequest) {
  const used = Number(req.cookies.get(GUEST_COOKIE)?.value ?? "0") || 0;
  if (used >= GUEST_LIMIT) {
    return NextResponse.json(
      {
        error: `You've used your ${GUEST_LIMIT} free scores. Create a free account for unlimited scoring, the AI builder, job scanning, and tracking.`,
        limitReached: true,
      },
      { status: 403 }
    );
  }

  let cvText = "";

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 413 });
      }
      const kind = detectKind(file.name, file.type);
      if (!kind) {
        return NextResponse.json(
          { error: "Unsupported file — use PDF, DOCX, TXT, or paste text." },
          { status: 415 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      cvText = (await extractText(kind, buffer)).trim();
      if (cvText.length < 100) {
        return NextResponse.json(
          { error: "Couldn't read enough text (scanned image?). Try pasting your CV instead." },
          { status: 422 }
        );
      }
    } else {
      const body = (await req.json()) as { text?: string };
      cvText = (body.text ?? "").trim();
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (cvText.length < 100) {
    return NextResponse.json(
      { error: "Paste your full CV (at least a few lines)." },
      { status: 400 }
    );
  }

  const capped = cvText.slice(0, MAX_TEXT_CHARS);
  try {
    const { score } = await scoreCvMarkdown(capped);
    // Only a successful score consumes a credit (validation failures don't).
    const remaining = Math.max(0, GUEST_LIMIT - (used + 1));
    // Return the extracted text so the client can stash it (localStorage) and
    // re-import it into the user's account after they sign up.
    const res = NextResponse.json({ score, remaining, cvText: capped });
    res.cookies.set(GUEST_COOKIE, String(used + 1), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scoring failed" },
      { status: 500 }
    );
  }
}

