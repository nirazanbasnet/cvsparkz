# CVSparkz — Feature Backlog (parity with the original career-ops CLI)

Features present in the original `career-ops` CLI that are **not yet built** in
the cloud app. Ordered by impact. "Scaffolded" = the DB table already exists
(from the original schema), so only feature/UI work remains.

> Built so far in cloud: CV score, visual builder + AI assists, JD analyzer,
> job evaluation (A–G) + live Tavily research, scan + inbox + quick-fit,
> tailored PDF, tracker, dashboard, landing + guest flow.

## Tier 1 — highest impact (DB tables already exist)

- [ ] **Interview prep + STAR story bank** — company-specific interview intel
      reports + a reusable bank of STAR+R stories. Tables: `interview_preps`,
      `stories`. (Original mode: `interview-prep`.)
- [ ] **Follow-up cadence / reminders** — when & how to follow up on each
      application; urgency + next-action dates. Table: `follow_ups`.
      (Original mode: `followup`, `followup-cadence.mjs`.)
- [ ] **Outreach / contact drafting** — suggest contacts + draft ≤300-char
      LinkedIn messages (never auto-send). Table: `contacts`.
      (Original mode: `contacto`.)

## Tier 2 — strong value

- [ ] **Cover letter generation** — the original treats a tailored cover letter
      as standard on every application; cloud has none.
- [ ] **Compare & rank multiple offers** — side-by-side ranking of evaluated
      roles. (Original mode: `ofertas`.)
- [ ] **Pattern / rejection analytics** — funnel, blockers, archetype
      performance, recommended score threshold; recommendations to update
      profile/scan config. (Original: `patterns`, `analyze-patterns.mjs`.)
- [ ] **Job-posting liveness check** — populate `job_postings.is_live` so
      stale/closed scanned roles are flagged. (Original: `check-liveness.mjs`.)

## Tier 3 — nice to have

- [ ] **Deep company research** — standalone deep-dive (today we only do light
      Tavily research inside an evaluation). (Original mode: `deep`.)
- [ ] **Live application assistant** — fill forms / draft application answers.
      (Original mode: `apply`.)
- [ ] **Course & portfolio-project evaluation** — score a cert/course or
      project idea against goals. (Original modes: `training`, `project`.)
- [ ] **Multi-language modes** — DE / FR / JA / TR. `prompt_templates` table
      exists for lang variants.
- [ ] **LaTeX / Overleaf CV export** — cloud only does HTML→PDF.
      (Original: `latex`, `generate-latex.mjs`.)
- [ ] **Proof points / article digest** — `proof_points` table exists (with
      embeddings) but no UI; partially covered by profile narrative.

## Intentionally not ported

- **`batch`** (parallel headless workers) — cloud evaluates inline; only needed
  at high scale.
- **`update`** (CLI self-updater) — irrelevant to a hosted app.
