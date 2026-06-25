import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node packages that must not be bundled (native bindings / dynamic requires).
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@sparticuz/chromium",
    "@react-pdf/renderer",
    "pdf-parse",
    "mammoth",
  ],
  // Vercel's file tracer misses playwright-core's data files (browsers.json),
  // so importing it fails at runtime ("Cannot find module browsers.json").
  // Force the scanner's browser deps into the two routes that launch one.
  outputFileTracingIncludes: {
    "/api/scan": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
    "/api/cv-find-jobs": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
};

export default nextConfig;
