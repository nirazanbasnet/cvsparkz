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
  inInbox: number;
  handled: number;
  roleFilter: { role: string; keywords: string[] } | null;
  pruned: number;
  scored: number;
  errors: Array<{ company: string; error: string }>;
}

/** One keyword textarea with a colored include/exclude dot, live keyword
 *  count, and a one-line explanation of what it does. */
function FilterField({
  label,
  description,
  value,
  onChange,
  placeholder,
  tone,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  tone: "include" | "exclude";
}) {
  const count = value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean).length;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full ${
              tone === "include" ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          {label}
        </Label>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {count} {count === 1 ? "keyword" : "keywords"}
        </span>
      </div>
      <Textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm"
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
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
  const [filtersSaved, setFiltersSaved] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  function updateForm(key: keyof ScanConfigForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setFiltersSaved(false);
  }

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
              <b>{summary.fetched}</b> postings. <b>{summary.matched}</b> matched
              your filters → <b>{summary.inInbox}</b> in your inbox
              {summary.added > 0 && (
                <>
                  {" "}
                  (<b>{summary.added}</b> new)
                </>
              )}
              {summary.handled > 0 && (
                <>
                  , <b>{summary.handled}</b> already handled (evaluated or
                  dismissed, kept out)
                </>
              )}
              .
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
              View Inbox{summary.inInbox > 0 ? ` (${summary.inInbox})` : ""} →
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
            Decide which scanned jobs reach your Inbox. One keyword per line,
            case-insensitive, matched anywhere in the text.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ── Job title ────────────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Job title</h3>
              <p className="text-xs text-muted-foreground">
                A title is kept when it contains at least one{" "}
                <span className="font-medium text-emerald-600">match</span>{" "}
                keyword (if any are set) and none of the{" "}
                <span className="font-medium text-rose-600">exclude</span>{" "}
                keywords.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FilterField
                label="Match (include)"
                tone="include"
                value={form.title_positive}
                onChange={(v) => updateForm("title_positive", v)}
                placeholder={"AI\nML Engineer\nBackend"}
                description="Keep only titles containing one of these. Leave empty to fall back to your primary CV's target role."
              />
              <FilterField
                label="Exclude"
                tone="exclude"
                value={form.title_negative}
                onChange={(v) => updateForm("title_negative", v)}
                placeholder={"Intern\nStaff Attorney\nSales"}
                description="Drop any title containing one of these — applied even when Match is empty."
              />
            </div>
          </section>

          <div className="border-t" />

          {/* ── Location ─────────────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Location</h3>
              <p className="text-xs text-muted-foreground">
                Precedence: <b>Always-allow</b> wins → otherwise it must match{" "}
                <b>Allow</b> (when set) → <b>Block</b> removes the rest.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <FilterField
                label="Always allow"
                tone="include"
                value={form.loc_always_allow}
                onChange={(v) => updateForm("loc_always_allow", v)}
                placeholder={"United States"}
                description="Always keep these locations, even if Block would remove them (e.g. your home country)."
              />
              <FilterField
                label="Allow"
                tone="include"
                value={form.loc_allow}
                onChange={(v) => updateForm("loc_allow", v)}
                placeholder={"Remote\nUnited States"}
                description="If set, keep only jobs matching these. Leave empty to allow everything except Block."
              />
              <FilterField
                label="Block"
                tone="exclude"
                value={form.loc_block}
                onChange={(v) => updateForm("loc_block", v)}
                placeholder={"India\nLondon"}
                description="Remove jobs in these locations (unless Always-allow matches)."
              />
            </div>
          </section>

          <div className="flex items-center gap-3">
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await saveScanConfig(form);
                  if (!res?.error) setFiltersSaved(true);
                  return res;
                })
              }
            >
              {pending ? "Saving…" : "Save filters"}
            </Button>
            {filtersSaved && (
              <p className="text-sm text-emerald-600">Filters saved.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
