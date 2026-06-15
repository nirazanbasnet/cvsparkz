/**
 * Live web research via Tavily — feeds real data into evaluation Blocks
 * D (comp & demand) and G (posting legitimacy), which otherwise run on
 * training-knowledge estimates. Activates only when TAVILY_API_KEY is set;
 * any failure degrades gracefully to the no-research path.
 */

export function isTavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

async function tavilySearch(
  query: string,
  maxResults = 4
): Promise<{ answer: string | null; results: TavilyResult[] } | null> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: maxResults,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    return {
      answer: json.answer ?? null,
      results: (json.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        content: (r.content ?? "").replace(/\s+/g, " ").trim(),
      })),
    };
  } catch {
    return null;
  }
}

const RESEARCH_CHAR_CAP = 1500; // keep the prompt inside free-tier TPM windows

function renderSection(
  heading: string,
  data: { answer: string | null; results: TavilyResult[] } | null,
  budget: number
): string {
  if (!data || (!data.answer && data.results.length === 0)) return "";
  let out = `### ${heading}\n`;
  if (data.answer) out += `${data.answer}\n`;
  for (const r of data.results.slice(0, 3)) {
    const line = `- ${r.title} (${r.url}): ${r.content.slice(0, 180)}\n`;
    if (out.length + line.length > budget) break;
    out += line;
  }
  return out;
}

/**
 * Run comp + legitimacy searches for a job. Returns a compact markdown
 * block for the eval prompt, or null when unconfigured/unavailable.
 */
export async function researchJob(args: {
  company?: string | null;
  role?: string | null;
}): Promise<string | null> {
  if (!isTavilyConfigured()) return null;
  const company = args.company?.trim();
  const role = args.role?.trim();
  if (!company && !role) return null;

  const year = new Date().getFullYear();
  const [comp, news] = await Promise.all([
    role
      ? tavilySearch(
          company ? `${company} ${role} salary` : `${role} salary range ${year}`
        )
      : Promise.resolve(null),
    company
      ? tavilySearch(`"${company}" layoffs OR "hiring freeze" ${year}`)
      : Promise.resolve(null),
  ]);

  const half = Math.floor(RESEARCH_CHAR_CAP / 2);
  const block = [
    renderSection("Salary / market data", comp, half),
    renderSection("Company hiring signals (layoffs / freezes)", news, half),
  ]
    .filter(Boolean)
    .join("\n");

  return block ? block.slice(0, RESEARCH_CHAR_CAP) : null;
}

/**
 * Best-effort company/role hints from the JD text and URL — used to build
 * research queries BEFORE the LLM has extracted the official names.
 */
export function deriveJobHints(
  jdText: string,
  url?: string | null
): { company: string | null; role: string | null } {
  let company: string | null = null;
  let role: string | null = null;

  // ATS URLs carry the company slug
  if (url) {
    const slug =
      url.match(/(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/)?.[1] ??
      url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)?.[1] ??
      url.match(/jobs\.lever\.co\/([^/?#]+)/)?.[1] ??
      url.match(/apply\.workable\.com\/([^/?#]+)/)?.[1] ??
      url.match(/jobs\.smartrecruiters\.com\/([^/?#]+)/)?.[1] ??
      url.match(/^https:\/\/([a-z0-9-]+)\.recruitee\.com/)?.[1] ??
      null;
    if (slug) company = slug.replace(/-/g, " ");
  }

  const head = jdText.slice(0, 400);
  // "Title: X" lines come from our ATS fast paths
  const titled = head.match(/^Title:\s*(.{3,80})$/m);
  if (titled) role = titled[1].trim();

  // "Senior AI Engineer — Nimbus Health" / "Engineer at Acme" patterns
  if (!role || !company) {
    const dash = head.match(/^(.{3,60}?)\s+[—–-]\s+([A-Z][\w&.' ]{2,40})/m);
    if (dash) {
      role = role ?? dash[1].trim();
      company = company ?? dash[2].trim();
    }
  }
  if (!company) {
    const at = head.match(/\bat\s+([A-Z][\w&.']+(?:\s+[A-Z][\w&.']+){0,2})/);
    if (at) company = at[1].trim();
  }

  return { company, role };
}
