/**
 * Custom careers-page provider — for companies NOT on a supported ATS
 * (branded pages like lftechnology.com/careers).
 *
 * Strategy: render the page in headless Chromium (so JS-rendered listings
 * actually appear), collect visible text + links, then have the LLM extract
 * the real job postings. Slower than ATS APIs and costs a small LLM call per
 * company per scan, but it sees the same jobs a human would — static HTML
 * fetches miss everything a SPA renders client-side.
 */
import { z } from "zod";
import { getBrowser } from "@/lib/browser";
import { chatJSON } from "@/lib/llm/gateway";
import { htmlToText } from "@/lib/html";
import type { CompanyEntry, ScannedJob } from "./providers";

const extractionSchema = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string().min(2),
        url: z.string().nullish(),
        location: z.string().nullish(),
      })
    )
    .max(150),
});

const EXTRACT_SYSTEM = `You extract job openings from a company careers webpage. You get the page URL, title, a visible-text excerpt, and the page's links. Return the individual job postings listed on the page.

Rules:
- Include ONLY real, individual job openings. Exclude navigation, departments, "See all jobs", blog posts, benefits sections, and generic Apply buttons.
- "title": the job title exactly as listed.
- "location": only if shown for that job, else null.
- "url": the href from the links list that leads to that specific job's page, else null. Never invent URLs.
- No openings on the page -> {"jobs": []}.

Return ONLY JSON: {"jobs":[{"title":"...","url":"... or null","location":"... or null"}]}`;

const JOBISH =
  /job|career|position|opening|vacanc|apply|role|hiring|join|recruit/i;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const JD_STORE_CAP = 6000;

interface PageData {
  html: string;
  title: string;
  text: string;
  anchors: Array<{ text: string; href: string }>;
}

/**
 * Render a careers page in a real browser. Many job boards (Greenhouse-embed,
 * Workday, custom React/Vue SPAs) inject their listings via XHR after first
 * paint, so we wait for the network to settle before reading the DOM.
 */
async function renderCareersPage(url: string): Promise<PageData> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 1600 },
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    // Give client-rendered listings a chance to load (don't fail if the page
    // never goes fully idle — analytics/sockets keep it busy forever).
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const data = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({
          text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          href: (a as HTMLAnchorElement).href,
        }))
        .filter((a) => a.text && a.href.startsWith("http"));
      return {
        title: document.title,
        text: (document.body.innerText || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 4000),
        anchors,
      };
    });
    const html = await page.content();
    return { html, ...data };
  } finally {
    await context.close();
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Many "custom" careers pages are really a known ATS behind a custom domain.
 * Recruitee serves its public offers API on the careers origin itself (e.g.
 * career.acme.com/api/offers/), so if the page fingerprints as Recruitee we
 * pull structured jobs straight from that API instead of guessing from HTML.
 */
async function tryRecruiteeApi(
  entry: CompanyEntry,
  html: string
): Promise<ScannedJob[] | null> {
  if (!/recruitee/i.test(html)) return null;
  let origin: string;
  try {
    origin = new URL(entry.careersUrl).origin;
  } catch {
    return null;
  }
  try {
    const res = await fetch(`${origin}/api/offers/`, {
      headers: { "user-agent": UA, accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      offers?: Array<{
        title?: string;
        careers_url?: string;
        url?: string;
        city?: string;
        country?: string;
        remote?: boolean;
        location?: string;
        description?: string;
        requirements?: string;
      }>;
    };
    const offers = json.offers ?? [];
    if (offers.length === 0) return null;
    return offers
      .map((j) => {
        const location =
          j.location ||
          [j.city, j.country, j.remote ? "Remote" : ""]
            .filter(Boolean)
            .join(", ");
        let url = "";
        try {
          url = new URL(j.careers_url || j.url || "", origin).href;
        } catch {
          url = "";
        }
        const jdHtml = [j.description, j.requirements].filter(Boolean).join(" ");
        return {
          title: j.title ?? "",
          url,
          company: entry.name,
          location,
          jdText: jdHtml ? htmlToText(jdHtml).slice(0, JD_STORE_CAP) : undefined,
        };
      })
      .filter((j) => j.title && j.url);
  } catch {
    return null;
  }
}

export async function fetchCustomBoard(
  entry: CompanyEntry
): Promise<ScannedJob[]> {
  const data = await renderCareersPage(entry.careersUrl);

  // Known ATS behind a custom domain? Pull structured jobs from its API.
  const viaRecruitee = await tryRecruiteeApi(entry, data.html);
  if (viaRecruitee && viaRecruitee.length > 0) return viaRecruitee;

  // Job-ish links first, dedupe by href, keep the prompt small.
  const seen = new Set<string>();
  const anchors = data.anchors
    .sort((a, b) => {
      const aJob = JOBISH.test(a.href) || JOBISH.test(a.text) ? 0 : 1;
      const bJob = JOBISH.test(b.href) || JOBISH.test(b.text) ? 0 : 1;
      return aJob - bJob;
    })
    .filter((a) => {
      if (seen.has(a.href)) return false;
      seen.add(a.href);
      return true;
    })
    .slice(0, 120);

  let linksBlock = "";
  for (const a of anchors) {
    const line = `- "${a.text}" -> ${a.href}\n`;
    if (linksBlock.length + line.length > 9000) break;
    linksBlock += line;
  }

  const { data: extracted } = await chatJSON(
    {
      system: EXTRACT_SYSTEM,
      user: `Careers page URL: ${entry.careersUrl}
Page title: ${data.title}

## Visible text (excerpt)
${data.text}

## Links on the page
${linksBlock || "(none)"}

Extract the job openings. Return the JSON object only.`,
      maxTokens: 3000,
      temperature: 0,
    },
    (raw) => {
      const result = extractionSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(JSON.stringify(result.error.issues.slice(0, 3)));
      }
      return result.data;
    }
  );

  return extracted.jobs.map((j) => {
    let url = "";
    if (j.url) {
      try {
        const parsed = new URL(j.url, entry.careersUrl);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          url = parsed.href;
        }
      } catch {
        // fall through to synthesized URL
      }
    }
    if (!url) {
      // No per-job link on the page — synthesize a stable URL so dedup works
      // and the inbox can still point the user at the careers page.
      url = `${entry.careersUrl.replace(/\/$/, "")}#job-${slugify(j.title)}`;
    }
    return {
      title: j.title,
      url,
      company: entry.name,
      location: j.location ?? "",
    };
  });
}
