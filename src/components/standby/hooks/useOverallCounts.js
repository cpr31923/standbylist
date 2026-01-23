import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient";

/**
 * Overall summary of unsettled (not deleted) standbys:
 * plus = they owe you (worked_for_me=false)
 * minus = you owe them (worked_for_me=true)
 */
export function useOverallCounts({ userId, refreshTick }) {
  const [overallPlus, setOverallPlus] = useState(0);
  const [overallMinus, setOverallMinus] = useState(0);

  useEffect(() => {
    if (!userId) {
      setOverallPlus(0);
      setOverallMinus(0);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("standby_events")
        .select("worked_for_me, settled, deleted_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .eq("settled", false);

      if (cancelled) return;

      if (error) {
        console.warn("Overall counts fetch failed:", error);
        setOverallPlus(0);
        setOverallMinus(0);
        return;
      }

      let plus = 0;
      let minus = 0;
      for (const r of data || []) {
        if (r.worked_for_me) minus += 1;
        else plus += 1;
      }

      setOverallPlus(plus);
      setOverallMinus(minus);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, refreshTick]);

  return { overallPlus, overallMinus };
}
