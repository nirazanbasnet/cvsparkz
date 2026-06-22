import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { chatJSON } from "@/lib/llm/gateway";
import { withUsage } from "@/lib/llm/usage-context";
import { detectKind, extractText } from "@/lib/cv/extract";

export const maxDuration = 120;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 9000;

const importResultSchema = z.object({
  markdown: z.string().min(100),
  role: z.string().nullish(),
});

const IMPORT_SYSTEM_PROMPT = `You convert raw CV/resume text (extracted from a PDF or Word file, possibly with broken line breaks and layout noise) into clean, well-structured markdown.

Rules:
- PRESERVE every fact verbatim: names, employers, dates, titles, metrics, skills, links. NEVER invent, embellish, or drop content.
- Standard section structure: # Name, then ## Summary, ## Experience (### {Role} — {Company} ({period}) with bullet lists), ## Projects, ## Education, ## Certifications, ## Skills. Omit sections the CV doesn't have.
- Fix extraction artifacts: re-join broken lines, drop page numbers/headers, normalize bullets to "-".
- Keep the original language of the CV.
- "role": the candidate's current or most recent job title (e.g. "Senior Backend Engineer"), null if unclear.

Return ONLY JSON: {"markdown": "the full CV as markdown", "role": "current role title or null"}`;

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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
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
      { error: "Unsupported file type — use PDF, DOCX, MD, or TXT" },
      { status: 415 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const raw = (await extractText(kind, buffer)).trim();
    if (raw.length < 200) {
      return NextResponse.json(
        { error: "Could not extract enough text from the file (is it a scanned image?)" },
        { status: 422 }
      );
    }

    // Markdown files are already the target format — no LLM pass needed.
    if (kind === "md") {
      return NextResponse.json({ markdown: raw, role: null });
    }

    const { data } = await withUsage(
      { tenantId: membership.tenant_id, feature: "cv_import" },
      () =>
        chatJSON(
          {
            system: IMPORT_SYSTEM_PROMPT,
            user: `Raw extracted CV text:\n\n${raw.slice(0, MAX_TEXT_CHARS)}`,
          },
          (rawJson) => {
            const result = importResultSchema.safeParse(rawJson);
            if (!result.success) throw new Error("missing markdown field");
            return result.data;
          }
        )
    );

    return NextResponse.json({ markdown: data.markdown, role: data.role ?? null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 500 }
    );
  }
}
