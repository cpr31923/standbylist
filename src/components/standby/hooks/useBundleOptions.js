import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../supabaseClient";

/**
 * Loads recent bundle_id/bundle_label options for the current user.
 * Call this when Add modal opens, so the bundle dropdown is populated.
 */
export function useBundleOptions({ userId, enabled, refreshTick }) {
  const [bundleOptions, setBundleOptions] = useState([]);

  const fetchBundleOptions = useCallback(async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("standby_events")
      .select("bundle_id, bundle_label")
      .eq("user_id", userId)
      .not("bundle_id", "is", null)
      .is("deleted_at", null)
      .order("shift_date", { ascending: false })
      .limit(300);

    if (error) {
      console.warn("Could not load bundle options:", error);
      return;
    }

    const map = new Map();
    for (const r of data || []) {
      const id = r.bundle_id;
      if (!id) continue;
      if (!map.has(id)) map.set(id, { bundle_id: id, bundle_label: r.bundle_label || "Shift run" });
    }
    setBundleOptions(Array.from(map.values()));
  }, [userId]);

  useEffect(() => {
    if (!enabled) return;
    fetchBundleOptions();
  }, [enabled, fetchBundleOptions, userId, refreshTick]);

  return { bundleOptions, fetchBundleOptions };
}
