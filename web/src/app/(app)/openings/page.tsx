import Link from "next/link";
import { getUserAndTenant } from "@/lib/tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewOpeningForm } from "./new-opening-form";

export default async function OpeningsPage() {
  const { supabase, tenantId } = await getUserAndTenant();
  const [{ data: openings }, { data: fits }] = await Promise.all([
    supabase
      .from("job_openings")
      .select("id, title, location, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_fits")
      .select("opening_id, status")
      .eq("tenant_id", tenantId),
  ]);

  const counts = new Map<string, { total: number; advancing: number }>();
  for (const f of fits ?? []) {
    const c = counts.get(f.opening_id) ?? { total: 0, advancing: 0 };
    c.total++;
    if (["shortlisted", "interview", "offer", "hired"].includes(f.status)) {
      c.advancing++;
    }
    counts.set(f.opening_id, c);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Job openings</h1>
        <p className="text-sm text-muted-foreground">
          Create a role, then bulk-upload CVs and rank candidates by fit.
        </p>
      </div>

      <NewOpeningForm />

      <div className="space-y-2">
        {(openings ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No openings yet — create your first role above.
            </CardContent>
          </Card>
        ) : (
          (openings ?? []).map((o) => {
            const c = counts.get(o.id) ?? { total: 0, advancing: 0 };
            return (
              <Link
                key={o.id}
                href={`/openings/${o.id}`}
                className="block rounded-lg border bg-background p-4 transition-colors hover:border-[hsl(187_74%_32%)]/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{o.title}</span>
                      {o.status === "closed" && (
                        <Badge variant="secondary">Closed</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {o.location || "—"} · created{" "}
                      {new Date(o.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {c.total}
                    </span>{" "}
                    candidates
                    {c.advancing > 0 && <span> · {c.advancing} advancing</span>}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
