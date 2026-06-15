/**
 * CV tailoring — port of modes/pdf.md content rules:
 * rewrite summary with JD keywords, reorder bullets by relevance, build
 * competency grid from JD requirements, NEVER invent experience.
 */
import { chatJSON } from "@/lib/llm/gateway";
import { parseTailoredCv, TailoredCv } from "./schema";
import { LlmUsage } from "@/lib/llm/gateway";

const TAILOR_SYSTEM_PROMPT = `You are career-ops, generating an ATS-optimized CV tailored to a specific job. You restructure and reword the candidate's REAL experience using the job's vocabulary.

## Hard rules (ethics — violating these is unacceptable)
- NEVER add skills, tools, achievements, metrics, employers, degrees, or certifications that are not in the source CV. Only reword real experience using the JD's exact vocabulary.
- Legitimate reformulation example: CV says "LLM workflows with retrieval", JD says "RAG pipelines" -> "RAG pipeline design and LLM orchestration workflows". Same fact, JD vocabulary.
- Every bullet must be traceable to the source CV.

## Tailoring strategy (6-second recruiter scan)
1. Professional Summary: 3-4 lines, keyword-dense, weave in the top 5 JD keywords naturally.
2. Core Competencies: 6-8 short keyword phrases pulled from JD requirements that the candidate genuinely has.
3. Work Experience: keep every real job (company, role, period). Reorder bullets inside each job by JD relevance (most relevant first). Inject JD keywords into existing achievements where truthful.
4. Projects: select the 3-4 most relevant to this JD (omit section if the CV has none).
5. Education / Certifications / Skills: carry over from the CV, JD-relevant items first.
6. Paper format: "letter" if the company/role is US or Canada based, otherwise "a4".

## Writing rules
- No cliches: never "passionate about", "results-oriented", "proven track record", "leveraged", "spearheaded", "synergies", "robust", "seamless", "cutting-edge".
- Prefer specifics over abstractions; keep the candidate's real metrics exactly as written.
- Vary bullet openings; short punchy sentences; active voice; plain ASCII punctuation.

## Output
Return ONLY a JSON object:
{
  "paper_format": "letter" | "a4",
  "summary": "3-4 line professional summary",
  "competencies": ["6-8 keyword phrases"],
  "experience": [{ "company": "", "role": "", "period": "", "location": "" or null, "bullets": ["reordered, keyword-injected bullets"] }],
  "projects": [{ "title": "", "badge": "optional short tag or null", "description": "", "tech": "comma-separated stack or null" }],
  "education": [{ "title": "", "org": "", "year": "or null", "desc": "or null" }],
  "certifications": [{ "title": "", "org": "", "year": "or null" }],
  "skills": [{ "category": "", "items": "comma-separated" }],
  "keywords_used": ["JD keywords you actually worked into the CV"],
  "change_log": ["4-8 short, concrete notes on what you changed vs the source CV and why — e.g. 'Rewrote summary to lead with platform reliability; added JD terms: Kubernetes, SLO' or 'Moved eval-harness bullet to top of Acme AI role (JD asks for LLM evaluation)'. Be specific enough that the candidate can verify each change."]
}
Keep the whole response under ~2500 tokens.`;

export async function tailorCv(args: {
  cvMarkdown: string;
  jdContext: string;
  companyName: string;
  role: string;
  archetype?: string | null;
}): Promise<{ cv: TailoredCv; usage: LlmUsage }> {
  // Caps keep prompt + completion inside free-tier TPM windows. The CV cap is
  // generous (it is the content source for the PDF); the JD just guides wording.
  const cv =
    args.cvMarkdown.length > 9000
      ? `${args.cvMarkdown.slice(0, 9000)}\n[CV truncated for length]`
      : args.cvMarkdown;
  const jd =
    args.jdContext.length > 4000
      ? `${args.jdContext.slice(0, 4000)}\n[JD truncated for length]`
      : args.jdContext;

  const user = `# Source CV (the only source of truth)

${cv}

# Target job

Company: ${args.companyName}
Role: ${args.role}${args.archetype ? `\nArchetype: ${args.archetype}` : ""}

${jd}

Tailor the CV to this job. Return the JSON object only.`;

  const { data, usage } = await chatJSON(
    { system: TAILOR_SYSTEM_PROMPT, user },
    parseTailoredCv
  );
  return { cv: data, usage };
}
