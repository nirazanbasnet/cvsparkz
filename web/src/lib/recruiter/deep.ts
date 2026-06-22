import { z } from "zod";
import { chatJSON } from "@/lib/llm/gateway";
import type { Verdict } from "./screen";

export interface ScorecardItem {
  dimension: string;
  score: number; // 0–5
  note: string;
}

export interface DeepEval {
  fitScore: number;
  verdict: Verdict;
  recommendation: string;
  scorecard: ScorecardItem[];
  strengths: string[];
  gaps: string[];
  riskFlags: string[];
  interviewFocus: string[];
}

const schema = z.object({
  fit_score: z.number().min(0).max(100),
  verdict: z.enum(["Strong", "Good", "Fair", "Low"]),
  recommendation: z.string(),
  scorecard: z
    .array(
      z.object({
        dimension: z.string().default(""),
        score: z.number().min(0).max(5).default(0),
        note: z.string().default(""),
      })
    )
    .default([]),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  risk_flags: z.array(z.string()).default([]),
  interview_focus: z.array(z.string()).default([]),
});

const SYSTEM = `You are a senior technical recruiter doing a DEEP review of ONE candidate against ONE role. Be rigorous and specific, citing evidence from the CV.

- "fit_score": 0–100, with "verdict" Strong (>=85) / Good (70–84) / Fair (50–69) / Low (<50), consistent with the score.
- "recommendation": 2–3 sentences — should they advance, and why.
- "scorecard": 5–8 role-relevant dimensions, each scored 0–5 (one decimal allowed) with a short evidence-based note. Choose dimensions that fit THIS role (e.g. "Core skills match", "Relevant experience & seniority", "Project delivery", "Domain knowledge", "System design", "Communication"). The dimensions should reflect the JD's actual requirements.
- "strengths"/"gaps": 3–6 each, concrete and tied to the JD's requirements.
- "risk_flags": concerns like job-hopping, employment gaps, seniority mismatch, missing must-haves (empty array if none).
- "interview_focus": 3–5 specific things to probe in an interview to de-risk the decision.
- Judge ONLY from the CV; never invent experience.

Return ONLY JSON with keys: fit_score, verdict, recommendation, scorecard, strengths, gaps, risk_flags, interview_focus.`;

export async function deepEvaluate(
  opening: { title: string; jdText: string },
  candidate: { name: string; contentMd: string }
): Promise<DeepEval> {
  const { data } = await chatJSON(
    {
      system: SYSTEM,
      user: `# Role: ${opening.title}\n\n## Job description\n${opening.jdText.slice(
        0,
        4000
      )}\n\n## Candidate: ${candidate.name}\n${candidate.contentMd.slice(
        0,
        6000
      )}\n\nReturn the deep review as JSON.`,
      maxTokens: 3500,
      temperature: 0.2,
    },
    (raw) => {
      const r = schema.safeParse(raw);
      if (!r.success) throw new Error(JSON.stringify(r.error.issues.slice(0, 4)));
      return r.data;
    }
  );
  return {
    fitScore: Math.round(data.fit_score),
    verdict: data.verdict,
    recommendation: data.recommendation,
    scorecard: data.scorecard.map((s) => ({
      dimension: s.dimension,
      score: Math.round(s.score * 10) / 10,
      note: s.note,
    })),
    strengths: data.strengths,
    gaps: data.gaps,
    riskFlags: data.risk_flags,
    interviewFocus: data.interview_focus,
  };
}
