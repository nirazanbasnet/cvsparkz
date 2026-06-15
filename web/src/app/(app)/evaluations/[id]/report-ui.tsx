import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/* Brand: cyan hsl(187 74% 32%) → violet hsl(270 70% 45%) — same identity
   as the generated CV PDFs. */

export function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score / 5));
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-32 shrink-0">
      <svg viewBox="0 0 112 112" className="size-32 -rotate-90">
        <defs>
          <linearGradient id="score-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(187 74% 38%)" />
            <stop offset="100%" stopColor="hsl(270 70% 50%)" />
          </linearGradient>
        </defs>
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="hsl(220 14% 92%)"
          strokeWidth="7"
        />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="url(#score-grad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-4xl font-bold leading-none tracking-tight">
          {score.toFixed(1)}
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          of 5.0
        </span>
      </div>
    </div>
  );
}

const DECISION_STYLES: Record<string, string> = {
  apply_now: "bg-emerald-600 text-white",
  apply: "bg-[hsl(187_74%_32%)] text-white",
  maybe: "bg-amber-500 text-white",
  skip: "bg-red-600 text-white",
};

export const DECISION_LABELS: Record<string, string> = {
  apply_now: "Apply now",
  apply: "Apply",
  maybe: "Maybe",
  skip: "Skip",
};

export function Verdict({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      {tone ? (
        <span
          className={`mt-1 inline-block rounded-md px-2.5 py-0.5 font-heading text-sm font-semibold ${tone}`}
        >
          {value}
        </span>
      ) : (
        <p className="mt-1 truncate font-heading text-sm font-semibold capitalize">
          {value}
        </p>
      )}
    </div>
  );
}

export function decisionTone(decision: string | null): string {
  return DECISION_STYLES[decision ?? ""] ?? "bg-muted text-foreground";
}

export function SignalList({
  title,
  items,
  flavor,
}: {
  title: string;
  items: string[];
  flavor: "strength" | "gap" | "stop";
}) {
  const marks = {
    strength: { glyph: "✓", cls: "text-emerald-600" },
    gap: { glyph: "△", cls: "text-amber-600" },
    stop: { glyph: "✕", cls: "text-red-600" },
  }[flavor];

  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None found.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className={`mt-px shrink-0 font-semibold ${marks.cls}`}>
                {marks.glyph}
              </span>
              <span className="text-foreground/90">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const BLOCK_TITLES: Array<{ key: string; title: string }> = [
  { key: "A", title: "Role Summary" },
  { key: "B", title: "Match with CV" },
  { key: "C", title: "Level & Strategy" },
  { key: "D", title: "Comp & Demand" },
  { key: "E", title: "Customization Plan" },
  { key: "F", title: "Interview Plan" },
  { key: "G", title: "Posting Legitimacy" },
];

const PROSE =
  "prose prose-sm max-w-none leading-relaxed " +
  "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 " +
  "[&_strong]:font-semibold " +
  "[&_th]:border-b [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top [&_th]:font-heading [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground " +
  "[&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:break-words [&_tr:last-child_td]:border-b-0";

// Wide markdown tables (e.g. the 8-column STAR+R Interview Plan) get a
// horizontal-scroll wrapper so they never overflow the report column.
const MD_COMPONENTS: Components = {
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-160 border-separate border-spacing-0 text-[13px]">
        {children}
      </table>
    </div>
  ),
};

export function BlockSection({
  letter,
  title,
  markdown,
}: {
  letter: string;
  title: string;
  markdown: string;
}) {
  return (
    <section id={`block-${letter}`} className="scroll-mt-24">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-[hsl(187_74%_32%)] to-[hsl(270_70%_45%)] font-heading text-sm font-bold text-white">
          {letter}
        </span>
        <h2 className="font-heading text-lg font-bold tracking-tight">{title}</h2>
        <div className="h-px flex-1 bg-linear-to-r from-border to-transparent" />
      </div>
      <div className={`${PROSE} min-w-0`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {markdown}
        </ReactMarkdown>
      </div>
    </section>
  );
}

export function SectionRail({
  blocks,
}: {
  blocks: Array<{ key: string; title: string }>;
}) {
  return (
    <nav className="sticky top-20 hidden w-44 shrink-0 self-start xl:block">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Report sections
      </p>
      <ul className="space-y-1 border-l">
        {blocks.map((b) => (
          <li key={b.key}>
            <a
              href={`#block-${b.key}`}
              className="-ml-px flex items-baseline gap-2 border-l-2 border-transparent py-1 pl-3 text-sm text-muted-foreground transition-colors hover:border-[hsl(187_74%_32%)] hover:text-foreground"
            >
              <span className="font-heading text-xs font-bold text-[hsl(187_74%_32%)]">
                {b.key}
              </span>
              {b.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
