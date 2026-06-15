import { getUserAndTenant } from "@/lib/tenant";
import { ScanClient } from "./scan-client";

export default async function ScanPage() {
  const { supabase, tenantId } = await getUserAndTenant();

  const [{ data: companies }, { data: config }] = await Promise.all([
    supabase
      .from("tracked_companies")
      .select("id, display_name, provider, provider_config, enabled")
      .eq("tenant_id", tenantId)
      .order("display_name"),
    supabase
      .from("scan_configs")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  return (
    <ScanClient
      companies={(companies ?? []).map((c) => ({
        id: c.id,
        display_name: c.display_name,
        provider: c.provider,
        careers_url:
          (c.provider_config as { careers_url?: string })?.careers_url ?? "",
        enabled: c.enabled,
      }))}
      config={{
        title_positive: (config?.title_positive ?? []).join("\n"),
        title_negative: (config?.title_negative ?? []).join("\n"),
        loc_always_allow: (config?.loc_always_allow ?? []).join("\n"),
        loc_allow: (config?.loc_allow ?? []).join("\n"),
        loc_block: (config?.loc_block ?? []).join("\n"),
      }}
    />
  );
}
