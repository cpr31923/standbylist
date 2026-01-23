// src/components/standby/grouping.js
import { normalizeName, toTitleCase } from "../helpers";

/**
 * Build canonical person groups from standby rows.
 * - key: canonical grouping key (normalizeName)
 * - label: display name (best-known)
 * - platoon: derived from the most common non-empty row.platoon in the group
 * - rows: original rows
 */
export function makePersonGroups(rows) {
  const map = new Map();

  (rows || []).forEach((r) => {
    const rawName = String(r?.person_name || "").trim();
    const key = normalizeName(rawName) || rawName.toLowerCase() || "unknown";

    if (!map.has(key)) {
      map.set(key, {
        key,
        label: toTitleCase(rawName || "—"),
        platoon: "",
        rows: [],
      });
    }

    const g = map.get(key);
    g.rows.push(r);

    // Pick a "best-known" label (prefer longer, non-empty strings)
    const candidate = toTitleCase(rawName || "");
    if (candidate && candidate.length > (g.label || "").length) g.label = candidate;
  });

  // Compute platoon per group (most frequent non-empty row.platoon)
  for (const g of map.values()) {
    const counts = new Map();
    for (const r of g.rows) {
      const p = String(r?.platoon || "").trim().toUpperCase();
      if (!p) continue;
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    let best = "";
    let bestN = 0;
    for (const [p, n] of counts.entries()) {
      if (n > bestN) {
        best = p;
        bestN = n;
      }
    }
    g.platoon = best; // NOTE: raw platoon, not duty platoon
  }

  return Array.from(map.values());
}

export function sortPersonGroups(groups, sortBy = "count_desc") {
  const arr = Array.isArray(groups) ? [...groups] : [];

  const byCountDesc = (a, b) => (b?.rows?.length || 0) - (a?.rows?.length || 0);
  const byNameAsc = (a, b) => String(a?.label || "").localeCompare(String(b?.label || ""), "en", { sensitivity: "base" });
  const byPlatoonAsc = (a, b) => {
    const ap = String(a?.platoon || "");
    const bp = String(b?.platoon || "");
    const c = ap.localeCompare(bp, "en", { sensitivity: "base" });
    return c !== 0 ? c : byNameAsc(a, b);
  };

  if (sortBy === "name_asc") return arr.sort((a, b) => byNameAsc(a, b));
  if (sortBy === "platoon_asc") return arr.sort((a, b) => byPlatoonAsc(a, b));
  return arr.sort((a, b) => byCountDesc(a, b) || byNameAsc(a, b));
}
