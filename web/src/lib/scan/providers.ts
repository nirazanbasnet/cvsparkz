/**
 * ATS portal providers — ported from the career-ops CLI (providers/*.mjs).
 * Each provider detects support from the company's careers URL pattern and
 * fetches live postings from the ATS's public, no-auth API. Zero LLM cost.
 * SSRF guards (host allowlists + redirect:error) are preserved from the CLI.
 */
import { htmlToText } from "@/lib/html";

export interface CompanyEntry {
  name: string;
  careersUrl: string;
}

export interface ScannedJob {
  title: string;
  url: string;
  company: string;
  location: string;
  /** Full JD text when the board's list API includes it (greenhouse/ashby/
   *  lever/recruitee) — stored on the posting for scoring and evaluation. */
  jdText?: string;
}

export interface Provider {
  id: "greenhouse" | "ashby" | "lever" | "recruitee" | "smartrecruiters" | "workable";
  detect(entry: CompanyEntry): boolean;
  fetch(entry: CompanyEntry): Promise<ScannedJob[]>;
}

const UA = "Mozilla/5.0 (compatible; career-ops-cloud/0.1)";
const JD_STORE_CAP = 6000;

async function fetchJson(
  url: string,
  opts: { timeoutMs?: number; redirect?: RequestRedirect } = {}
): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    redirect: opts.redirect ?? "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchText(
  url: string,
  opts: { timeoutMs?: number; redirect?: RequestRedirect } = {}
): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    redirect: opts.redirect ?? "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── Greenhouse ───────────────────────────────────────────────
const greenhouse: Provider = {
  id: "greenhouse",
  detect: (e) =>
    /job-boards(?:\.eu)?\.greenhouse\.io\/[^/?#]+/.test(e.careersUrl) ||
    /boards\.greenhouse\.io\/[^/?#]+/.test(e.careersUrl),
  async fetch(e) {
    const match = e.careersUrl.match(
      /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/
    );
    if (!match) throw new Error("greenhouse: cannot derive board slug");
    // content=true includes each job's full description in the same call
    const json = (await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs?content=true`,
      { redirect: "error", timeoutMs: 30000 }
    )) as {
      jobs?: Array<{
        title?: string;
        absolute_url?: string;
        location?: { name?: string };
        content?: string;
      }>;
    };
    return (json.jobs ?? [])
      .filter((j) => j.absolute_url)
      .map((j) => ({
        title: j.title ?? "",
        url: j.absolute_url!,
        company: e.name,
        location: j.location?.name ?? "",
        jdText: j.content
          ? htmlToText(j.content).slice(0, JD_STORE_CAP)
          : undefined,
      }));
  },
};

// ── Ashby ────────────────────────────────────────────────────
// Public posting-api has a ~10s latency floor and rate-limits repeats:
// longer timeout + backoff retries (ported from the CLI).
const ashby: Provider = {
  id: "ashby",
  detect: (e) => /jobs\.ashbyhq\.com\/[^/?#]+/.test(e.careersUrl),
  async fetch(e) {
    const match = e.careersUrl.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
    if (!match) throw new Error("ashby: cannot derive board slug");
    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${match[1]}?includeCompensation=true`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1) + 250));
      }
      try {
        const json = (await fetchJson(apiUrl, { timeoutMs: 30000 })) as {
          jobs?: Array<{
            title?: string;
            jobUrl?: string;
            location?: string;
            descriptionPlain?: string;
          }>;
        };
        return (json.jobs ?? []).map((j) => ({
          title: j.title ?? "",
          url: j.jobUrl ?? "",
          company: e.name,
          location: j.location ?? "",
          jdText: j.descriptionPlain
            ? j.descriptionPlain.replace(/\s+/g, " ").trim().slice(0, JD_STORE_CAP)
            : undefined,
        }));
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  },
};

