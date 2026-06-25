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

const groupSchema = z.object({
  groups: z
    .array(
      z.object({
        heading: z.string().default(""),
        bullets: z.array(z.string()).default([]),
      })
    )
    .default([]),
});

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export interface GroupedAccomplishments {
  focusAreas: Array<{ heading: string; bullets: string[] }>;
  ungrouped: string[];
}

/**
 * Organize a single role's accomplishments into thematic task/project areas.
 * The model only proposes a grouping — we reconcile its output against the
 * original bullets so nothing is reworded, dropped, or invented: each returned
 * bullet is matched back to an input bullet (exact, then loose) and the
 * verbatim original is used; anything unmatched stays ungrouped.
 */
export async function groupAccomplishments(args: {
  role: string;
  company?: string;
  bullets: string[];
}): Promise<GroupedAccomplishments> {
  const clean = args.bullets.map((b) => b.trim()).filter(Boolean);
  if (clean.length < 2) return { focusAreas: [], ungrouped: clean };

  const { data } = await chatJSON(
    {
      system: `You organize one job's resume accomplishments into 2–5 thematic "task / project areas" (e.g. "Payments platform", "CI/CD & Tooling", "Team leadership", "Data pipeline").

Rules:
- Use ONLY the bullets provided. NEVER reword, merge, split, summarize, translate, or invent bullets — copy each one EXACTLY, character for character.
- Each bullet goes in at most one group. A bullet that fits no clear theme is simply left out (it stays ungrouped).
- Headings are concise noun phrases naming the project, system, product, or area of work — not full sentences.
- Aim for 2–5 groups. Don't make a group for a single stray bullet unless it's clearly its own distinct project.

Return ONLY JSON: {"groups":[{"heading":"...","bullets":["exact bullet text", ...]}]}`,
      user: `Job title: "${args.role}"${args.company ? `\nCompany: "${args.company}"` : ""}

Accomplishments:
${clean.map((b, i) => `${i + 1}. ${b}`).join("\n")}`,
      maxTokens: 2500,
      temperature: 0.2,
    },
    (raw) => groupSchema.parse(raw)
  );

  const used = new Set<number>();
  const matchInput = (text: string): number => {
    const n = normalize(text);
    if (!n) return -1;
    let idx = clean.findIndex((b, i) => !used.has(i) && normalize(b) === n);
    if (idx === -1) {
      idx = clean.findIndex(
        (b, i) =>
          !used.has(i) &&
          (normalize(b).includes(n) || n.includes(normalize(b)))
      );
    }
    return idx;
  };

  const focusAreas: GroupedAccomplishments["focusAreas"] = [];
  for (const g of data.groups) {
    const heading = g.heading.trim();
    if (!heading) continue;
    const bullets: string[] = [];
    for (const b of g.bullets) {
      const idx = matchInput(b);
      if (idx !== -1) {
        used.add(idx);
        bullets.push(clean[idx]); // verbatim original, not the model's copy
      }
    }
    if (bullets.length > 0) focusAreas.push({ heading, bullets });
  }
  const ungrouped = clean.filter((_, i) => !used.has(i));
  return { focusAreas, ungrouped };
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
