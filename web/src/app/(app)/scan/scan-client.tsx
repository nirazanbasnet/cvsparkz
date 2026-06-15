"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addCompany,
  removeCompany,
  toggleCompany,
  saveScanConfig,
  seedDefaultCompanies,
} from "./actions";

interface Company {
  id: string;
  display_name: string;
  provider: string;
  careers_url: string;
  enabled: boolean;
}

interface ScanConfigForm {
  title_positive: string;
  title_negative: string;
  loc_always_allow: string;
  loc_allow: string;
  loc_block: string;
}

interface ScanSummary {
  companies: number;
  fetched: number;
  matched: number;
  added: number;
  alreadySeen: number;
  roleFilter: { role: string; keywords: string[] } | null;
  pruned: number;
  scored: number;
  errors: Array<{ company: string; error: string }>;
}

export function ScanClient({
  companies,
  config,
}: {
  companies: Company[];
  config: ScanConfigForm;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(config);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  async function scanNow() {
    setScanning(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setSummary(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function run(action: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (res?.error) setError(res.error);
      } catch {
        setError("Something went wrong — try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Job scanner</h1>
          <p className="text-sm text-muted-foreground">
            Add the companies you care about and career-ops watches their
            careers pages for openings that match you. New matches land in
            your Inbox.
          </p>
        </div>
        <Button onClick={scanNow} disabled={scanning || companies.length === 0}>
          {scanning ? "Scanning…" : "Scan now"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {summary && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6 text-sm">
            <div className="min-w-0">
              Scanned <b>{summary.companies}</b> companies · fetched{" "}
              <b>{summary.fetched}</b> postings · <b>{summary.matched}</b>{" "}
              matched filters · <b>{summary.added}</b> new added to inbox ·{" "}
              <b>{summary.alreadySeen}</b> already seen
              {summary.pruned > 0 && (
                <>
                  {" · "}
                  <b>{summary.pruned}</b> stale inbox items removed (didn&apos;t
                  match current filters)
                </>
              )}
              {summary.scored > 0 && (
                <>
                  {" · "}
                  <b>{summary.scored}</b> quick-scored against your CV
                </>
              )}
              {summary.roleFilter && (
                <p className="mt-1 text-muted-foreground">
                  Matched against your primary CV&apos;s role{" "}
                  <b>{summary.roleFilter.role}</b> (keywords:{" "}
                  {summary.roleFilter.keywords.join(", ")}). Set explicit title
                  filters below to override.
                </p>
              )}
              {summary.errors.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-destructive">
                  {summary.errors.map((e) => (
                    <li key={e.company}>
                      {e.company}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button render={<Link href="/inbox" />}>
              View Inbox{summary.added > 0 ? ` (${summary.added} new)` : ""} →
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tracked companies ({companies.length})</CardTitle>
          <CardDescription>
            Paste any careers URL — ATS boards are auto-detected; everything
            else is scanned as a custom page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="cname">Company</Label>
              <Input
                id="cname"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Anthropic"
                className="w-44"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="curl">Careers / board URL</Label>
              <Input
                id="curl"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://job-boards.greenhouse.io/anthropic"
              />
            </div>
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await addCompany(newName, newUrl);
                  if (!res?.error) {
                    setNewName("");
                    setNewUrl("");
                  }
                  return res;
                })
              }
            >
              Add
            </Button>
            {companies.length === 0 && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(() => seedDefaultCompanies())}
              >
                Seed 16 AI companies
              </Button>
            )}
          </div>

          {companies.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Board</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id} className={c.enabled ? "" : "opacity-50"}>
                    <TableCell className="font-medium">{c.display_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.provider}</Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                      <a href={c.careers_url} target="_blank" rel="noreferrer" className="hover:underline">
                        {c.careers_url}
                      </a>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => toggleCompany(c.id, !c.enabled))}
                      >
                        {c.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => removeCompany(c.id))}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            One keyword per line, case-insensitive substring match. A title
            needs ≥1 positive (if any set) and 0 negatives. Leave positives
            empty to match against your primary CV&apos;s target role instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Title — positive</Label>
              <Textarea
                rows={5}
                value={form.title_positive}
                onChange={(e) => setForm({ ...form, title_positive: e.target.value })}
                placeholder={"AI\nML Engineer\nBackend"}
              />
            </div>
            <div className="space-y-1">
              <Label>Title — negative</Label>
              <Textarea
                rows={5}
                value={form.title_negative}
                onChange={(e) => setForm({ ...form, title_negative: e.target.value })}
                placeholder={"Intern\nStaff Attorney\nSales"}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Location — always allow</Label>
              <Textarea
                rows={4}
                value={form.loc_always_allow}
                onChange={(e) => setForm({ ...form, loc_always_allow: e.target.value })}
                placeholder={"United States"}
              />
            </div>
            <div className="space-y-1">
              <Label>Location — allow</Label>
              <Textarea
                rows={4}
                value={form.loc_allow}
                onChange={(e) => setForm({ ...form, loc_allow: e.target.value })}
                placeholder={"Remote\nUnited States"}
              />
            </div>
            <div className="space-y-1">
              <Label>Location — block</Label>
              <Textarea
                rows={4}
                value={form.loc_block}
                onChange={(e) => setForm({ ...form, loc_block: e.target.value })}
                placeholder={"India\nLondon"}
              />
            </div>
          </div>
          <Button disabled={pending} onClick={() => run(() => saveScanConfig(form))}>
            Save filters
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
