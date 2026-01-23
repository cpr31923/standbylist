import React, { useEffect, useMemo, useState } from "react";
import EmptyState from "../ui/EmptyState";
import ListRowCompact from "../ListRowCompact";
import { makePersonGroups, sortPersonGroups } from "../services/groupings";
import { formatDisplayDate } from "../helpers";

/**
 * StandbysView supports:
 * - grouped-by-person mode (recommended): pass rows + groupMode props
 * - flat mode: pass rows only
 *
 * Grouped mode behavior:
 * - Shows ONE row per person with total count
 * - Clicking person drills into that person's outstanding rows
 * - Clicking a row opens Detail Modal via onOpenDetail(row)
 */
export default function StandbysView({
  title,
  totalLabel,
  count,
  emptyText,
  renderFiltersBar,

  // INPUT DATA:
  // Prefer passing rows only and letting this component group them.
  rows = null,

  // If you already pre-compute groups elsewhere you can pass personGroups.
  // If provided, it will be used instead of auto-grouping.
  personGroups = null,

  // Sentences / interactions:
  listRowSentence,
  onOpenDetail,

  /**
   * Determines the per-person sentence in grouped list:
   * - "owed" => "<Name> owes you <X> standbys"
   * - "owe"  => "You owe <Name> <X> standbys"
   */
  groupMode = "owed", // "owed" | "owe"
}) {
  const [sortBy, setSortBy] = useState("count_desc"); // default: most owed/owing
  const [selectedKey, setSelectedKey] = useState(null);

  const computedGroups = useMemo(() => {
    if (Array.isArray(personGroups)) return personGroups;
    if (!Array.isArray(rows)) return [];
    return makePersonGroups(rows);
  }, [personGroups, rows]);

  const sortedGroups = useMemo(() => {
    return sortPersonGroups(computedGroups, sortBy);
  }, [computedGroups, sortBy]);

  const selectedGroup = useMemo(() => {
    if (!selectedKey) return null;
    return (sortedGroups || []).find((g) => g.key === selectedKey) || null;
  }, [sortedGroups, selectedKey]);

  useEffect(() => {
    if (selectedKey && !selectedGroup) {
      setSelectedKey(null);
    }
  }, [selectedKey, selectedGroup]);


  const empty = selectedGroup
    ? (selectedGroup.rows?.length || 0) === 0
    : Array.isArray(sortedGroups)
    ? sortedGroups.length === 0
    : true;

  function groupLine(g) {
    const name = g?.label || "—";
    const n = g?.rows?.length || 0;
    const word = n === 1 ? "standby" : "standbys";
    if (groupMode === "owe") return `You owe ${name} ${n} ${word}`;
    return `${name} owes you ${n} ${word}`;
  }

const inGroupDetail = Boolean(selectedGroup);

  return (
    <div>
      {/* Header (title left, filters button right) */}
{!inGroupDetail && (
<div className="mb-3">
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <div className="text-xl font-extrabold text-slate-900">{title}</div>
      <div className="text-sm text-slate-600 mt-1 font-semibold">
        {totalLabel} <span className="text-slate-900">{count}</span>
      </div>
    </div>

    {/* Filters button up near the title (ONLY when not drilled in) */}
    {!selectedGroup
      ? renderFiltersBar?.({
          mode: "toggle",
          toggleAlign: "right",
          containerClassName: "mb-0",
        })
      : null}
  </div>

  {/* Filters fields open directly under the title */}
  {!selectedGroup
    ? renderFiltersBar?.({
        mode: "panel",
        containerClassName: "mt-2 mb-0",
      })
    : null}
</div>
)}

      {/* Drill-down: person detail */}
      {selectedGroup ? (
        <div className="space-y-3">
          {/* Back (left) + Filters (right) */}
          <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelectedKey(null)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
          >
            <span className="text-slate-500">‹</span> Back
          </button>

          {/* Toggle only in header */}
          {renderFiltersBar?.({
            mode: "toggle",
            toggleAlign: "right",
            containerClassName: "mb-0",
          })}
        </div>

        {/* Panel only below header (full width) */}
        {renderFiltersBar?.({
          mode: "panel",
          containerClassName: "mb-0",
        })}


          {/* Title (no border) */}
<div className="mb-2">
  <div className="text-lg font-extrabold text-slate-900 truncate">
    {selectedGroup.label}{" "}
    <span className="text-slate-500 font-semibold">
      — {selectedGroup.platoon ? `${selectedGroup.platoon} Platoon` : "Platoon —"}
    </span>
  </div>
</div>

{/* List */}
{empty ? (
  <div className="rounded-md border border-slate-200 bg-white shadow-sm p-4">
    <EmptyState tabLabel={emptyText} />
  </div>
) : (
  <div className="space-y-2">
    {selectedGroup.rows.map((s) => {
      const platoonLabel = s.duty_platoon || s.platoon; // prefer duty_platoon if present
      const shiftTypeLabel = s.shift_type === "Night" ? "Night" : "Day";

      return (
        <button
          key={s.id}
          type="button"
          onClick={() => onOpenDetail?.(s)}
          className="w-full text-left px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-50 transition flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">
              {formatDisplayDate(s.shift_date)}{" "}
              <span className="text-slate-500 font-medium">
                — {platoonLabel ? `${platoonLabel} Platoon` : "Platoon —"} {shiftTypeLabel}
              </span>
            </div>
          </div>

          <div className="shrink-0 text-slate-400 font-semibold">›</div>
        </button>
      );
    })}
  </div>
)}
        </div>
      ) : (
        <>
          {/* Grouped list controls */}
          {!empty ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-500">Grouped by person</div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Sort
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                >
                  <option value="count_desc">Most owed</option>
                  <option value="name_asc">Name</option>
                  <option value="platoon_asc">Platoon</option>
                </select>
              </label>
            </div>
          ) : null}

          {/* Grouped list rows */}
          {empty ? (
            <EmptyState tabLabel={emptyText} />
          ) : (
              <div className="space-y-2">
                  {sortedGroups.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setSelectedKey(g.key)}
                      className="w-full text-left px-3 py-2 rounded-md border border-slate-200 bg-white shadow-sm hover:bg-slate-50 active:bg-slate-50 transition flex items-center justify-between gap-3"
                    >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {g.label}
                      <span className="text-slate-500 font-medium">
                        {" "}
                        — {g.platoon ? `${g.platoon} Platoon` : "Platoon —"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">{groupLine(g)}</div>
                  </div>

                  <div className="shrink-0 text-slate-400 font-semibold">›</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
