import { z } from "zod";
import { chatJSON } from "@/lib/llm/gateway";

// ── Recorded interview shapes (stored on interviews.questions/follow_ups) ──
export interface InterviewQuestion {
  id: string;
  category: string;
  question: string;
  why: string;
  answer: string;
  score: number | null;
  notes: string;
}

export interface FollowUp {
  id: string;
  dueDate: string | null;
  note: string;
  done: boolean;
}

// ── Generated interview questions ───────────────────────────────
export interface GeneratedQuestion {
  category: string;
  question: string;
  why: string;
}

const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        category: z.string(),
        question: z.string(),
        why: z.string(),
      })
    )
    .min(4)
    .max(20),
});

const QUESTIONS_SYSTEM = `You are a senior interviewer preparing a tailored interview for ONE candidate and ONE role. Design questions that probe whether this specific candidate can do this specific job — grounded in BOTH the job description's requirements AND the candidate's actual CV (their projects, claimed skills, seniority).

Rules:
- 10–14 questions total, grouped into 4–6 categories relevant to the role (e.g. "Core technical depth", "System design", "Project deep-dive", "Problem solving", "Behavioral & collaboration", plus role-specific ones).
- Mix: verify claimed skills, probe depth behind buzzwords on the CV, test must-have requirements from the JD, and 1–2 behavioral/ownership questions.
- Reference the candidate's real projects/claims where useful ("You built an OCR pipeline — how did you handle …").
- Calibrate difficulty to the candidate's stated seniority/experience.
- "why": one short line on what the question is meant to reveal (for the interviewer).

Return ONLY JSON: {"questions":[{"category":"...","question":"...","why":"..."}]}`;

export async function generateInterviewQuestions(
  opening: { title: string; jdText: string },
  candidate: { name: string; headline: string | null; contentMd: string },
  stage: string
): Promise<GeneratedQuestion[]> {
  const { data } = await chatJSON(
    {
      system: QUESTIONS_SYSTEM,
      user: `# Role: ${opening.title}\nInterview stage: ${stage}\n\n## Job description\n${opening.jdText.slice(
        0,
        3500
      )}\n\n## Candidate: ${candidate.name}${
        candidate.headline ? ` — ${candidate.headline}` : ""
      }\n${candidate.contentMd.slice(
        0,
        5000
      )}\n\nGenerate the tailored interview questions as JSON.`,
      maxTokens: 3500,
      temperature: 0.4,
    },
    (raw) => {
      const r = questionsSchema.safeParse(raw);
      if (!r.success) throw new Error(JSON.stringify(r.error.issues.slice(0, 4)));
      return r.data;
    }
  );
  return data.questions;
}

// ── Synthesized hiring decision report ──────────────────────────
export type Decision =
  | "strong_hire"
  | "hire"
  | "conditional_hire"
  | "no_hire";

export interface HiringReport {
  verdict: string;
  decision: Decision;
  overallScore: number; // 0–5
  summary: string;
  scorecard: { dimension: string; score: number; note: string }[];
  strengths: { title: string; detail: string }[];
  concerns: { title: string; detail: string }[];
  recommendation: string;
  growthPlan: string[];
}

const reportSchema = z.object({
  verdict: z.string(),
  decision: z.enum(["strong_hire", "hire", "conditional_hire", "no_hire"]),
  overall_score: z.number().min(0).max(5),
  summary: z.string(),
  scorecard: z
    .array(
      z.object({
        dimension: z.string().default(""),
        score: z.number().min(0).max(5).default(0),
        note: z.string().default(""),
      })
    )
    .default([]),
  strengths: z
    .array(
      z.object({
        title: z.string().default(""),
        detail: z.string().default(""),
      })
    )
    .default([]),
  concerns: z
    .array(
      z.object({
        title: z.string().default(""),
        detail: z.string().default(""),
      })
    )
    .default([]),
  recommendation: z.string(),
  growth_plan: z.array(z.string()).default([]),
});

const REPORT_SYSTEM = `You are a hiring manager writing the final HIRING DECISION REPORT after an interview. Base it STRICTLY on: the job description, the candidate's CV, and the recorded interview answers + per-question scores. Be specific and evidence-based, citing what the candidate actually said.

Produce:
- "verdict": a crisp one-line decision incl. level if relevant (e.g. "Conditional Hire — Junior AI Engineer with a 6-month growth plan", "Strong Hire — Senior Backend Engineer", "No Hire").
- "decision": one of strong_hire | hire | conditional_hire | no_hire.
- "overall_score": 0–5 weighted overall.
- "summary": 3–5 sentence executive summary of the decision and reasoning.
- "scorecard": the dimensions evaluated (derive from the interview categories + JD), each 0–5 with a short evidence note. Cover technical depth, experience/delivery, role-specific areas, communication.
- "strengths": 3–6, each {title, detail} with concrete evidence from the interview/CV.
- "concerns": 3–6, each {title, detail} — gaps, risks, weak answers. Empty only if truly none.
- "recommendation": concrete next steps (advance to next round? offer at what level? reject?).
- "growth_plan": if conditional/junior, 3–6 concrete ramp/mentorship items; else empty.

Be honest and balanced — do not inflate. Return ONLY JSON with those keys.`;

export async function synthesizeHiringReport(input: {
  opening: { title: string; jdText: string };
  candidate: { name: string; headline: string | null; contentMd: string };
  interviewer: string | null;
  stage: string;
  questions: {
    category: string;
    question: string;
    answer?: string;
    score?: number | null;
    notes?: string;
  }[];
}): Promise<HiringReport> {
  const qa = input.questions
    .map(
      (q, i) =>
        `${i + 1}. [${q.category}] ${q.question}\n   Score: ${
          q.score ?? "—"
        }/5\n   Answer: ${q.answer?.trim() || "(not recorded)"}${
          q.notes?.trim() ? `\n   Interviewer notes: ${q.notes.trim()}` : ""
        }`
    )
    .join("\n\n");

  const { data } = await chatJSON(
    {
      system: REPORT_SYSTEM,
      user: `# Role: ${input.opening.title}\nStage: ${input.stage}${
        input.interviewer ? ` · Interviewer: ${input.interviewer}` : ""
      }\n\n## Job description\n${input.opening.jdText.slice(
        0,
        3000
      )}\n\n## Candidate: ${input.candidate.name}${
        input.candidate.headline ? ` — ${input.candidate.headline}` : ""
      }\nCV:\n${input.candidate.contentMd.slice(
        0,
        4000
      )}\n\n## Recorded interview\n${qa || "(no answers recorded)"}\n\nWrite the hiring decision report as JSON.`,
      maxTokens: 4000,
      temperature: 0.3,
    },
    (raw) => {
      const r = reportSchema.safeParse(raw);
      if (!r.success) throw new Error(JSON.stringify(r.error.issues.slice(0, 5)));
      return r.data;
    }
  );

  return {
    verdict: data.verdict,
    decision: data.decision,
    overallScore: Math.round(data.overall_score * 10) / 10,
    summary: data.summary,
    scorecard: data.scorecard.map((s) => ({
      dimension: s.dimension,
      score: Math.round(s.score * 10) / 10,
      note: s.note,
    })),
    strengths: data.strengths,
    concerns: data.concerns,
    recommendation: data.recommendation,
    growthPlan: data.growth_plan,
  };
}
