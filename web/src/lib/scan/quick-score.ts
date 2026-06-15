/**
 * Quick fit scoring for inbox items — batched LLM calls rate jobs against
 * the primary CV so the inbox can rank postings before the user spends
 * full A–G evaluations.
 *
 * Jobs scanned from Greenhouse/Ashby/Lever/Recruitee carry their real JD
 * text (captured at scan time), so the score reads actual requirements.
 * Jobs without stored JD (Workable/SmartRecruiters/custom) fall back to
 * title-level scoring — the fit_reason marks those as title-only.
 */
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";
import { chatJSON } from "@/lib/llm/gateway";

const BATCH_SIZE = 15;
const CV_EXCERPT_CHARS = 2500;
const JD_EXCERPT_CHARS = 500;

const scoresSchema = z.object({
  scores: z
    .array(
      z.object({
        index: z.number().int().min(0),
        score: z.number().min(1).max(5),
        reason: z.string().max(120),
      })
    )
    .max(BATCH_SIZE + 5),
});

const SCORE_SYSTEM_PROMPT = `You are career-ops, pre-screening job postings for a candidate. Predict what a FULL evaluation of each job would score for this candidate, using the same rubric the full evaluator uses.

Rubric — global score 1.0–5.0 (one decimal), weighing:
- Match with CV: required skills/experience vs what the CV demonstrates
- North Star alignment: fit with the candidate's target role/direction
- Seniority alignment: JD level vs the candidate's level
- Location feasibility when evident
(Comp and culture are usually unknowable here — ignore unless stated.)

Score interpretation (same as the full evaluator):
- 4.5+ strong match, apply immediately
- 4.0–4.4 good match, worth applying
- 3.5–3.9 decent but not ideal
- below 3.5 recommend against applying

Inputs per job: title, company, location, and — when available — a JD excerpt with the real requirements. Base the score primarily on the JD excerpt when present. When a job has NO JD excerpt, score from the title alone, stay conservative (avoid scores above 4.5), and start "reason" with "title-only:".

"reason" = one short phrase (max ~10 words).
Return ONLY JSON: {"scores":[{"index":0,"score":4.2,"reason":"..."}]} — one entry per job, same index as given.`;

export interface QuickScoreResult {
  scored: number;
}

export async function quickScorePendingItems({
  supabase,
  tenantId,
}: {
  supabase: SupabaseClient;
  tenantId: string;
}): Promise<QuickScoreResult> {
  const [{ data: cv }, { data: items }] = await Promise.all([
    supabase
      .from("cv_versions")
      .select("content_md, primary_role")
      .eq("tenant_id", tenantId)
      .eq("is_current", true)
      .maybeSingle(),
    supabase
      .from("pipeline_items")
      .select("id, job_postings ( title, company_name, location, jd_text )")
      .eq("tenant_id", tenantId)
      .eq("state", "pending")
      .is("fit_score", null)
      .limit(200),
  ]);

  if (!cv || !items?.length) return { scored: 0 };

  const rows = items
    .map((item) => {
      const posting = Array.isArray(item.job_postings)
        ? item.job_postings[0]
        : item.job_postings;
      return posting?.title
        ? {
            id: item.id,
            title: posting.title,
            company: posting.company_name ?? "",
            location: posting.location ?? "",
            jd: posting.jd_text
              ? posting.jd_text.slice(0, JD_EXCERPT_CHARS)
              : null,
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let scored = 0;
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const jobList = batch
      .map((r, i) => {
        const head = `${i}. ${r.title} — ${r.company}${r.location ? ` (${r.location})` : ""}`;
        return r.jd ? `${head}\n   JD: ${r.jd}` : `${head}\n   JD: (not available)`;
      })
      .join("\n");

    try {
      const { data } = await chatJSON(
        {
          system: SCORE_SYSTEM_PROMPT,
          user: `# Candidate
Target role: ${cv.primary_role ?? "(not set)"}

## CV (excerpt)
${cv.content_md.slice(0, CV_EXCERPT_CHARS)}

# Jobs to rate
${jobList}

Rate all ${batch.length} jobs. Return the JSON object only.`,
          maxTokens: 3000,
          temperature: 0,
        },
        (raw) => {
          const result = scoresSchema.safeParse(raw);
          if (!result.success) {
            throw new Error(JSON.stringify(result.error.issues.slice(0, 3)));
          }
          return result.data;
        }
      );

      for (const s of data.scores) {
        const row = batch[s.index];
        if (!row) continue;
        await supabase
          .from("pipeline_items")
          .update({
            fit_score: Math.round(s.score * 10) / 10,
            fit_reason: s.reason.slice(0, 120),
          })
          .eq("tenant_id", tenantId)
          .eq("id", row.id);
        scored++;
      }
    } catch (e) {
      // Scoring is best-effort — an unscored batch just shows without badges.
      console.log(
        `[quick-score] batch failed: ${e instanceof Error ? e.message.slice(0, 200) : e}`
      );
    }
  }

  return { scored };
}
