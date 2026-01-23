import { useEffect } from "react";

/**
 * Prevents horizontal scrolling on the whole page.
 * This matches the old StandbyList behaviour.
 */
export function usePreventHorizontalScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const prevHtml = document.documentElement.style.overflowX;
    const prevBody = document.body.style.overflowX;

    document.documentElement.style.overflowX = "hidden";
    document.body.style.overflowX = "hidden";

    return () => {
      document.documentElement.style.overflowX = prevHtml;
      document.body.style.overflowX = prevBody;
    };
  }, [enabled]);
}
