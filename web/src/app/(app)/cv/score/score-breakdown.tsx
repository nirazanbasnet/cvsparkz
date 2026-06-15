import type { CvScore } from "@/lib/cv/score-schema";

/* Brand: cyan hsl(187 74% 32%) → violet hsl(270 70% 45%). */

function Ring({ value, max = 100, size = 128 }: { value: number; max?: number; size?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 112 112" className="-rotate-90" style={{ width: size, height: size }}>
        <defs>
          <linearGradient id="cv-score-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(187 74% 38%)" />
            <stop offset="100%" stopColor="hsl(270 70% 50%)" />
          </linearGradient>
        </defs>
        <circle cx="56" cy="56" r={r} fill="none" stroke="hsl(220 14% 92%)" strokeWidth="8" />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="url(#cv-score-grad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-3xl font-bold leading-none tracking-tight">
          {Math.round(value)}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          / {max}
        </span>
      </div>
    </div>
  );
}

function tier(score: number): string {
  if (score >= 80) return "Gold standard";
  if (score >= 60) return "Competitive";
  return "Needs work";
}

export function ScoreBreakdown({
  score,
  scoredAt,
}: {
  score: CvScore;
  scoredAt?: string | null;
}) {
  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="h-1 bg-linear-to-r from-[hsl(187_74%_32%)] to-[hsl(270_70%_45%)]" />
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div className="min-w-0">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(187_74%_32%)]">
              CV score
            </p>
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {tier(score.score)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Benchmarked as a{" "}
              <span className="font-medium text-foreground">{score.roleCategory}</span>{" "}
              CV against a gold standard (heavily quantified, action-driven, zero
              passive voice).
              {scoredAt && (
                <> Scored {new Date(scoredAt).toLocaleDateString()}.</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <Ring value={score.score} />
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                your CV
              </span>
            </div>
            <div className="flex flex-col items-center opacity-80">
              <Ring value={score.averageMarketScore} size={88} />
              <span className="mt-1 max-w-20 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                market avg
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Market fit summary */}
      {score.marketFitSummary && (
        <div className="rounded-xl border bg-background p-5 text-sm shadow-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Market fit
          </p>
          <p className="leading-relaxed">{score.marketFitSummary}</p>
        </div>
      )}

      {/* Categories */}
      <div className="space-y-5">
        {score.categories.map((cat, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-background shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-5 py-3">
              <div className="min-w-0">
                <h3 className="font-heading text-base font-semibold">{cat.name}</h3>
                {cat.sourceCited && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    Source: <span className="italic">{cat.sourceCited}</span>
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-md border bg-background px-2 py-0.5 font-heading text-sm font-semibold">
                {cat.score}/100
              </span>
            </div>

            <div className="space-y-4 p-5">
              {cat.good.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
                    Strong aspects
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {cat.good.map((g, gi) => (
                      <li key={gi} className="flex gap-2">
                        <span className="mt-px shrink-0 font-semibold text-emerald-600">✓</span>
                        <span className="text-foreground/90">{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cat.improvements.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">
                    Actionable rewrites
                  </p>
                  <div className="space-y-3">
                    {cat.improvements.map((imp, ii) => (
                      <div key={ii} className="overflow-hidden rounded-lg border">
                        <div className="border-l-2 border-red-400 bg-red-50/60 px-3 py-2 dark:bg-red-950/20">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
                            Avoid
                          </p>
                          <p className="mt-0.5 text-sm italic text-muted-foreground">
                            &ldquo;{imp.originalText || "Generic statement"}&rdquo;
                          </p>
                        </div>
                        <div className="border-l-2 border-emerald-400 bg-emerald-50/60 px-3 py-2 dark:bg-emerald-950/20">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                            Gold-standard rewrite
                          </p>
                          <p className="mt-0.5 text-sm font-medium">
                            &ldquo;{imp.recommendedText}&rdquo;
                          </p>
                          {imp.reasoning && (
                            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                              <span aria-hidden>💡</span> {imp.reasoning}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
