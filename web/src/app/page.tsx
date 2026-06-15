import Link from "next/link";
import {
  Gauge,
  PenLine,
  Radar,
  ClipboardCheck,
  FileText,
  KanbanSquare,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GuestScore } from "@/components/landing/guest-score";

export const metadata = {
  title: "CVSparkz — Score, build, and land your next role with AI",
  description:
    "CVSparkz grades your CV against a gold standard, rebuilds it with AI, scans real jobs, evaluates fit with live market research, and tracks every application — one platform.",
};

const STATS = [
  { v: "15 sec", l: "to your first CV score" },
  { v: "0–100", l: "gold-standard grade" },
  { v: "A–G", l: "job-fit reports" },
  { v: "One", l: "pipeline, end to end" },
];

const FEATURES = [
  { icon: Gauge, t: "Score your CV", b: "An absolute 0–100 grade against a gold-standard benchmark, with a line-by-line rewrite for every weak bullet." },
  { icon: PenLine, t: "Build with AI", b: "A visual resume builder with a live ATS preview — improve, suggest, and summarize bullets in one click." },
  { icon: Radar, t: "Scan real jobs", b: "Watch any careers page — Greenhouse, Ashby, Lever, or custom — and surface openings that actually fit you." },
  { icon: ClipboardCheck, t: "Evaluate the fit", b: "A full A–G breakdown of any role against your CV, backed by live salary and company research." },
  { icon: FileText, t: "Tailor per job", b: "Generate an ATS-optimized PDF rewritten for each role's keywords — and see exactly what changed." },
  { icon: KanbanSquare, t: "Track the pipeline", b: "Every evaluation and application in one tracker, from first scan to signed offer." },
];

const STEPS = [
  { n: "01", t: "Score & build", b: "See your CV's real score, then fix it in the AI builder." },
  { n: "02", t: "Scan & match", b: "Track companies; get fit scores on fresh openings automatically." },
  { n: "03", t: "Tailor & apply", b: "Generate a job-specific CV and apply with confidence." },
  { n: "04", t: "Track & win", b: "Run the whole pipeline through to the offer." },
];

function Wordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className={`font-serif text-xl font-semibold tracking-tight ${onDark ? "text-[#F4F1EA]" : "text-[#1C1A16]"}`}>
      CVSparkz
      <span className="text-[#BB5A33]">.</span>
    </span>
  );
}

