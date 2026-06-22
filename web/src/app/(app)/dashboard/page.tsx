import Link from "next/link";
import { getUserAndTenant } from "@/lib/tenant";
import { getAccountType } from "@/lib/account";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scoreBadgeVariant } from "@/lib/ui";
import { RecruiterDashboard } from "./recruiter-dashboard";

export default async function DashboardPage() {
  const { supabase, tenantId } = await getUserAndTenant();

  if ((await getAccountType(supabase, tenantId)) === "recruiter") {
    return <RecruiterDashboard supabase={supabase} tenantId={tenantId} />;
  }

  const [{ data: apps }, { data: recentEvals }, { data: cv }] =
    await Promise.all([
      supabase
        .from("applications")
        .select("status")
        .eq("tenant_id", tenantId),
      supabase
        .from("evaluations")
        .select("id, company_name, role, score, final_decision, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("cv_versions")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_current", true)
        .maybeSingle(),
    ]);

  const counts: Record<string, number> = {};
  for (const a of apps ?? []) {
    counts[a.status] = (counts[a.status] ?? 0) + 1;
  }
  const total = apps?.length ?? 0;

  const funnel = [
    { key: "evaluated", label: "Evaluated" },
    { key: "applied", label: "Applied" },
    { key: "interview", label: "Interview" },
    { key: "offer", label: "Offer" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button render={<Link href="/evaluate" />}>Evaluate a job</Button>
      </div>

      {!cv && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="pt-6 text-sm">
            <span className="font-medium">Setup needed:</span> add your CV
            before evaluating jobs.{" "}
            <Link href="/cv" className="underline">
              Add CV →
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{total}</CardContent>
        </Card>
        {funnel.map((f) => (
          <Card key={f.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {f.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {counts[f.key] ?? 0}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent evaluations</CardTitle>
        </CardHeader>
        <CardContent>
          {!recentEvals?.length ? (
            <p className="text-sm text-muted-foreground">
              No evaluations yet. Paste a job description to get your first A–G
              report.
            </p>
          ) : (
            <ul className="divide-y">
              {recentEvals.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/evaluations/${e.id}`}
                      className="font-medium hover:underline"
                    >
                      {e.company_name} — {e.role}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={scoreBadgeVariant(Number(e.score))}>
                    {Number(e.score).toFixed(1)}/5
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
