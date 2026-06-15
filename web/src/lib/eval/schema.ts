import { z } from "zod";

export const LEGITIMACY_TIERS = [
  "high_confidence",
  "proceed_with_caution",
  "suspicious",
] as const;

export const evalResultSchema = z.object({
  company_name: z.string().min(1),
  role: z.string().min(1),
  archetype: z.string().min(1),
  archetype_secondary: z.string().nullish(),
  score: z.number().min(1).max(5),
  final_decision: z.enum(["apply_now", "apply", "maybe", "skip"]),
  risk_level: z.enum(["low", "medium", "high"]),
  confidence: z.enum(["low", "medium", "high"]),
  next_action: z.string(),
  legitimacy: z.enum(LEGITIMACY_TIERS),
  hard_stops: z.array(z.string()),
  soft_gaps: z.array(z.string()),
  top_strengths: z.array(z.string()),
  keywords: z.array(z.string()),
  blocks: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
    E: z.string(),
    F: z.string(),
    G: z.string(),
  }),
});

export type EvalResult = z.infer<typeof evalResultSchema>;

export function parseEvalResult(raw: unknown): EvalResult {
  const result = evalResultSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues.slice(0, 5)));
  }
  return result.data;
}
