/**
 * Tailored CV → ATS PDF HTML. Styled to match the visual language of the
 * in-app builder preview (ResumePreview): classic black-on-white document,
 * centered uppercase name + contact row, uppercase section titles with a
 * black underline. DM Sans throughout (self-hosted, inlined). Keeps the CV
 * consistent whether the user views it in the builder or downloads it.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { TailoredCv } from "./schema";
import { safe } from "./ats";

export interface CvHeaderInfo {
  name: string;
  label?: string;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  location?: string | null;
}

let fontCss: string | null = null;

function loadFontCss(): string {
  if (fontCss) return fontCss;
  const dir = join(process.cwd(), "assets", "fonts");
  const dataUrl = (file: string) =>
    `data:font/woff2;base64,${readFileSync(join(dir, file)).toString("base64")}`;
  fontCss = `
  @font-face { font-family: 'DM Sans'; src: url('${dataUrl("dm-sans-latin.woff2")}') format('woff2'); font-weight: 100 1000; font-style: normal; }
  @font-face { font-family: 'DM Sans'; src: url('${dataUrl("dm-sans-latin-ext.woff2")}') format('woff2'); font-weight: 100 1000; font-style: normal; unicode-range: U+0100-02AF, U+1E00-1E9F; }`;
  return fontCss;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function renderCvHtml(header: CvHeaderInfo, cv: TailoredCv): string {
  const pageWidth = cv.paper_format === "letter" ? "8.5in" : "210mm";

  // Contact row: location · phone · email · links, joined with " | "
  const contactParts: string[] = [];
  if (header.location) contactParts.push(safe(header.location));
  if (header.phone) contactParts.push(safe(header.phone));
  if (header.email) contactParts.push(safe(header.email));
  if (header.portfolioUrl)
    contactParts.push(`<a href="${safe(header.portfolioUrl)}">${safe(displayUrl(header.portfolioUrl))}</a>`);
  if (header.githubUrl)
    contactParts.push(`<a href="${safe(header.githubUrl)}">${safe(displayUrl(header.githubUrl))}</a>`);
  if (header.linkedinUrl)
    contactParts.push(`<a href="${safe(header.linkedinUrl)}">${safe(displayUrl(header.linkedinUrl))}</a>`);
  const contactRow = contactParts.join('<span class="sep">|</span>');

  const section = (title: string, body: string) =>
    body.trim() ? `<section><h2>${title}</h2>${body}</section>` : "";

  const summary = cv.summary
    ? `<p class="summary">${safe(cv.summary)}</p>`
    : "";

  const competencies = cv.competencies.length
    ? `<p>${cv.competencies.map((c) => safe(c)).join("  •  ")}</p>`
    : "";

  const experience = cv.experience
    .map((e) => {
      const bullets = e.bullets
        .filter((b) => b.trim())
        .map((b) => `<li>${safe(b)}</li>`)
        .join("");
      return `
      <div class="entry">
        <div class="row">
          <span class="org">${safe(e.company)}</span>
          <span class="when">${safe(e.period)}</span>
        </div>
        <div class="role">${safe(e.role)}${e.location ? ` <span class="loc">· ${safe(e.location)}</span>` : ""}</div>
        ${bullets ? `<ul>${bullets}</ul>` : ""}
      </div>`;
    })
    .join("");

  const skills = cv.skills.length
    ? cv.skills
        .map((s) => `<div><span class="k">${safe(s.category)}:</span> ${safe(s.items)}</div>`)
        .join("")
    : "";

  const projects = cv.projects.length
    ? `<ul class="projects">${cv.projects
        .map(
          (p) =>
            `<li><span class="k">${safe(p.title)}</span>${p.tech ? ` <span class="loc">· ${safe(p.tech)}</span>` : ""}<div>${safe(p.description)}</div></li>`
        )
        .join("")}</ul>`
    : "";

  const education = cv.education
    .map(
      (ed) => `
      <div class="row">
        <span><span class="org">${safe(ed.title)}</span>${ed.org ? ` — ${safe(ed.org)}` : ""}</span>
        ${ed.year ? `<span class="when">${safe(ed.year)}</span>` : ""}
      </div>`
    )
    .join("");

  const certifications = cv.certifications
    .map(
      (c) => `
      <div class="row">
        <span><span class="k">${safe(c.title)}</span>${c.org ? ` — ${safe(c.org)}` : ""}</span>
        ${c.year ? `<span class="when">${safe(c.year)}</span>` : ""}
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${safe(header.name)} — CV</title>
<style>
  ${loadFontCss()}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'DM Sans', sans-serif; font-size: 13px; line-height: 1.5; color: #000; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; }
  a { color: #1d4ed8; text-decoration: underline; white-space: nowrap; }

  header { text-align: center; margin-bottom: 18px; }
  header h1 { font-size: 26px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.01em; }
  header .label { font-size: 13px; margin-top: 2px; }
  .contact { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; font-size: 12px; margin-top: 6px; }
  .contact .sep { color: #000; }

  section { margin-bottom: 15px; }
  h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 7px; }

  p.summary { text-align: justify; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 3px; }
  .org { font-weight: 700; }
  .when { font-weight: 600; white-space: nowrap; }
  .role { font-style: italic; margin-bottom: 4px; }
  .loc { font-style: normal; color: #333; font-size: 11.5px; }
  .k { font-weight: 700; }
  ul { list-style: disc; padding-left: 18px; margin-top: 3px; }
  li { margin-bottom: 3px; }
  .entry { margin-bottom: 12px; break-inside: avoid; }
  ul.projects > li { margin-bottom: 7px; }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${safe(header.name)}</h1>
    ${header.label ? `<div class="label">${safe(header.label)}</div>` : ""}
    ${contactRow ? `<div class="contact">${contactRow}</div>` : ""}
  </header>
  ${section("Professional Summary", summary)}
  ${section("Core Competencies", competencies)}
  ${section("Experience", experience)}
  ${section("Technical Skills", skills)}
  ${section("Projects", projects)}
  ${section("Education", education)}
  ${section("Certifications", certifications)}
</div>
</body>
</html>`;
}
