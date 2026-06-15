import { getUserAndTenant } from "@/lib/tenant";
import { ProfileForm } from "./profile-form";
import type { ProfileFormData } from "./actions";

export default async function ProfilePage() {
  const { supabase, user, tenantId } = await getUserAndTenant();

  const { data: p } = await supabase
    .from("candidate_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const narrative = (p?.narrative ?? {}) as {
    headline?: string;
    superpowers?: string[];
    dealbreakers?: string[];
  };

  // Fall back to the name captured at signup (auth metadata) when the profile
  // hasn't been filled yet, so the field isn't blank for new users.
  const signupName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "";

  const initial: ProfileFormData = {
    full_name: p?.full_name ?? signupName,
    email: p?.email ?? user.email ?? "",
    location_city: p?.location_city ?? "",
    location_country: p?.location_country ?? "",
    timezone: p?.timezone ?? "",
    location_flexibility: p?.location_flexibility ?? "",
    comp_currency: p?.comp_currency ?? "USD",
    comp_target_min: p?.comp_target_min?.toString() ?? "",
    comp_target_max: p?.comp_target_max?.toString() ?? "",
    comp_minimum: p?.comp_minimum?.toString() ?? "",
    target_roles: Array.isArray(p?.target_roles)
      ? (p.target_roles as { title?: string }[])
          .map((r) => r.title ?? "")
          .filter(Boolean)
          .join(", ")
      : "",
    headline: narrative.headline ?? "",
    superpowers: (narrative.superpowers ?? []).join("\n"),
    dealbreakers: (narrative.dealbreakers ?? []).join("\n"),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">
          The evaluator reads this on every run — the more context, the better
          the scoring.
        </p>
      </div>
      <ProfileForm initial={initial} />
    </div>
  );
}
