import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FUNNEL: { key: string; label: string }[] = [
  { key: "new", label: "New" },
  { key: "reviewing", label: "Reviewing" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
];

export async function RecruiterDashboard({
  supabase,
  tenantId,
}: {
  supabase: SupabaseClient;
  tenantId: string;
}) {
  const [{ data: openings }, { data: fits }, { count: candidates }] =
    await Promise.all([
      supabase
        .from("job_openings")
        .select("id, title, status, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      supabase.from("candidate_fits").select("status").eq("tenant_id", tenantId),
      supabase
        .from("candidates")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ]);

  const openCount = (openings ?? []).filter((o) => o.status === "open").length;
  const counts: Record<string, number> = {};
  for (const f of fits ?? []) counts[f.status] = (counts[f.status] ?? 0) + 1;
  const advancing =
    (counts.shortlisted ?? 0) + (counts.interview ?? 0) + (counts.offer ?? 0);

  const stats = [
    { v: openCount, l: "Open roles" },
    { v: candidates ?? 0, l: "Candidates" },
    { v: advancing, l: "Advancing" },
    { v: counts.hired ?? 0, l: "Hired" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hiring dashboard</h1>
        <Button render={<Link href="/openings" />}>Job openings</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.l}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.l}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{s.v}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {FUNNEL.map((f) => (
              <div key={f.key} className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-2xl font-semibold">{counts[f.key] ?? 0}</p>
                <p className="text-xs text-muted-foreground">{f.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent openings</CardTitle>
        </CardHeader>
        <CardContent>
          {(openings ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No openings yet.{" "}
              <Link href="/openings" className="underline">
                Create one
              </Link>{" "}
              to start screening candidates.
            </p>
          ) : (
            <ul className="divide-y">
              {(openings ?? []).slice(0, 6).map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2.5">
                  <Link href={`/openings/${o.id}`} className="font-medium hover:underline">
                    {o.title}
                  </Link>
                  <span className="text-xs text-muted-foreground capitalize">
                    {o.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
