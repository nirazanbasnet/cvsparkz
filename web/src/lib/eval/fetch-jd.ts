/**
 * Best-effort JD extraction from a URL (no headless browser).
 *
 * Every ATS we scan exposes a public API with the clean JD content — those
 * fast paths come first (they also work when the job page itself is a JS
 * app, like Ashby's). Unknown hosts fall back to a plain HTML fetch; if that
 * yields too little text the UI asks the user to paste the JD.
 */

const JD_CHAR_CAP = 8000; // ~2k tokens — keeps eval prompts inside free-tier TPM windows

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, " ");
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assemble(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("\n").slice(0, JD_CHAR_CAP);
}

async function getJson(url: string, timeoutMs = 10000): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Greenhouse: boards-api.greenhouse.io/v1/boards/{board}/jobs/{id} */
async function fetchGreenhouseJd(url: string): Promise<string | null> {
  const match = url.match(
    /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/
  );
  if (!match) return null;
  const json = (await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs/${match[2]}`
  )) as { title?: string; location?: { name?: string }; content?: string } | null;
  if (!json?.content) return null;
  const body = stripTags(decodeEntities(json.content));
  if (body.length < 200) return null;
  return assemble([
    json.title ? `Title: ${json.title}` : null,
    json.location?.name ? `Location: ${json.location.name}` : null,
    "",
    body,
  ]);
}

/**
 * Ashby: job pages are a JS app, but the board API carries descriptionPlain.
 * URL: jobs.ashbyhq.com/{slug}/{job-uuid}
 */
async function fetchAshbyJd(url: string): Promise<string | null> {
  const match = url.match(
    /jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f]{8}-[0-9a-f-]{27,})/i
  );
  if (!match) return null;
  const json = (await getJson(
    `https://api.ashbyhq.com/posting-api/job-board/${match[1]}?includeCompensation=true`,
    30000 // Ashby's API has a ~10s+ latency floor
  )) as {
    jobs?: Array<{
      id?: string;
      title?: string;
      location?: string;
      descriptionPlain?: string;
      descriptionHtml?: string;
      compensation?: { compensationTierSummary?: string };
    }>;
  } | null;
  const job = json?.jobs?.find((j) => j.id === match[2]);
  if (!job) return null;
  const body =
    job.descriptionPlain?.trim() ||
    (job.descriptionHtml ? stripTags(decodeEntities(job.descriptionHtml)) : "");
  if (body.length < 200) return null;
  return assemble([
    job.title ? `Title: ${job.title}` : null,
    job.location ? `Location: ${job.location}` : null,
    job.compensation?.compensationTierSummary
      ? `Compensation: ${job.compensation.compensationTierSummary}`
      : null,
    "",
    body,
  ]);
}

/** Lever: api.lever.co/v0/postings/{slug}/{id} */
async function fetchLeverJd(url: string): Promise<string | null> {
  const match = url.match(/jobs\.lever\.co\/([^/?#]+)\/([0-9a-f-]{20,})/i);
  if (!match) return null;
  const json = (await getJson(
    `https://api.lever.co/v0/postings/${match[1]}/${match[2]}`
  )) as {
    text?: string;
    descriptionPlain?: string;
    description?: string;
    categories?: { location?: string; commitment?: string };
    lists?: Array<{ text?: string; content?: string }>;
  } | null;
  if (!json) return null;
  const lists = (json.lists ?? [])
    .map((l) => `${l.text ?? ""}\n${stripTags(decodeEntities(l.content ?? ""))}`)
    .join("\n\n");
  const body = [
    json.descriptionPlain?.trim() ||
      (json.description ? stripTags(decodeEntities(json.description)) : ""),
    lists,
  ]
    .filter(Boolean)
    .join("\n\n");
  if (body.length < 200) return null;
  return assemble([
    json.text ? `Title: ${json.text}` : null,
    json.categories?.location ? `Location: ${json.categories.location}` : null,
    "",
    body,
  ]);
}

/** Workable: every posting page has a public markdown twin at {url}.md */
async function fetchWorkableJd(url: string): Promise<string | null> {
  if (!/apply\.workable\.com\/[^/?#]+\/(j|jobs\/view)\//.test(url)) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}.md`, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length >= 200 ? text.slice(0, JD_CHAR_CAP) : null;
  } catch {
    return null;
  }
}

/** SmartRecruiters: api.smartrecruiters.com/v1/companies/{slug}/postings/{id} */
async function fetchSmartRecruitersJd(url: string): Promise<string | null> {
  const match = url.match(
    /jobs\.smartrecruiters\.com\/([^/?#]+)\/(\d{6,})/
  );
  if (!match) return null;
  const json = (await getJson(
    `https://api.smartrecruiters.com/v1/companies/${match[1]}/postings/${match[2]}`
  )) as {
    name?: string;
    location?: { fullLocation?: string; city?: string; country?: string };
    jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
  } | null;
  const sections = json?.jobAd?.sections;
  if (!sections) return null;
  const body = Object.values(sections)
    .map((s) => `${s.title ?? ""}\n${stripTags(decodeEntities(s.text ?? ""))}`)
    .join("\n\n");
  if (body.length < 200) return null;
  const location =
    json.location?.fullLocation ||
    [json.location?.city, json.location?.country].filter(Boolean).join(", ");
  return assemble([
    json.name ? `Title: ${json.name}` : null,
    location ? `Location: ${location}` : null,
    "",
    body,
  ]);
}

/** Recruitee: {slug}.recruitee.com/api/offers/ carries each offer's description. */
async function fetchRecruiteeJd(url: string): Promise<string | null> {
  const match = url.match(
    /^https:\/\/([a-z0-9][a-z0-9-]*)\.recruitee\.com\/o\/([^/?#]+)/
  );
  if (!match) return null;
  const json = (await getJson(`https://${match[1]}.recruitee.com/api/offers/`)) as {
    offers?: Array<{
      slug?: string;
      title?: string;
      location?: string;
      description?: string;
      requirements?: string;
    }>;
  } | null;
  const offer = json?.offers?.find((o) => o.slug === match[2]);
  if (!offer) return null;
  const body = [offer.description, offer.requirements]
    .filter(Boolean)
    .map((h) => stripTags(decodeEntities(h!)))
    .join("\n\n");
  if (body.length < 200) return null;
  return assemble([
    offer.title ? `Title: ${offer.title}` : null,
    offer.location ? `Location: ${offer.location}` : null,
    "",
    body,
  ]);
}

const FAST_PATHS = [
  fetchGreenhouseJd,
  fetchAshbyJd,
  fetchLeverJd,
  fetchWorkableJd,
  fetchSmartRecruitersJd,
  fetchRecruiteeJd,
];

export async function fetchJdFromUrl(url: string): Promise<string> {
  for (const fastPath of FAST_PATHS) {
    const jd = await fastPath(url);
    if (jd) return jd;
  }

  let plainText = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      plainText = stripTags(decodeEntities(await res.text()));
    }
  } catch {
    // fall through to the error below
  }

  if (plainText.length >= 500) return plainText.slice(0, JD_CHAR_CAP);

  throw new Error(
    "FETCH_FAILED: Could not extract the job description from that page. Paste the JD text instead."
  );
}
