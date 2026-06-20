"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { restorePipelineItem } from "./actions";
import type { InboxRow } from "./inbox-item";

export function DismissedJobs({ items }: { items: InboxRow[] }) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) return null;

  function restore(id: string) {
    setPendingId(id);
    startTransition(async () => {
      await restorePipelineItem(id);
      setPendingId(null);
    });
  }

  return (
    <div className="rounded-lg border bg-background">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between px-2 py-3 text-sm font-medium hover:bg-muted/40"
      >
        <span>Dismissed jobs ({items.length})</span>
        <span className="text-xs text-muted-foreground">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.company}</TableCell>
                <TableCell className="text-muted-foreground">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {r.title}
                  </a>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.location || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingId === r.id}
                    onClick={() => restore(r.id)}
                  >
                    {pendingId === r.id ? "Restoring…" : "Restore to inbox"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