// ── Lever ────────────────────────────────────────────────────
const lever: Provider = {
  id: "lever",
  detect: (e) => /jobs\.lever\.co\/[^/?#]+/.test(e.careersUrl),
  async fetch(e) {
    const match = e.careersUrl.match(/jobs\.lever\.co\/([^/?#]+)/);
    if (!match) throw new Error("lever: cannot derive board slug");
    const json = await fetchJson(`https://api.lever.co/v0/postings/${match[1]}`);
    if (!Array.isArray(json)) return [];
    return (
      json as Array<{
        text?: string;
        hostedUrl?: string;
        categories?: { location?: string };
        descriptionPlain?: string;
      }>
    ).map((j) => ({
      title: j.text ?? "",
      url: j.hostedUrl ?? "",
      company: e.name,
      location: j.categories?.location ?? "",
      jdText: j.descriptionPlain
        ? j.descriptionPlain.replace(/\s+/g, " ").trim().slice(0, JD_STORE_CAP)
        : undefined,
    }));
  },
};

// ── Recruitee ────────────────────────────────────────────────
const RECRUITEE_HOST_RE = /^[a-z0-9][a-z0-9-]*\.recruitee\.com$/;

const recruitee: Provider = {
  id: "recruitee",
  detect: (e) => {
    try {
      const u = new URL(e.careersUrl);
      return u.protocol === "https:" && RECRUITEE_HOST_RE.test(u.hostname);
    } catch {
      return false;
    }
  },
  async fetch(e) {
    const host = new URL(e.careersUrl).hostname;
    if (!RECRUITEE_HOST_RE.test(host)) throw new Error("recruitee: untrusted host");
    const json = (await fetchJson(`https://${host}/api/offers/`, {
      redirect: "error",
    })) as {
      offers?: Array<{
        title?: string; careers_url?: string; url?: string;
        city?: string; country?: string; remote?: boolean; location?: string;
        description?: string; requirements?: string;
      }>;
    };
    return (json.offers ?? []).map((j) => {
      const location =
        j.location ||
        [j.city, j.country, j.remote ? "Remote" : ""].filter(Boolean).join(", ");
      let url = "";
      const rawUrl = j.careers_url || j.url || "";
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === "https:" && RECRUITEE_HOST_RE.test(parsed.hostname)) {
          url = parsed.href;
        }
      } catch {
        // off-domain or malformed → drop URL
      }
      const jdHtml = [j.description, j.requirements].filter(Boolean).join(" ");
      return {
        title: j.title ?? "",
        url,
        company: e.name,
        location,
        jdText: jdHtml ? htmlToText(jdHtml).slice(0, JD_STORE_CAP) : undefined,
      };
    });
  },
};

// ── SmartRecruiters ──────────────────────────────────────────
const SR_PAGE_SIZE = 100;
const SR_MAX_PAGES = 50;

const smartrecruiters: Provider = {
  id: "smartrecruiters",
  detect: (e) =>
    /(careers|jobs)\.smartrecruiters\.com\/[^/?#]+/.test(e.careersUrl),
  async fetch(e) {
    const match = e.careersUrl.match(/(?:careers|jobs)\.smartrecruiters\.com\/([^/?#]+)/);
    if (!match) throw new Error("smartrecruiters: cannot derive slug");
    const slug = match[1];
    const all: ScannedJob[] = [];
    for (let page = 0; page < SR_MAX_PAGES; page++) {
      const json = (await fetchJson(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${SR_PAGE_SIZE}&offset=${page * SR_PAGE_SIZE}&status=PUBLIC`,
        { redirect: "error" }
      )) as {
        content?: Array<{
          id?: string; name?: string; ref?: string;
          location?: { fullLocation?: string; city?: string; region?: string; country?: string; remote?: boolean };
        }>;
      };
      const items = json.content ?? [];
      if (items.length === 0) break;
      for (const j of items) {
        const loc = j.location ?? {};
        const fullLocation =
          loc.fullLocation || [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
        const location = [fullLocation, loc.remote ? "Remote" : ""].filter(Boolean).join(", ");
        let url = "";
        if (typeof j.ref === "string") {
          try {
            const ref = new URL(j.ref);
            if (
              ref.protocol === "https:" &&
              ref.hostname === "api.smartrecruiters.com" &&
              ref.pathname.startsWith("/v1/companies/")
            ) {
              url = `https://jobs.smartrecruiters.com/${ref.pathname.slice("/v1/companies/".length)}`;
            }
          } catch {
            // fall through to synthesised URL
          }
        }
        if (!url && j.id) {
          const titleSlug = (j.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          url = `https://jobs.smartrecruiters.com/${slug}/${j.id}-${titleSlug}`;
        }
        all.push({ title: j.name ?? "", url, company: e.name, location });
      }
      if (items.length < SR_PAGE_SIZE) break;
    }
    return all;
  },
};

// ── Workable ─────────────────────────────────────────────────
// Public markdown feed is the only no-auth surface (JSON API needs a token).
const workable: Provider = {
  id: "workable",
  detect: (e) => /apply\.workable\.com\/[^/?#]+/.test(e.careersUrl),
  async fetch(e) {
    const match = e.careersUrl.match(/apply\.workable\.com\/([^/?#]+)/);
    if (!match) throw new Error("workable: cannot derive slug");
    const text = await fetchText(`https://apply.workable.com/${match[1]}/jobs.md`, {
      redirect: "error",
    });
    const jobs: ScannedJob[] = [];
    for (const line of text.split("\n")) {
      if (!line.startsWith("|") || !line.includes("[View]")) continue;
      const cols = line.split("|").map((c) => c.trim());
      if (cols.length < 8) continue;
      const title = cols[1];
      if (!title || title === "Title") continue;
      const urlMatch = line.match(/\[View\]\(([^)]+)\)/);
      let url = urlMatch ? urlMatch[1] : "";
      if (url.endsWith(".md")) url = url.slice(0, -3);
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || parsed.hostname !== "apply.workable.com") continue;
        url = parsed.href;
      } catch {
        continue;
      }
      jobs.push({ title, url, company: e.name, location: cols[3] ?? "" });
    }
    return jobs;
  },
};

export const PROVIDERS: Provider[] = [
  greenhouse,
  ashby,
  lever,
  recruitee,
  smartrecruiters,
  workable,
];

export function detectProvider(entry: CompanyEntry): Provider | null {
  return PROVIDERS.find((p) => p.detect(entry)) ?? null;
}
