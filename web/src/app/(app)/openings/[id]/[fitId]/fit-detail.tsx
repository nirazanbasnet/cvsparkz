"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeepData } from "../opening-detail";
import type {
  InterviewQuestion,
  FollowUp,
  HiringReport,
} from "@/lib/recruiter/interview";
import { setCandidateStatus, saveCandidateNotes } from "../../actions";
import {
  scheduleInterview,
  saveInterview,
  deleteInterview,
} from "../../interview-actions";

interface FitInfo {
  fitId: string;
  name: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  sourceFilename: string | null;
  status: string;
  fitScore: number | null;
  verdict: string | null;
  summary: string | null;
  strengths: string[];
  gaps: string[];
  deep: DeepData | null;
  notes: string;
}

interface InterviewData {
  id: string;
  stage: string;
  interviewer: string | null;
  scheduledAt: string | null;
  status: string;
  questions: InterviewQuestion[];
  followUps: FollowUp[];
  report: HiringReport | null;
  reportAt: string | null;
}

const STATUS_OPTIONS = [
  "new",
  "reviewing",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;
const STAGES = ["screening", "technical", "final", "culture", "other"] as const;

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 85
      ? "bg-emerald-600 text-white"
      : score >= 70
        ? "bg-[hsl(187_74%_32%)] text-white"
        : score >= 50
          ? "bg-amber-500 text-white"
          : "bg-rose-500 text-white";
  return (
    <span className={`rounded-md px-2 py-1 text-sm font-bold tabular-nums ${cls}`}>
      {score}
    </span>
  );
}

function Chips({ items, tone }: { items: string[]; tone: "good" | "bad" }) {
  if (items.length === 0) return null;
  const mark = tone === "good" ? "✓" : "•";
  const color = tone === "good" ? "text-emerald-600" : "text-amber-600";
  return (
    <ul className="space-y-1 text-sm">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className={color}>{mark}</span>
          <span className="text-foreground/90">{s}</span>
        </li>
      ))}
    </ul>
  );
}

