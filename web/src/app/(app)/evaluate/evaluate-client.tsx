"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import type { JdAnalysis } from "@/lib/cv/jd-analyze";

export interface CvOption {
  label: string;
  isPrimary: boolean;
}

const VERDICT_STYLES: Record<string, string> = {
  "Strong Apply": "bg-emerald-600 text-white",
  Apply: "bg-[hsl(187_74%_32%)] text-white",
  Stretch: "bg-amber-500 text-white",
  "Do Not Apply": "bg-red-600 text-white",
};

const IMPORTANCE_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  High: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Medium: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  Low: "bg-muted text-muted-foreground",
};

function MatchRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value / 100));
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 112 112" className="size-28 -rotate-90">
        <defs>
          <linearGradient id="jd-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(187 74% 38%)" />
            <stop offset="100%" stopColor="hsl(270 70% 50%)" />
          </linearGradient>
        </defs>
        <circle cx="56" cy="56" r={r} fill="none" stroke="hsl(220 14% 92%)" strokeWidth="8" />
        <circle cx="56" cy="56" r={r} fill="none" stroke="url(#jd-grad)" strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-2xl font-bold leading-none">{Math.round(value)}%</span>
        <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">match</span>
      </div>
    </div>
  );
}

export function EvaluateClient({
  cvs,
  initialUrl = "",
}: {
  cvs: CvOption[];
  initialUrl?: string;
}) {
  const router = useRouter();
  const [cvLabel, setCvLabel] = useState<string>(cvs[0]?.label ?? "");
  const [url, setUrl] = useState(initialUrl);
  const [jdText, setJdText] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [fullLoading, setFullLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quick, setQuick] = useState<JdAnalysis | null>(null);

  const hasInput = jdText.trim().length > 0 || url.trim().length > 0;
  const busy = quickLoading || fullLoading;

  async function runQuick() {
    if (!hasInput) {
      setError("Paste a job description (or a URL).");
      return;
    }
    setQuickLoading(true);
    setError(null);
    setQuick(null);
    try {
      const res = await fetch("/api/jd-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvLabel,
          jdText: jdText.trim() || undefined,
          url: url.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quick check failed");
      setQuick(data.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quick check failed");
    } finally {
      setQuickLoading(false);
    }
  }

  async function runFull() {
    if (!hasInput) {
      setError("Paste a job description (or a URL).");
      return;
    }
    setFullLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv_label: cvLabel || undefined,
          jd_text: jdText.trim() || undefined,
          url: url.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Evaluation failed");
      router.push(`/evaluations/${data.evaluation_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
      setFullLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Evaluate a job</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Quick check</span> for a
          fast match read, or a{" "}
          <span className="font-medium text-foreground">full A–G evaluation</span>{" "}
          with live market research that saves to your tracker.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          {/* CV picker */}
          {cvs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No CVs yet —{" "}
              <Link href="/cv" className="underline">
                add a CV
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Evaluate against</Label>
              <div className="flex flex-wrap gap-2">
                {cvs.map((cv) => (
                  <button
                    key={cv.label}
                    onClick={() => setCvLabel(cv.label)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      cvLabel === cv.label
                        ? "border-[hsl(187_74%_32%)] bg-[hsl(187_40%_96%)] text-[hsl(187_74%_26%)] dark:bg-[hsl(187_74%_32%)]/15"
                        : "hover:bg-muted"
                    }`}
                  >
                    {cv.label}
                    {cv.isPrimary && " ★"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="url">Job URL (optional)</Label>
            <Input
              id="url"
              placeholder="https://boards.greenhouse.io/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jd">Job description text</Label>
            <Textarea
              id="jd"
              placeholder="Paste the full job description here…"
              className="min-h-56 font-mono text-sm"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              disabled={busy}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={runQuick}
              disabled={busy || cvs.length === 0}
            >
              {quickLoading ? "Checking…" : "Quick check"}
            </Button>
            <Button onClick={runFull} disabled={busy || cvs.length === 0}>
              {fullLoading ? "Evaluating… (~20s)" : "Full evaluation"}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Quick check is instant and isn&apos;t saved. Full evaluation adds
            live research, the A–G report, your tracker, and a tailored PDF.
          </p>
        </CardContent>
      </Card>

      {/* Quick result */}
      {quick && (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
            <div className="h-1 bg-linear-to-r from-[hsl(187_74%_32%)] to-[hsl(270_70%_45%)]" />
            <div className="flex flex-col items-center gap-6 p-6 sm:flex-row">
              <MatchRing value={quick.skillMatchPercentage} />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <span
                  className={`inline-block rounded-md px-3 py-1 font-heading text-sm font-semibold ${
                    VERDICT_STYLES[quick.verdict] ?? "bg-muted"
                  }`}
                >
                  {quick.verdict}
                </span>
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                  {quick.summary}
                </p>
              </div>
            </div>
          </div>

          {quick.strengths.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
                  Where you match
                </p>
                <ul className="space-y-1.5 text-sm">
                  {quick.strengths.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-px shrink-0 font-semibold text-emerald-600">✓</span>
                      <span className="text-foreground/90">{s}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {quick.gapAnalysis.length > 0 && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">
                  Gaps to close
                </p>
                {quick.gapAnalysis.map((g, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{g.missingSkill}</span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          IMPORTANCE_STYLES[g.importance] ?? ""
                        }`}
                      >
                        {g.importance}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{g.recommendation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="rounded-xl border border-[hsl(187_74%_32%)]/30 bg-[hsl(187_40%_97%)] p-4 text-center dark:bg-[hsl(187_74%_32%)]/10">
            <p className="text-sm text-foreground/90">
              Worth pursuing? Run the{" "}
              <span className="font-medium">full evaluation</span> for the A–G
              report, live market research, and a tailored CV.
            </p>
            <Button className="mt-3" onClick={runFull} disabled={busy}>
              {fullLoading ? "Evaluating… (~20s)" : "Run full evaluation →"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
