"use client";

import { useState } from "react";
import { Plus, Trash2, Wand2, Bot, Loader2, ChevronDown, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { StructuredCv } from "@/lib/cv/structured";

type Setter = (updater: (cv: StructuredCv) => StructuredCv) => void;

async function assist(payload: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/cv-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return res.ok ? (data.text as string) : null;
  } catch {
    return null;
  }
}

interface GroupResult {
  focusAreas: Array<{ heading: string; bullets: string[] }>;
  ungrouped: string[];
}

/** AI: group a role's accomplishments into task/project areas. */
async function assistGroup(payload: {
  role: string;
  company?: string;
  bullets: string[];
}): Promise<GroupResult | null> {
  try {
    const res = await fetch("/api/cv-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "group", ...payload }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    return {
      focusAreas: Array.isArray(data.focusAreas) ? data.focusAreas : [],
      ungrouped: Array.isArray(data.ungrouped) ? data.ungrouped : [],
    };
  } catch {
    return null;
  }
}

const ACCENT = "text-[hsl(187_74%_32%)]";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </Label>
  );
}

// ── Basics ───────────────────────────────────────────────────
function BasicsEditor({ cv, setCv }: { cv: StructuredCv; setCv: Setter }) {
  const [genLoading, setGenLoading] = useState(false);
  const b = cv.basics;
  const set = (field: string, value: string) =>
    setCv((c) => ({ ...c, basics: { ...c.basics, [field]: value } }));
  const setLink = (key: string, value: string) =>
    setCv((c) => ({
      ...c,
      basics: { ...c.basics, links: { ...(c.basics.links ?? {}), [key]: value } },
    }));

  async function genSummary() {
    setGenLoading(true);
    const text = await assist({ action: "summary", experience: cv.experience });
    if (text) set("summary", text);
    setGenLoading(false);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel>Full name</FieldLabel>
          <Input value={b.name} onChange={(e) => set("name", e.target.value)} placeholder="Ada Lovelace" />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Headline / title</FieldLabel>
          <Input value={b.label} onChange={(e) => set("label", e.target.value)} placeholder="Senior Backend Engineer" />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Location</FieldLabel>
          <Input value={b.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Kathmandu, Nepal" />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Phone</FieldLabel>
          <Input value={b.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Email</FieldLabel>
          <Input value={b.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <FieldLabel>GitHub</FieldLabel>
          <Input value={b.links?.github ?? ""} onChange={(e) => setLink("github", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>LinkedIn</FieldLabel>
          <Input value={b.links?.linkedin ?? ""} onChange={(e) => setLink("linkedin", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Portfolio</FieldLabel>
          <Input value={b.links?.portfolio ?? ""} onChange={(e) => setLink("portfolio", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <FieldLabel>Professional summary</FieldLabel>
          <Button variant="outline" size="sm" onClick={genSummary} disabled={genLoading}>
            {genLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
            AI write
          </Button>
        </div>
        <Textarea
          rows={4}
          value={b.summary ?? ""}
          onChange={(e) => set("summary", e.target.value)}
          placeholder="3-4 line summary — or click AI write to generate one from your experience."
        />
      </div>
    </div>
  );
}

// ── Bullet row (shared by experience) ────────────────────────
function BulletRow({
  value,
  onChange,
  onRemove,
}: {
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  const [loading, setLoading] = useState(false);
  async function improve() {
    if (value.trim().length < 5) return;
    setLoading(true);
    const text = await assist({ action: "improve", text: value });
    if (text) onChange(text);
    setLoading(false);
  }
  return (
    <div className="flex gap-2">
      <Textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Led … using … resulting in …"
        className="flex-1 text-sm"
      />
      <div className="flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={improve}
          disabled={loading || value.trim().length < 5}
          title="AI optimize this bullet"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} title="Remove">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Experience ───────────────────────────────────────────────
function ExperienceEditor({ cv, setCv }: { cv: StructuredCv; setCv: Setter }) {
  const [open, setOpen] = useState<number[]>([0]);
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<number | null>(null);
  const toggle = (i: number) => setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));

  const mut = (fn: (exp: StructuredCv["experience"]) => void) =>
    setCv((c) => {
      const exp = structuredClone(c.experience);
      fn(exp);
      return { ...c, experience: exp };
    });

  // AI: organize this role's flat accomplishments into task/project areas.
  // Grouped areas are appended to any existing ones; leftovers stay flat.
  async function group(ei: number) {
    const exp = cv.experience[ei];
    const flat = exp.bullets.map((b) => b.trim()).filter(Boolean);
    if (flat.length < 2) return;
    setGrouping(ei);
    const res = await assistGroup({
      role: exp.role || cv.basics.label || "Professional",
      company: exp.company,
      bullets: flat,
    });
    if (res && res.focusAreas.length > 0) {
      mut((e) => {
        e[ei].focusAreas = [...e[ei].focusAreas, ...res.focusAreas];
        e[ei].bullets = res.ungrouped;
      });
    }
    setGrouping(null);
  }

  async function suggest(ei: number, fi: number | null) {
    const exp = cv.experience[ei];
    const key = `${ei}-${fi}`;
    setSuggesting(key);
    const existing = fi === null ? exp.bullets : exp.focusAreas[fi].bullets;
    const text = await assist({
      action: "suggest",
      role: exp.role || cv.basics.label || "Professional",
      taskHeading: fi === null ? "" : exp.focusAreas[fi].heading,
      existingBullets: existing,
    });
    if (text) {
      mut((e) => {
        if (fi === null) e[ei].bullets.push(text);
        else e[ei].focusAreas[fi].bullets.push(text);
      });
    }
    setSuggesting(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            mut((e) => e.unshift({ role: "", company: "", duration: "", focusAreas: [], bullets: [] }));
            setOpen((o) => [0, ...o.map((i) => i + 1)]);
          }}
        >
          <Plus className="size-4" /> Add role
        </Button>
      </div>

      {cv.experience.map((exp, ei) => {
        const isOpen = open.includes(ei);
        return (
          <div key={ei} className="overflow-hidden rounded-xl border bg-background">
            <button
              onClick={() => toggle(ei)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{exp.role || "Untitled role"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {exp.company || "Company"} {exp.duration && `· ${exp.duration}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    mut((arr) => arr.splice(ei, 1));
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
                <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {isOpen && (
              <div className="space-y-4 border-t p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <FieldLabel>Job title</FieldLabel>
                    <Input value={exp.role} onChange={(e) => mut((a) => { a[ei].role = e.target.value; })} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Company</FieldLabel>
                    <Input value={exp.company} onChange={(e) => mut((a) => { a[ei].company = e.target.value; })} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Duration</FieldLabel>
                    <Input value={exp.duration} placeholder="Oct 2022 – Present" onChange={(e) => mut((a) => { a[ei].duration = e.target.value; })} />
                  </div>
                </div>

                {/* Flat bullets */}
                <div className="space-y-2">
                  <FieldLabel>Accomplishments</FieldLabel>
                  {exp.bullets.map((bl, bi) => (
                    <BulletRow
                      key={bi}
                      value={bl}
                      onChange={(v) => mut((a) => { a[ei].bullets[bi] = v; })}
                      onRemove={() => mut((a) => { a[ei].bullets.splice(bi, 1); })}
                    />
                  ))}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => suggest(ei, null)}
                      disabled={suggesting === `${ei}-null`}
                    >
                      {suggesting === `${ei}-null` ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
                      AI suggest bullet
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => mut((a) => { a[ei].bullets.push(""); })}>
                      <Plus className="size-3.5" /> Manual
                    </Button>
                  </div>
                </div>

                {/* AI: sort the flat accomplishments above into task/project areas */}
                {exp.bullets.length >= 2 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed text-[hsl(187_74%_32%)]"
                    onClick={() => group(ei)}
                    disabled={grouping === ei}
                    title="Let AI organize these accomplishments into task / project areas"
                  >
                    {grouping === ei ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Layers className="size-3.5" />
                    )}
                    {grouping === ei
                      ? "Grouping…"
                      : "AI: group into task / project areas"}
                  </Button>
                )}

                {/* Task / project areas */}
                {exp.focusAreas.map((fa, fi) => (
                  <div key={fi} className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={fa.heading}
                        placeholder="Task / project area (e.g. Payments platform, CI/CD)"
                        className={`flex-1 font-medium ${ACCENT}`}
                        onChange={(e) => mut((a) => { a[ei].focusAreas[fi].heading = e.target.value; })}
                      />
                      <Button variant="ghost" size="icon-sm" onClick={() => mut((a) => { a[ei].focusAreas.splice(fi, 1); })}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    {fa.bullets.map((bl, bi) => (
                      <BulletRow
                        key={bi}
                        value={bl}
                        onChange={(v) => mut((a) => { a[ei].focusAreas[fi].bullets[bi] = v; })}
                        onRemove={() => mut((a) => { a[ei].focusAreas[fi].bullets.splice(bi, 1); })}
                      />
                    ))}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => suggest(ei, fi)} disabled={suggesting === `${ei}-${fi}`}>
                        {suggesting === `${ei}-${fi}` ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
                        AI suggest
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => mut((a) => { a[ei].focusAreas[fi].bullets.push(""); })}>
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed"
                  onClick={() => mut((a) => { a[ei].focusAreas.push({ heading: "", bullets: [] }); })}
                >
                  <Plus className="size-3.5" /> Add task / project area
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Education ────────────────────────────────────────────────
function EducationEditor({ cv, setCv }: { cv: StructuredCv; setCv: Setter }) {
  const mut = (fn: (a: StructuredCv["education"]) => void) =>
    setCv((c) => {
      const ed = structuredClone(c.education);
      fn(ed);
      return { ...c, education: ed };
    });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => mut((a) => a.push({ institution: "", location: "", degree: "", duration: "" }))}>
          <Plus className="size-4" /> Add education
        </Button>
      </div>
      {cv.education.map((ed, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-4">
          <div className="flex justify-end">
            <Button variant="ghost" size="icon-sm" onClick={() => mut((a) => a.splice(i, 1))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><FieldLabel>Institution</FieldLabel><Input value={ed.institution} onChange={(e) => mut((a) => { a[i].institution = e.target.value; })} /></div>
            <div className="space-y-1.5"><FieldLabel>Degree</FieldLabel><Input value={ed.degree} onChange={(e) => mut((a) => { a[i].degree = e.target.value; })} /></div>
            <div className="space-y-1.5"><FieldLabel>Location</FieldLabel><Input value={ed.location ?? ""} onChange={(e) => mut((a) => { a[i].location = e.target.value; })} /></div>
            <div className="space-y-1.5"><FieldLabel>Duration</FieldLabel><Input value={ed.duration} onChange={(e) => mut((a) => { a[i].duration = e.target.value; })} /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Skills (comma-separated → arrays) ────────────────────────
const SKILL_FIELDS: Array<{ key: keyof StructuredCv["skills"]; label: string }> = [
  { key: "programming", label: "Languages" },
  { key: "frameworks", label: "Frameworks & Libraries" },
  { key: "databases", label: "Databases" },
  { key: "devOps", label: "DevOps & CI/CD" },
  { key: "cloud", label: "Cloud" },
  { key: "testing", label: "Testing" },
  { key: "security", label: "Security" },
];

function SkillsEditor({ cv, setCv }: { cv: StructuredCv; setCv: Setter }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Comma-separated. Empty categories are hidden from the resume.</p>
      {SKILL_FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1.5">
          <FieldLabel>{label}</FieldLabel>
          <Input
            value={(cv.skills[key] ?? []).join(", ")}
            placeholder="e.g. TypeScript, Python, Go"
            onChange={(e) =>
              setCv((c) => ({
                ...c,
                skills: {
                  ...c.skills,
                  [key]: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                },
              }))
            }
          />
        </div>
      ))}
    </div>
  );
}

// ── Projects ─────────────────────────────────────────────────
function ProjectsEditor({ cv, setCv }: { cv: StructuredCv; setCv: Setter }) {
  const mut = (fn: (a: StructuredCv["openSourceProjects"]) => void) =>
    setCv((c) => {
      const p = structuredClone(c.openSourceProjects);
      fn(p);
      return { ...c, openSourceProjects: p };
    });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => mut((a) => a.push({ title: "", link: "", description: "" }))}>
          <Plus className="size-4" /> Add project
        </Button>
      </div>
      {cv.openSourceProjects.map((p, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-4">
          <div className="flex justify-end">
            <Button variant="ghost" size="icon-sm" onClick={() => mut((a) => a.splice(i, 1))}><Trash2 className="size-4" /></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><FieldLabel>Title</FieldLabel><Input value={p.title} onChange={(e) => mut((a) => { a[i].title = e.target.value; })} /></div>
            <div className="space-y-1.5"><FieldLabel>Link</FieldLabel><Input value={p.link ?? ""} onChange={(e) => mut((a) => { a[i].link = e.target.value; })} /></div>
          </div>
          <div className="space-y-1.5"><FieldLabel>Description</FieldLabel><Textarea rows={2} value={p.description} onChange={(e) => mut((a) => { a[i].description = e.target.value; })} /></div>
        </div>
      ))}
    </div>
  );
}

// ── Custom sections ──────────────────────────────────────────
function CustomSectionsEditor({ cv, setCv }: { cv: StructuredCv; setCv: Setter }) {
  const mut = (fn: (a: StructuredCv["customSections"]) => void) =>
    setCv((c) => {
      const s = structuredClone(c.customSections);
      fn(s);
      return { ...c, customSections: s };
    });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => mut((a) => a.push({ title: "", items: [{ heading: "", description: "", bullets: [] }] }))}>
          <Plus className="size-4" /> Add section
        </Button>
      </div>
      {cv.customSections.map((sec, si) => (
        <div key={si} className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <Input value={sec.title} placeholder="Section title (e.g. Certifications)" className="flex-1 font-medium" onChange={(e) => mut((a) => { a[si].title = e.target.value; })} />
            <Button variant="ghost" size="icon-sm" onClick={() => mut((a) => a.splice(si, 1))}><Trash2 className="size-4" /></Button>
          </div>
          {sec.items.map((it, ii) => (
            <div key={ii} className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={it.heading ?? ""} placeholder="Heading" onChange={(e) => mut((a) => { a[si].items[ii].heading = e.target.value; })} />
                <Input value={it.date ?? ""} placeholder="Date" onChange={(e) => mut((a) => { a[si].items[ii].date = e.target.value; })} />
              </div>
              <Textarea rows={2} value={it.description ?? ""} placeholder="Description" onChange={(e) => mut((a) => { a[si].items[ii].description = e.target.value; })} />
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => mut((a) => { a[si].items.splice(ii, 1); })}><Trash2 className="size-3.5" /> Remove item</Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => mut((a) => { a[si].items.push({ heading: "", description: "", bullets: [] }); })}>
            <Plus className="size-3.5" /> Add item
          </Button>
        </div>
      ))}
    </div>
  );
}

export const BUILDER_TABS = [
  { id: "basics", label: "Basics" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "projects", label: "Projects" },
  { id: "custom", label: "Custom" },
] as const;

export function SectionEditor({
  tab,
  cv,
  setCv,
}: {
  tab: string;
  cv: StructuredCv;
  setCv: Setter;
}) {
  switch (tab) {
    case "basics":
      return <BasicsEditor cv={cv} setCv={setCv} />;
    case "experience":
      return <ExperienceEditor cv={cv} setCv={setCv} />;
    case "education":
      return <EducationEditor cv={cv} setCv={setCv} />;
    case "skills":
      return <SkillsEditor cv={cv} setCv={setCv} />;
    case "projects":
      return <ProjectsEditor cv={cv} setCv={setCv} />;
    case "custom":
      return <CustomSectionsEditor cv={cv} setCv={setCv} />;
    default:
      return null;
  }
}
