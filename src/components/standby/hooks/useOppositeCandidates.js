import { useCallback, useMemo, useState } from "react";
import { supabase } from "../../../supabaseClient";
import { normalizeName, toTitleCase } from "../helpers";

/**
 * Opposite candidates = unsettled rows with the specified worked_for_me value.
 * Used by:
 * - settle existing from detail modal
 * - settle existing from add modal
 *
 * wantWorkedForMe:
 * - true  => candidates from "I owe" list (worked_for_me = true)
 * - false => candidates from "Owed to me" list (worked_for_me = false)
 */
export function useOppositeCandidates({ userId }) {
  const [oppositeCandidates, setOppositeCandidates] = useState([]);
  const [loadingOpposite, setLoadingOpposite] = useState(false);

  const fetchOppositeCandidates = useCallback(
    async (wantWorkedForMe) => {
      if (!userId) return;

      setLoadingOpposite(true);

      const { data, error } = await supabase
        .from("standby_events")
        .select(
          "id, person_name, platoon, duty_platoon, shift_date, shift_type, worked_for_me, settled, deleted_at, settlement_group_id"
        )
        .eq("user_id", userId)
        .is("deleted_at", null)
        .eq("settled", false)
        .eq("worked_for_me", wantWorkedForMe)
        // oldest first (so the first item in a person-group is the one we settle against)
        .order("shift_date", { ascending: true });

      if (error) {
        console.error("Error fetching opposite candidates:", error);
        setOppositeCandidates([]);
      } else {
        setOppositeCandidates(data || []);
      }

      setLoadingOpposite(false);
    },
    [userId]
  );

  return {
    oppositeCandidates,
    loadingOpposite,
    setOppositeCandidates,
    fetchOppositeCandidates,
  };
}

/**
 * Build dropdown options grouped by person_key (name canonicalization),
 * and each option includes the OLDEST standby id for that person.
 */
export function buildOppositePersonOptions(rows = [], mode = "owed") {
  // mode:
  // - "owed": dropdown label should read "<Name> — owes you X shifts"
  // - "owe":  dropdown label should read "<Name> — you owe X shifts"

  const map = new Map();

  for (const r of rows || []) {
    const raw = r?.person_name || "";
    const key = normalizeName ? normalizeName(raw) : String(raw).trim().toLowerCase();
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        label: toTitleCase ? toTitleCase(raw) : raw,
        count: 1,
        oldestId: r.id,
        oldestDate: r.shift_date || null,
      });
      continue;
    }

    existing.count += 1;

    // rows are already sorted oldest-first, but keep this safe:
    const d0 = existing.oldestDate ? String(existing.oldestDate) : null;
    const d1 = r.shift_date ? String(r.shift_date) : null;
    if (!d0 || (d1 && d1 < d0)) {
      existing.oldestDate = r.shift_date || null;
      existing.oldestId = r.id;
    }

    // keep the nicest label we’ve seen (longer tends to be “full name”)
    const nextLabel = toTitleCase ? toTitleCase(raw) : raw;
    if ((nextLabel || "").length > (existing.label || "").length) existing.label = nextLabel;
  }

  const options = Array.from(map.values()).map((x) => {
    const word = x.count === 1 ? "shift" : "shifts";
    const tail = mode === "owe" ? `you owe ${x.count} ${word}` : `owes you ${x.count} ${word}`;
    return {
      key: x.key,
      value: x.oldestId, // IMPORTANT: selecting the person selects the OLDEST standby id
      label: `${x.label} — ${tail}`,
      count: x.count,
      name: x.label,
      oldestId: x.oldestId,
      oldestDate: x.oldestDate,
    };
  });

  // Sort: most outstanding first, then name
  options.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.name).localeCompare(String(b.name));
  });

  return options;
}
