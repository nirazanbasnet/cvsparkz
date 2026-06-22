import { z } from "zod";
import { chatJSON } from "@/lib/llm/gateway";

export type Verdict = "Strong" | "Good" | "Fair" | "Low";

export interface ScreenResult {
  candidateId: string;
  fitScore: number; // 0–100
  verdict: Verdict;
  summary: string;
  strengths: string[];
  gaps: string[];
}

export interface ScreenCandidate {
  id: string;
  name: string;
  headline: string | null;
  contentMd: string;
}

const BATCH = 6;
const CV_EXCERPT = 1500;
const JD_CAP = 3000;

const schema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      fit_score: z.number().min(0).max(100),
      verdict: z.enum(["Strong", "Good", "Fair", "Low"]),
      summary: z.string(),
      strengths: z.array(z.string()).default([]),
      gaps: z.array(z.string()).default([]),
    })
  ),
});

const SYSTEM = `You are an experienced technical recruiter screening candidates for ONE role. For each candidate, judge how well their CV fits the job description.

Rules:
- "fit_score": 0–100. 85–100 = strong match, 70–84 = good, 50–69 = partial/stretch, below 50 = weak. Base it on required skills, seniority, domain and responsibilities — NOT formatting.
- "verdict": "Strong" (>=85), "Good" (70–84), "Fair" (50–69), "Low" (<50). Keep it consistent with fit_score.
- "summary": one concise sentence on the fit.
- "strengths"/"gaps": up to 3 each — concrete and role-relevant.
- Judge ONLY from the CV text; never invent experience.
- Return a result for EVERY candidate id provided.

Return ONLY JSON: {"results":[{"id":"...","fit_score":0,"verdict":"Low","summary":"...","strengths":[],"gaps":[]}]}`;

/** Batched quick-screen: one LLM call rates several candidates against the JD. */
export async function screenCandidates(
  opening: { title: string; jdText: string },
  candidates: ScreenCandidate[]
): Promise<ScreenResult[]> {
  const out: ScreenResult[] = [];
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const block = batch
      .map(
        (c) =>
          `### Candidate id: ${c.id}\nName: ${c.name}${
            c.headline ? `\nHeadline: ${c.headline}` : ""
          }\nCV:\n${c.contentMd.slice(0, CV_EXCERPT)}`
      )
      .join("\n\n");
    try {
      const { data } = await chatJSON(
        {
          system: SYSTEM,
          user: `# Role: ${opening.title}\n\n## Job description\n${opening.jdText.slice(
            0,
            JD_CAP
          )}\n\n## Candidates (${batch.length})\n${block}\n\nRate every candidate. Return JSON only.`,
          maxTokens: 3000,
          temperature: 0,
        },
        (raw) => {
          const r = schema.safeParse(raw);
          if (!r.success) throw new Error(JSON.stringify(r.error.issues.slice(0, 3)));
          return r.data;
        }
      );
      const ids = new Set(batch.map((c) => c.id));
      for (const r of data.results) {
        if (!ids.has(r.id)) continue;
        out.push({
          candidateId: r.id,
          fitScore: Math.round(r.fit_score),
          verdict: r.verdict,
          summary: r.summary,
          strengths: r.strengths.slice(0, 3),
          gaps: r.gaps.slice(0, 3),
        });
      }
    } catch {
      // best-effort: skip this batch; those candidates stay unscored to retry
    }
  }
  return out;
}
