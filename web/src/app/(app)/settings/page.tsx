import { getUserAndTenant } from "@/lib/tenant";
import { getAccountType } from "@/lib/account";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const { supabase, tenantId } = await getUserAndTenant();
  const accountType = (await getAccountType(supabase, tenantId)) ?? "personal";
  return <SettingsClient current={accountType} />;
}
