import type { Browser } from "playwright-core";

/**
 * Shared headless Chromium for custom careers-page scanning (JS-rendered
 * listings) and JS-rendered JD fetching. Three ways to get a browser, in
 * priority order:
 *
 *   1. BROWSER_WS_ENDPOINT — a hosted browser (Browserless / Browserbase /
 *      Bright Data). We just connect over CDP, so NOTHING Chromium ships in
 *      the serverless function. This is the reliable path on Vercel.
 *   2. Serverless w/o a hosted browser → `playwright-core` + `@sparticuz/chromium`
 *      (a Lambda-sized Chromium). Works, but needs ≥1GB memory + a long
 *      maxDuration (see web/vercel.json) and is sensitive to Chromium version.
 *   3. Local/dev → full `playwright` with its bundled browser.
 */
let browserPromise: Promise<Browser> | null = null;

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

async function launch(): Promise<Browser> {
  // 1. Hosted browser over CDP — the Vercel-friendly path.
  const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;
  if (wsEndpoint) {
    const { chromium } = await import("playwright-core");
    return chromium.connectOverCDP(wsEndpoint);
  }

  // 2. Serverless: bring our own Lambda-sized Chromium.
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: pw } = await import("playwright-core");
    return pw.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  // 3. Local dev: full Playwright drives its own bundled Chromium.
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true });
}

export async function getBrowser(): Promise<Browser> {
  // Reuse a live browser; relaunch if the cached one died or disconnected
  // (e.g. a hosted browser session that timed out between scans).
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.isConnected()) return existing;
    } catch {
      // fall through to relaunch
    }
    browserPromise = null;
  }
  browserPromise = launch();
  browserPromise.catch(() => {
    browserPromise = null;
  });
  return browserPromise;
}
