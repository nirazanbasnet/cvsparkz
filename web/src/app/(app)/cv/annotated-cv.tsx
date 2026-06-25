"use client";

import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * "Recruiter's eye" — renders a parsed CV as a printed sheet that a recruiter
 * marks up by hand: the name gets circled, the current title highlighted,
 * standout metrics underlined, and metric-carrying bullets starred in the
 * margin. Marks are hand-drawn SVG strokes that draw themselves in, in reading
 * order (delays are computed during the build pass, so render stays pure).
 *
 * Source of truth is the CV markdown — no extra LLM call — so it works for any
 * saved CV regardless of whether structured data exists.
 */

// ── Hand-drawn stroke paths (irregular on purpose). pathLength=1 normalizes
//    the draw-in animation across every path length. ────────────────────────
const UNDERLINES = [
  "M1,6 C18,2 34,9 52,5 C70,1 84,8 99,4",
  "M1,5 C20,9 40,2 60,7 C76,11 88,3 99,6",
  "M1,7 C16,3 32,8 48,5 C66,2 82,9 99,5",
];
const CIRCLE_PATH =
  "M16,46 C12,18 64,8 116,10 C174,12 214,24 207,48 C201,70 146,83 96,81 C46,79 11,71 17,43 C20,29 33,22 49,18";
const STAR_PATH =
  "M12,2.6 L14.5,9.1 L21.4,9.5 L16,13.9 L17.8,20.6 L12,16.6 L6.2,20.6 L8,13.9 L2.6,9.5 L9.5,9.1 Z";

// Stagger draw-in by creation (≈ reading) order, capped so it never drags.
function delayFor(order: number): CSSProperties {
  return { "--d": `${Math.min(order * 95, 1700)}ms` } as CSSProperties;
}

