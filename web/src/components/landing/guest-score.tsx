"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { CvScore } from "@/lib/cv/score-schema";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { writePendingCv } from "@/lib/guest-cv";

const SAMPLE = `Maya Sharma
Backend Developer

Summary
Worked on web apps for a few years. Responsible for backend stuff.

Experience
Backend Developer, SomeCo (2021-now)
- Worked on the API
- Responsible for the database
- Helped with deployments

Skills
JavaScript, Python, SQL, Docker`;

function tier(score: number) {
  if (score >= 80) return { label: "Gold standard", color: "#15594E" };
  if (score >= 60) return { label: "Competitive", color: "#B8893C" };
  return { label: "Needs work", color: "#BB5A33" };
}

export function GuestScore() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<CvScore | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [gated, setGated] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const quickWins = useMemo(() => {
    if (!score) return [];
    return score.categories
      .flatMap((c) => c.improvements)
      .filter((i) => i.originalText && i.recommendedText)
      .slice(0, 3);
  }, [score]);

  async function run(payload: { text: string } | { file: File }) {
    setLoading(true);
    setError(null);
    try {
      const res =
        "file" in payload
          ? await fetch("/api/public/cv-score", {
              method: "POST",
              body: (() => {
                const f = new FormData();
                f.append("file", payload.file);
                return f;
              })(),
            })
          : await fetch("/api/public/cv-score", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      const data = await res.json();
      if (!res.ok) {
        if (data.limitReached) {
          setGated(true);
          setModalOpen(true);
          setError(null);
          return;
        }
        throw new Error(data.error ?? "Scoring failed");
      }
      setScore(data.score);
      setModalOpen(true);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      // Stash the CV so we can re-import it after the user signs up.
      if (typeof data.cvText === "string" && data.cvText.length > 0) {
        writePendingCv({
          text: data.cvText,
          score: data.score?.score,
          scoredAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setLoading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function scoreAnother() {
    setModalOpen(false);
    setScore(null);
    setText("");
  }

  const showGate = gated || remaining === 0;
  const open = modalOpen && (Boolean(score) || showGate);

  return (
    <>
      {/* ── Input card — always mounted so the hero never shifts ── */}
      <div className="rounded-2xl border border-[#E6DECF] bg-[#FCFBF7] p-6 shadow-[0_24px_60px_-30px_rgba(28,26,22,0.35)]">
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#BB5A33]">
            <span className="size-1.5 rounded-full bg-[#BB5A33]" />
            Free · no signup
          </span>
          <button
            onClick={() => setText(SAMPLE)}
            className="text-xs font-medium text-[#9A917F] underline-offset-2 hover:text-[#6E6656] hover:underline"
          >
            Use a sample CV
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your CV here…"
          className="h-44 w-full resize-none rounded-xl border border-[#E6DECF] bg-[#FAF7F0] p-4 font-mono text-sm text-[#1C1A16] placeholder:text-[#B3AB99] focus:border-[#103530]/40 focus:outline-none"
        />

        {error && <p className="mt-2 text-sm text-[#BB5A33]">{error}</p>}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => {
              if (text.trim().length < 100) {
                setError("Paste your full CV (a few lines), or upload a file.");
                return;
              }
              run({ text });
            }}
            disabled={loading}
            className="flex-1 rounded-full bg-[#1C1A16] px-6 py-3 text-sm font-semibold text-[#F4F1EA] transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
          >
            {loading ? "Scoring your CV…" : "Score my CV free"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) run({ file: f });
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={loading}
            className="rounded-full border border-[#D8CFBC] px-5 py-3 text-sm font-semibold text-[#4A453B] transition-colors hover:bg-[#F1ECE0] disabled:opacity-60"
          >
            Upload PDF
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-[#9A917F]">
          A 0–100 score with line-by-line rewrites in ~15 seconds.
        </p>
      </div>

      {/* ── Result / signup wall — modal overlay, hero stays put ── */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) setScore(null);
        }}
      >
        {showGate ? (
          <DialogContent
            showCloseButton={false}
            className="border-none bg-[#103530] p-8 text-center shadow-[0_24px_60px_-30px_rgba(28,26,22,0.45)] sm:max-w-md"
          >
            <DialogTitle className="sr-only">Free trial used</DialogTitle>
            <CloseButton onDark />
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E0A95C]">
              Free trial used
            </span>
            <h3 className="mt-3 font-serif text-2xl font-medium text-[#F4F1EA]">
              You&apos;ve used your 2 free scores.
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[#A9BDB3]">
              Create a free account to keep scoring — plus unlock the AI builder,
              line-by-line rewrites, real job scanning, and application tracking.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-block rounded-full bg-[#F4F1EA] px-7 py-3 text-sm font-semibold text-[#103530] transition-transform hover:scale-105"
            >
              Create free account →
            </Link>
            <p className="mt-3 text-xs text-[#7E978D]">
              Already have one?{" "}
              <Link href="/login" className="underline">
                Sign in
              </Link>
            </p>
          </DialogContent>
        ) : score ? (
          <DialogContent
            showCloseButton={false}
            className="max-h-[90vh] overflow-y-auto border border-[#E6DECF] bg-[#FCFBF7] p-6 shadow-[0_24px_60px_-30px_rgba(28,26,22,0.35)] sm:max-w-lg"
          >
            <DialogTitle className="sr-only">Your CV score</DialogTitle>
            <CloseButton />
            {/* score header */}
            <div className="flex items-center justify-between gap-4 border-b border-[#ECE5D7] pb-5">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-5xl font-semibold leading-none text-[#1C1A16]">
                    {score.score}
                  </span>
                  <span className="font-serif text-lg text-[#9A917F]">/100</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold" style={{ color: tier(score.score).color }}>
                  {tier(score.score).label}
                  <span className="font-normal text-[#6E6656]">
                    {" "}
                    · vs market avg {score.averageMarketScore}
                  </span>
                </p>
              </div>
              <span className="rounded-full border border-[#E6DECF] bg-white px-3 py-1 text-xs font-medium text-[#6E6656]">
                {score.roleCategory}
              </span>
            </div>

            {score.marketFitSummary && (
              <p className="mt-4 text-sm leading-relaxed text-[#4A453B]">
                {score.marketFitSummary}
              </p>
            )}

            {/* quick wins */}
            {quickWins.length > 0 && (
              <div className="mt-5 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9A917F]">
                  Your top quick wins
                </p>
                {quickWins.map((q, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-[#ECE5D7]">
                    <div className="bg-[#F8EDE6] px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#BB5A33]">
                        Avoid
                      </p>
                      <p className="mt-0.5 text-[13px] italic text-[#6E6656]">
                        &ldquo;{q.originalText}&rdquo;
                      </p>
                    </div>
                    <div className="bg-[#E9F0ED] px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#15594E]">
                        Rewrite
                      </p>
                      <p className="mt-0.5 text-[13px] font-medium text-[#1C1A16]">
                        &ldquo;{q.recommendedText}&rdquo;
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            <div className="mt-6 rounded-xl bg-[#103530] p-5 text-center">
              <p className="font-serif text-lg font-medium text-[#F4F1EA]">
                {score.categories.reduce((n, c) => n + c.improvements.length, 0) >
                quickWins.length
                  ? `${score.categories.reduce((n, c) => n + c.improvements.length, 0)} fixes found. Apply them in seconds.`
                  : "Now rebuild it — and find jobs that fit."}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-[#A9BDB3]">
                A free account saves this CV, unlocks the full breakdown, the AI
                builder, real job scanning, and application tracking.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login"
                  className="rounded-full bg-[#F4F1EA] px-6 py-2.5 text-sm font-semibold text-[#103530] transition-transform hover:scale-105"
                >
                  Create free account →
                </Link>
                {remaining !== 0 && (
                  <button
                    onClick={scoreAnother}
                    className="text-sm font-medium text-[#A9BDB3] transition-colors hover:text-[#F4F1EA]"
                  >
                    Score another{remaining === 1 ? " (1 free left)" : ""}
                  </button>
                )}
              </div>
            </div>
          </DialogContent>
        ) : (
          // Dialog requires a child even when closed; render nothing visible.
          <DialogContent className="hidden" />
        )}
      </Dialog>
    </>
  );
}

/** Dismiss button positioned at the modal's top-right, tinted for the surface. */
function CloseButton({ onDark = false }: { onDark?: boolean }) {
  return (
    <DialogClose
      className={`absolute right-3 top-3 rounded-full p-1.5 transition-colors ${
        onDark
          ? "text-[#A9BDB3] hover:bg-white/10 hover:text-[#F4F1EA]"
          : "text-[#9A917F] hover:bg-[#F1ECE0] hover:text-[#1C1A16]"
      }`}
    >
      <X className="size-4" />
      <span className="sr-only">Close</span>
    </DialogClose>
  );
}
