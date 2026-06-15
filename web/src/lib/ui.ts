export function scoreBadgeVariant(
  score: number
): "default" | "secondary" | "destructive" | "outline" {
  if (score >= 4.5) return "default";
  if (score >= 4.0) return "secondary";
  if (score >= 3.5) return "outline";
  return "destructive";
}

export const STATUS_OPTIONS = [
  "evaluated",
  "applied",
  "responded",
  "interview",
  "offer",
  "rejected",
  "discarded",
  "skip",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  evaluated: "Evaluated",
  applied: "Applied",
  responded: "Responded",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  discarded: "Discarded",
  skip: "SKIP",
};
