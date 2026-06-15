import type { StructuredCv } from "@/lib/cv/structured";

/* The resume document itself stays classic black-on-white (ATS-correct).
   Brand color lives only in the builder chrome, not the document. */

const SKILL_ROWS: Array<{ key: keyof StructuredCv["skills"]; label: string }> = [
  { key: "programming", label: "Languages" },
  { key: "frameworks", label: "Frameworks & Libraries" },
  { key: "databases", label: "Databases" },
  { key: "devOps", label: "DevTools & CI/CD" },
  { key: "cloud", label: "Cloud" },
  { key: "testing", label: "Testing" },
  { key: "security", label: "Security" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 border-b border-black pb-0.5 text-[13px] font-bold uppercase tracking-wide">
      {children}
    </h2>
  );
}

export function ResumePreview({ cv }: { cv: StructuredCv }) {
  const b = cv.basics;
  const contact = [b.location, b.phone, b.email].filter(Boolean);
  const links = [
    b.links?.portfolio,
    b.links?.github,
    b.links?.linkedin,
  ].filter(Boolean) as string[];

  return (
    <div
      className="mx-auto flex min-h-[1056px] w-full max-w-[816px] flex-col p-10 text-[13px] leading-relaxed shadow-2xl"
      style={{ backgroundColor: "#ffffff", color: "#000000" }}
    >
      {/* Header */}
      <div className="mb-5 text-center">
        <h1 className="mb-1 text-3xl font-bold uppercase tracking-tight">
          {b.name || "Your Name"}
        </h1>
        {b.label && <div className="mb-1 text-[13px]">{b.label}</div>}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[12px]">
          {contact.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="mr-2">|</span>}
              {c}
            </span>
          ))}
          {links.map((l, i) => (
            <span key={`l${i}`}>
              <span className="mr-2">|</span>
              <span style={{ color: "#1d4ed8" }} className="underline">
                {l.replace(/^https?:\/\//, "")}
              </span>
            </span>
          ))}
        </div>
      </div>

      {b.summary && (
        <div className="mb-4">
          <SectionTitle>Professional Summary</SectionTitle>
          <p className="text-justify">{b.summary}</p>
        </div>
      )}

      {cv.education.length > 0 && (
        <div className="mb-4">
          <SectionTitle>Education</SectionTitle>
          {cv.education.map((ed, i) => (
            <div key={i} className="mb-1 flex items-baseline justify-between gap-3">
              <div>
                <span className="font-bold">{ed.institution}</span>
                {ed.location && <span>, {ed.location}</span>}
                {ed.degree && <span> — {ed.degree}</span>}
              </div>
              {ed.duration && (
                <span className="shrink-0 font-medium">{ed.duration}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {SKILL_ROWS.some((r) => (cv.skills[r.key] ?? []).length > 0) && (
        <div className="mb-4">
          <SectionTitle>Technical Skills</SectionTitle>
          <div className="flex flex-col gap-1">
            {SKILL_ROWS.map((r) =>
              (cv.skills[r.key] ?? []).length > 0 ? (
                <div key={r.key}>
                  <span className="font-bold">{r.label}:</span>{" "}
                  {cv.skills[r.key].join(", ")}
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      {cv.experience.length > 0 && (
        <div className="mb-4">
          <SectionTitle>Professional Experience</SectionTitle>
          <div className="space-y-4">
            {cv.experience.map((exp, i) => (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[14px] font-bold">
                    {exp.company || "Company"}
                  </h3>
                  {exp.duration && <div className="font-bold">{exp.duration}</div>}
                </div>
                {exp.role && <div className="mb-1 italic">{exp.role}</div>}
                {exp.bullets.filter((x) => x.trim()).length > 0 && (
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {exp.bullets
                      .filter((x) => x.trim())
                      .map((bl, bi) => (
                        <li key={bi} className="pl-1">
                          {bl}
                        </li>
                      ))}
                  </ul>
                )}
                {exp.focusAreas.map((fa, fi) => (
                  <div key={fi} className="mb-2 mt-2">
                    {fa.heading && (
                      <h4 className="mb-1 text-[13px] font-bold">{fa.heading}</h4>
                    )}
                    <ul className="list-disc space-y-1 pl-5">
                      {fa.bullets
                        .filter((x) => x.trim())
                        .map((bl, bi) => (
                          <li key={bi} className="pl-1">
                            {bl}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {cv.openSourceProjects.length > 0 && (
        <div className="mb-4">
          <SectionTitle>Projects</SectionTitle>
          <ul className="list-disc space-y-2 pl-5">
            {cv.openSourceProjects.map((p, i) => (
              <li key={i} className="pl-1">
                <span className="font-bold">{p.title}</span>
                {p.link && (
                  <span>
                    {" "}
                    |{" "}
                    <span style={{ color: "#1d4ed8" }} className="underline">
                      {p.link.replace(/^https?:\/\//, "")}
                    </span>
                  </span>
                )}
                {p.description && <div>{p.description}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cv.customSections.map((sec, si) =>
        sec.title ? (
          <div key={si} className="mb-4">
            <SectionTitle>{sec.title}</SectionTitle>
            <div className="space-y-3">
              {sec.items.map((it, ii) => (
                <div key={ii}>
                  {(it.heading || it.date) && (
                    <div className="flex items-baseline justify-between gap-3">
                      {it.heading && <h3 className="font-bold">{it.heading}</h3>}
                      {it.date && <div className="font-medium">{it.date}</div>}
                    </div>
                  )}
                  {it.subheading && <div className="italic">{it.subheading}</div>}
                  {it.description && <div>{it.description}</div>}
                  {it.bullets.filter((x) => x.trim()).length > 0 && (
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {it.bullets
                        .filter((x) => x.trim())
                        .map((bl, bi) => (
                          <li key={bi} className="pl-1">
                            {bl}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
