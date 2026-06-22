"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createOpening } from "./actions";

export function NewOpeningForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [jd, setJd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await createOpening({ title, jdText: jd, location });
    if (res.error || !res.id) {
      setError(res.error ?? "Failed to create opening");
      setSaving(false);
      return;
    }
    router.push(`/openings/${res.id}`);
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ New opening</Button>;
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ot">Role title</Label>
            <Input
              id="ot"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Senior Backend Engineer"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ol">Location (optional)</Label>
            <Input
              id="ol"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Remote / Kathmandu"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="oj">Job description</Label>
          <Textarea
            id="oj"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            className="min-h-48 font-mono text-sm"
            placeholder="Paste the full job description here…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Creating…" : "Create opening"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
