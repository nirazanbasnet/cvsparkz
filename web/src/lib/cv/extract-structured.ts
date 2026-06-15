/**
 * Markdown/plain CV text → structured CV JSON (for opening an existing CV in
 * the visual builder). Faithful extraction only — never invent content.
 */
import { chatJSON } from "@/lib/llm/gateway";
import { parseStructuredCv, StructuredCv } from "./structured";

const EXTRACT_SYSTEM = `You convert a CV into a strict structured JSON resume. Extract EVERY piece of information faithfully — do NOT summarize, omit, or invent. Group experience bullets under focusAreas only if the source clearly organizes them that way; otherwise use a flat "bullets" array.

Return ONLY JSON matching this shape:
{
  "basics": { "name": "", "label": "", "location": "", "email": "", "phone": "", "summary": "", "links": { "github": "", "linkedin": "", "portfolio": "" } },
  "skills": { "programming": [], "frameworks": [], "devOps": [], "testing": [], "security": [], "cloud": [], "databases": [] },
  "experience": [ { "role": "", "company": "", "duration": "", "location": "", "focusAreas": [ { "heading": "", "bullets": [] } ], "bullets": [] } ],
  "education": [ { "institution": "", "location": "", "degree": "", "duration": "" } ],
  "openSourceProjects": [ { "title": "", "link": "", "description": "" } ],
  "customSections": [ { "title": "", "items": [ { "heading": "", "subheading": "", "date": "", "description": "", "bullets": [] } ] } ]
}`;

export async function extractStructured(cvText: string): Promise<StructuredCv> {
  const { data } = await chatJSON(
    {
      system: EXTRACT_SYSTEM,
      user: `CV:\n\n${cvText.slice(0, 9000)}\n\nReturn the JSON object only.`,
      maxTokens: 6000,
    },
    parseStructuredCv
  );
  return data;
}
