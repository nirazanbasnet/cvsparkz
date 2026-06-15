import { redirect } from "next/navigation";
import { getUserAndTenant } from "@/lib/tenant";
import { CvScoreView } from "./cv-score-view";
import type { CvScore } from "@/lib/cv/score-schema";

export default async function CvScorePage({
  searchParams,
}: {
  searchParams: Promise<{ cv?: string }>;
}) {
  const { cv: label } = await searchParams;
  if (!label) redirect("/cv");

  const { supabase, tenantId } = await getUserAndTenant();

  const { data: row } = await supabase
    .from("cv_versions")
    .select("label, score_overall, score_data, scored_at")
    .eq("tenant_id", tenantId)
    .eq("label", label)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) redirect("/cv");

  const initialScore: CvScore | null =
    row.score_overall != null && row.score_data
      ? { score: row.score_overall, ...(row.score_data as Omit<CvScore, "score">) }
      : null;

  return (
    <CvScoreView
      label={row.label}
      initialScore={initialScore}
      scoredAt={row.scored_at}
    />
  );
}
