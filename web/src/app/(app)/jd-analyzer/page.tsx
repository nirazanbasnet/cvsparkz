import { redirect } from "next/navigation";

// JD Analyzer merged into Evaluate (Quick check). Keep this route as a
// redirect so old links/bookmarks still work.
export default function JdAnalyzerPage() {
  redirect("/evaluate");
}
