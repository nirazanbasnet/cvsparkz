"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { dismissPipelineItem } from "./actions";

export interface InboxRow {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  state: string;
  error: string | null;
  fitScore: number | null;
  fitReason: string | null;
  firstSeen: string;
}

/** Quick-fit (1–5 estimate) → tiered, color-coded pill so the user can
 *  triage the inbox at a glance. */
function fitTier(s: number): { label: string; cls: string } {
  if (s >= 4.5) return { label: "Strong", cls: "bg-emerald-600 text-white" };
  if (s >= 4.0) return { label: "Good", cls: "bg-[hsl(187_74%_32%)] text-white" };
  if (s >= 3.0) return { label: "Fair", cls: "bg-amber-500 text-white" };
  return { label: "Low", cls: "bg-rose-500 text-white" };
}

function FitBadge({ score, reason }: { score: number; reason: string | null }) {
  const t = fitTier(score);
  return (
    <span
      title={`${reason ?? "quick pre-screen"} — estimate for ranking; Evaluate gives the real score`}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold tabular-nums ${t.cls}`}
    >
      {score.toFixed(1)}
      <span className="font-medium opacity-85">{t.label}</span>
    </span>
  );
}

export function InboxItem({ item }: { item: InboxRow }) {
  const router = useRouter();
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(item.error);
  const [pending, startTransition] = useTransition();

  async function evaluate() {
    setEvaluating(true);
    setError(null);
    try {
      const res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_item_id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Evaluation failed");
      router.push(`/evaluations/${data.evaluation_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
      setEvaluating(false);
      router.refresh();
    }
  }

  const fetchFailed = error?.startsWith("FETCH_FAILED");

  return (
    <TableRow>
      <TableCell>
        {item.fitScore != null ? (
          <FitBadge score={item.fitScore} reason={item.fitReason} />
        ) : (
          <span
            className="text-xs text-muted-foreground"
            title="Not scored yet — runs automatically on the next scan"
          >
            —
          </span>
        )}
      </TableCell>
      <TableCell className="font-medium">{item.company}</TableCell>
      <TableCell>
        <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
          {item.title}
        </a>
        {error && (
          <p className="mt-1 max-w-md text-xs text-destructive">
            {fetchFailed
              ? "Couldn't auto-fetch this JD (JS-rendered page)."
              : error}
          </p>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{item.location || "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {new Date(item.firstSeen).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" onClick={evaluate} disabled={evaluating}>
          {evaluating ? "Evaluating…" : error ? "Retry" : "Evaluate"}
        </Button>{" "}
        {fetchFailed && (
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/evaluate?url=${encodeURIComponent(item.url)}`} />}
          >
            Paste JD
          </Button>
        )}{" "}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || evaluating}
          onClick={() => startTransition(() => dismissPipelineItem(item.id))}
        >
          Dismiss
        </Button>
      </TableCell>
    </TableRow>
  );
}
