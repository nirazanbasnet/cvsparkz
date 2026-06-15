"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { saveCv, setPrimaryCv } from "./actions";
import { DeleteCvDialog } from "./delete-cv-dialog";

/** 0–100 CV score → badge variant. */
function cvScoreVariant(s: number): "default" | "secondary" | "destructive" {
  if (s >= 80) return "default";
  if (s >= 60) return "secondary";
  return "destructive";
}

export interface CvSummary {
  label: string;
  primaryRole: string | null;
  version: number;
  contentMd: string;
  isPrimary: boolean;
  updatedAt: string;
  scoreOverall: number | null;
}

export function CvWorkspace({
  cvs,
  selectedLabel,
}: {
  cvs: CvSummary[];
  selectedLabel: string | null;
}) {
  const router = useRouter();
  const selected = cvs.find((c) => c.label === selectedLabel) ?? null;
  const isNew = selected === null && cvs.length > 0;

  const [label, setLabel] = useState(selected?.label ?? "Main CV");
  const [role, setRole] = useState(selected?.primaryRole ?? "");
  const [content, setContent] = useState(selected?.contentMd ?? "");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [primaryPending, setPrimaryPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const editingExisting = cvs.some((c) => c.label === label);

  function loadCv(cv: CvSummary) {
    setMessage(null);
    setError(null);
    setLabel(cv.label);
    setRole(cv.primaryRole ?? "");
    setContent(cv.contentMd);
    router.push(`/cv?cv=${encodeURIComponent(cv.label)}`);
  }

  function startNewCv() {
    setMessage(null);
    setError(null);
    setLabel(`CV ${cvs.length + 1}`);
    setRole("");
    setContent("");
    router.push("/cv?cv=__new__");
  }

  async function onSave() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await saveCv({ contentMd: content, label, primaryRole: role });
      if (res.error) {
        setError(res.error);
      } else {
        setMessage(`Saved "${label}" (v${res.version}).`);
        router.push(`/cv?cv=${encodeURIComponent(label)}`);
        router.refresh();
      }
    } catch {
      setError("Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onFileChosen(file: File) {
    setImporting(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/cv-import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setContent(data.markdown);
      if (data.role && !role) setRole(data.role);
      if (!editingExisting && file.name) {
        setLabel(file.name.replace(/\.(pdf|docx|md|markdown|txt)$/i, ""));
      }
      setMessage(
        "Imported! Review the markdown — fix anything that parsed oddly, then save."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function makePrimary(cvLabel: string) {
    setError(null);
    setPrimaryPending(cvLabel);
    startTransition(async () => {
      const res = await setPrimaryCv(cvLabel);
      if (res?.error) setError(res.error);
      else router.refresh();
      setPrimaryPending(null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Your CVs</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Keep one CV per direction (e.g. backend, data, management). The{" "}
            <span className="font-medium text-foreground">primary</span> CV is
            used for evaluations and tailored PDFs, and its target role filters
            scanned jobs when no manual filters are set.
          </p>
        </div>
        <Button variant="outline" onClick={startNewCv}>
          + New CV
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* ── Left: CV library ──────────────────────────────── */}
        <aside className="space-y-2 lg:sticky lg:top-20 lg:self-start">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            CV library ({cvs.length})
          </p>

          {cvs.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No CVs yet — upload a file or write one on the right.
              </CardContent>
            </Card>
          )}

          {cvs.map((cv) => {
            const active = !isNew && cv.label === selected?.label;
            return (
              <button
                key={cv.label}
                onClick={() => loadCv(cv)}
                className={`block w-full rounded-lg border bg-background p-3 text-left transition-colors hover:border-[hsl(187_74%_32%)]/60 ${
                  active
                    ? "border-[hsl(187_74%_32%)] ring-1 ring-[hsl(187_74%_32%)]/30"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {cv.label}
                  </span>
                  {cv.scoreOverall != null && (
                    <Badge
                      variant={cvScoreVariant(cv.scoreOverall)}
                      className="shrink-0"
                      title="CV score (0–100) vs gold standard"
                    >
                      {cv.scoreOverall}
                    </Badge>
                  )}
                  {cv.isPrimary && (
                    <Badge className="shrink-0 bg-linear-to-r from-[hsl(187_74%_32%)] to-[hsl(270_70%_45%)] text-white">
                      Primary
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {cv.primaryRole || "no target role set"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  v{cv.version} · {new Date(cv.updatedAt).toLocaleDateString()}
                </p>
              </button>
            );
          })}
        </aside>

        {/* ── Right: editor / detail ────────────────────────── */}
        <Card className="overflow-hidden">
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold">
                {isNew ? "New CV" : editingExisting ? label : "New CV"}
              </h2>
              {!isNew && editingExisting && selected && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    render={
                      <Link href={`/cv/builder?cv=${encodeURIComponent(selected.label)}`} />
                    }
                  >
                    Open builder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link href={`/cv/score?cv=${encodeURIComponent(selected.label)}`} />
                    }
                  >
                    {selected.scoreOverall != null
                      ? `Score: ${selected.scoreOverall}`
                      : "Score CV"}
                  </Button>
                  {!selected.isPrimary && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={primaryPending === selected.label}
                      onClick={() => makePrimary(selected.label)}
                    >
                      {primaryPending === selected.label
                        ? "Setting…"
                        : "Set primary"}
                    </Button>
                  )}
                  <DeleteCvDialog
                    label={selected.label}
                    isPrimary={selected.isPrimary}
                    onDeleted={() => {
                      const next = cvs.find((c) => c.label !== selected.label);
                      if (next) loadCv(next);
                      else startNewCv();
                      router.refresh();
                    }}
                  />
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Upload a file (PDF, DOCX, Markdown, TXT) or edit the markdown
              directly. Nothing is saved until you hit Save.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cv-label">CV name</Label>
                <Input
                  id="cv-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Backend CV"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-role">Target role (drives job filtering)</Label>
                <Input
                  id="cv-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Senior Backend Engineer"
                />
              </div>
            </div>

            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileChosen(f);
              }}
            />
            <Button
              variant="outline"
              disabled={importing}
              onClick={() => fileInput.current?.click()}
            >
              {importing ? "Importing… (~10s)" : "Upload CV file"}
            </Button>

            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-120 font-mono text-sm"
              placeholder={`# Your Name\n\n## Summary\n…\n\n## Experience\n…\n\n## Skills\n…`}
            />

            <div className="flex items-center gap-4">
              <Button onClick={onSave} disabled={saving || importing}>
                {saving ? "Saving…" : "Save CV"}
              </Button>
              {message && (
                <p className="text-sm text-muted-foreground">{message}</p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
