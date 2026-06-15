import { z } from "zod";

export const cvScoreSchema = z.object({
  score: z.number().min(0).max(100),
  averageMarketScore: z.number().min(0).max(100),
  roleCategory: z.string().min(1),
  marketFitSummary: z.string(),
  categories: z
    .array(
      z.object({
        name: z.string(),
        score: z.number().min(0).max(100),
        sourceCited: z.string().nullish(),
        good: z.array(z.string()).default([]),
        improvements: z
          .array(
            z.object({
              originalText: z.string().default(""),
              recommendedText: z.string().default(""),
              reasoning: z.string().default(""),
            })
          )
          .default([]),
      })
    )
    .min(1),
});

export type CvScore = z.infer<typeof cvScoreSchema>;

export function parseCvScore(raw: unknown): CvScore {
  const result = cvScoreSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues.slice(0, 5)));
  }
  return result.data;
}
