/**
 * Structured CV model (ported & adapted from CV Spark's GoldStandardResume).
 * This is the builder's source of truth; `structuredToMarkdown` derives the
 * canonical markdown that the evaluation, scan role-filter, and PDF pipelines
 * already consume — so nothing downstream changes.
 */
import { z } from "zod";

const linksSchema = z
  .object({
    github: z.string().nullish(),
    linkedin: z.string().nullish(),
    portfolio: z.string().nullish(),
  })
  .nullish();

const focusAreaSchema = z.object({
  heading: z.string().default(""),
  bullets: z.array(z.string()).default([]),
});

const experienceSchema = z.object({
  role: z.string().default(""),
  company: z.string().default(""),
  duration: z.string().default(""),
  location: z.string().nullish(),
  focusAreas: z.array(focusAreaSchema).default([]),
  bullets: z.array(z.string()).default([]),
});

const educationSchema = z.object({
  institution: z.string().default(""),
  location: z.string().nullish(),
  degree: z.string().default(""),
  duration: z.string().default(""),
});

const projectSchema = z.object({
  title: z.string().default(""),
  link: z.string().nullish(),
  description: z.string().default(""),
});

const customItemSchema = z.object({
  heading: z.string().nullish(),
  subheading: z.string().nullish(),
  date: z.string().nullish(),
  description: z.string().nullish(),
  bullets: z.array(z.string()).default([]),
});

const customSectionSchema = z.object({
  title: z.string().default(""),
  items: z.array(customItemSchema).default([]),
});

export const structuredCvSchema = z.object({
  basics: z
    .object({
      name: z.string().default(""),
      label: z.string().default(""),
      location: z.string().nullish(),
      email: z.string().nullish(),
      phone: z.string().nullish(),
      summary: z.string().nullish(),
      links: linksSchema,
    })
    .default({ name: "", label: "" }),
  skills: z
    .object({
      programming: z.array(z.string()).default([]),
      frameworks: z.array(z.string()).default([]),
      devOps: z.array(z.string()).default([]),
      testing: z.array(z.string()).default([]),
      security: z.array(z.string()).default([]),
      cloud: z.array(z.string()).default([]),
      databases: z.array(z.string()).default([]),
    })
    .default({
      programming: [],
      frameworks: [],
      devOps: [],
      testing: [],
      security: [],
      cloud: [],
      databases: [],
    }),
  experience: z.array(experienceSchema).default([]),
  education: z.array(educationSchema).default([]),
  openSourceProjects: z.array(projectSchema).default([]),
  customSections: z.array(customSectionSchema).default([]),
});

export type StructuredCv = z.infer<typeof structuredCvSchema>;

export function parseStructuredCv(raw: unknown): StructuredCv {
  return structuredCvSchema.parse(raw ?? {});
}

/** True when the object actually holds CV content (vs the empty `{}` default). */
export function hasStructuredContent(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const cv = raw as Partial<StructuredCv>;
  return Boolean(
    cv.basics?.name ||
      (cv.experience && cv.experience.length > 0) ||
      (cv.education && cv.education.length > 0)
  );
}

const SKILL_LABELS: Record<string, string> = {
  programming: "Programming",
  frameworks: "Frameworks",
  devOps: "DevOps",
  testing: "Testing",
  security: "Security",
  cloud: "Cloud",
  databases: "Databases",
};

/**
 * Render structured CV → clean markdown (the canonical format the eval/scan/
 * PDF pipelines already read). Keep this lossless enough that re-importing
 * the markdown would reconstruct the same sections.
 */
export function structuredToMarkdown(cv: StructuredCv): string {
  const out: string[] = [];
  const b = cv.basics;

  if (b.name) out.push(`# ${b.name}`);
  if (b.label) out.push(`**${b.label}**`);

  const contact = [b.email, b.phone, b.location].filter(Boolean);
  const links = b.links
    ? [
        b.links.github && `GitHub: ${b.links.github}`,
        b.links.linkedin && `LinkedIn: ${b.links.linkedin}`,
        b.links.portfolio && `Portfolio: ${b.links.portfolio}`,
      ].filter(Boolean)
    : [];
  if (contact.length) out.push(contact.join(" · "));
  if (links.length) out.push(links.join(" · "));

  if (b.summary) {
    out.push("\n## Summary", b.summary);
  }

  // Skills
  const skillLines: string[] = [];
  for (const [key, label] of Object.entries(SKILL_LABELS)) {
    const arr = (cv.skills as Record<string, string[]>)[key] ?? [];
    if (arr.length) skillLines.push(`- **${label}:** ${arr.join(", ")}`);
  }
  if (skillLines.length) out.push("\n## Skills", ...skillLines);

  // Experience
  if (cv.experience.length) {
    out.push("\n## Experience");
    for (const e of cv.experience) {
      const head = [e.role, e.company].filter(Boolean).join(" — ");
      out.push(`\n### ${head}${e.duration ? ` (${e.duration})` : ""}`);
      if (e.location) out.push(`*${e.location}*`);
      for (const fa of e.focusAreas) {
        if (fa.heading) out.push(`\n**${fa.heading}**`);
        for (const bl of fa.bullets) out.push(`- ${bl}`);
      }
      for (const bl of e.bullets) out.push(`- ${bl}`);
    }
  }

  // Projects
  if (cv.openSourceProjects.length) {
    out.push("\n## Projects");
    for (const p of cv.openSourceProjects) {
      const head = p.link ? `${p.title} (${p.link})` : p.title;
      out.push(`\n### ${head}`);
      if (p.description) out.push(p.description);
    }
  }

  // Education
  if (cv.education.length) {
    out.push("\n## Education");
    for (const ed of cv.education) {
      const head = [ed.degree, ed.institution].filter(Boolean).join(" — ");
      out.push(`\n### ${head}${ed.duration ? ` (${ed.duration})` : ""}`);
      if (ed.location) out.push(`*${ed.location}*`);
    }
  }

  // Custom sections
  for (const sec of cv.customSections) {
    if (!sec.title) continue;
    out.push(`\n## ${sec.title}`);
    for (const it of sec.items) {
      const head = [it.heading, it.subheading].filter(Boolean).join(" — ");
      if (head) out.push(`\n### ${head}${it.date ? ` (${it.date})` : ""}`);
      if (it.description) out.push(it.description);
      for (const bl of it.bullets) out.push(`- ${bl}`);
    }
  }

  return out.join("\n").trim();
}
