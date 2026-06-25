import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mint a short-lived signed URL for a CV's originally-uploaded file (the
 * PDF/DOCX kept at import time). The user client read is RLS-scoped to the
 * caller's tenant; the signed URL is minted with the service role (the
 * `documents` bucket is private and has no storage RLS).
 *
 * Inline by default (no `download` option) so a PDF renders in an <iframe>;
 * pass ?download=1 to force a file download (used for DOCX).
 */
export async function GET(req: NextRequest) {
  const label = req.nextUrl.searchParams.get("label");
  const forceDownload = req.nextUrl.searchParams.get("download") === "1";
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

  const { data: cv } = await supabase
    .from("cv_versions")
    .select("original_object_key, original_filename, original_mime")
    .eq("tenant_id", membership.tenant_id)
    .eq("label", label)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cv?.original_object_key) {
    return NextResponse.json(
      { error: "No original file on record for this CV" },
      { status: 404 }
    );
  }

  const { data: signed, error } = await createAdminClient()
    .storage.from("documents")
    .createSignedUrl(
      cv.original_object_key,
      300,
      forceDownload ? { download: cv.original_filename ?? "cv" } : undefined
    );
  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Could not sign URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    filename: cv.original_filename ?? "cv",
    mime: cv.original_mime ?? "application/octet-stream",
  });
}
