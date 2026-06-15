import { z } from "zod";

export const tailoredCvSchema = z.object({
  paper_format: z.enum(["letter", "a4"]),
  summary: z.string().min(50),
  competencies: z.array(z.string()).min(4).max(10),
  experience: z
    .array(
      z.object({
        company: z.string(),
        role: z.string(),
        period: z.string(),
        location: z.string().nullish(),
        bullets: z.array(z.string()).min(1),
      })
    )
    .min(1),
  projects: z
    .array(
      z.object({
        title: z.string(),
        badge: z.string().nullish(),
        description: z.string(),
        tech: z.string().nullish(),
      })
    )
    .default([]),
  education: z
    .array(
      z.object({
        title: z.string(),
        org: z.string(),
        year: z.string().nullish(),
        desc: z.string().nullish(),
      })
    )
    .default([]),
  certifications: z
    .array(
      z.object({
        title: z.string(),
        org: z.string(),
        year: z.string().nullish(),
      })
    )
    .default([]),
  skills: z
    .array(z.object({ category: z.string(), items: z.string() }))
    .default([]),
  keywords_used: z.array(z.string()).default([]),
  change_log: z.array(z.string()).max(12).default([]),
});

export type TailoredCv = z.infer<typeof tailoredCvSchema>;

export function parseTailoredCv(raw: unknown): TailoredCv {
  const result = tailoredCvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues.slice(0, 5)));
  }
  return result.data;
}
