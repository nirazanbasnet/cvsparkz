import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";

// Editorial display serif for the marketing landing (italic accents).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  style: ["normal", "italic"],
});

// Brand fonts — same pair the generated CV PDFs use.
const dmSans = localFont({
  src: [
    { path: "../fonts/dm-sans-latin.woff2", weight: "100 1000", style: "normal" },
    { path: "../fonts/dm-sans-latin-ext.woff2", weight: "100 1000", style: "normal" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: [
    { path: "../fonts/space-grotesk-latin.woff2", weight: "300 700", style: "normal" },
    { path: "../fonts/space-grotesk-latin-ext.woff2", weight: "300 700", style: "normal" },
  ],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CVSparkz — AI career platform",
  description:
    "Score your CV, rebuild it with AI, scan real jobs, evaluate fit, and track every application — one platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${spaceGrotesk.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
