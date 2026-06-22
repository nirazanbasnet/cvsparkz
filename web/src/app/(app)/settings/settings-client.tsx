"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setAccountType } from "@/lib/account-actions";
import type { AccountType } from "@/lib/account";

const label = (t: AccountType) =>
  t === "recruiter" ? "Recruiter (hiring)" : "Personal (job seeking)";

export function SettingsClient({ current }: { current: AccountType }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const other: AccountType = current === "recruiter" ? "personal" : "recruiter";

  async function switchTo() {
    setLoading(true);
    setError(null);
    const res = await setAccountType(other);
    if (res?.error) {
      setError(res.error);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Workspace mode</CardTitle>
          <CardDescription>
            Switch between job-seeking and hiring. Each mode keeps its own data,
            so nothing is lost when you switch back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Current mode:{" "}
            <span className="font-semibold text-foreground">
              {label(current)}
            </span>
          </p>
          <Button onClick={switchTo} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Switching…" : `Switch to ${label(other)}`}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
