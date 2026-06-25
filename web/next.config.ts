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
};

export default nextConfig;
