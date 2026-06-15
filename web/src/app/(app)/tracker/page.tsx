import Link from "next/link";
import { getUserAndTenant } from "@/lib/tenant";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scoreBadgeVariant } from "@/lib/ui";
import { StatusSelect } from "./status-select";

export default async function TrackerPage() {
  const { supabase, tenantId } = await getUserAndTenant();

  const { data: apps } = await supabase
    .from("applications")
    .select(
      "id, company_name, role, score, status, notes, latest_evaluation_id, created_at, updated_at"
    )
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tracker</h1>
          <p className="text-sm text-muted-foreground">
            One row per company + role. Evaluating the same job again updates
            the existing row.
          </p>
        </div>
        <Button render={<Link href="/evaluate" />}>Evaluate a job</Button>
      </div>

      {!apps?.length ? (
        <p className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
          Nothing tracked yet — evaluate your first job to populate the
          pipeline.
        </p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.company_name}</TableCell>
                  <TableCell>{a.role}</TableCell>
                  <TableCell>
                    {a.score != null ? (
                      <Badge variant={scoreBadgeVariant(Number(a.score))}>
                        {Number(a.score).toFixed(1)}/5
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusSelect applicationId={a.id} status={a.status} />
                  </TableCell>
                  <TableCell>
                    {a.latest_evaluation_id ? (
                      <Link
                        href={`/evaluations/${a.latest_evaluation_id}`}
                        className="text-sm underline"
                      >
                        View
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(a.updated_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
