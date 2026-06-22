import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentUsageContext } from "./usage-context";
import type { LlmUsage } from "./gateway";

export type UsageRole = "personal" | "recruiter";

/** Recruiter-mode features are prefixed "recruiter:"; everything else is personal. */
export function roleForFeature(feature: string): UsageRole {
  return feature.startsWith("recruiter:") ? "recruiter" : "personal";
}

/**
 * Map a granular feature to the coarse `usage_metric` enum (0003) when one
 * fits, else null. `feature` is the real source of truth; `metric` is kept
 * populated for the five historic buckets so older dashboards still work.
 */
function metricForFeature(feature: string): string | null {
  if (feature === "evaluation") return "evaluation";
  if (feature === "scan") return "scan";
  if (feature === "pdf") return "pdf";
  if (feature === "recruiter:deep") return "deep_research";
  if (feature.startsWith("recruiter:interview")) return "interview_prep";
  return null;
}

/**
 * Record one completion's token spend against the active usage context.
 * Best-effort: a metering failure must never break the LLM call, and calls
 * made outside an attributed scope (e.g. the public guest endpoint) are
 * silently skipped.
 */
export async function recordUsage(usage: LlmUsage): Promise<void> {
  const ctx = currentUsageContext();
  if (!ctx) return;
  try {
    const admin = createAdminClient();
    await admin.from("usage_events").insert({
      tenant_id: ctx.tenantId,
      role: roleForFeature(ctx.feature),
      feature: ctx.feature,
      metric: metricForFeature(ctx.feature),
      quantity: 1,
      tokens_in: usage.tokensIn,
      tokens_out: usage.tokensOut,
      model: usage.model,
    });
  } catch (e) {
    console.error("[usage] failed to record event:", e);
  }
}

// ---------- summary for the header badge ----------

export interface FeatureUsage {
  feature: string;
  tokens: number;
  calls: number;
}

export interface RoleUsage {
  role: UsageRole;
  tokensUsed: number;
  calls: number;
  remaining: number;
  /** 0–100, capped, of the per-role monthly budget. */
  percent: number;
  byFeature: FeatureUsage[];
}

export interface UsageSummary {
  /** Per-role monthly token budget. */
  budget: number;
  monthLabel: string;
  resetsInDays: number;
  totalUsed: number;
  /** The mode the workspace is currently in (highlighted in the UI). */
  currentRole: UsageRole;
  roles: RoleUsage[];
}

interface UsageRow {
  role: string | null;
  feature: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
}

const ROLES: UsageRole[] = ["personal", "recruiter"];

/**
 * This-calendar-month token usage for a tenant, grouped by role and feature,
 * with each role measured against the tenant's monthly budget. Read through
 * the caller's RLS-scoped client.
 */
export async function getUsageSummary(
  supabase: SupabaseClient,
  tenantId: string,
  currentRole: UsageRole
): Promise<UsageSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const resetsInDays = Math.max(
    1,
    Math.ceil((nextMonth.getTime() - now.getTime()) / 86_400_000)
  );

  const [{ data: tenant }, { data: rows }] = await Promise.all([
    supabase
      .from("tenants")
      .select("monthly_token_budget")
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("usage_events")
      .select("role, feature, tokens_in, tokens_out")
      .eq("tenant_id", tenantId)
      .gte("occurred_at", monthStart.toISOString()),
  ]);

  const budget = (tenant?.monthly_token_budget as number | undefined) ?? 500_000;

  // role -> feature -> { tokens, calls }
  const acc = new Map<UsageRole, Map<string, FeatureUsage>>();
  for (const role of ROLES) acc.set(role, new Map());

  for (const r of (rows ?? []) as UsageRow[]) {
    const role: UsageRole = r.role === "recruiter" ? "recruiter" : "personal";
    const feature = r.feature ?? "other";
    const tokens = (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
    const byFeature = acc.get(role)!;
    const cur = byFeature.get(feature) ?? { feature, tokens: 0, calls: 0 };
    cur.tokens += tokens;
    cur.calls += 1;
    byFeature.set(feature, cur);
  }

  let totalUsed = 0;
  const roles: RoleUsage[] = ROLES.map((role) => {
    const byFeature = [...acc.get(role)!.values()].sort(
      (a, b) => b.tokens - a.tokens
    );
    const tokensUsed = byFeature.reduce((s, f) => s + f.tokens, 0);
    const calls = byFeature.reduce((s, f) => s + f.calls, 0);
    totalUsed += tokensUsed;
    return {
      role,
      tokensUsed,
      calls,
      remaining: Math.max(0, budget - tokensUsed),
      percent: budget > 0 ? Math.min(100, Math.round((tokensUsed / budget) * 100)) : 0,
      byFeature,
    };
  });

  return {
    budget,
    monthLabel: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
    resetsInDays,
    totalUsed,
    currentRole,
    roles,
  };
}
