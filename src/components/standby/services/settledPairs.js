import { toTitleCase } from "../helpers";

function isoDateOnly(iso) {
  if (!iso) return "";
  try {
    return String(iso).slice(0, 10); // YYYY-MM-DD
  } catch {
    return "";
  }
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const k = String(x || "").trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Groups settled rows by settlement_group_id.
 * Returns [{ id, settledAt, settledDateYMD, rows, names, label }]
 */
export function makeSettlementGroups(rows = []) {
  const map = new Map();

  for (const r of rows || []) {
    const gid = String(r?.settlement_group_id || "").trim();
    if (!gid) continue;

    const group = map.get(gid) || {
      id: gid,
      settledAt: r?.settled_at || null,
      settledDateYMD: isoDateOnly(r?.settled_at),
      rows: [],
    };

    group.rows.push(r);

    // keep latest settledAt for ordering
    const a = group.settledAt ? String(group.settledAt) : "";
    const b = r?.settled_at ? String(r.settled_at) : "";
    if (b && b > a) {
      group.settledAt = r.settled_at;
      group.settledDateYMD = isoDateOnly(r.settled_at);
    }

    map.set(gid, group);
  }

  const groups = Array.from(map.values()).map((g) => {
    const names = uniq((g.rows || []).map((x) => toTitleCase(x?.person_name || "")));
    const label =
      names.length === 0
        ? "Settled"
        : names.length === 1
        ? `Standby with ${names[0]}`
        : `3-way standby between ${names.join(", ")} and you.`;

    return { ...g, names, label };
  });

  // Most recent settled first
  groups.sort((a, b) => String(b.settledAt || "").localeCompare(String(a.settledAt || "")));

  return groups;
}
