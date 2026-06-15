/**
 * ATS text normalization — ported from generate-pdf.mjs (issue #1 upstream).
 * ATS parsers fail on em-dashes, smart quotes, zero-width chars, etc.
 * Applied to text content BEFORE it goes into the HTML template.
 */
export function normalizeForAts(text: string): string {
  return text
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/…/g, "...")
    .replace(/[​‌‍⁠﻿]/g, "")
    .replace(/ /g, " ")
    .replace(/\s*→\s*/g, " to ")
    .replace(/\s*←\s*/g, " from ")
    .replace(/\s*[↑↓]\s*/g, " ")
    .replace(/\s*·\s*/g, " | ")
    .replace(/\s*•\s*/g, " | ")
    .replace(/€/g, "EUR ")
    .replace(/£/g, "GBP ");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Normalize + escape: every model/user-sourced string passes through this. */
export function safe(text: string | null | undefined): string {
  return escapeHtml(normalizeForAts(text ?? ""));
}