// ── Inline mark components (pure: delay/variant arrive as props) ────────────
function Underline({ children, style, variant }: { children: ReactNode; style: CSSProperties; variant: number }) {
  return (
    <span className="cv-u" style={style}>
      {children}
      <svg className="cv-u-svg" viewBox="0 0 100 12" fill="none" preserveAspectRatio="none" aria-hidden>
        <path className="cv-ink" pathLength={1} d={UNDERLINES[variant % UNDERLINES.length]} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

function CircleMark({ children, style }: { children: ReactNode; style: CSSProperties }) {
  return (
    <span className="cv-circle">
      {children}
      <svg className="cv-circle-svg" viewBox="0 0 224 92" fill="none" preserveAspectRatio="none" aria-hidden style={style}>
        <path className="cv-ink" pathLength={1} d={CIRCLE_PATH} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

function HighlightMark({ children, style }: { children: ReactNode; style: CSSProperties }) {
  return (
    <span className="cv-hl" style={style}>
      <span className="cv-hl-ink" aria-hidden />
      <span className="cv-hl-text">{children}</span>
    </span>
  );
}

function MarginStar({ style }: { style: CSSProperties }) {
  return (
    <span className="cv-star" style={style} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none">
        <path className="cv-star-ink" pathLength={1} d={STAR_PATH} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

// ── Markdown → blocks ───────────────────────────────────────────────────────
type Block =
  | { t: "name"; text: string }
  | { t: "title"; text: string }
  | { t: "contact"; text: string }
  | { t: "section"; text: string }
  | { t: "entry"; text: string }
  | { t: "subtle"; text: string }
  | { t: "bullet"; text: string }
  | { t: "para"; text: string };

function parseCv(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let nameSeen = false;
  let sectionSeen = false;
  let titleSet = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^#\s+/.test(line)) {
      const text = line.replace(/^#\s+/, "");
      if (!nameSeen) {
        blocks.push({ t: "name", text });
        nameSeen = true;
      } else {
        blocks.push({ t: "section", text });
        sectionSeen = true;
      }
      continue;
    }
    if (/^##\s+/.test(line)) {
      blocks.push({ t: "section", text: line.replace(/^#{2}\s+/, "") });
      sectionSeen = true;
      continue;
    }
    if (/^###\s+/.test(line)) {
      blocks.push({ t: "entry", text: line.replace(/^#{3}\s+/, "") });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      blocks.push({ t: "bullet", text: line.replace(/^[-*]\s+/, "") });
      continue;
    }
    // Title = a bold-only line, or the short line right after the name.
    if (!titleSet && !sectionSeen && /^\*\*(.+)\*\*$/.test(line)) {
      blocks.push({ t: "title", text: line.replace(/^\*\*(.+)\*\*$/, "$1") });
      titleSet = true;
      continue;
    }
    if (
      !titleSet &&
      !sectionSeen &&
      blocks[blocks.length - 1]?.t === "name" &&
      line.length <= 70 &&
      !line.includes("@") &&
      !/https?:\/\//i.test(line)
    ) {
      blocks.push({ t: "title", text: line });
      titleSet = true;
      continue;
    }
    if (/^\*(?!\*)(.+)\*$/.test(line)) {
      blocks.push({ t: "subtle", text: line.replace(/^\*(.+)\*$/, "$1") });
      continue;
    }
    if (
      !sectionSeen &&
      (line.includes("@") ||
        /https?:\/\//i.test(line) ||
        line.includes("·") ||
        /\b(LinkedIn|GitHub|Portfolio)\b/i.test(line))
    ) {
      blocks.push({ t: "contact", text: line });
      continue;
    }
    blocks.push({ t: "para", text: line });
  }
  return blocks;
}

// ── Metric detection: only numbers with a real qualifier ($, %, x, +, k/m/bn,
//    or an impact unit). Bare years/counts are left unmarked to avoid noise. ──
function splitMetrics(text: string): Array<{ s: string; metric: boolean }> {
  const re =
    /(\$)?(\d[\d.,]*)\s?(%|×|x|\+|k|m|bn|billion|million|users?|customers?|clients?|requests?|years?|yrs?|months?|weeks?|days?|hours?|hrs?|fold)?/gi;
  const parts: Array<{ s: string; metric: boolean }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (!(m[1] || m[3])) continue; // no qualifier → not a standout metric
    if (m.index > last) parts.push({ s: text.slice(last, m.index), metric: false });
    parts.push({ s: m[0], metric: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ s: text.slice(last), metric: false });
  if (parts.length === 0) parts.push({ s: text, metric: false });
  return parts;
}

function hasMetric(text: string): boolean {
  return splitMetrics(text).some((p) => p.metric);
}

// Strong résumé verbs a recruiter's eye lands on first — the "what you did".
const STRONG_VERBS = new Set([
  "led", "built", "scaled", "reduced", "launched", "architected", "owned",
  "drove", "shipped", "designed", "improved", "increased", "cut", "grew",
  "migrated", "automated", "delivered", "spearheaded", "mentored", "managed",
  "created", "developed", "implemented", "optimized", "established", "founded",
  "streamlined", "accelerated", "transformed", "redesigned", "engineered",
  "orchestrated", "pioneered", "negotiated", "secured", "generated", "saved",
  "boosted", "expanded", "initiated", "oversaw", "coordinated", "directed",
  "produced", "championed", "executed", "refactored", "deployed", "integrated",
  "analyzed", "resolved", "rebuilt", "doubled", "tripled",
]);

function isSkillsSection(title: string): boolean {
  return /skill|technical|technolog|tool|stack|competenc|proficienc|expertise|language|framework/i.test(
    title
  );
}

/** A strong verb leading a bullet → highlight it (the action), keep the rest. */
function leadingVerb(text: string): { verb: string; sep: string; rest: string } | null {
  const m = /^([A-Za-z]+)(\s+)([\s\S]*)$/.exec(text);
  if (m && STRONG_VERBS.has(m[1].toLowerCase())) {
    return { verb: m[1], sep: m[2], rest: m[3] };
  }
  return null;
}

// ── Build the annotated tree. A local counter assigns draw-in order; caps keep
//    the markup tasteful (a recruiter marks the best few, not everything).
function buildTree(blocks: Block[], on: boolean) {
  let order = 0;
  let underlines = 0;
  let verbHl = 0;
  let skillHl = 0;
  let stars = 0;
  const MAX_UNDERLINES = 12;
  const MAX_VERB_HL = 7;
  const MAX_SKILL_HL = 120; // highlight the whole skills scan, not a handful
  const MAX_STARS = 5;

  // Inline markdown (**bold**, *italic*, [text](url)) → nodes, with optional
  // metric underlines applied to plain runs.
  function inline(text: string, annotateMetrics: boolean, keyBase: string): ReactNode[] {
    const tokenRe = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
    const out: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    const plain = (str: string) => {
      if (!str) return;
      if (!annotateMetrics) {
        out.push(<Fragment key={`${keyBase}-t${k++}`}>{str}</Fragment>);
        return;
      }
      for (const part of splitMetrics(str)) {
        if (part.metric && on && underlines < MAX_UNDERLINES) {
          out.push(
            <Underline key={`${keyBase}-u${k++}`} style={delayFor(order++)} variant={underlines++}>
              {part.s}
            </Underline>
          );
        } else {
          out.push(<Fragment key={`${keyBase}-t${k++}`}>{part.s}</Fragment>);
        }
      }
    };

    while ((m = tokenRe.exec(text)) !== null) {
      if (m.index > last) plain(text.slice(last, m.index));
      if (m[1]) {
        out.push(
          <strong key={`${keyBase}-b${k++}`} className="font-semibold text-[#1C1A16]">
            {inline(m[2], annotateMetrics, `${keyBase}-b${k}`)}
          </strong>
        );
      } else if (m[3]) {
        out.push(
          <em key={`${keyBase}-i${k++}`} className="italic">
            {m[4]}
          </em>
        );
      } else if (m[5]) {
        out.push(
          <a key={`${keyBase}-a${k++}`} href={m[7]} target="_blank" rel="noreferrer" className="text-[#15594E] underline underline-offset-2">
            {m[6]}
          </a>
        );
      }
      last = tokenRe.lastIndex;
    }
    if (last < text.length) plain(text.slice(last));
    return out;
  }

  // A "Skills" line — usually "**Category:** a, b, c". Render the bold label
  // properly (markdown, not raw **) and run the highlighter over each term.
  function renderSkillLine(text: string, keyBase: string): ReactNode[] {
    const out: ReactNode[] = [];
    let rest = text.trim();

    // Leading label: bold "**Category:**" / "**Category**:" or plain "Category:".
    let label: string | null = null;
    const boldLab = /^\*\*\s*([^*]+?)\s*\*\*\s*:?\s*/.exec(rest);
    if (boldLab) {
      label = boldLab[1].replace(/\s*:\s*$/, "");
      rest = rest.slice(boldLab[0].length);
    } else {
      const plainLab = /^([A-Za-z][\w +/&-]*?):\s+/.exec(rest);
      if (plainLab) {
        label = plainLab[1];
        rest = rest.slice(plainLab[0].length);
      }
    }
    if (label) {
      out.push(
        <strong key={`${keyBase}-lab`} className="font-semibold text-[#1C1A16]">
          {label}:{" "}
        </strong>
      );
    }

    // Split the remaining terms on commas (parenthetical notes stay attached).
    const tokens = rest.split(",").map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0 && rest.trim()) tokens.push(rest.trim());
    tokens.forEach((tok, idx) => {
      if (on && skillHl < MAX_SKILL_HL) {
        out.push(
          <HighlightMark key={`${keyBase}-s${idx}`} style={delayFor(order++)}>
            {inline(tok, false, `${keyBase}-s${idx}`)}
          </HighlightMark>
        );
        skillHl++;
      } else {
        out.push(
          <Fragment key={`${keyBase}-s${idx}`}>{inline(tok, false, `${keyBase}-t${idx}`)}</Fragment>
        );
      }
      if (idx < tokens.length - 1) {
        out.push(<Fragment key={`${keyBase}-c${idx}`}>, </Fragment>);
      }
    });
    return out;
  }

  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  let section = "";
  while (i < blocks.length) {
    const b = blocks[i];
    const inSkills = isSkillsSection(section);

    if (b.t === "bullet") {
      const items: Block[] = [];
      while (i < blocks.length && blocks[i].t === "bullet") {
        items.push(blocks[i]);
        i++;
      }
      out.push(
        <ul key={`k${key++}`} className="cv-bullets">
          {items.map((it, j) => {
            const kb = `b${key}-${j}`;
            if (inSkills) {
              return (
                <li key={j} className="cv-bullet">
                  {renderSkillLine(it.text, kb)}
                </li>
              );
            }
            // Experience bullet: highlight the leading action verb, underline
            // metrics, and star the standout (verb or number present).
            const lv = leadingVerb(it.text);
            const useVerb = !!lv && on && verbHl < MAX_VERB_HL;
            const verbStyle = useVerb ? delayFor(order++) : null;
            if (useVerb) verbHl++;
            const useStar = on && stars < MAX_STARS && (hasMetric(it.text) || useVerb);
            const starStyle = useStar ? delayFor(order++) : null;
            if (useStar) stars++;
            return (
              <li key={j} className="cv-bullet">
                {useStar && starStyle && <MarginStar style={starStyle} />}
                {useVerb && lv && verbStyle ? (
                  <>
                    <HighlightMark style={verbStyle}>{lv.verb}</HighlightMark>
                    {lv.sep}
                    {inline(lv.rest, true, kb)}
                  </>
                ) : (
                  inline(it.text, true, kb)
                )}
              </li>
            );
          })}
        </ul>
      );
      continue;
    }

    if (b.t === "section") section = b.text;

    switch (b.t) {
      case "name":
        out.push(
          <h2 key={`k${key++}`} className="cv-name">
            {on ? <CircleMark style={delayFor(order++)}>{b.text}</CircleMark> : b.text}
          </h2>
        );
        break;
      case "title":
        out.push(
          <p key={`k${key++}`} className="cv-title">
            {on ? (
              <HighlightMark style={delayFor(order++)}>{inline(b.text, false, `ti${key}`)}</HighlightMark>
            ) : (
              inline(b.text, false, `ti${key}`)
            )}
          </p>
        );
        break;
      case "contact":
        out.push(
          <p key={`k${key++}`} className="cv-contact">
            {inline(b.text, false, `c${key}`)}
          </p>
        );
        break;
      case "section":
        out.push(
          <h3 key={`k${key++}`} className="cv-section">
            {b.text}
          </h3>
        );
        break;
      case "entry":
        out.push(
          <h4 key={`k${key++}`} className="cv-entry">
            {inline(b.text, false, `e${key}`)}
          </h4>
        );
        break;
      case "subtle":
        out.push(
          <p key={`k${key++}`} className="cv-subtle">
            {b.text}
          </p>
        );
        break;
      default:
        out.push(
          <p key={`k${key++}`} className="cv-para">
            {inSkills ? renderSkillLine(b.text, `p${key}`) : inline(b.text, true, `p${key}`)}
          </p>
        );
    }
    i++;
  }
  return out;
}

const LEGEND = [
  { cls: "bg-[#15594E]", label: "Circled — who you are" },
  { cls: "bg-[#B8893C]", label: "Highlighted — strengths & skills" },
  { cls: "bg-[#15594E]", label: "Underlined — the numbers" },
  { cls: "bg-[#BB5A33]", label: "★ Standout result" },
];

export function AnnotatedCv({
  markdown,
  version,
  headerAction,
}: {
  markdown: string;
  version?: number;
  headerAction?: ReactNode;
}) {
  const [on, setOn] = useState(true);
  const blocks = useMemo(() => parseCv(markdown), [markdown]);
  const tree = useMemo(() => buildTree(blocks, on), [blocks, on]);
  const empty = blocks.length === 0;

  return (
    <section className="rounded-xl border border-[#E6DECF] bg-[#F3EEE2]/40 p-3 sm:p-4">
      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#BB5A33]">
            Recruiter&apos;s eye
          </p>
          <p className="text-xs text-[#6E6656]">
            How a recruiter reads your CV{typeof version === "number" ? ` (saved v${version})` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <button
            type="button"
            onClick={() => setOn((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#D8CFBC] bg-[#FCFBF7] px-3 py-1.5 text-xs font-medium text-[#4A453B] transition-colors hover:bg-[#F1ECE0]"
            aria-pressed={on}
          >
            {on ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {on ? "Hide marks" : "Show marks"}
          </button>
        </div>
      </div>

      {/* legend */}
      <div className="mb-3 hidden flex-wrap items-center gap-x-4 gap-y-1.5 px-1 md:flex">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] text-[#6E6656]">
            <span className={`size-2 rounded-full ${l.cls}`} />
            {l.label}
          </span>
        ))}
      </div>

      {/* the marked-up paper */}
      <div className="cv-anim cv-paper">
        {empty ? (
          <p className="text-sm text-[#9A917F]">This CV has no saved content yet.</p>
        ) : (
          tree
        )}
      </div>
    </section>
  );
}
