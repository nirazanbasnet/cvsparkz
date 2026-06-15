/**
 * JD Analyzer (ported from CV Spark) — compares a CV against a specific job
 * description: skill-match %, gap analysis, and an apply/skip verdict. Lighter
 * and faster than the full A–G evaluation; meant for a quick "should I bother?"
 * read before committing to a tailored application.
 */
import { z } from "zod";
import { chatJSON } from "@/lib/llm/gateway";

export const jdAnalysisSchema = z.object({
  skillMatchPercentage: z.number().min(0).max(100),
  verdict: z.enum(["Strong Apply", "Apply", "Stretch", "Do Not Apply"]),
  summary: z.string(),
  strengths: z.array(z.string()).default([]),
  gapAnalysis: z
    .array(
      z.object({
        missingSkill: z.string(),
        importance: z.enum(["Critical", "High", "Medium", "Low"]),
        recommendation: z.string(),
      })
    )
    .default([]),
});

export type JdAnalysis = z.infer<typeof jdAnalysisSchema>;

const SYSTEM_PROMPT = `You are an expert technical recruiter and ATS specialist. Compare a candidate's CV against a specific job description and give an objective, brutally honest but constructive read. NEVER invent skills the CV doesn't show.

Return ONLY JSON:
{
  "skillMatchPercentage": number,   // 0-100, how well the CV aligns with the JD's requirements
  "verdict": "Strong Apply" | "Apply" | "Stretch" | "Do Not Apply",
  "summary": string,                // 2-3 sentences on the fit
  "strengths": string[],            // 2-4 specific, real overlaps between the CV and the JD
  "gapAnalysis": [
    {
      "missingSkill": string,       // a requirement from the JD not evidenced in the CV
      "importance": "Critical" | "High" | "Medium" | "Low",
      "recommendation": string      // concrete action to close or offset the gap
    }
  ]
}`;

export async function analyzeJd(args: {
  cvText: string;
  jdText: string;
}): Promise<{ analysis: JdAnalysis; model: string; tokensIn: number; tokensOut: number }> {
  const { data, usage } = await chatJSON(
    {
      system: SYSTEM_PROMPT,
      user: `Target job description:\n${args.jdText.slice(0, 6000)}\n\n---\n\nCandidate CV:\n${args.cvText.slice(0, 6000)}\n\nReturn the JSON object only.`,
      maxTokens: 4000,
    },
    (raw) => {
      const result = jdAnalysisSchema.safeParse(raw);
      if (!result.success) throw new Error(JSON.stringify(result.error.issues.slice(0, 5)));
      return result.data;
    }
  );
  return { analysis: data, model: usage.model, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut };
}
