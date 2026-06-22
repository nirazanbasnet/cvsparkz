import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountType } from "@/lib/account";
import { OnboardingClient } from "./onboarding-client";

export const metadata = { title: "Welcome to CVSparkz" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membership) {
    const type = await getAccountType(supabase, membership.tenant_id);
    if (type) redirect("/dashboard"); // already onboarded
  }

  return <OnboardingClient />;
}
