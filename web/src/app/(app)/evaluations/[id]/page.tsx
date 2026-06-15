import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { PdfPanel, type DocRow } from "./pdf-panel";
import {
  ScoreGauge,
  Verdict,
  decisionTone,
  DECISION_LABELS,
  SignalList,
  BlockSection,
  SectionRail,
  BLOCK_TITLES,
} from "./report-ui";

const LEGITIMACY_META: Record<
  string,
  { label: string; banner?: string; chip: string }
> = {
  high_confidence: {
    label: "High confidence",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  proceed_with_caution: {
    label: "Proceed with caution",
    banner: "Mixed legitimacy signals — see section G before investing time.",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  suspicious: {
    label: "Suspicious",
    banner:
      "Multiple ghost-job indicators — investigate before investing time. Details in section G.",
    chip: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};

export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, tenantId } = await getUserAndTenant();

  const [{ data: ev }, { data: docs }] = await Promise.all([
    supabase
      .from("evaluations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("generated_documents")
      .select("id, page_format, file_size, created_at, meta")
      .eq("tenant_id", tenantId)
      .eq("evaluation_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!ev) notFound();

  const score = Number(ev.score);
  const lowFit = score < 4.0;
  const blocks = (ev.blocks ?? {}) as Record<string, unknown>;
  const keywords = Array.isArray(blocks.keywords)
    ? (blocks.keywords as string[])
    : [];
  const legitimacy = LEGITIMACY_META[ev.legitimacy ?? ""];
  const presentBlocks = BLOCK_TITLES.filter(
    (b) => typeof blocks[b.key] === "string" && (blocks[b.key] as string).trim()
  );

  return (
    <div className="relative mx-auto max-w-5xl">
      {/* ambient brand glow behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-full max-w-3xl -translate-x-1/2 rounded-full opacity-[0.07] blur-3xl"
        style={{
          background:
            "linear-gradient(100deg, hsl(187 74% 38%), hsl(270 70% 50%))",
        }}
      />

      <div className="space-y-8">
        {/* ── Hero ─────────────────────────────────────────── */}
        <header className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="h-1 bg-linear-to-r from-[hsl(187_74%_32%)] to-[hsl(270_70%_45%)]" />
          <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="min-w-0">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(187_74%_32%)]">
                Evaluation report
              </p>
              <h1 className="font-heading text-2xl font-bold leading-tight tracking-tight md:text-3xl">
                {ev.company_name}
                <span className="font-normal text-muted-foreground"> — </span>
                <span className="font-semibold">{ev.role}</span>
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {new Date(ev.created_at).toLocaleString(undefined, {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
                {" · "}
                {ev.archetype}
                {ev.url && (
                  <>
                    {" · "}
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-[hsl(187_74%_32%)] decoration-2 underline-offset-2 hover:text-foreground"
                    >
                      original posting ↗
                    </a>
                  </>
                )}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <Verdict
                  label="Decision"
                  value={DECISION_LABELS[ev.final_decision ?? ""] ?? "—"}
                  tone={decisionTone(ev.final_decision)}
                />
                <Verdict
                  label="Legitimacy"
                  value={legitimacy?.label ?? "—"}
                  tone={legitimacy?.chip}
                />
                <Verdict label="Risk" value={ev.risk_level ?? "—"} />
                <Verdict label="Confidence" value={ev.confidence ?? "—"} />
              </div>
            </div>

            <div className="flex items-center gap-5 md:flex-col md:gap-3">
              <ScoreGauge score={score} />
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/tracker" />}
              >
                Tracker →
              </Button>
            </div>
          </div>
        </header>

        {/* ── Callouts ─────────────────────────────────────── */}
        {(legitimacy?.banner || lowFit) && (
          <div className="space-y-3">
            {legitimacy?.banner && (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <span aria-hidden>⚠️</span>
                <p>{legitimacy.banner}</p>
              </div>
            )}
            {lowFit && (
              <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                <span aria-hidden>🛑</span>
                <p>
                  <span className="font-semibold">
                    Low fit ({score.toFixed(1)}/5).
                  </span>{" "}
                  Recommendation: don&apos;t apply unless you have a specific
                  reason — your time and the recruiter&apos;s are both valuable.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Next action ──────────────────────────────────── */}
        {ev.next_action && (
          <div className="flex items-start gap-3 rounded-xl border-l-4 border-[hsl(187_74%_32%)] bg-background p-4 shadow-sm">
            <span className="font-heading text-xs font-bold uppercase tracking-[0.16em] text-[hsl(187_74%_32%)]">
              Next action
            </span>
            <p className="text-sm">{ev.next_action}</p>
          </div>
        )}

        {/* ── Signals ──────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-3">
          <SignalList
            title="Top strengths"
            items={(ev.top_strengths ?? []) as string[]}
            flavor="strength"
          />
          <SignalList
            title="Soft gaps"
            items={(ev.soft_gaps ?? []) as string[]}
            flavor="gap"
          />
          <SignalList
            title="Hard stops"
            items={(ev.hard_stops ?? []) as string[]}
            flavor="stop"
          />
        </div>

        {/* ── Tailored CV ──────────────────────────────────── */}
        <PdfPanel evaluationId={ev.id} documents={(docs ?? []) as DocRow[]} />

        {/* ── Report body ──────────────────────────────────── */}
        <div className="flex gap-10">
          <article className="min-w-0 flex-1 space-y-10 rounded-2xl border bg-background p-6 shadow-sm md:p-8">
            {presentBlocks.length > 0 ? (
              presentBlocks.map((b) => (
                <BlockSection
                  key={b.key}
                  letter={b.key}
                  title={b.title}
                  markdown={blocks[b.key] as string}
                />
              ))
            ) : (
              <BlockSection
                letter="·"
                title="Full report"
                markdown={ev.report_md ?? ""}
              />
            )}

            {keywords.length > 0 && (
              <section className="border-t pt-6">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  ATS keywords extracted from the JD
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-md border border-[hsl(187_40%_85%)] bg-[hsl(187_40%_96%)] px-2 py-0.5 text-xs font-medium text-[hsl(187_74%_26%)]"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </article>

          <SectionRail blocks={presentBlocks} />
        </div>
      </div>
    </div>
  );
}
