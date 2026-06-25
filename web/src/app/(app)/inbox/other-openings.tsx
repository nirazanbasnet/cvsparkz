"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InboxItem, type InboxRow } from "./inbox-item";

/**
 * Postings the scanner found that fell outside the user's title/location
 * filters. Collapsed by default so it never competes with the matched inbox,
 * but available so nothing is lost — the user can evaluate any of these (e.g.
 * with a different CV) or dismiss them. Same row + actions as the main inbox.
 */
export function OtherOpenings({ items }: { items: InboxRow[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-background">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-3 text-left hover:bg-muted/40"
      >
        <span className="text-sm font-medium">
          Other openings · didn&apos;t match your filters ({items.length})
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Found by the scanner but outside your title/location filters — kept
            so you can still apply, e.g. with a different CV. Evaluate or dismiss
            any of them, or loosen your filters on the{" "}
            <a href="/scan" className="underline">
              scanner
            </a>
            .
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quick fit</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <InboxItem key={r.id} item={r} />
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
