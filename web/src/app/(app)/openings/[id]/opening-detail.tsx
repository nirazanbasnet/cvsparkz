"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  setCandidateStatus,
  setCandidateStatusBulk,
  setOpeningStatus,
  deleteOpening,
  removeCandidatesBulk,
} from "../actions";

export interface DeepData {
  fitScore: number;
  verdict: string;
  recommendation: string;
  strengths: string[];
  gaps: string[];
  riskFlags: string[];
  interviewFocus: string[];
  scorecard?: { dimension: string; score: number; note: string }[];
}

export interface FitRowData {
  fitId: string;
  candidateId: string;
  name: string;
  email: string | null;
  headline: string | null;
  status: string;
  fitScore: number | null;
  verdict: string | null;
  summary: string | null;
  strengths: string[];
  gaps: string[];
  deep: DeepData | null;
  notes: string;
  scored: boolean;
}

interface OpeningInfo {
  id: string;
  title: string;
  jdText: string;
  location: string | null;
  status: string;
  createdAt: string;
}

const STATUS_OPTIONS = [
  "new",
  "reviewing",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;

const STATUS_CLS: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  reviewing: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  shortlisted: "bg-[hsl(187_40%_92%)] text-[hsl(187_74%_26%)]",
  interview: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  offer: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  hired: "bg-emerald-600 text-white",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

const TIERS = ["Strong", "Good", "Fair", "Low"] as const;

function fitTier(s: number) {
  if (s >= 85) return { label: "Strong", cls: "bg-emerald-600 text-white" };
  if (s >= 70) return { label: "Good", cls: "bg-[hsl(187_74%_32%)] text-white" };
  if (s >= 50) return { label: "Fair", cls: "bg-amber-500 text-white" };
  return { label: "Low", cls: "bg-rose-500 text-white" };
}

function csvCell(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function OpeningDetail({
  opening,
  initialRows,
}: {
  opening: OpeningInfo;
  initialRows: FitRowData[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [uploading, setUploading] = useState(false);
  const [screening, setScreening] = useState(false);
  const [showJd, setShowJd] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // filters + selection
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => setRows(initialRows), [initialRows]);

  const unscored = rows.filter((r) => !r.scored).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (tierFilter !== "all") {
        const tier = r.fitScore != null ? fitTier(r.fitScore).label : null;
        if (tier !== tierFilter) return false;
      }
      if (
        needle &&
        !`${r.name} ${r.headline ?? ""} ${r.email ?? ""}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      return true;
    });
  }, [rows, q, statusFilter, tierFilter]);

  const allShownSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.fitId));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) filtered.forEach((r) => next.delete(r.fitId));
      else filtered.forEach((r) => next.add(r.fitId));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function onFiles(files: FileList) {
    setUploading(true);
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.append("openingId", opening.id);
    Array.from(files).forEach((f) => fd.append("file", f));
    try {
      const res = await fetch("/api/recruiter/candidates", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setMessage(
        `Added ${data.created} candidate${data.created === 1 ? "" : "s"}.` +
          (data.errors?.length ? ` ${data.errors.length} skipped.` : "")
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function screenAll() {
    setScreening(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/recruiter/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingId: opening.id, onlyUnscored: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Screening failed");
      setMessage(`Screened ${data.scored} candidate${data.scored === 1 ? "" : "s"}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screening failed");
    } finally {
      setScreening(false);
    }
  }

  async function changeStatus(fitId: string, status: string) {
    setRows((rs) => rs.map((r) => (r.fitId === fitId ? { ...r, status } : r)));
    await setCandidateStatus(fitId, status);
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} candidate${ids.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    await removeCandidatesBulk(ids);
    setSelected(new Set());
    setBulkBusy(false);
    router.refresh();
  }

  async function bulkStatus(status: string) {
    const ids = [...selected];
    if (ids.length === 0 || !status) return;
    setBulkBusy(true);
    setRows((rs) => rs.map((r) => (selected.has(r.fitId) ? { ...r, status } : r)));
    await setCandidateStatusBulk(ids, status);
    setBulkBusy(false);
  }

  function exportCsv() {
    const header = ["Name", "Email", "Headline", "Fit", "Verdict", "Status", "Summary"];
    const body = filtered.map((r) =>
      [r.name, r.email ?? "", r.headline ?? "", r.fitScore ?? "", r.verdict ?? "", r.status, r.summary ?? ""]
        .map(csvCell)
        .join(",")
    );
    const csv = [header.join(","), ...body].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${opening.title.replace(/[^a-z0-9]+/gi, "-")}-candidates.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleOpen() {
    await setOpeningStatus(opening.id, opening.status === "open" ? "closed" : "open");
    router.refresh();
  }
  async function onDelete() {
    if (!confirm("Delete this opening and all its candidates?")) return;
    await deleteOpening(opening.id);
    router.push("/openings");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{opening.title}</h1>
            {opening.status === "closed" && <Badge variant="secondary">Closed</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {opening.location || "—"} · {rows.length} candidate{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowJd((v) => !v)}>
            {showJd ? "Hide JD" : "View JD"}
          </Button>
          <Button variant="outline" size="sm" onClick={toggleOpen}>
            {opening.status === "open" ? "Close" : "Reopen"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      {showJd && (
        <Card>
          <CardContent className="whitespace-pre-wrap pt-6 text-sm text-foreground/90">
            {opening.jdText}
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.md,.markdown,.txt,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.length && onFiles(e.target.files)}
          />
          <Button disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading && <Loader2 className="size-4 animate-spin" />}
            {uploading ? "Uploading…" : "Upload CVs"}
          </Button>
          <Button variant="outline" disabled={screening || unscored === 0} onClick={screenAll}>
            {screening && <Loader2 className="size-4 animate-spin" />}
            {screening ? "Screening…" : unscored > 0 ? `Screen ${unscored} new` : "All screened"}
          </Button>
          {rows.length > 0 && (
            <Button variant="ghost" onClick={exportCsv}>
              Export CSV
            </Button>
          )}
        </CardContent>
      </Card>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Filters */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, headline, email…"
            className="h-9 w-60"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm capitalize"
          >
            <option value="all">All stages</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="all">All fit tiers</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {filtered.length} of {rows.length}
          </span>
        </div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <select
            defaultValue=""
            disabled={bulkBusy}
            onChange={(e) => {
              if (e.target.value) bulkStatus(e.target.value);
              e.target.value = "";
            }}
            className="h-8 rounded-md border bg-background px-2 text-xs capitalize"
          >
            <option value="">Set stage…</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={bulkDelete}>
            Delete selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No candidates yet — upload CVs to start screening.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead className="w-20">Fit</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const tier = r.fitScore != null ? fitTier(r.fitScore) : null;
                return (
                  <TableRow key={r.fitId} className={selected.has(r.fitId) ? "bg-muted/40" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(r.fitId)}
                        onChange={() => toggleOne(r.fitId)}
                        aria-label={`Select ${r.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      {tier ? (
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${tier.cls}`}>
                          {r.fitScore}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/openings/${opening.id}/${r.fitId}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.headline || r.email || "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <select
                        value={r.status}
                        onChange={(e) => changeStatus(r.fitId, e.target.value)}
                        className={`rounded-md border-0 px-2 py-1 text-xs font-medium capitalize ${STATUS_CLS[r.status] ?? ""}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s} className="bg-background text-foreground">
                            {s}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" render={<Link href={`/openings/${opening.id}/${r.fitId}`} />}>
                        Review →
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
