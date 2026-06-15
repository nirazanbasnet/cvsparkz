"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBreakdown } from "./score-breakdown";
import type { CvScore } from "@/lib/cv/score-schema";

export function CvScoreView({
  label,
  initialScore,
  scoredAt,
}: {
  label: string;
  initialScore: CvScore | null;
  scoredAt: string | null;
}) {
  const router = useRouter();
  const [score, setScore] = useState<CvScore | null>(initialScore);
  const [scored, setScored] = useState<string | null>(scoredAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runScore() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cv-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scoring failed");
      setScore(data.score);
      setScored(new Date().toISOString());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">CV score</h1>
          <p className="text-sm text-muted-foreground">
            How strong <span className="font-medium text-foreground">{label}</span>{" "}
            is on its own — graded against a gold-standard benchmark, with
            actionable rewrites.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" render={<Link href={`/cv?cv=${encodeURIComponent(label)}`} />}>
            ← Back to CV
          </Button>
          <Button onClick={runScore} disabled={loading}>
            {loading
              ? "Scoring… (~15s)"
              : score
                ? "Re-score"
                : "Score this CV"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {score ? (
        <ScoreBreakdown score={score} scoredAt={scored} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-heading text-lg font-semibold">
              {loading ? "Analyzing your CV…" : "Not scored yet"}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Get an absolute 0–100 score with category breakdowns (impact &
              metrics, action verbs, formatting…), each with specific Do/Don&apos;t
              rewrites you can paste straight into the builder.
            </p>
            {!loading && (
              <Button onClick={runScore} className="mt-2">
                Score this CV
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
