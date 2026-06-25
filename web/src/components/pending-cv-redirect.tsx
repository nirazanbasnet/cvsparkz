"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PENDING_CV_KEY,
  PENDING_CV_REDIRECTED_KEY,
} from "@/lib/guest-cv";

/**
 * After a visitor scores a CV on the landing page and then signs up, send them
 * straight to /cv to claim it. The dashboard is the single post-login/onboarding
 * landing point, so mounting this here covers both new and returning users.
 *
 * Guarded by a per-session flag so revisiting the dashboard later doesn't keep
 * hijacking navigation; the pending CV itself is cleared once claimed on /cv.
 */
export function PendingCvRedirect() {
  const router = useRouter();

  useEffect(() => {
    try {
      const hasPending = !!window.localStorage.getItem(PENDING_CV_KEY);
      const alreadyRedirected =
        window.sessionStorage.getItem(PENDING_CV_REDIRECTED_KEY) === "1";
      if (hasPending && !alreadyRedirected) {
        window.sessionStorage.setItem(PENDING_CV_REDIRECTED_KEY, "1");
        router.replace("/cv");
      }
    } catch {
      // localStorage/sessionStorage unavailable — skip the redirect.
    }
  }, [router]);

  return null;
}
