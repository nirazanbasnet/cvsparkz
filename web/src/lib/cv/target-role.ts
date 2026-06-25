/**
 * Analyze a CV to decide the best job titles + locations to search for. The
 * output maps directly onto the scanner's filters (title_positive / loc_allow),
 * so "find matching jobs" can drive the existing watchlist scan.
 */
import { z } from "zod";
import { chatJSON } from "@/lib/llm/gateway";

const schema = z.object({
  primaryRole: z.string().min(1),
  titleKeywords: z.array(z.string()).default([]),
  seniority: z.string().default(""),
  locations: z.array(z.string()).default([]),
  rationale: z.string().default(""),
});

export type TargetRoleAnalysis = z.infer<typeof schema>;

const clean = (arr: string[]) =>
  [...new Set(arr.map((s) => s.trim()).filter(Boolean))].slice(0, 6);

export async function analyzeTargetRole(args: {
  cvMarkdown: string;
  candidateLocation?: string | null;
}): Promise<TargetRoleAnalysis> {
  const { data } = await chatJSON(
    {
      system: `You are a career strategist. From a candidate's CV, decide the best job titles to search for and the ideal locations.

Return:
- "primaryRole": the single best-fit job title (e.g. "Senior AI Engineer").
- "titleKeywords": 2–5 SHORT keywords a matching job TITLE should contain. Include the candidate's core FIELD term so common titles still match (e.g. "AI", "Machine Learning", "Backend", "Data") PLUS 1–2 more specific ones (e.g. "LLM", "MLOps"). Avoid bare generics like "Engineer" or "Developer" on their own.
- "seniority": one of intern | junior | mid | senior | lead | principal | manager | director.
- "locations": 2–5 places to search, grounded in the candidate's own location. ALWAYS include "Remote" if the work is remote-capable; include the candidate's city and country, and 1–2 nearby hubs if relevant.
- "rationale": one short sentence on why these titles fit.

Base everything ONLY on the CV. Return ONLY JSON: {"primaryRole":"...","titleKeywords":[...],"seniority":"...","locations":[...],"rationale":"..."}`,
      user: `Candidate location: "${args.candidateLocation?.trim() || "unknown"}"

CV:
${args.cvMarkdown.slice(0, 8000)}`,
      maxTokens: 800,
      temperature: 0.3,
    },
    (raw) => schema.parse(raw)
  );

  return {
    primaryRole: data.primaryRole.trim(),
    titleKeywords: clean(data.titleKeywords),
    seniority: data.seniority.trim(),
    locations: clean(data.locations),
    rationale: data.rationale.trim(),
  };
}
