"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteCv } from "./actions";

export function DeleteCvDialog({
  label,
  isPrimary,
  onDeleted,
}: {
  label: string;
  isPrimary: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteCv(label);
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        onDeleted();
      }
    } catch {
      setError("Failed to delete — try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!deleting) {
          setOpen(o);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          />
        }
      >
        Delete
      </DialogTrigger>
      <DialogContent showCloseButton={!deleting}>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{label}&rdquo;?</DialogTitle>
          <DialogDescription>
            This removes the CV and all its versions. Past evaluations and
            generated PDFs are kept — they&apos;ll just no longer link to this
            CV. This can&apos;t be undone.
            {isPrimary && (
              <span className="mt-2 block font-medium text-foreground">
                This is your primary CV — another CV will become primary
                automatically.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={deleting} />}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete CV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
