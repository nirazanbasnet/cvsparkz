/**
 * Title + location filters — semantics ported from the CLI scanner
 * (scan.mjs + portals.example.yml).
 */

const SENIORITY_WORDS = new Set([
  "senior", "sr", "junior", "jr", "staff", "lead", "principal", "head",
  "intern", "mid", "mid-level", "associate", "chief", "vp", "director",
]);
// Too generic to filter on alone — only used when nothing better remains.
const GENERIC_WORDS = new Set([
  "engineer", "developer", "manager", "specialist", "analyst", "consultant",
  "architect", "of", "the", "and",
]);

/**
 * Derive title-filter keywords from a CV's role title:
 *   "Senior Backend Engineer" → ["backend"]
 *   "AI Engineer"             → ["ai"]
 *   "Software Engineer"       → ["software engineer"]  (nothing specific left)
 */
export function deriveTitleKeywords(roleTitle: string): string[] {
  const words = roleTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !SENIORITY_WORDS.has(w));
  const specific = words.filter((w) => !GENERIC_WORDS.has(w));
  if (specific.length > 0) return specific;
  const phrase = words.join(" ").trim();
  return phrase ? [phrase] : [];
}

export function makeTitleFilter(positive: string[], negative: string[]) {
  const pos = positive.map((k) => k.toLowerCase()).filter(Boolean);
  const neg = negative.map((k) => k.toLowerCase()).filter(Boolean);
  return (title: string): boolean => {
    const lower = title.toLowerCase();
    const hasPositive = pos.length === 0 || pos.some((k) => lower.includes(k));
    const hasNegative = neg.some((k) => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

/**
 * Order matters (case-insensitive substring):
 *   empty location → pass; always_allow match → pass; block match → reject;
 *   allow empty → pass; else must match allow.
 */
export function makeLocationFilter(
  alwaysAllow: string[],
  allow: string[],
  block: string[]
) {
  const aa = alwaysAllow.map((k) => k.toLowerCase()).filter(Boolean);
  const al = allow.map((k) => k.toLowerCase()).filter(Boolean);
  const bl = block.map((k) => k.toLowerCase()).filter(Boolean);
  return (location: string): boolean => {
    const lower = location.toLowerCase().trim();
    if (!lower) return true;
    if (aa.some((k) => lower.includes(k))) return true;
    if (bl.some((k) => lower.includes(k))) return false;
    if (al.length === 0) return true;
    return al.some((k) => lower.includes(k));
  };
}
