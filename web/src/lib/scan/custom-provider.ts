/**
 * Custom careers-page provider — for companies NOT on a supported ATS
 * (branded pages like lftechnology.com/careers).
 *
 * Strategy: render the page headless (JS apps included), collect visible
 * text + links, then have the LLM extract the actual job listings.
 * Slower than ATS APIs and costs a small LLM call per company per scan.
 */
import { z } from "zod";
import { getBrowser } from "@/lib/browser";
import { chatJSON } from "@/lib/llm/gateway";
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

interface PageData {
  title: string;
  text: string;
  anchors: Array<{ text: string; href: string }>;
}

async function renderCareersPage(url: string): Promise<PageData> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    // Some careers pages lazy-render listings after first paint
    await page.waitForTimeout(1500);
    return await page.evaluate(() => {
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
  } finally {
    await page.close();
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function fetchCustomBoard(
  entry: CompanyEntry
): Promise<ScannedJob[]> {
  const data = await renderCareersPage(entry.careersUrl);

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
