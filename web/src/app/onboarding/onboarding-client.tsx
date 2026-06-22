"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, User, Users } from "lucide-react";
import { setAccountType } from "@/lib/account-actions";
import type { AccountType } from "@/lib/account";

const OPTIONS: {
  type: AccountType;
  icon: typeof User;
  title: string;
  blurb: string;
  points: string[];
}[] = [
  {
    type: "personal",
    icon: User,
    title: "I'm job hunting",
    blurb: "Find roles and land your next job.",
    points: [
      "Score & build your own CV with AI",
      "Scan companies and evaluate job fit",
      "Track every application end to end",
    ],
  },
  {
    type: "recruiter",
    icon: Users,
    title: "I'm hiring",
    blurb: "Review candidates against your roles.",
    points: [
      "Create job openings (paste the JD)",
      "Bulk-upload CVs and rank by fit",
      "Track candidates through your pipeline",
    ],
  },
];

export function OnboardingClient() {
  const router = useRouter();
  const [loading, setLoading] = useState<AccountType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(type: AccountType) {
    setLoading(type);
    setError(null);
    const res = await setAccountType(type);
    if (res?.error) {
      setError(res.error);
      setLoading(null);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            <span className="bg-linear-to-r from-[hsl(187_74%_32%)] to-[hsl(270_70%_45%)] bg-clip-text text-transparent">
              Welcome to CVSparkz
            </span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            How will you use it? You can switch anytime in Settings.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <button
              key={o.type}
              onClick={() => choose(o.type)}
              disabled={loading !== null}
              className="group flex flex-col rounded-2xl border bg-background p-6 text-left transition-all hover:border-[hsl(187_74%_32%)] hover:shadow-md disabled:opacity-60"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-[hsl(187_40%_96%)] text-[hsl(187_74%_30%)] dark:bg-[hsl(187_74%_32%)]/15">
                {loading === o.type ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <o.icon className="size-5" />
                )}
              </div>
              <h2 className="mt-4 text-lg font-semibold">{o.title}</h2>
              <p className="text-sm text-muted-foreground">{o.blurb}</p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {o.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="mt-px text-[hsl(187_74%_32%)]">✓</span>
                    <span className="text-foreground/90">{p}</span>
                  </li>
                ))}
              </ul>
              <span className="mt-5 text-sm font-medium text-[hsl(187_74%_30%)] group-hover:underline">
                Continue →
              </span>
            </button>
          ))}
        </div>
        {error && (
          <p className="mt-4 text-center text-sm text-destructive">{error}</p>
        )}
      </div>
    </main>
  );
}
