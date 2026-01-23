import { useEffect } from "react";

/**
 * Locks page scrolling (body overflow hidden) while `locked` is true.
 * Useful for modals + drawers.
 */
export function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}
