/**
 * Absolute CV scoring (ported from CV Spark's ANALYSIS_PROMPT) — grades a CV
 * against a gold-standard benchmark, independent of any job. Runs through the
 * shared LLM gateway (Cerebras/Groq) so it inherits TPM budgeting + retries.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { chatJSON } from "@/lib/llm/gateway";
import { parseCvScore, CvScore } from "./score-schema";

const SCORE_SYSTEM_PROMPT = `You are an expert technical recruiter and AI-driven resume analyst. Grade the candidate's CV against a "Gold Standard Benchmark", independent of any specific job.

Gold Standard (a CV scores 80+ only if it):
- Uses strong action verbs (Led, Architected, Spearheaded) over passive phrasing ("Worked on", "Responsible for").
- Quantifies impact ("by 66%", "saving 50% cost", "team of 5").
- Categorizes skills cleanly rather than dumping them.
- Has clear, scannable formatting and a sharp professional summary.

Be critically strict — most real CVs land 55-75.

Return ONLY a JSON object with this exact shape:
{
  "score": number,                 // overall 0-100 vs the gold standard
  "averageMarketScore": number,    // typical score for this role in today's market (e.g. 65-75)
  "roleCategory": string,          // the candidate's inferred profession from their actual history (e.g. "Frontend Developer", "Data Scientist", "Registered Nurse") — never a generic default
  "marketFitSummary": string,      // 1-2 sentences on how they compare to standard market competition
  "categories": [
    {
      "name": string,              // e.g. "Impact & Metrics", "Action Verbs", "Skills Clarity", "Formatting", "Summary & Positioning"
      "score": number,             // 0-100 for this dimension
      "sourceCited": string,       // a specific reputable industry source/benchmark that validates this dimension
      "good": string[],            // 1-3 concrete things done well in this category
      "improvements": [            // actionable Do/Don't rewrites
        {
          "originalText": string,      // the EXACT weak sentence from their CV
          "recommendedText": string,   // your stronger, metric-driven gold-standard rewrite
          "reasoning": string          // why the rewrite is better (one short sentence)
        }
      ]
    }
  ]
}

Produce 4-6 categories. Keep the whole response under ~3500 tokens; use real text from the CV for originalText.`;

const CV_CHAR_CAP = 7000;

export async function scoreCvMarkdown(markdown: string): Promise<{
  score: CvScore;
  model: string;
  tokensIn: number;
  tokensOut: number;
}> {
  const { data, usage } = await chatJSON(
    {
      system: SCORE_SYSTEM_PROMPT,
      user: `Candidate CV:\n\n${markdown.slice(0, CV_CHAR_CAP)}\n\nGrade it. Return the JSON object only.`,
      maxTokens: 5000,
    },
    parseCvScore
  );
  return {
    score: data,
    model: usage.model,
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
  };
}

/**
 * Score the current version of a CV (by label) and persist the result onto
 * that version. Returns the score for immediate display.
 */
export async function scoreAndStore({
  supabase,
  tenantId,
  label,
}: {
  supabase: SupabaseClient;
  tenantId: string;
  label: string;
}): Promise<{ cvVersionId: string; score: CvScore }> {
  const { data: cv } = await supabase
    .from("cv_versions")
    .select("id, content_md")
    .eq("tenant_id", tenantId)
    .eq("label", label)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cv) throw new Error(`No CV named "${label}" found.`);
  if (!cv.content_md || cv.content_md.trim().length < 50) {
    throw new Error("CV is too short to score.");
  }

  const { score, model, tokensIn, tokensOut } = await scoreCvMarkdown(cv.content_md);

  const { averageMarketScore, roleCategory, marketFitSummary, categories } = score;
  await supabase
    .from("cv_versions")
    .update({
      score_overall: Math.round(score.score),
      score_data: { averageMarketScore, roleCategory, marketFitSummary, categories },
      scored_at: new Date().toISOString(),
    })
    .eq("id", cv.id);

  await supabase.from("usage_events").insert({
    tenant_id: tenantId,
    metric: "evaluation",
    quantity: 1,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  });

  return { cvVersionId: cv.id, score };
}
