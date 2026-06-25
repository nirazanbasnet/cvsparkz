"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "View original" — shows the CV exactly as the user uploaded it. PDFs render
 * inline in an iframe; DOCX can't render in-browser, so we offer a download.
 * The signed URL is fetched lazily when the dialog opens (300s TTL).
 */
export function OriginalCvDialog({
  label,
  filename,
  mime,
}: {
  label: string;
  filename: string;
  mime?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPdf =
    (mime ?? "").includes("pdf") || /\.pdf$/i.test(filename);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cv-original?label=${encodeURIComponent(label)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the file");
      setUrl(data.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the file");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !url && !loading) load();
        if (!o) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <FileText className="size-4" />
            View original
          </Button>
        }
      />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Original CV</DialogTitle>
          <DialogDescription>
            The file you uploaded — {filename} — shown as-is.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && <p className="py-6 text-center text-sm text-destructive">{error}</p>}

        {!loading && !error && url && isPdf && (
          <iframe
            src={url}
            title={`Original CV — ${filename}`}
            className="h-[70vh] w-full rounded-md border bg-white"
          />
        )}

        {!loading && !error && url && !isPdf && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <FileText className="size-10 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              This file type can&apos;t be previewed in the browser. Download it
              to open in your editor.
            </p>
            <Button
              render={
                <a
                  href={`/api/cv-original?label=${encodeURIComponent(label)}&download=1`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <Download className="size-4" />
              Download {filename}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
