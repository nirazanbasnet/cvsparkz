import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function getUserAndTenant() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership, error } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (error || !membership) {
    throw new Error("No workspace found for user. Signup provisioning failed.");
  }

  return { supabase, user, tenantId: membership.tenant_id as string };
}
