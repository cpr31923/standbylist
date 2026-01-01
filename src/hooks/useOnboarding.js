import { useEffect, useMemo, useState } from "react";

export default function useOnboarding(userId) {
  const storageKey = useMemo(() => {
    const id = userId || "anon";
    return `shift-iou:onboardingSeen:${id}`;
  }, [userId]);

  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(storageKey) === "true";
      if (!seen) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [storageKey]);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {}
  }

  function reset() {
    try {
      localStorage.setItem(storageKey, "false");
    } catch {}
    setStepIndex(0);
    setOpen(true);
  }

  function next(totalSteps) {
    setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
  }

  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  return { open, setOpen, stepIndex, next, back, close, reset };
}
