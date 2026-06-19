"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveProfile, type ProfileFormData } from "./actions";

export function ProfileForm({ initial }: { initial: ProfileFormData }) {
  const [form, setForm] = useState<ProfileFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProfileFormData>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await saveProfile(form);
      if (res?.error) {
        setError(res.error);
      } else {
        setMessage("Profile saved.");
      }
    } catch {
      setError("Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  }

  const field = (
    key: keyof ProfileFormData,
    label: string,
    placeholder = "",
    opts: { disabled?: boolean; hint?: string } = {}
  ) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={form[key]}
        placeholder={placeholder}
        disabled={opts.disabled}
        readOnly={opts.disabled}
        onChange={(e) => set(key, e.target.value)}
        className={opts.disabled ? "cursor-not-allowed opacity-70" : undefined}
      />
      {opts.hint && <p className="text-xs text-muted-foreground">{opts.hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identity & location</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {field("full_name", "Full name", "Ada Lovelace")}
          {field("email", "Email", "you@example.com", {
            disabled: true,
            hint: "Linked to your Google account — can't be changed here.",
          })}
          {field("location_city", "City", "Kathmandu")}
          {field("location_country", "Country", "Nepal")}
          {field("timezone", "Timezone", "Asia/Kathmandu")}
          {field(
            "location_flexibility",
            "Location policy",
            "remote-only / hybrid OK / relocate"
          )}
        </CardContent>
      </Card>

      {/* Targeting block is hidden from the UI for now (kept in form state so
          saving preserves any existing target-role / comp / narrative data).
          Re-enable when the targeting UX is revisited. */}

      <div className="flex items-center gap-4">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
