import { getUserAndTenant } from "@/lib/tenant";
import { EvaluateClient, type CvOption } from "./evaluate-client";

export default async function EvaluatePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  const { supabase, tenantId } = await getUserAndTenant();

  const { data: rows } = await supabase
    .from("cv_versions")
    .select("label, is_current, version")
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false });

  const seen = new Set<string>();
  const cvs: CvOption[] = [];
  for (const r of rows ?? []) {
    if (seen.has(r.label)) continue;
    seen.add(r.label);
    cvs.push({ label: r.label, isPrimary: r.is_current });
  }
  cvs.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  return <EvaluateClient cvs={cvs} initialUrl={url ?? ""} />;
}
