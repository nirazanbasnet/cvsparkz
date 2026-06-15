/**
 * CV file → raw text extraction. PDF via pdf-parse, DOCX via mammoth,
 * TXT/MD pass through. The raw text then goes through the LLM to become
 * clean structured markdown (except .md, which is already markdown).
 */

export type CvFileKind = "pdf" | "docx" | "md" | "txt";

export function detectKind(filename: string, mime: string): CvFileKind | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (
    ext === "docx" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "txt" || mime.startsWith("text/")) return "txt";
  return null;
}

export async function extractText(
  kind: CvFileKind,
  buffer: Buffer
): Promise<string> {
  if (kind === "pdf") {
    // Direct lib import skips pdf-parse's debug-mode test-file read.
    const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
    const result = await pdfParse(buffer);
    return result.text ?? "";
  }
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }
  return buffer.toString("utf-8");
}
