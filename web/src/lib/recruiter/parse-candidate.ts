import { detectKind, extractText } from "@/lib/cv/extract";

export interface ParsedCandidate {
  name: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  contentMd: string;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const NOISE_RE = /^(curriculum\s+vitae|resume|r[ée]sum[ée]|cv|profile|contact)\b/i;
const CONTENT_CAP = 20000;

/**
 * Extract a candidate from an uploaded CV file WITHOUT an LLM call (keeps bulk
 * upload fast and rate-limit-free — the screening pass does the AI work).
 * Name/email/headline come from light heuristics; the full text is kept for
 * screening.
 */
export async function parseCandidateFile(file: {
  name: string;
  type: string;
  buffer: Buffer;
}): Promise<ParsedCandidate | { error: string }> {
  const kind = detectKind(file.name, file.type);
  if (!kind) return { error: "unsupported file type" };

  let raw: string;
  try {
    raw = (await extractText(kind, file.buffer)).trim();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "couldn't read file" };
  }
  if (raw.length < 100) {
    return { error: "too little text (scanned image?)" };
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const email = raw.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null;
  const phone = raw.match(PHONE_RE)?.[0]?.trim() ?? null;

  const looksLikeName = (l: string) =>
    l.length <= 40 &&
    /[a-z]/i.test(l) &&
    !EMAIL_RE.test(l) &&
    !PHONE_RE.test(l) &&
    !NOISE_RE.test(l) &&
    l.split(/\s+/).length <= 5;

  const clean = (s: string) => s.replace(/^[#>\-*\s]+/, "").trim();
  const nameLine = lines.find(looksLikeName);
  const fallbackName = file.name
    .replace(/\.(pdf|docx|md|markdown|txt)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  const name = clean(nameLine || fallbackName) || "Candidate";

  const headlineLine = lines.find(
    (l) =>
      l !== nameLine &&
      l.length <= 80 &&
      l.length >= 6 &&
      /[a-z]/i.test(l) &&
      !EMAIL_RE.test(l) &&
      !PHONE_RE.test(l)
  );
  const headline = headlineLine ? clean(headlineLine) : null;

  return { name, email, phone, headline, contentMd: raw.slice(0, CONTENT_CAP) };
}
