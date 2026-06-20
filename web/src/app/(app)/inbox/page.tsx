import Link from "next/link";
import { getUserAndTenant } from "@/lib/tenant";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { InboxItem, type InboxRow } from "./inbox-item";
import { DismissedJobs } from "./dismissed-jobs";

const SELECT =
  "id, url, state, error, created_at, fit_score, fit_reason, job_postings ( title, company_name, location, first_seen_at )";

type ItemRow = {
  id: string;
  url: string | null;
  state: string;
  error: string | null;
  created_at: string;
  fit_score: number | null;
  fit_reason: string | null;
  job_postings:
    | { title: string; company_name: string; location: string; first_seen_at: string }
    | { title: string; company_name: string; location: string; first_seen_at: string }[]
    | null;
};

function toRow(i: ItemRow): InboxRow {
  const posting = Array.isArray(i.job_postings) ? i.job_postings[0] : i.job_postings;
  return {
    id: i.id,
    title: posting?.title ?? i.url ?? "(unknown)",
    company: posting?.company_name ?? "—",
    location: posting?.location ?? "",
    url: i.url ?? "",
    state: i.state,
    error: i.error,
    fitScore: i.fit_score != null ? Number(i.fit_score) : null,
    fitReason: i.fit_reason,
    firstSeen: posting?.first_seen_at ?? i.created_at,
  };
}

export default async function InboxPage() {
  const { supabase, tenantId } = await getUserAndTenant();

  const [{ data: items }, { data: dismissed }] = await Promise.all([
    supabase
      .from("pipeline_items")
      .select(SELECT)
      .eq("tenant_id", tenantId)
      .in("state", ["pending", "error"])
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("pipeline_items")
      .select(SELECT)
      .eq("tenant_id", tenantId)
      .eq("state", "dismissed")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const rows: InboxRow[] = ((items as ItemRow[]) ?? []).map(toRow);
  const dismissedRows: InboxRow[] = ((dismissed as ItemRow[]) ?? []).map(toRow);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            New postings discovered by the scanner, ranked by{" "}
            <span className="font-medium text-foreground">quick fit</span> — a
            fast AI pre-screen of each posting against your primary CV, for
            prioritizing only. The number can shift once{" "}
            <span className="font-medium text-foreground">Evaluate</span> reads
            the full job description, your profile, and live market data.
            Hover a score to see why it was given.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/scan" />}>
          Scanner settings
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
          Inbox is empty. Run a scan from the{" "}
          <Link href="/scan" className="underline">
            scanner
          </Link>{" "}
          to discover new postings.
        </p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead title="Fast AI pre-screen vs your primary CV — an estimate for ranking, not the full evaluation score">
                  Quick fit
                </TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <InboxItem key={r.id} item={r} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DismissedJobs items={dismissedRows} />
    </div>
  );
}
