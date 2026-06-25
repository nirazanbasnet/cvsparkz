import { getUserAndTenant } from "@/lib/tenant";
import { hasStructuredContent } from "@/lib/cv/structured";
import { CvWorkspace, type CvSummary } from "./cv-workspace";

export default async function CvPage({
  searchParams,
}: {
  searchParams: Promise<{ cv?: string }>;
}) {
  const { cv: selectedParam } = await searchParams;
  const { supabase, tenantId } = await getUserAndTenant();

  const { data: rows } = await supabase
    .from("cv_versions")
    .select(
      "label, primary_role, version, content_md, structured, is_current, created_at, score_overall, original_filename, original_mime"
    )
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false });

  // Latest row per label = one entry per CV
  const byLabel = new Map<string, NonNullable<typeof rows>[number]>();
  for (const row of rows ?? []) {
    if (!byLabel.has(row.label)) byLabel.set(row.label, row);
  }
  const cvs: CvSummary[] = [...byLabel.values()].map((r) => ({
    label: r.label,
    primaryRole: r.primary_role,
    version: r.version,
    contentMd: r.content_md,
    isPrimary: r.is_current,
    updatedAt: r.created_at,
    scoreOverall: r.score_overall ?? null,
    originalFilename: r.original_filename ?? null,
    originalMime: r.original_mime ?? null,
    hasStructured: hasStructuredContent(r.structured),
  }));

  // "__new__" = explicit New CV view; otherwise resolve to the named CV,
  // falling back to the primary (or first) CV.
  const selectedLabel =
    selectedParam === "__new__"
      ? "__new__"
      : (cvs.find((c) => c.label === selectedParam) ??
          cvs.find((c) => c.isPrimary) ??
          cvs[0])?.label ?? null;

  return <CvWorkspace cvs={cvs} selectedLabel={selectedLabel} />;
}
