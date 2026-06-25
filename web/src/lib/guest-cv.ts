/**
 * Bridge for the CV a visitor scores on the landing page *before* signing up.
 *
 * The public scoring endpoint persists nothing (there's no tenant yet), so we
 * stash the extracted CV text client-side. It survives the OAuth round-trip and
 * onboarding (same browser/origin), and is claimed on the /cv page after login:
 * the text is re-imported (LLM cleanup), and the user is asked whether to make
 * it their primary CV. Cleared once claimed or discarded.
 */

export const PENDING_CV_KEY = "cvsparkz_pending_cv";

/** Set once per browser session after we auto-route a freshly signed-in user
 *  to /cv, so revisiting the dashboard doesn't keep hijacking navigation. */
export const PENDING_CV_REDIRECTED_KEY = "cvsparkz_pending_cv_redirected";

export interface PendingCv {
  /** Extracted CV text (pasted or parsed from the uploaded file). */
  text: string;
  /** The 0–100 score it earned, for continuity messaging. */
  score?: number;
  /** ISO timestamp of when it was scored. */
  scoredAt: string;
}

export function readPendingCv(): PendingCv | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_CV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCv;
    if (!parsed?.text || typeof parsed.text !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePendingCv(cv: PendingCv): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_CV_KEY, JSON.stringify(cv));
  } catch {
    // Storage full / disabled (private mode) — best-effort only.
  }
}

export function clearPendingCv(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_CV_KEY);
  } catch {
    // ignore
  }
}
