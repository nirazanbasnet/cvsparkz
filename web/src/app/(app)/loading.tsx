import { Loader2 } from "lucide-react";

// Shown while an app page's server data streams in. The header (in layout.tsx)
// stays mounted and interactive — only this content area swaps to the spinner.
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Loader2 className="size-7 animate-spin text-[hsl(187_74%_32%)]" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}
