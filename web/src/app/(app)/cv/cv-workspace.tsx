"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveCv, setPrimaryCv } from "./actions";
import { DeleteCvDialog } from "./delete-cv-dialog";
import { AnnotatedCv } from "./annotated-cv";
import { OriginalCvDialog } from "./original-cv-dialog";
import { clearPendingCv, readPendingCv } from "@/lib/guest-cv";

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
  originalFilename: string | null;
  originalMime: string | null;
  hasStructured: boolean;
}

/** Client-side download of the CV's markdown (no server round-trip). */
function downloadMarkdown(label: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${label.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "cv"}.md`;
  a.click();
  URL.revokeObjectURL(url);
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
  // Original file (PDF/DOCX) from the most recent import, carried into saveCv.
  const [pendingOriginal, setPendingOriginal] = useState<
    { objectKey: string; filename: string; mime: string } | null
  >(null);
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // ── Claim a CV scored on the landing page before signup ──────
  type PendingImport =
    | { phase: "importing" }
    | { phase: "ready"; markdown: string; role: string | null; label: string }
    | { phase: "error"; message: string };
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [makePrimaryChoice, setMakePrimaryChoice] = useState(true);
  const [pendingSaving, setPendingSaving] = useState(false);
  const pendingStarted = useRef(false);

  const editingExisting = cvs.some((c) => c.label === label);

  /** A label that won't collide with an existing CV (so the import becomes a
   *  NEW CV rather than a new version of one the user already has). */
  function uniqueCvLabel(base: string) {
    if (!cvs.some((c) => c.label === base)) return base;
    let i = 2;
    while (cvs.some((c) => c.label === `${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  /** Re-import the guest-scored CV (LLM cleanup) and prefill the editor so
   *  it's ready to save once the user confirms in the claim dialog. */
  async function importGuestCv(text: string) {
    const importLabel =
      cvs.length === 0 ? "Main CV" : uniqueCvLabel("Imported CV");
    setPending({ phase: "importing" });
    try {
      const file = new File([text], "scored-cv.txt", { type: "text/plain" });
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/cv-import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const markdown = String(data.markdown ?? "");
      const role = (data.role ?? null) as string | null;
      setLabel(importLabel);
      setRole(role ?? "");
      setContent(markdown);
      setPending({ phase: "ready", markdown, role, label: importLabel });
    } catch (e) {
      setPending({
        phase: "error",
        message: e instanceof Error ? e.message : "Import failed",
      });
    }
  }

  // On arrival, if the visitor scored a CV before signing up, claim it.
  // Fetch-on-mount with a loading state is a legitimate effect→external-system
  // sync; importGuestCv intentionally reads mount-time props.
  useEffect(() => {
    if (pendingStarted.current) return;
    const guest = readPendingCv();
    if (!guest?.text) return;
    pendingStarted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void importGuestCv(guest.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Close the claim dialog. Always clears the stash (so it won't nag again);
   *  the prefilled draft stays in the editor unless the user discarded it. */
  function closePending(resetEditor: boolean) {
    clearPendingCv();
    setPending(null);
    if (resetEditor) {
      setLabel(selected?.label ?? "Main CV");
      setRole(selected?.primaryRole ?? "");
      setContent(selected?.contentMd ?? "");
    }
  }

  async function savePending() {
    if (pending?.phase !== "ready") return;
    setPendingSaving(true);
    setError(null);
    try {
      const res = await saveCv({
        contentMd: pending.markdown,
        label: pending.label,
        primaryRole: pending.role ?? "",
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      // The first CV is auto-primary; for additional CVs, honor the choice.
      if (cvs.length > 0 && makePrimaryChoice) {
        const pr = await setPrimaryCv(pending.label);
        if (pr?.error) setError(pr.error);
      }
      clearPendingCv();
      const savedLabel = pending.label;
      setPending(null);
      setMessage(`Saved "${savedLabel}".`);
      router.push(`/cv?cv=${encodeURIComponent(savedLabel)}`);
      router.refresh();
    } catch {
      setError("Failed to save — try again.");
    } finally {
      setPendingSaving(false);
    }
  }

  function loadCv(cv: CvSummary) {
    setMessage(null);
    setError(null);
    setPendingOriginal(null);
    setLabel(cv.label);
    setRole(cv.primaryRole ?? "");
    setContent(cv.contentMd);
    router.push(`/cv?cv=${encodeURIComponent(cv.label)}`);
  }

  function startNewCv() {
    setMessage(null);
    setError(null);
    setPendingOriginal(null);
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
      const res = await saveCv({
        contentMd: content,
        label,
        primaryRole: role,
        original: pendingOriginal,
      });
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
      setPendingOriginal(data.original ?? null);
      if (data.role && !role) setRole(data.role);
      if (!editingExisting && file.name) {
        setLabel(file.name.replace(/\.(pdf|docx|md|markdown|txt)$/i, ""));
      }
      setMessage(
        data.original
          ? "Imported! Review the text, then save — your original file is kept too."
          : "Imported! Review the markdown — fix anything that parsed oddly, then save."
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
    <>
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
        <aside className="space-y-2 lg:sticky lg:top-0 lg:self-start">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            CV library ({cvs.length})
          </p>

          {cvs.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No CVs yet — upload one on the right to get started.
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

        {/* ── Right: controls on top, recruiter's-eye CV below ── */}
        <Card className="overflow-hidden">
          <CardContent className="space-y-5">
            {/* title + per-CV actions */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold">
                {isNew ? "New CV" : editingExisting ? label : "New CV"}
              </h2>
              {!isNew && editingExisting && selected && (
                <div className="flex flex-wrap items-center gap-2">
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
                  {selected.hasStructured ? (
                    <Button
                      variant="outline"
                      size="sm"
                      title="Download as PDF"
                      render={
                        <a
                          href={`/api/cv-pdf?label=${encodeURIComponent(selected.label)}`}
                          download
                        />
                      }
                    >
                      <Download className="size-4" /> PDF
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      title="Download as Markdown (build in the editor for a PDF)"
                      onClick={() => downloadMarkdown(selected.label, selected.contentMd)}
                    >
                      <Download className="size-4" /> .md
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

            {/* metadata + upload + save toolbar */}
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
            <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
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
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={importing}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="size-4" />
                  {importing
                    ? "Importing… (~10s)"
                    : content.trim()
                      ? "Replace with file"
                      : "Upload CV file"}
                </Button>
                <Button onClick={onSave} disabled={saving || importing || !content.trim()}>
                  {saving ? "Saving…" : "Save CV"}
                </Button>
                {message && (
                  <p className="text-sm text-muted-foreground">{message}</p>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <p className="text-xs text-muted-foreground">
                Upload a PDF, DOCX, Markdown, or TXT — we keep your original file
                and mark up the parsed version below. Edit the content anytime in
                the builder. Nothing saves until you hit Save.
              </p>
            </div>

            {/* recruiter's-eye markup of the working CV */}
            {content.trim() ? (
              <AnnotatedCv
                markdown={content}
                version={!isNew && editingExisting ? selected?.version : undefined}
                headerAction={
                  !isNew && editingExisting && selected?.originalFilename ? (
                    <OriginalCvDialog
                      label={selected.label}
                      filename={selected.originalFilename}
                      mime={selected.originalMime}
                    />
                  ) : undefined
                }
              />
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/10 p-10 text-center">
                <Upload className="mx-auto size-7 text-muted-foreground" />
                <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
                  Upload your CV to see it the way a recruiter reads it — name
                  circled, strengths and skills highlighted, results starred.
                </p>
                <Button
                  className="mt-4"
                  disabled={importing}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="size-4" />
                  {importing ? "Importing… (~10s)" : "Upload CV file"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>

    {/* ── Claim-your-scored-CV dialog (post-signup) ───────────── */}
    <Dialog
      open={pending !== null}
      onOpenChange={(o) => {
        if (!o && !pendingSaving) closePending(false);
      }}
    >
      <DialogContent showCloseButton={!pendingSaving} className="sm:max-w-md">
        {pending?.phase === "importing" && (
          <>
            <DialogHeader>
              <DialogTitle>Bringing in the CV you scored…</DialogTitle>
              <DialogDescription>
                Cleaning up the formatting from your landing-page score. One
                moment.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {pending?.phase === "error" && (
          <>
            <DialogHeader>
              <DialogTitle>Couldn&apos;t import that CV</DialogTitle>
              <DialogDescription>{pending.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => closePending(true)}>
                Dismiss
              </Button>
            </DialogFooter>
          </>
        )}

        {pending?.phase === "ready" && (
          <>
            <DialogHeader>
              <DialogTitle>Save the CV you scored?</DialogTitle>
              <DialogDescription>
                This is the CV you scored before signing up — cleaned up and
                ready in the editor.
                {cvs.length === 0
                  ? " It'll be saved as your primary CV."
                  : " Save it to your library, or make it your primary CV."}
              </DialogDescription>
            </DialogHeader>
            {cvs.length > 0 && (
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={makePrimaryChoice}
                  onChange={(e) => setMakePrimaryChoice(e.target.checked)}
                  className="size-4 rounded border-input accent-[hsl(187_74%_32%)]"
                />
                Make this my primary CV
              </label>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => closePending(true)}
                disabled={pendingSaving}
              >
                Discard
              </Button>
              <Button onClick={savePending} disabled={pendingSaving}>
                {pendingSaving
                  ? "Saving…"
                  : cvs.length === 0 || makePrimaryChoice
                    ? "Save as primary CV"
                    : "Save CV"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
