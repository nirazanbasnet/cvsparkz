import { NextRequest, NextResponse } from "next/server";
import { getUserAndTenant } from "@/lib/tenant";
import { parseCandidateFile } from "@/lib/recruiter/parse-candidate";

export const maxDuration = 300;

const MAX_FILES = 40;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { supabase, tenantId } = await getUserAndTenant();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const openingId = form.get("openingId");
  if (typeof openingId !== "string") {
    return NextResponse.json({ error: "openingId required" }, { status: 400 });
  }
  const { data: opening } = await supabase
    .from("job_openings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", openingId)
    .maybeSingle();
  if (!opening) {
    return NextResponse.json({ error: "Opening not found" }, { status: 404 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files (max ${MAX_FILES})` }, { status: 413 });
  }

  let created = 0;
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: too large (max 8 MB)`);
      continue;
    }
    const parsed = await parseCandidateFile({
      name: file.name,
      type: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    if ("error" in parsed) {
      errors.push(`${file.name}: ${parsed.error}`);
      continue;
    }
    const { data: cand, error: cErr } = await supabase
      .from("candidates")
      .insert({
        tenant_id: tenantId,
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        headline: parsed.headline,
        content_md: parsed.contentMd,
        source_filename: file.name,
      })
      .select("id")
      .single();
    if (cErr || !cand) {
      errors.push(`${file.name}: ${cErr?.message ?? "save failed"}`);
      continue;
    }
    const { error: fErr } = await supabase.from("candidate_fits").insert({
      tenant_id: tenantId,
      opening_id: openingId,
      candidate_id: cand.id,
      status: "new",
    });
    if (fErr) {
      errors.push(`${file.name}: ${fErr.message}`);
      continue;
    }
    created++;
  }

  return NextResponse.json({ created, errors });
}
