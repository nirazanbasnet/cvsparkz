"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { getUserAndTenant } from "@/lib/tenant";
import {
  parseStructuredCv,
  structuredToMarkdown,
  type StructuredCv,
} from "@/lib/cv/structured";

export interface SaveCvInput {
  contentMd: string;
  label: string;
  primaryRole: string;
  /** Set when this save follows a fresh file import, so the original upload
   *  (PDF/DOCX) is linked to the new version. Omit to carry forward whatever
   *  the previous version of this label had. */
  original?: { objectKey: string; filename: string; mime: string } | null;
}

export async function saveCv(
  input: SaveCvInput
): Promise<{ version?: number; error?: string }> {
  const trimmed = input.contentMd.trim();
  const label = input.label.trim() || "Main CV";
  const primaryRole = input.primaryRole.trim() || null;
  if (trimmed.length < 50) {
    return { error: "CV looks too short — paste your full CV in markdown." };
  }

  const { supabase, tenantId } = await getUserAndTenant();
  const contentHash = createHash("sha256").update(trimmed).digest("hex");

  const [{ data: latest }, { data: sameLabel }] = await Promise.all([
    supabase
      .from("cv_versions")
      .select("version")
      .eq("tenant_id", tenantId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cv_versions")
      .select(
        "id, version, content_hash, primary_role, is_current, original_object_key, original_filename, original_mime"
      )
      .eq("tenant_id", tenantId)
      .eq("label", label)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    sameLabel?.content_hash === contentHash &&
    sameLabel?.primary_role === primaryRole
  ) {
    return { version: sameLabel.version };
  }

  // Link a fresh upload, or carry forward the previous version's original file.
  const originalKey = input.original?.objectKey ?? sameLabel?.original_object_key ?? null;
  const originalName = input.original?.filename ?? sameLabel?.original_filename ?? null;
  const originalMime = input.original?.mime ?? sameLabel?.original_mime ?? null;

  // New row stays primary if this CV (label) was primary, or if it's the
  // tenant's first CV ever.
  const { count: totalCvs } = await supabase
    .from("cv_versions")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const makePrimary = sameLabel ? sameLabel.is_current : (totalCvs ?? 0) === 0;

  if (makePrimary) {
    await supabase
      .from("cv_versions")
      .update({ is_current: false })
      .eq("tenant_id", tenantId)
      .eq("is_current", true);
  } else if (sameLabel?.is_current) {
    await supabase
      .from("cv_versions")
      .update({ is_current: false })
      .eq("id", sameLabel.id);
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const { error } = await supabase.from("cv_versions").insert({
    tenant_id: tenantId,
    version: nextVersion,
    label,
    primary_role: primaryRole,
    content_md: trimmed,
    content_hash: contentHash,
    is_current: makePrimary,
    original_object_key: originalKey,
    original_filename: originalName,
    original_mime: originalMime,
  });
  if (error) return { error: `Failed to save CV: ${error.message}` };

  revalidatePath("/cv");
  revalidatePath("/dashboard");
  return { version: nextVersion };
}

/**
 * Save from the visual builder: structured JSON is the source of truth, and
 * the canonical markdown is derived so evaluation/scan/PDF keep working. Like
 * saveCv, a content change creates a new immutable version (keeping primary).
 */
export async function saveStructuredCv(input: {
  label: string;
  primaryRole: string;
  structured: StructuredCv;
}): Promise<{ version?: number; error?: string }> {
  const label = input.label.trim() || "Main CV";
  const primaryRole = input.primaryRole.trim() || null;

  let structured: StructuredCv;
  try {
    structured = parseStructuredCv(input.structured);
  } catch {
    return { error: "CV data is malformed." };
  }
  const contentMd = structuredToMarkdown(structured);
  if (contentMd.trim().length < 30) {
    return { error: "Add at least a name and some experience before saving." };
  }

  const { supabase, tenantId } = await getUserAndTenant();
  const contentHash = createHash("sha256")
    .update(JSON.stringify(structured))
    .digest("hex");

  const [{ data: latest }, { data: sameLabel }] = await Promise.all([
    supabase
      .from("cv_versions")
      .select("version")
      .eq("tenant_id", tenantId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cv_versions")
      .select(
        "id, version, content_hash, is_current, original_object_key, original_filename, original_mime"
      )
      .eq("tenant_id", tenantId)
      .eq("label", label)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (sameLabel?.content_hash === contentHash) {
    return { version: sameLabel.version };
  }

  const { count: totalCvs } = await supabase
    .from("cv_versions")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const makePrimary = sameLabel ? sameLabel.is_current : (totalCvs ?? 0) === 0;

  if (makePrimary) {
    await supabase
      .from("cv_versions")
      .update({ is_current: false })
      .eq("tenant_id", tenantId)
      .eq("is_current", true);
  } else if (sameLabel?.is_current) {
    await supabase
      .from("cv_versions")
      .update({ is_current: false })
      .eq("id", sameLabel.id);
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const { error } = await supabase.from("cv_versions").insert({
    tenant_id: tenantId,
    version: nextVersion,
    label,
    primary_role: primaryRole,
    content_md: contentMd,
    structured,
    content_hash: contentHash,
    is_current: makePrimary,
    // keep the original uploaded file linked across builder edits
    original_object_key: sameLabel?.original_object_key ?? null,
    original_filename: sameLabel?.original_filename ?? null,
    original_mime: sameLabel?.original_mime ?? null,
    // editing invalidates any prior score for this CV
    score_overall: null,
    score_data: null,
    scored_at: null,
  });
  if (error) return { error: `Failed to save CV: ${error.message}` };

  revalidatePath("/cv");
  revalidatePath("/dashboard");
  return { version: nextVersion };
}

/**
 * Delete a CV (all versions sharing this label). Past evaluations and
 * generated PDFs are kept — their cv_version link is just nulled (the FK is
 * NO ACTION, so we unlink before deleting). If the deleted CV was primary
 * and others remain, the most recently updated one becomes primary.
 */
export async function deleteCv(label: string): Promise<{ error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();

  const { data: versions } = await supabase
    .from("cv_versions")
    .select("id, is_current")
    .eq("tenant_id", tenantId)
    .eq("label", label);

  if (!versions?.length) return { error: `No CV named "${label}" found.` };

  const versionIds = versions.map((v) => v.id);
  const wasPrimary = versions.some((v) => v.is_current);

  // Unlink dependents (FK is NO ACTION → delete would otherwise fail)
  await Promise.all([
    supabase
      .from("evaluations")
      .update({ cv_version_id: null })
      .eq("tenant_id", tenantId)
      .in("cv_version_id", versionIds),
    supabase
      .from("generated_documents")
      .update({ cv_version_id: null })
      .eq("tenant_id", tenantId)
      .in("cv_version_id", versionIds),
  ]);

  const { error } = await supabase
    .from("cv_versions")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", versionIds);
  if (error) return { error: `Failed to delete CV: ${error.message}` };

  // Promote a replacement primary if we just removed the primary CV
  if (wasPrimary) {
    const { data: next } = await supabase
      .from("cv_versions")
      .select("id")
      .eq("tenant_id", tenantId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabase
        .from("cv_versions")
        .update({ is_current: true })
        .eq("id", next.id);
    }
  }

  revalidatePath("/cv");
  revalidatePath("/dashboard");
  return {};
}

/** Make the latest version of the given CV (label) the primary one —
 *  used by evaluations, PDF tailoring, and scan role-filtering. */
export async function setPrimaryCv(label: string): Promise<{ error?: string }> {
  const { supabase, tenantId } = await getUserAndTenant();

  const { data: target } = await supabase
    .from("cv_versions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("label", label)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!target) return { error: `No CV named "${label}" found.` };

  await supabase
    .from("cv_versions")
    .update({ is_current: false })
    .eq("tenant_id", tenantId)
    .eq("is_current", true);
  const { error } = await supabase
    .from("cv_versions")
    .update({ is_current: true })
    .eq("id", target.id);
  if (error) return { error: error.message };

  revalidatePath("/cv");
  revalidatePath("/dashboard");
  return {};
}