function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${onDark ? "text-[#9DB8AE]" : "text-[#BB5A33]"}`}>
      {children}
    </p>
  );
}

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-[#F4F1EA] font-sans text-[#1C1A16] antialiased">
      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark />
        <div className="flex items-center gap-7 text-sm">
          <a href="#features" className="hidden text-[#6E6656] transition-colors hover:text-[#1C1A16] sm:block">Features</a>
          <a href="#how" className="hidden text-[#6E6656] transition-colors hover:text-[#1C1A16] sm:block">How it works</a>
          {user ? (
            <Link href="/dashboard" className="rounded-full bg-[#1C1A16] px-5 py-2 font-semibold text-[#F4F1EA] transition-transform hover:scale-105">
              Open app →
            </Link>
          ) : (
            <Link href="/login" className="font-medium text-[#1C1A16] transition-colors hover:text-[#BB5A33]">
              Sign in
            </Link>
          )}
        </div>
      </nav>

      {/* ── Hero (two-column: copy + live demo) ───────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 lg:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E0D8C8] bg-[#FCFBF7] px-3.5 py-1.5 text-xs font-medium text-[#6E6656]">
              <span className="size-1.5 rounded-full bg-[#BB5A33]" />
              Score · Build · Match · Track
            </div>
            <h1 className="font-serif text-[2.7rem] font-semibold leading-[1.04] tracking-[-0.02em] text-[#1C1A16] sm:text-6xl">
              Your career deserves
              <br />
              a <span className="italic text-[#15594E]">spark.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#5A5447]">
              From a weak CV to a signed offer — CVSparkz scores your resume, rebuilds
              it with AI, scans real openings, evaluates each one with live market
              research, and tracks every application. In one place.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a href="#try" className="rounded-full bg-[#1C1A16] px-7 py-3.5 text-sm font-semibold text-[#F4F1EA] transition-transform hover:scale-105">
                Score my CV free
              </a>
              <a href="#how" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1C1A16] transition-colors hover:text-[#BB5A33]">
                See how it works <ArrowRight className="size-4" />
              </a>
            </div>
            <p className="mt-5 text-xs text-[#9A917F]">No signup to score. Free account to build, scan, and track.</p>
          </div>

          <div id="try" className="animate-in fade-in slide-in-from-bottom-6 duration-700 [animation-delay:150ms]">
            <GuestScore />
          </div>
        </div>

        {/* stat bar */}
        <div className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#E0D8C8] bg-[#E0D8C8] sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.l} className="bg-[#FCFBF7] px-6 py-6 text-center">
              <p className="font-serif text-3xl font-semibold text-[#15594E]">{s.v}</p>
              <p className="mt-1 text-xs font-medium text-[#6E6656]">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problem ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-[2.6rem]">
              Job hunting is broken <span className="italic text-[#15594E]">one tab at a time.</span>
            </h2>
            <p className="mt-5 max-w-md text-[#5A5447]">
              Your resume lives in one tool, job boards in ten more, and the
              tailoring, tracking, and follow-up live in your head. Nothing
              connects — so good candidates lose to better-organized ones.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { k: "Guesswork", v: "You never really know if your CV is good — until the rejections pile up." },
              { k: "Scattered", v: "Scoring, building, searching, and tracking are five disconnected apps." },
              { k: "Generic", v: "One resume sprayed at every role reads as generic to every recruiter." },
            ].map((c) => (
              <div key={c.k} className="rounded-2xl border border-[#E0D8C8] bg-[#FCFBF7] p-5">
                <p className="font-serif text-lg font-medium text-[#BB5A33]">{c.k}</p>
                <p className="mt-2 text-sm leading-relaxed text-[#5A5447]">{c.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Journey (deep teal) ──────────────────────────────── */}
      <section id="how" className="bg-[#103530] py-24 text-[#EDE7D9]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <Eyebrow onDark>How it works</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-tight text-[#F4F1EA] sm:text-[2.6rem]">
              Four steps. One <span className="italic text-[#E0A95C]">upward</span> trajectory.
            </h2>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-[#103530] p-6">
                <span className="font-serif text-3xl font-semibold text-[#E0A95C]">{s.n}</span>
                <h3 className="mt-3 font-serif text-xl font-medium text-[#F4F1EA]">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#9DB8AE]">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <Eyebrow>One platform</Eyebrow>
          <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-[2.6rem]">
            Everything between <span className="italic text-[#15594E]">&ldquo;I need a job&rdquo;</span> and the offer.
          </h2>
          <p className="mt-5 text-lg text-[#5A5447]">
            Most tools do one slice. CVSparkz does the whole arc — so your CV, your
            applications, and your pipeline finally talk to each other.
          </p>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[#E0D8C8] bg-[#E0D8C8] sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="group bg-[#FCFBF7] p-7 transition-colors hover:bg-white">
              <div className="flex size-11 items-center justify-center rounded-xl bg-[#103530] text-[#E0A95C]">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-serif text-xl font-medium">{f.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#5A5447]">{f.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA (deep teal) ────────────────────────────── */}
      <section className="bg-[#103530] py-24 text-center text-[#EDE7D9]">
        <div className="mx-auto max-w-2xl px-6">
          <Eyebrow onDark>Start free</Eyebrow>
          <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight tracking-tight text-[#F4F1EA] sm:text-5xl">
            Start with your score.
            <br />
            End with an <span className="italic text-[#E0A95C]">offer.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-lg text-[#9DB8AE]">
            Score your CV free in 15 seconds — then let CVSparkz take it the rest of
            the way.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a href="#try" className="rounded-full bg-[#F4F1EA] px-7 py-3.5 text-sm font-semibold text-[#103530] transition-transform hover:scale-105">
              Score my CV free
            </a>
            <Link href="/login" className="rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-white/5">
              Create free account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="bg-[#1C1A16] py-12 text-center text-sm text-[#9A917F]">
        <Wordmark onDark />
        <p className="mt-3">Score · Build · Match · Track — your career, on the rise.</p>
      </footer>
    </main>
  );
}
