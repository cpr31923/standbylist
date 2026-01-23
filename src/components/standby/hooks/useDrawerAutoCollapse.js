import { useEffect } from "react";

/**
 * When the drawer opens, force the drawerGroup to "" so it opens collapsed.
 */
export function useDrawerAutoCollapse(drawerOpen, setDrawerGroup) {
  useEffect(() => {
    if (!drawerOpen) return;
    if (typeof setDrawerGroup === "function") setDrawerGroup("");
  }, [drawerOpen, setDrawerGroup]);
}
