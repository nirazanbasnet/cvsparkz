import { redirect } from "next/navigation";
import { getUserAndTenant } from "@/lib/tenant";
import { hasStructuredContent, parseStructuredCv } from "@/lib/cv/structured";
import { BuilderClient } from "./builder-client";

export default async function CvBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ cv?: string }>;
}) {
  const { cv: label } = await searchParams;
  if (!label) redirect("/cv");

  const { supabase, tenantId } = await getUserAndTenant();

  const { data: row } = await supabase
    .from("cv_versions")
    .select("label, primary_role, structured, content_md")
    .eq("tenant_id", tenantId)
    .eq("label", label)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) redirect("/cv");

  const structured = hasStructuredContent(row.structured)
    ? parseStructuredCv(row.structured)
    : null;

  return (
    <BuilderClient
      label={row.label}
      primaryRole={row.primary_role ?? ""}
      initialStructured={structured}
      canExtract={Boolean(row.content_md && row.content_md.trim().length > 50)}
    />
  );
}
