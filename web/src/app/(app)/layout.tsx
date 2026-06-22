import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountType } from "@/lib/account";
import { getUsageSummary } from "@/lib/llm/usage";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./nav-links";
import { UsageBadge } from "./usage-badge";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
  const accountType = membership
    ? await getAccountType(supabase, membership.tenant_id)
    : null;
  if (!accountType) redirect("/onboarding");

  const usage = await getUsageSummary(
    supabase,
    membership!.tenant_id,
    accountType
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-heading text-lg font-bold tracking-tight">
              <span className="bg-linear-to-r from-[hsl(187_74%_32%)] to-[hsl(270_70%_45%)] bg-clip-text text-transparent">
                CVSparkz
              </span>
            </Link>
            <NavLinks accountType={accountType} />
          </div>
          <div className="flex items-center gap-2">
            <UsageBadge summary={usage} />
            <form action="/auth/signout" method="post">
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
