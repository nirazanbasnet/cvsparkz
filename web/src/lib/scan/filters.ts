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

/**
 * Whole-word/token matcher: a keyword must sit on alphanumeric boundaries, so
 * short keywords don't hit substrings ("ai" matches "AI Engineer" and "(AI)"
 * but NOT "Spain"/"Claims"; "us" matches "NY, US" but not "Houston"). Symbols
 * in tech terms (c++, node.js, .net) and multi-word phrases still work.
 */
function keywordRegex(keyword: string): RegExp | null {
  const k = keyword.trim().toLowerCase();
  if (!k) return null;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i");
}

function compileKeywords(keywords: string[]): RegExp[] {
  return keywords
    .map(keywordRegex)
    .filter((re): re is RegExp => re !== null);
}

export function makeTitleFilter(positive: string[], negative: string[]) {
  const pos = compileKeywords(positive);
  const neg = compileKeywords(negative);
  return (title: string): boolean => {
    const hasPositive = pos.length === 0 || pos.some((re) => re.test(title));
    const hasNegative = neg.some((re) => re.test(title));
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
  const aa = compileKeywords(alwaysAllow);
  const al = compileKeywords(allow);
  const bl = compileKeywords(block);
  return (location: string): boolean => {
    const t = location.trim();
    if (!t) return true;
    if (aa.some((re) => re.test(t))) return true;
    if (bl.some((re) => re.test(t))) return false;
    if (al.length === 0) return true;
    return al.some((re) => re.test(t));
  };
}
