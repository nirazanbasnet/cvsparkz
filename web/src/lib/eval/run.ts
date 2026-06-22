import { SupabaseClient } from "@supabase/supabase-js";
import { chatJSON } from "@/lib/llm/gateway";
import { withUsage } from "@/lib/llm/usage-context";
import { EVAL_SYSTEM_PROMPT, buildEvalUserPrompt } from "@/lib/eval/prompt";
import { parseEvalResult, EvalResult } from "@/lib/eval/schema";
import { researchJob, deriveJobHints } from "@/lib/research/tavily";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function decisionLabel(d: EvalResult["final_decision"]): string {
  return { apply_now: "Apply now", apply: "Apply", maybe: "Maybe", skip: "Skip" }[d];
}

function legitimacyLabel(l: EvalResult["legitimacy"]): string {
  return {
    high_confidence: "High Confidence",
    proceed_with_caution: "Proceed with Caution",
    suspicious: "Suspicious",
  }[l];
}

function assembleReportMd(r: EvalResult, url: string | null, date: string): string {
  return `# Evaluation: ${r.company_name} — ${r.role}

**Date:** ${date}
**URL:** ${url ?? "(pasted JD)"}
**Archetype:** ${r.archetype}${r.archetype_secondary ? ` / ${r.archetype_secondary}` : ""}
**Score:** ${r.score}/5
**Decision:** ${decisionLabel(r.final_decision)}
**Legitimacy:** ${legitimacyLabel(r.legitimacy)}

---

## A) Role Summary

${r.blocks.A}

## B) Match with CV

${r.blocks.B}

## C) Level and Strategy

${r.blocks.C}

## D) Comp and Demand

${r.blocks.D}

## E) Customization Plan

${r.blocks.E}

## F) Interview Plan

${r.blocks.F}

## G) Posting Legitimacy

${r.blocks.G}

---

## Keywords extracted

${r.keywords.map((k) => `- ${k}`).join("\n")}
`;
}

export interface RunEvaluationArgs {
  supabase: SupabaseClient;
  tenantId: string;
  jdText: string;
  url?: string | null;
  postingId?: string | null;
  /** Known company/role (e.g. from a scanned posting) — improves web research queries. */
  companyHint?: string | null;
  roleHint?: string | null;
  /** Evaluate against a specific CV (by label); defaults to the primary CV. */
  cvLabel?: string | null;
}

export async function runEvaluation({
  supabase,
  tenantId,
  jdText,
  url,
  postingId,
  companyHint,
  roleHint,
  cvLabel,
}: RunEvaluationArgs): Promise<{ evaluationId: string }> {
  // 1. Load the chosen CV (by label) or the primary CV, + profile
  const cvQuery = cvLabel
    ? supabase
        .from("cv_versions")
        .select("id, content_md")
        .eq("tenant_id", tenantId)
        .eq("label", cvLabel)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    : supabase
        .from("cv_versions")
        .select("id, content_md")
        .eq("tenant_id", tenantId)
        .eq("is_current", true)
        .limit(1)
        .maybeSingle();

  const [{ data: cv }, { data: profile }] = await Promise.all([
    cvQuery,
    supabase
      .from("candidate_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  if (!cv) {
    throw new Error("NO_CV: Add your CV before evaluating a job.");
  }

  // 2. Record job (observability; eval itself runs inline)
  const { data: job } = await supabase
    .from("jobs")
    .insert({
      tenant_id: tenantId,
      kind: "evaluation",
      status: "running",
      input: { url: url ?? null, jd_chars: jdText.length },
      started_at: new Date().toISOString(),
      attempts: 1,
    })
    .select("id")
    .single();

  try {
    // 3. Live web research for comp + legitimacy (no-op without TAVILY_API_KEY)
    const hints = deriveJobHints(jdText, url);
    const research = await researchJob({
      company: companyHint ?? hints.company,
      role: roleHint ?? hints.role,
    });
    console.log(
      `[eval] research: ${research ? `${research.length} chars` : "none"} (company=${companyHint ?? hints.company ?? "?"}, role=${roleHint ?? hints.role ?? "?"})`
    );

    // 4. Call the LLM gateway
    const userPrompt = buildEvalUserPrompt({
      research,
      cvMarkdown: cv.content_md,
      profile: profile
        ? {
            fullName: profile.full_name,
            targetRoles: profile.target_roles,
            archetypes: profile.archetypes,
            narrative: profile.narrative,
            compCurrency: profile.comp_currency,
            compTargetMin: profile.comp_target_min,
            compTargetMax: profile.comp_target_max,
            compMinimum: profile.comp_minimum,
            locationCity: profile.location_city,
            locationCountry: profile.location_country,
            locationFlexibility: profile.location_flexibility,
          }
        : null,
      jdText,
      url,
    });

    const { data: result, usage } = await withUsage(
      { tenantId, feature: "evaluation" },
      () =>
        chatJSON({ system: EVAL_SYSTEM_PROMPT, user: userPrompt }, parseEvalResult)
    );

    const score = Math.round(result.score * 10) / 10;
    const date = new Date().toISOString().slice(0, 10);
    const reportMd = assembleReportMd(result, url ?? null, date);

    // 4. Persist evaluation
    const { data: evaluation, error: evalError } = await supabase
      .from("evaluations")
      .insert({
        tenant_id: tenantId,
        posting_id: postingId ?? null,
        cv_version_id: cv.id,
        company_name: result.company_name,
        role: result.role,
        url: url ?? null,
        score,
        archetype: result.archetype,
        legitimacy: result.legitimacy,
        final_decision: result.final_decision,
        risk_level: result.risk_level,
        confidence: result.confidence,
        next_action: result.next_action,
        hard_stops: result.hard_stops,
        soft_gaps: result.soft_gaps,
        top_strengths: result.top_strengths,
        blocks: {
          ...result.blocks,
          keywords: result.keywords,
          // JD snapshot so PDF tailoring can run later without re-fetching
          jd_text: jdText.slice(0, 15000),
        },
        report_md: reportMd,
        model_used: usage.model,
      })
      .select("id")
      .single();

    if (evalError || !evaluation) {
      throw new Error(`Failed to persist evaluation: ${evalError?.message}`);
    }

    // 5. Upsert application (never duplicate company+role)
    const companyNorm = normalize(result.company_name);
    const roleNorm = normalize(result.role);

    const { data: existing } = await supabase
      .from("applications")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("company_norm", companyNorm)
      .eq("role_norm", roleNorm)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("applications")
        .update({
          score,
          latest_evaluation_id: evaluation.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      const { data: app } = await supabase
        .from("applications")
        .insert({
          tenant_id: tenantId,
          company_name: result.company_name,
          role: result.role,
          company_norm: companyNorm,
          role_norm: roleNorm,
          status: "evaluated",
          score,
          latest_evaluation_id: evaluation.id,
        })
        .select("id")
        .single();

      if (app) {
        await supabase.from("application_status_events").insert({
          tenant_id: tenantId,
          application_id: app.id,
          from_status: null,
          to_status: "evaluated",
          note: `Evaluated ${score}/5`,
        });
      }
    }

    // 6. Job success (token spend is metered by the gateway via withUsage)
    if (job) {
      await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          result: { evaluation_id: evaluation.id, score },
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    return { evaluationId: evaluation.id };
  } catch (e) {
    if (job) {
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error: e instanceof Error ? e.message.slice(0, 2000) : String(e),
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
    throw e;
  }
}
