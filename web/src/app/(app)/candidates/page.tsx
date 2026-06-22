import { getUserAndTenant } from "@/lib/tenant";
import { Card, CardContent } from "@/components/ui/card";

export default async function CandidatesPage() {
  const { supabase, tenantId } = await getUserAndTenant();
  const [{ data: cands }, { data: fits }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, name, email, headline, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("candidate_fits")
      .select("candidate_id, fit_score")
      .eq("tenant_id", tenantId),
  ]);

  const byCand = new Map<string, { openings: number; best: number | null }>();
  for (const f of fits ?? []) {
    const e = byCand.get(f.candidate_id) ?? { openings: 0, best: null };
    e.openings++;
    if (f.fit_score != null) e.best = Math.max(e.best ?? 0, Number(f.fit_score));
    byCand.set(f.candidate_id, e);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Candidates</h1>
        <p className="text-sm text-muted-foreground">
          Everyone you&apos;ve uploaded, across all openings.
        </p>
      </div>

      {(cands ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No candidates yet. Open a role and upload CVs.
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-lg border bg-background">
          {(cands ?? []).map((c) => {
            const m = byCand.get(c.id) ?? { openings: 0, best: null };
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.headline || c.email || "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm text-muted-foreground">
                  {m.best != null && (
                    <>
                      <span className="font-semibold text-foreground">{m.best}</span>{" "}
                      best fit ·{" "}
                    </>
                  )}
                  {m.openings} opening{m.openings === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
