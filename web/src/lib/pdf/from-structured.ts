/**
 * Map a builder CV (StructuredCv) straight onto the PDF render shape — no LLM,
 * no tailoring. Used for the "Download CV" of the generated CV as-is.
 */
import type { StructuredCv } from "@/lib/cv/structured";
import type { TailoredCv } from "./schema";
import type { CvHeaderInfo } from "./pdf-document";

const SKILL_LABELS: Record<string, string> = {
  programming: "Languages",
  frameworks: "Frameworks & Libraries",
  databases: "Databases",
  devOps: "DevOps & CI/CD",
  cloud: "Cloud",
  testing: "Testing",
  security: "Security",
};

const first = (...v: Array<string | null | undefined>) =>
  v.find((x) => x && x.trim())?.trim() ?? "";

export function structuredToHeader(
  cv: StructuredCv,
  profile?: Record<string, unknown> | null
): CvHeaderInfo {
  const b = cv.basics;
  const p = (profile ?? {}) as Record<string, string | null | undefined>;
  return {
    name: first(b.name, p.full_name) || "Candidate",
    label: first(b.label) || undefined,
    email: first(b.email, p.email) || null,
    phone: first(b.phone, p.phone) || null,
    linkedinUrl: first(b.links?.linkedin, p.linkedin_url) || null,
    portfolioUrl: first(b.links?.portfolio, p.portfolio_url) || null,
    githubUrl: first(b.links?.github, p.github_url) || null,
    location:
      first(
        b.location,
        [p.location_city, p.location_country].filter(Boolean).join(", ")
      ) || null,
  };
}

export function structuredToTailored(cv: StructuredCv): TailoredCv {
  const skills = Object.entries(SKILL_LABELS)
    .map(([key, category]) => ({
      category,
      items: ((cv.skills as Record<string, string[]>)[key] ?? []).join(", "),
    }))
    .filter((s) => s.items.length > 0);

  const experience = cv.experience.map((e) => {
    // Keep task/project areas legible in a flat layout: lead each group's first
    // bullet with its heading, inline.
    const grouped = e.focusAreas.flatMap((fa) => {
      const bullets = fa.bullets.filter(Boolean);
      if (bullets.length === 0) return [];
      if (!fa.heading.trim()) return bullets;
      const [head, ...rest] = bullets;
      return [`${fa.heading.trim()} — ${head}`, ...rest];
    });
    const bullets = [...e.bullets.filter(Boolean), ...grouped];
    return {
      company: e.company,
      role: e.role,
      period: e.duration,
      location: e.location ?? null,
      bullets: bullets.length > 0 ? bullets : [" "],
    };
  });

  return {
    paper_format: "a4",
    summary: cv.basics.summary?.trim() || " ",
    competencies: [],
    experience:
      experience.length > 0
        ? experience
        : [{ company: "", role: "", period: "", location: null, bullets: [" "] }],
    projects: cv.openSourceProjects
      .filter((p) => p.title.trim())
      .map((p) => ({
        title: p.title,
        badge: null,
        description: p.description,
        tech: p.link ?? null,
      })),
    education: cv.education
      .filter((ed) => ed.degree.trim() || ed.institution.trim())
      .map((ed) => ({
        title: ed.degree,
        org: ed.institution,
        year: ed.duration || null,
        desc: ed.location ?? null,
      })),
    certifications: [],
    skills,
    keywords_used: [],
    change_log: [],
  };
}
