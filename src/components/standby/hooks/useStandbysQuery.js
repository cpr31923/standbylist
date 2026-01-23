import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient";
import { todayYMD } from "../helpers";

/**
 * Fetches standbys for the current "section" + subtab selection.
 * Mirrors the query logic you had in StandbyList.jsx.
 */
export function useStandbysQuery({
  userId,
  section,
  standbysSubtab,
  upcomingSubtab,
  historySubtab,
  refreshTick,
}) {
  const [standbys, setStandbys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setStandbys([]);
      setLoading(false);
      setFetchError(null);
      return;
    }

    let cancelled = false;

    async function fetchStandbys() {
      setLoading(true);
      setFetchError(null);

      let query = supabase.from("standby_events").select("*").eq("user_id", userId);

      // deleted filter differs by "History -> Deleted"
      if (section === "history" && historySubtab === "deleted") {
        query = query.not("deleted_at", "is", null);
      } else {
        query = query.is("deleted_at", null);
      }

      // standbys (owed/owe) => unsettled only
      if (section === "standbys") {
        if (standbysSubtab === "owed") query = query.eq("settled", false).eq("worked_for_me", false);
        if (standbysSubtab === "owe") query = query.eq("settled", false).eq("worked_for_me", true);
      }

      // upcoming => future only
      if (section === "upcoming") {
        if (upcomingSubtab === "i_work")
          query = query.eq("worked_for_me", false).gt("shift_date", todayYMD());
        if (upcomingSubtab === "they_work")
          query = query.eq("worked_for_me", true).gt("shift_date", todayYMD());
      }

      // history -> settled
      if (section === "history" && historySubtab === "settled") {
        query = query.eq("settled", true);
      }

      const orderCol =
        section === "history" && historySubtab === "deleted"
          ? "deleted_at"
          : section === "history" && historySubtab === "settled"
          ? "settled_at"
          : "shift_date";

      const ascending = section === "upcoming";

      const { data, error } = await query.order(orderCol, { ascending });

      if (cancelled) return;

      if (error) {
        console.error("Error fetching standbys:", error);
        setFetchError(error.message);
        setStandbys([]);
        setLoading(false);
        return;
      }

      setStandbys(data || []);
      setLoading(false);
    }

    fetchStandbys();

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    section,
    standbysSubtab,
    upcomingSubtab,
    historySubtab,
    refreshTick,
  ]);

  return { standbys, loading, fetchError };
}
