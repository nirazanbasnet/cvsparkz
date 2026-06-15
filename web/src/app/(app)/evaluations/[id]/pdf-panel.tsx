"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface DocMeta {
  change_log?: string[];
  keywords_used?: string[];
  coverage?: {
    matched: string[];
    missing: string[];
    total: number;
    pct: number | null;
  };
  summary?: string;
}

export interface DocRow {
  id: string;
  page_format: string;
  file_size: number | null;
  created_at: string;
  meta: DocMeta | null;
}

function coverageVariant(pct: number): "default" | "secondary" | "destructive" {
  if (pct >= 70) return "default";
  if (pct >= 45) return "secondary";
  return "destructive";
}

function DocDetails({ doc }: { doc: DocRow }) {
  const meta = doc.meta ?? {};
  const coverage = meta.coverage;
  const changes = meta.change_log ?? [];

  return (
    <div className="space-y-3 border-t pt-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/documents/${doc.id}/download`}
          className="font-medium underline"
          target="_blank"
          rel="noreferrer"
        >
          Download PDF
        </a>
        <span className="text-muted-foreground">
          {doc.page_format.toUpperCase()}
          {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ""} ·{" "}
          {new Date(doc.created_at).toLocaleString()}
        </span>
        {coverage?.pct != null && (
          <Badge variant={coverageVariant(coverage.pct)}>
            {coverage.matched.length}/{coverage.total} JD keywords · {coverage.pct}%
          </Badge>
        )}
      </div>

      {changes.length > 0 && (
        <div>
          <p className="mb-1 font-medium">What was changed (verify before sending):</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            {changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {coverage && coverage.missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Keywords NOT covered</span> (you may
          genuinely lack these — that&apos;s honest, don&apos;t force them):{" "}
          {coverage.missing.join(", ")}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Tailoring only rewords and reorders your real experience using the
        JD&apos;s vocabulary — it never invents skills or metrics. Still: read
        the PDF before you send it.
      </p>
    </div>
  );
}

export function PdfPanel({
  evaluationId,
  documents,
}: {
  evaluationId: string;
  documents: DocRow[];
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluation_id: evaluationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "PDF generation failed");
      router.refresh();
      window.open(`/api/documents/${data.document_id}/download`, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-2xl py-0 shadow-sm">
      <div className="h-1 bg-linear-to-r from-[hsl(187_74%_32%)] to-[hsl(270_70%_45%)] opacity-40" />
      <CardContent className="space-y-3 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(187_74%_32%)]">
              Tailored CV
            </p>
            <p className="mt-1 text-muted-foreground">
              ATS-optimized PDF rewritten with this JD&apos;s keywords — never
              invents experience.
            </p>
            {error && <p className="mt-1 text-destructive">{error}</p>}
          </div>
          <Button onClick={generate} disabled={generating}>
            {generating
              ? "Generating… (~20s)"
              : documents.length > 0
                ? "Regenerate PDF"
                : "Generate tailored CV (PDF)"}
          </Button>
        </div>

        {documents.map((d) => (
          <DocDetails key={d.id} doc={d} />
        ))}
      </CardContent>
    </Card>
  );
}
