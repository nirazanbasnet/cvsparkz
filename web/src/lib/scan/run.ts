import { createHash } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { detectProvider, ScannedJob } from "./providers";
import { fetchCustomBoard } from "./custom-provider";
import { quickScorePendingItems } from "./quick-score";
import {
  makeTitleFilter,
  makeLocationFilter,
  deriveTitleKeywords,
} from "./filters";

const CONCURRENCY = 5;

export interface ScanSummary {
  companies: number;
  fetched: number;
  matched: number;
  added: number;
  alreadySeen: number;
  /** Of everything that matched, how many are now waiting in the inbox. */
  inInbox: number;
  /** Matched postings already handled (evaluated or dismissed) — kept out of the inbox. */
  handled: number;
  /** Set when the title filter was derived from the primary CV's role. */
  roleFilter: { role: string; keywords: string[] } | null;
  /** Pending inbox items removed because they no longer match the filters. */
  pruned: number;
  /** Inbox items quick-scored against the primary CV this scan. */
  scored: number;
  errors: Array<{ company: string; error: string }>;
}

export async function runScan({
  supabase,
  tenantId,
}: {
  supabase: SupabaseClient;
  tenantId: string;
}): Promise<ScanSummary> {
  const [{ data: companies }, { data: config }] = await Promise.all([
    supabase
      .from("tracked_companies")
      .select("id, display_name, provider, provider_config")
      .eq("tenant_id", tenantId)
      .eq("enabled", true),
    supabase
      .from("scan_configs")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const summary: ScanSummary = {
    companies: companies?.length ?? 0,
    fetched: 0,
    matched: 0,
    added: 0,
    alreadySeen: 0,
    inInbox: 0,
    handled: 0,
    roleFilter: null,
    pruned: 0,
    scored: 0,
    errors: [],
  };

  // No manual title filters? Fall back to the primary CV's target role.
  let titlePositive = config?.title_positive ?? [];
  if (titlePositive.length === 0) {
    const { data: primaryCv } = await supabase
      .from("cv_versions")
      .select("primary_role")
      .eq("tenant_id", tenantId)
      .eq("is_current", true)
      .maybeSingle();
    if (primaryCv?.primary_role) {
      const keywords = deriveTitleKeywords(primaryCv.primary_role);
      if (keywords.length > 0) {
        titlePositive = keywords;
        summary.roleFilter = { role: primaryCv.primary_role, keywords };
      }
    }
  }

  const titleOk = makeTitleFilter(titlePositive, config?.title_negative ?? []);
  const locationOk = makeLocationFilter(
    config?.loc_always_allow ?? [],
    config?.loc_allow ?? [],
    config?.loc_block ?? []
  );

  // Keep the inbox consistent with the CURRENT filters: drop waiting items
  // that were discovered under older/looser filters (e.g. before a primary
  // CV with a target role existed).
  const { data: waiting } = await supabase
    .from("pipeline_items")
    .select("id, job_postings ( title, location )")
    .eq("tenant_id", tenantId)
    .in("state", ["pending", "error"]);
  const stale = (waiting ?? []).filter((item) => {
    const posting = Array.isArray(item.job_postings)
      ? item.job_postings[0]
      : item.job_postings;
    if (!posting) return false;
    return !(titleOk(posting.title ?? "") && locationOk(posting.location ?? ""));
  });
  if (stale.length > 0) {
    await supabase
      .from("pipeline_items")
      .delete()
      .in("id", stale.map((i) => i.id));
    summary.pruned = stale.length;
  }

  if (!companies?.length) return summary;

  // Record the scan as a job for observability
  const { data: job } = await supabase
    .from("jobs")
    .insert({
      tenant_id: tenantId,
      kind: "scan",
      status: "running",
      input: { companies: summary.companies },
      started_at: new Date().toISOString(),
      attempts: 1,
    })
    .select("id")
    .single();

  // Fetch all boards with bounded concurrency
  const queue = [...companies];
  const results: Array<
    | { company: string; jobs: ScannedJob[]; source: string }
    | { company: string; error: string }
  > = [];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const entry = queue.shift();
        if (!entry) return;
        const careersUrl = (entry.provider_config as { careers_url?: string })?.careers_url ?? "";
        const companyEntry = { name: entry.display_name, careersUrl };
        const provider = detectProvider(companyEntry);
        try {
          let jobs: ScannedJob[];
          let source: string;
          if (provider) {
            jobs = await provider.fetch(companyEntry);
            source = provider.id;
          } else if (entry.provider === "custom") {
            // Branded page: headless render + LLM extraction (slower)
            jobs = await fetchCustomBoard(companyEntry);
            source = "custom";
          } else {
            results.push({
              company: entry.display_name,
              error: "no provider matches careers URL",
            });
            continue;
          }
          results.push({ company: entry.display_name, jobs, source });
        } catch (e) {
          results.push({
            company: entry.display_name,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })
  );

  // Filter + dedup + insert
  const seenMatchedPostingIds: string[] = [];
  const addedPostingIds: string[] = [];
  for (const r of results) {
    if ("error" in r) {
      summary.errors.push({ company: r.company, error: r.error });
      continue;
    }
    summary.fetched += r.jobs.length;
    const matching = r.jobs.filter(
      (j) => j.url && j.title && titleOk(j.title) && locationOk(j.location)
    );
    summary.matched += matching.length;

    for (const j of matching) {
      const urlHash = createHash("sha256").update(j.url).digest("hex");
      const { data: existing } = await supabase
        .from("job_postings")
        .select("id, seen_count, jd_text")
        .eq("tenant_id", tenantId)
        .eq("url_hash", urlHash)
        .maybeSingle();

      if (existing) {
        summary.alreadySeen++;
        seenMatchedPostingIds.push(existing.id);
        await supabase
          .from("job_postings")
          .update({
            last_seen_at: new Date().toISOString(),
            seen_count: existing.seen_count + 1,
            // backfill JDs for postings scanned before JD capture existed
            ...(!existing.jd_text && j.jdText ? { jd_text: j.jdText } : {}),
          })
          .eq("id", existing.id);
        continue;
      }

      const { data: posting, error: postingError } = await supabase
        .from("job_postings")
        .insert({
          tenant_id: tenantId,
          url: j.url,
          url_hash: urlHash,
          title: j.title,
          company_name: j.company,
          location: j.location,
          jd_text: j.jdText ?? null,
          source: r.source,
        })
        .select("id")
        .single();

      if (postingError || !posting) {
        // Don't drop the job silently — surface why it didn't reach the inbox.
        summary.errors.push({
          company: r.company,
          error: `couldn't save "${j.title}": ${postingError?.message ?? "no row returned"}`,
        });
        continue;
      }

      summary.added++;
      addedPostingIds.push(posting.id);
      const { error: itemError } = await supabase.from("pipeline_items").insert({
        tenant_id: tenantId,
        posting_id: posting.id,
        url: j.url,
        state: "pending",
      });
      if (itemError) {
        summary.errors.push({
          company: r.company,
          error: `saved "${j.title}" but couldn't add it to the inbox: ${itemError.message}`,
        });
      }
    }
  }

  // Re-admit known postings that match the CURRENT filters but have no inbox
  // presence at all — e.g. their items were pruned under older filters. Postings
  // the user already dismissed (processed item) or evaluated stay out.
  if (seenMatchedPostingIds.length > 0) {
    const [{ data: withItems }, { data: evaluated }] = await Promise.all([
      supabase
        .from("pipeline_items")
        .select("posting_id")
        .eq("tenant_id", tenantId)
        .in("posting_id", seenMatchedPostingIds),
      supabase
        .from("evaluations")
        .select("posting_id")
        .eq("tenant_id", tenantId)
        .in("posting_id", seenMatchedPostingIds),
    ]);
    const excluded = new Set([
      ...(withItems ?? []).map((i) => i.posting_id),
      ...(evaluated ?? []).map((e) => e.posting_id),
    ]);
    const readmit = [...new Set(seenMatchedPostingIds)].filter(
      (id) => !excluded.has(id)
    );
    if (readmit.length > 0) {
      const { data: postings } = await supabase
        .from("job_postings")
        .select("id, url")
        .in("id", readmit);
      const { error: readmitError } = await supabase.from("pipeline_items").insert(
        (postings ?? []).map((p) => ({
          tenant_id: tenantId,
          posting_id: p.id,
          url: p.url,
          state: "pending",
        }))
      );
      if (!readmitError) {
        summary.added += postings?.length ?? 0;
        summary.alreadySeen -= postings?.length ?? 0;
        addedPostingIds.push(...(postings ?? []).map((p) => p.id));
      }
    }
  }

  // Reconcile what the user will actually see: of everything that matched this
  // scan, how many are now waiting in the inbox vs already handled (evaluated or
  // dismissed). This makes "9 matched" line up with the inbox count.
  const matchedPostingIds = [
    ...new Set([...addedPostingIds, ...seenMatchedPostingIds]),
  ];
  if (matchedPostingIds.length > 0) {
    const { data: inboxRows } = await supabase
      .from("pipeline_items")
      .select("posting_id")
      .eq("tenant_id", tenantId)
      .in("posting_id", matchedPostingIds)
      .in("state", ["pending", "error"]);
    const inboxSet = new Set((inboxRows ?? []).map((r) => r.posting_id));
    summary.inInbox = inboxSet.size;
    summary.handled = matchedPostingIds.filter((id) => !inboxSet.has(id)).length;
  }

  // Quick-score any unscored pending items against the primary CV so the
  // inbox can rank them. Best-effort — failures leave items unscored.
  try {
    const { scored } = await quickScorePendingItems({ supabase, tenantId });
    summary.scored = scored;
  } catch {
    // ignore — scoring is a bonus, never fails the scan
  }

  if (job) {
    await supabase
      .from("jobs")
      .update({
        status: "succeeded",
        result: { ...summary },
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }

  return summary;
}