export function FitDetail({
  openingId,
  openingTitle,
  fit,
  interviews,
}: {
  openingId: string;
  openingTitle: string;
  fit: FitInfo;
  interviews: InterviewData[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(fit.status);
  const [deep, setDeep] = useState<DeepData | null>(fit.deep);
  const [deepLoading, setDeepLoading] = useState(false);
  const [notes, setNotes] = useState(fit.notes);

  async function changeStatus(s: string) {
    setStatus(s);
    await setCandidateStatus(fit.fitId, s);
  }

  async function runDeep() {
    setDeepLoading(true);
    try {
      const res = await fetch("/api/recruiter/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fitId: fit.fitId }),
      });
      const data = await res.json();
      if (res.ok && data.deep) setDeep(data.deep);
    } finally {
      setDeepLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/openings/${openingId}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {openingTitle || "Opening"}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{fit.name}</h1>
          <p className="text-sm text-muted-foreground">
            {fit.headline || fit.sourceFilename || "—"}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {fit.email && (
              <a href={`mailto:${fit.email}`} className="hover:underline">
                {fit.email}
              </a>
            )}
            {fit.phone && <span>{fit.phone}</span>}
          </div>
        </div>
        <select
          value={status}
          onChange={(e) => changeStatus(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm font-medium capitalize"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Screening fit */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-3 text-base">
            Screening fit
            {fit.fitScore != null ? (
              <ScoreBadge score={fit.fitScore} />
            ) : (
              <span className="text-xs font-normal text-muted-foreground">
                not screened yet
              </span>
            )}
            {fit.verdict && (
              <span className="text-sm font-normal text-muted-foreground">
                {fit.verdict}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fit.summary && <p className="text-sm text-foreground/90">{fit.summary}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
                Strengths
              </p>
              <Chips items={fit.strengths} tone="good" />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">
                Gaps
              </p>
              <Chips items={fit.gaps} tone="bad" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deep eval */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Deep evaluation (CV vs JD)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {deep ? (
            <>
              <p className="text-sm">
                <span className="font-semibold">
                  {deep.verdict} · {deep.fitScore}/100
                </span>{" "}
                — {deep.recommendation}
              </p>
              {deep.scorecard && deep.scorecard.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  {deep.scorecard.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                    >
                      <span className="w-40 shrink-0 font-medium">{s.dimension}</span>
                      <span className="w-10 shrink-0 tabular-nums">{s.score}/5</span>
                      <span className="text-muted-foreground">{s.note}</span>
                    </div>
                  ))}
                </div>
              )}
              {deep.riskFlags.length > 0 && (
                <p className="text-sm text-rose-600">
                  Risks: {deep.riskFlags.join("; ")}
                </p>
              )}
              {deep.interviewFocus.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium">Interview focus:</span>
                  <ul className="ml-4 list-disc text-foreground/90">
                    {deep.interviewFocus.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <Button variant="outline" disabled={deepLoading} onClick={runDeep}>
              {deepLoading && <Loader2 className="size-4 animate-spin" />}
              {deepLoading ? "Evaluating…" : "Run deep evaluation"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== fit.notes && saveCandidateNotes(fit.fitId, notes)}
            placeholder="Private notes about this candidate…"
            className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
          />
        </CardContent>
      </Card>

      {/* Interviews */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Interviews</h2>
        <ScheduleForm fitId={fit.fitId} onScheduled={() => router.refresh()} />
        {interviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No interviews yet. Schedule one above to generate tailored questions.
          </p>
        ) : (
          interviews.map((iv) => (
            <InterviewCard key={iv.id} candidateName={fit.name} interview={iv} />
          ))
        )}
      </div>
    </div>
  );
}

function ScheduleForm({
  fitId,
  onScheduled,
}: {
  fitId: string;
  onScheduled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<string>("screening");
  const [interviewer, setInterviewer] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await scheduleInterview(fitId, {
      stage,
      interviewer,
      scheduledAt: date ? new Date(date).toISOString() : null,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    setInterviewer("");
    setDate("");
    onScheduled();
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Schedule interview</Button>;
  }
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-6">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Stage</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm capitalize"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Interviewer</label>
          <Input
            value={interviewer}
            onChange={(e) => setInterviewer(e.target.value)}
            placeholder="Name"
            className="h-9 w-44"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Date</label>
          <Input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9"
          />
        </div>
        <Button onClick={submit} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Scheduling…" : "Schedule"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function InterviewCard({
  candidateName,
  interview,
}: {
  candidateName: string;
  interview: InterviewData;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<InterviewQuestion[]>(interview.questions);
  const [followUps, setFollowUps] = useState<FollowUp[]>(interview.followUps);
  const [report, setReport] = useState<HiringReport | null>(interview.report);
  const [genLoading, setGenLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuNote, setFuNote] = useState("");
  const [fuDate, setFuDate] = useState("");

  const scheduled = interview.scheduledAt
    ? new Date(interview.scheduledAt).toLocaleString()
    : null;

  async function generate() {
    setGenLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiter/interview/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: interview.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      setQuestions(data.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenLoading(false);
    }
  }

  function updateQ(id: string, patch: Partial<InterviewQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  async function saveAnswers() {
    setSaving(true);
    await saveInterview(interview.id, { questions });
    setSaving(false);
  }

  async function persistFollowUps(next: FollowUp[]) {
    setFollowUps(next);
    await saveInterview(interview.id, { followUps: next });
  }

  function addFollowUp() {
    if (!fuNote.trim()) return;
    const fu: FollowUp = {
      id: `fu${Date.now()}`,
      dueDate: fuDate ? new Date(fuDate).toISOString() : null,
      note: fuNote.trim(),
      done: false,
    };
    persistFollowUps([...followUps, fu]);
    setFuNote("");
    setFuDate("");
  }

  async function genReport() {
    setReportLoading(true);
    setError(null);
    try {
      // persist current answers first so the report reflects them
      await saveInterview(interview.id, { questions });
      const res = await fetch("/api/recruiter/interview/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: interview.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to build report");
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build report");
    } finally {
      setReportLoading(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this interview?")) return;
    await deleteInterview(interview.id);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium capitalize">
              {interview.stage} interview
              <span className="ml-2 text-xs font-normal text-muted-foreground capitalize">
                · {interview.status}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {scheduled ? `Scheduled ${scheduled}` : "No date set"}
              {interview.interviewer ? ` · ${interview.interviewer}` : ""}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={remove}>
            Delete
          </Button>
        </div>

        {/* Questions */}
        {questions.length === 0 ? (
          <Button variant="outline" disabled={genLoading} onClick={generate}>
            {genLoading && <Loader2 className="size-4 animate-spin" />}
            {genLoading ? "Generating…" : "Generate tailored questions"}
          </Button>
        ) : (
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                    {q.question}
                  </p>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {q.category}
                  </span>
                </div>
                {q.why && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">
                    Probes: {q.why}
                  </p>
                )}
                <textarea
                  value={q.answer}
                  onChange={(e) => updateQ(q.id, { answer: e.target.value })}
                  placeholder="Candidate's answer / interviewer notes…"
                  className="mt-2 min-h-14 w-full rounded-md border bg-background p-2 text-sm"
                />
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Score</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={q.score ?? ""}
                    onChange={(e) =>
                      updateQ(q.id, {
                        score: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="h-8 w-16 rounded-md border bg-background px-2 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">/ 5</span>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={saveAnswers}>
                {saving ? "Saving…" : "Save answers"}
              </Button>
              <Button size="sm" disabled={reportLoading} onClick={genReport}>
                {reportLoading && <Loader2 className="size-4 animate-spin" />}
                {reportLoading ? "Building report…" : report ? "Regenerate report" : "Generate hiring report"}
              </Button>
            </div>
          </div>
        )}

        {/* Follow-ups */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Follow-ups
          </p>
          {followUps.map((fu) => (
            <label key={fu.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fu.done}
                onChange={() =>
                  persistFollowUps(
                    followUps.map((f) => (f.id === fu.id ? { ...f, done: !f.done } : f))
                  )
                }
              />
              <span className={fu.done ? "text-muted-foreground line-through" : ""}>
                {fu.note}
                {fu.dueDate && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    due {new Date(fu.dueDate).toLocaleDateString()}
                  </span>
                )}
              </span>
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={fuNote}
              onChange={(e) => setFuNote(e.target.value)}
              placeholder="Add a follow-up…"
              className="h-8 w-56"
            />
            <Input
              type="date"
              value={fuDate}
              onChange={(e) => setFuDate(e.target.value)}
              className="h-8 w-40"
            />
            <Button variant="ghost" size="sm" onClick={addFollowUp}>
              Add
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Report */}
        {report && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(270_70%_45%)]">
                  Hiring decision · {report.overallScore}/5
                </p>
                <p className="font-semibold">{report.verdict}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    `/api/recruiter/interview/pdf?interviewId=${interview.id}`,
                    "_blank"
                  )
                }
              >
                Download PDF
              </Button>
            </div>
            <p className="text-sm text-foreground/90">{report.summary}</p>
            {report.scorecard.length > 0 && (
              <div className="overflow-hidden rounded-lg border bg-background">
                {report.scorecard.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 border-b px-3 py-1.5 text-sm last:border-b-0"
                  >
                    <span className="w-40 shrink-0 font-medium">{s.dimension}</span>
                    <span className="w-10 shrink-0 tabular-nums">{s.score}/5</span>
                    <span className="text-muted-foreground">{s.note}</span>
                  </div>
                ))}
              </div>
            )}
            {report.concerns.length > 0 && (
              <div className="text-sm">
                <span className="font-medium text-rose-600">Concerns:</span>
                <ul className="ml-4 list-disc">
                  {report.concerns.map((c, i) => (
                    <li key={i}>
                      <span className="font-medium">{c.title}</span> — {c.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm">
              <span className="font-medium">Recommendation:</span> {report.recommendation}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Full report for {candidateName} available as PDF.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
