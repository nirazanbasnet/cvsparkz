/**
 * CV writing assists (ported from CV Spark's improve-bullet / suggest-bullet /
 * generate-summary). All return plain text, wrapped as JSON so they ride the
 * shared gateway (Cerebras/Groq) with its retry + budgeting.
 */
import { z } from "zod";
import { chatJSON } from "@/lib/llm/gateway";

const textSchema = z.object({ text: z.string().min(1) });
const parseText = (raw: unknown) => textSchema.parse(raw).text.trim();

const FORMULA =
  '[Action Verb] + [Specific Technology/Process] + [Quantifiable Result/Impact]';

export async function improveBullet(text: string): Promise<string> {
  const { data } = await chatJSON(
    {
      system: `You are an elite technical resume ghostwriter. Rewrite the user's experience bullet using the formula: ${FORMULA}. One powerful sentence, strong action verb, concrete metric, no fluff. Return ONLY JSON: {"text":"the rewritten bullet"}.`,
      user: `Input bullet: "${text}"`,
      maxTokens: 500,
      temperature: 0.3,
    },
    parseText
  );
  return data;
}

export async function suggestBullet(args: {
  role: string;
  taskHeading?: string;
  existingBullets?: string[];
}): Promise<string> {
  let context = `Job Title: "${args.role}"`;
  if (args.taskHeading) context += `\nFocus area: "${args.taskHeading}"`;
  if (args.existingBullets?.length) {
    context += `\n\nExisting bullets (cover a DIFFERENT angle than all of these):\n${args.existingBullets.map((b) => `- ${b}`).join("\n")}`;
  }
  const { data } = await chatJSON(
    {
      system: `You are an elite technical resume ghostwriter. Generate ONE brand-new, realistic, impressive resume bullet for the given role using the formula: ${FORMULA}. It MUST cover a different skill/angle than any existing bullets provided (leadership, delivery, optimization, tooling, revenue, etc.). Invent reasonable impressive metrics. Return ONLY JSON: {"text":"the new bullet"}.`,
      user: context,
      maxTokens: 500,
      temperature: 0.7,
    },
    parseText
  );
  return data;
}

export async function generateSummary(experience: unknown): Promise<string> {
  const { data } = await chatJSON(
    {
      system: `You are an expert executive resume writer. Write a compelling, ATS-optimized professional summary STRICTLY between 80 and 100 words, based ONLY on the provided experience. Concrete achievements and core technologies, no generic buzzwords. Return ONLY JSON: {"text":"the summary"}.`,
      user: `Experience:\n${JSON.stringify(experience, null, 2).slice(0, 6000)}`,
      maxTokens: 600,
      temperature: 0.3,
    },
    parseText
  );
  return data;
}
