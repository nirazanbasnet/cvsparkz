import { chromium, Browser } from "playwright";

/** Shared headless Chromium singleton — used by PDF generation, custom
 *  careers-page scanning, and JS-rendered JD fetching. */
let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
    // If launch fails, allow a retry on the next call
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}
