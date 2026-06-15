import type { Browser } from "playwright-core";

/** Shared headless Chromium singleton — used by PDF generation, custom
 *  careers-page scanning, and JS-rendered JD fetching.
 *
 *  Local/dev: full `playwright` with its bundled browsers.
 *  Serverless (Vercel / AWS Lambda): `playwright-core` + `@sparticuz/chromium`,
 *  because a full Chromium won't fit a serverless function's size limit. */
let browserPromise: Promise<Browser> | null = null;

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

async function launch(): Promise<Browser> {
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: pw } = await import("playwright-core");
    return pw.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Full Playwright drives its own bundled Chromium in dev / on a real server.
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true });
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch();
    // If launch fails, allow a retry on the next call
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}
