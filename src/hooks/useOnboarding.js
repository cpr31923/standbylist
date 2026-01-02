import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Onboarding state is per-user (localStorage).
 * We NEVER early-return before hooks (Rules of Hooks).
 */
export function useOnboarding(userId) {
  const storageKey = useMemo(() => {
    const id = String(userId || "").trim();
    return id ? `shift-iou:onboarding:${id}` : `shift-iou:onboarding:anon`;
  }, [userId]);

  // Stored shape: { done: boolean, open: boolean, stepIndex: number, lastSeenAt?: string }
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Load saved state when storageKey changes (i.e., user logs in/out)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        // default: not open; index 0
        setOpen(false);
        setStepIndex(0);
        return;
      }
      const parsed = JSON.parse(raw);
      setOpen(Boolean(parsed?.open));
      setStepIndex(Number.isFinite(parsed?.stepIndex) ? parsed.stepIndex : 0);
    } catch {
      setOpen(false);
      setStepIndex(0);
    }
  }, [storageKey]);

  // Persist whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          open,
          stepIndex,
          done: false, // "done" is set by close()
          lastSeenAt: new Date().toISOString(),
        })
      );
    } catch {}
  }, [open, stepIndex, storageKey]);

  const close = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...parsed,
          open: false,
          stepIndex: 0,
          done: true,
          completedAt: new Date().toISOString(),
        })
      );
    } catch {}
  }, [storageKey]);

  const reset = useCallback(() => {
    // Force tour to re-run from step 0
    setStepIndex(0);
    setOpen(true);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          open: true,
          stepIndex: 0,
          done: false,
          lastSeenAt: new Date().toISOString(),
        })
      );
    } catch {}
  }, [storageKey]);

  const next = useCallback((stepsLength) => {
    setStepIndex((i) => {
      const n = Number.isFinite(stepsLength) ? stepsLength : 0;
      if (n <= 0) return i + 1;
      return Math.min(i + 1, n - 1);
    });
  }, []);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  return {
    open,
    setOpen,
    stepIndex,
    next,
    back,
    close,
    reset,
  };
}
