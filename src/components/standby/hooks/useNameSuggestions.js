import { useCallback, useState } from "react";
import { supabase } from "../../../supabaseClient";
import { toTitleCase } from "../helpers";

/**
 * Loads recent person_name values for quick suggestions/autocomplete.
 * Invoke when Add modal opens.
 */
export function useNameSuggestions({ userId }) {
  const [nameSuggestions, setNameSuggestions] = useState([]);

  const fetchNameSuggestions = useCallback(async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("standby_events")
      .select("person_name")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("shift_date", { ascending: false })
      .limit(300);

    if (error) {
      console.warn("Could not load name suggestions:", error);
      return;
    }

    const set = new Set();
    for (const r of data || []) {
      const n = toTitleCase(r.person_name);
      if (n) set.add(n);
    }
    setNameSuggestions(Array.from(set).sort((a, b) => a.localeCompare(b)));
  }, [userId]);

  return { nameSuggestions, fetchNameSuggestions };
}
