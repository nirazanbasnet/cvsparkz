"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { parseStructuredCv, type StructuredCv } from "@/lib/cv/structured";
import { saveStructuredCv } from "../actions";
import { BUILDER_TABS, SectionEditor } from "./editors";
import { ResumePreview } from "./resume-preview";

export function BuilderClient({
  label,
  primaryRole,
  initialStructured,
  canExtract,
}: {
  label: string;
  primaryRole: string;
  initialStructured: StructuredCv | null;
  canExtract: boolean;
}) {
  const router = useRouter();
  const [cv, setCv] = useState<StructuredCv | null>(initialStructured);
  const [role, setRole] = useState(primaryRole);
  const [tab, setTab] = useState<string>("basics");
  const [extracting, setExtracting] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);

  // Debounced autosave whenever the structured CV changes
  useEffect(() => {
    if (!cv || !dirty.current) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      const res = await saveStructuredCv({ label, primaryRole: role, structured: cv });
      if (res.error) {
        setError(res.error);
        setSaveState("error");
      } else {
        setError(null);
        setSaveState("saved");
        router.refresh();
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [cv, role, label, router]);

  function update(updater: (c: StructuredCv) => StructuredCv) {
    dirty.current = true;
    setCv((c) => (c ? updater(c) : c));
  }

  async function extract() {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/cv-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      setCv(parseStructuredCv(data.structured));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  function startBlank() {
    setCv(parseStructuredCv({}));
    dirty.current = true;
  }

  // Empty state: offer to parse existing CV into the builder, or start blank
  if (!cv) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-[hsl(187_74%_32%)] to-[hsl(270_70%_45%)] text-white">
              <Sparkles className="size-6" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-semibold">
                Open &ldquo;{label}&rdquo; in the builder
              </h1>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {canExtract
                  ? "Let AI parse your existing CV into editable sections, or start from a blank structure."
                  : "Start building your CV section by section, with AI help on every bullet."}
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              {canExtract && (
                <Button onClick={extract} disabled={extracting}>
                  {extracting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Parsing… (~15s)
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" /> Parse my CV into the builder
                    </>
                  )}
                </Button>
              )}
              <Button variant="outline" onClick={startBlank} disabled={extracting}>
                Start blank
              </Button>
            </div>
            <Button variant="ghost" size="sm" render={<Link href={`/cv?cv=${encodeURIComponent(label)}`} />}>
              ← Back to CV
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" render={<Link href={`/cv?cv=${encodeURIComponent(label)}`} />}>
            ← Back
          </Button>
          <div>
            <h1 className="font-heading text-lg font-semibold">Builder · {label}</h1>
            <p className="text-xs text-muted-foreground">
              {saveState === "saving" && (
                <span className="inline-flex items-center gap-1 text-[hsl(187_74%_32%)]">
                  <Loader2 className="size-3 animate-spin" /> Saving…
                </span>
              )}
              {saveState === "saved" && (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <Save className="size-3" /> Saved · markdown synced for evals
                </span>
              )}
              {saveState === "error" && <span className="text-destructive">{error}</span>}
              {saveState === "idle" && "Changes auto-save"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={role}
            onChange={(e) => {
              dirty.current = true;
              setRole(e.target.value);
            }}
            placeholder="Target role"
            className="w-48"
          />
          <Button render={<Link href={`/cv/score?cv=${encodeURIComponent(label)}`} />}>
            Score this CV →
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editor pane */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
            {BUILDER_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Card>
            <CardContent>
              <SectionEditor tab={tab} cv={cv} setCv={update} />
            </CardContent>
          </Card>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Live ATS preview
          </p>
          <div className="overflow-hidden rounded-lg border bg-muted/30">
            <div className="max-h-[78vh] overflow-y-auto p-4">
              <div className="origin-top scale-[0.92]">
                <ResumePreview cv={cv} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
