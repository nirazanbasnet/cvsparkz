"use client";

import { Popover } from "@base-ui/react/popover";
import { Zap, ChevronDown } from "lucide-react";
import type { UsageSummary, RoleUsage, UsageRole } from "@/lib/llm/usage";

const FEATURE_LABELS: Record<string, string> = {
  evaluation: "Evaluations",
  jd_analyze: "Quick checks",
  cv_score: "CV scores",
  cv_import: "CV imports",
  cv_assist: "CV assists",
  cv_extract: "CV parsing",
  pdf: "Tailored PDFs",
  scan: "Portal scans",
  "recruiter:screen": "Candidate screens",
  "recruiter:deep": "Deep evals",
  "recruiter:interview": "Interview questions",
  "recruiter:interview_report": "Hiring reports",
  other: "Other",
};

const ROLE_LABELS: Record<UsageRole, string> = {
  personal: "Personal",
  recruiter: "Recruiter",
};

function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

/** 312_400 → "312k", 1_240_000 → "1.24M". */
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** Bar + text color by how much of the budget is spent. */
function tier(percent: number): { bar: string; text: string } {
  if (percent >= 90)
    return { bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" };
  if (percent >= 75)
    return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-500" };
  return {
    bar: "bg-[hsl(187_74%_38%)]",
    text: "text-[hsl(187_74%_30%)] dark:text-[hsl(187_60%_60%)]",
  };
}

function RoleRow({
  usage,
  isCurrent,
}: {
  usage: RoleUsage;
  isCurrent: boolean;
}) {
  const t = tier(usage.percent);
  const top = usage.byFeature.slice(0, 4);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{ROLE_LABELS[usage.role]}</span>
          {isCurrent && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              current
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          <span className={`font-medium ${t.text}`}>{fmt(usage.tokensUsed)}</span>
          {" / "}
          {fmt(usage.tokensUsed + usage.remaining)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${t.bar} transition-all`}
          style={{ width: `${Math.max(usage.percent, usage.tokensUsed > 0 ? 2 : 0)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{fmt(usage.remaining)} left</span>
        <span>
          {usage.percent}% · {usage.calls} {usage.calls === 1 ? "call" : "calls"}
        </span>
      </div>
      {top.length > 0 && (
        <ul className="space-y-0.5 pt-0.5">
          {top.map((f) => (
            <li
              key={f.feature}
              className="flex items-center justify-between text-[11px] text-muted-foreground"
            >
              <span className="truncate pr-2">{featureLabel(f.feature)}</span>
              <span className="tabular-nums">{fmt(f.tokens)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UsageBadge({ summary }: { summary: UsageSummary }) {
  const current =
    summary.roles.find((r) => r.role === summary.currentRole) ?? summary.roles[0];
  const t = tier(current.percent);

  return (
    <Popover.Root>
      <Popover.Trigger className="group flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted data-[popup-open]:text-foreground">
        <Zap className={`size-3.5 ${t.text}`} aria-hidden />
        <span className="hidden sm:inline">{current.percent}% used</span>
        <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted sm:hidden">
          <span
            className={`block h-full rounded-full ${t.bar}`}
            style={{ width: `${current.percent}%` }}
          />
        </span>
        <ChevronDown
          className="size-3 transition-transform group-data-[popup-open]:rotate-180"
          aria-hidden
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className="w-72 origin-(--transform-origin) rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="mb-3 flex items-center justify-between">
              <Popover.Title className="text-sm font-semibold">
                Token usage
              </Popover.Title>
              <span className="text-[11px] text-muted-foreground">
                {summary.monthLabel}
              </span>
            </div>

            <div className="space-y-4">
              {summary.roles.map((r) => (
                <RoleRow
                  key={r.role}
                  usage={r}
                  isCurrent={r.role === summary.currentRole}
                />
              ))}
            </div>

            <Popover.Description className="mt-3 border-t pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {fmt(summary.budget)} tokens/month per role · resets in{" "}
              {summary.resetsInDays}{" "}
              {summary.resetsInDays === 1 ? "day" : "days"}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
