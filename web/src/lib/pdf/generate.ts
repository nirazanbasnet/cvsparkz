import { randomUUID } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasStructuredContent, parseStructuredCv } from "@/lib/cv/structured";
import { tailorCv } from "./tailor";
import { renderCvPdf } from "./pdf-document";

const first = (...vals: Array<string | null | undefined>) =>
  vals.find((v) => v && v.trim())?.trim() ?? "";

/**
 * How many of the evaluation's extracted JD keywords actually appear in the
 * tailored CV content — checked against the real text (not the model's
 * self-report), case-insensitive, with loose either-direction matching for
 * the model's keyword list as a fallback ("RAG" matches "RAG pipelines").
 */
function keywordCoverage(
  evalKeywords: string[],
  usedKeywords: string[],
  tailoredText: string
) {
  const used = usedKeywords.map((k) => k.toLowerCase());
  const haystack = tailoredText.toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];
  for (const kw of evalKeywords) {
    const lower = kw.toLowerCase();
    const hit =
      haystack.includes(lower) ||
      used.some((u) => u.includes(lower) || lower.includes(u));
    (hit ? matched : missing).push(kw);
  }
  const total = evalKeywords.length;
  return {
    matched,
    missing,
    total,
    pct: total > 0 ? Math.round((matched.length / total) * 100) : null,
  };
}

export async function generateTailoredPdf({
  supabase,
  tenantId,
  evaluationId,
}: {
  supabase: SupabaseClient;
  tenantId: string;
  evaluationId: string;
}): Promise<{ documentId: string }> {
  // 1. Load evaluation, CV, profile (user client → RLS-scoped)
  const { data: ev } = await supabase
    .from("evaluations")
    .select("id, company_name, role, archetype, blocks, cv_version_id")
    .eq("tenant_id", tenantId)
    .eq("id", evaluationId)
    .maybeSingle();
  if (!ev) throw new Error("Evaluation not found");

  const [{ data: cv }, { data: profile }] = await Promise.all([
    supabase
      .from("cv_versions")
      .select("id, content_md, structured")
      .eq("tenant_id", tenantId)
      .eq("is_current", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("candidate_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  if (!cv) throw new Error("NO_CV: Add your CV before generating a PDF.");

  // Header identity: prefer the CV's own basics (same source as the builder
  // preview), fall back to the profile — so the generated CV always carries
  // the name/email/phone the user actually entered.
  const basics = hasStructuredContent(cv.structured)
    ? parseStructuredCv(cv.structured).basics
    : null;
  const header = {
    name: first(basics?.name, profile?.full_name) || "Candidate",
    label: first(basics?.label),
    email: first(basics?.email, profile?.email),
    phone: first(basics?.phone, profile?.phone),
    linkedinUrl: first(basics?.links?.linkedin, profile?.linkedin_url),
    portfolioUrl: first(basics?.links?.portfolio, profile?.portfolio_url),
    githubUrl: first(basics?.links?.github, profile?.github_url),
    location: first(
      basics?.location,
      [profile?.location_city, profile?.location_country].filter(Boolean).join(", ")
    ),
  };

  const blocks = (ev.blocks ?? {}) as Record<string, unknown>;
  const jdText = typeof blocks.jd_text === "string" ? blocks.jd_text : "";
  const keywords = Array.isArray(blocks.keywords) ? (blocks.keywords as string[]) : [];
  const jdContext = jdText
    ? `## Job description\n\n${jdText}`
    : `## JD keywords (full JD unavailable)\n\n${keywords.join(", ")}\n\n## Evaluation match notes\n\n${typeof blocks.B === "string" ? blocks.B : ""}`;

  // 2. Job record for observability
  const { data: job } = await supabase
    .from("jobs")
    .insert({
      tenant_id: tenantId,
      kind: "pdf",
      status: "running",
      input: { evaluation_id: evaluationId },
      started_at: new Date().toISOString(),
      attempts: 1,
    })
    .select("id")
    .single();

  try {
    // 3. Tailor content (LLM) and render to PDF
    const { cv: tailored, usage } = await tailorCv({
      cvMarkdown: cv.content_md,
      jdContext,
      companyName: ev.company_name,
      role: ev.role,
      archetype: ev.archetype,
    });

    const pdf = await renderCvPdf(header, tailored);

    // 4. Upload to private bucket (service role; path is tenant-scoped)
    const documentId = randomUUID();
    const objectKey = `${tenantId}/cv_pdf/${documentId}.pdf`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(objectKey, pdf, { contentType: "application/pdf" });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    // 5. Record document + flip has_pdf on the application
    const { data: app } = await supabase
      .from("applications")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("latest_evaluation_id", evaluationId)
      .maybeSingle();

    const tailoredText = [
      tailored.summary,
      ...tailored.competencies,
      ...tailored.experience.flatMap((j) => [j.role, ...j.bullets]),
      ...tailored.projects.map((p) => `${p.title} ${p.description} ${p.tech ?? ""}`),
      ...tailored.skills.map((s) => `${s.category} ${s.items}`),
    ].join("\n");
    const coverage = keywordCoverage(keywords, tailored.keywords_used, tailoredText);

    const { error: docError } = await supabase.from("generated_documents").insert({
      id: documentId,
      tenant_id: tenantId,
      application_id: app?.id ?? null,
      evaluation_id: evaluationId,
      cv_version_id: cv.id,
      kind: "cv_pdf",
      lang: "en",
      page_format: tailored.paper_format,
      object_key: objectKey,
      file_size: pdf.length,
      tailored_for: `${ev.company_name} — ${ev.role}`,
      meta: {
        change_log: tailored.change_log,
        keywords_used: tailored.keywords_used,
        coverage,
        summary: tailored.summary,
      },
    });
    if (docError) throw new Error(`Failed to record document: ${docError.message}`);

    if (app) {
      await supabase
        .from("applications")
        .update({ has_pdf: true, updated_at: new Date().toISOString() })
        .eq("id", app.id);
    }

    await supabase.from("usage_events").insert({
      tenant_id: tenantId,
      metric: "pdf",
      quantity: 1,
      tokens_in: usage.tokensIn,
      tokens_out: usage.tokensOut,
      job_id: job?.id ?? null,
    });

    if (job) {
      await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          result: { document_id: documentId, bytes: pdf.length },
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    return { documentId };
  } catch (e) {
    if (job) {
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error: e instanceof Error ? e.message.slice(0, 2000) : String(e),
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
    throw e;
  }
}
