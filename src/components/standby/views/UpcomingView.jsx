import React, { useMemo, useState } from "react";
import EmptyState from "../ui/EmptyState";
import { formatDisplayDate, toTitleCase } from "../helpers";

function safeDateKey(ymd) {
  if (!ymd || typeof ymd !== "string") return "";
  return ymd; // "YYYY-MM-DD" sorts lexicographically
}

function minDateFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  let min = "";
  for (const r of rows) {
    const d = safeDateKey(r?.shift_date);
    if (!d) continue;
    if (!min || d < min) min = d;
  }
  return min;
}

function platoonKeyFromRow(r) {
  return String(r?.platoon || r?.duty_platoon || "").toUpperCase();
}

function formatUpcomingLine(s) {
  const date = s?.shift_date ? formatDisplayDate(s.shift_date) : "—";
  const platoon = String(s?.duty_platoon || s?.platoon || "—").toUpperCase();
  const nsds = s?.shift_type === "Night" ? "NS" : "DS";
  const name = toTitleCase(s?.person_name || "—");
  return { date, platoon, nsds, name };
}

export default function UpcomingView({
  title,
  totalLabel,
  count,
  emptyText,
  renderFiltersBar,
  upcomingItems = [],
  onRenameBundle,
  onOpenDetail,
  // listRowSentence is intentionally unused in list-level upcoming view now
  listRowSentence,
}) {
  const [sortMode, setSortMode] = useState("date"); // default: date

  const sortedItems = useMemo(() => {
    const items = Array.isArray(upcomingItems) ? [...upcomingItems] : [];

    const getDate = (it) => {
      if (it?.type === "bundle") return minDateFromRows(it?.rows);
      return safeDateKey(it?.row?.shift_date);
    };

    const getName = (it) => {
      if (it?.type === "bundle") {
        return String(it?.bundle_label || it?.rows?.[0]?.person_name || "").toLowerCase();
      }
      return String(it?.row?.person_name || "").toLowerCase();
    };

    const getPlatoon = (it) => {
      if (it?.type === "bundle") return platoonKeyFromRow(it?.rows?.[0]);
      return platoonKeyFromRow(it?.row);
    };

    items.sort((a, b) => {
      if (sortMode === "name") {
        const an = getName(a);
        const bn = getName(b);
        if (an < bn) return -1;
        if (an > bn) return 1;
        const ad = getDate(a);
        const bd = getDate(b);
        return ad < bd ? -1 : ad > bd ? 1 : 0;
      }

      if (sortMode === "platoon") {
        const ap = getPlatoon(a);
        const bp = getPlatoon(b);
        if (ap < bp) return -1;
        if (ap > bp) return 1;
        const ad = getDate(a);
        const bd = getDate(b);
        return ad < bd ? -1 : ad > bd ? 1 : 0;
      }

      // default: date
      const ad = getDate(a);
      const bd = getDate(b);
      if (ad < bd) return -1;
      if (ad > bd) return 1;

      const an = getName(a);
      const bn = getName(b);
      return an < bn ? -1 : an > bn ? 1 : 0;
    });

    return items;
  }, [upcomingItems, sortMode]);

  const empty = sortedItems.length === 0;

  return (
    <div>
      {/* Header (title left, filters button right) */}
      <div className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-slate-900">{title}</div>
            <div className="text-sm text-slate-600 mt-1 font-semibold">
              {totalLabel} <span className="text-slate-900">{count}</span>
            </div>
          </div>

          {/* Filters button aligned top-right */}
          {renderFiltersBar?.({
            mode: "toggle",
            toggleAlign: "right",
            containerClassName: "mb-0",
          })}
        </div>

        {/* Filters fields open directly under the title */}
        {renderFiltersBar?.({
          mode: "panel",
          containerClassName: "mt-2 mb-0",
        })}
      </div>

      {/* Sort (RHS, above list) */}
      {!empty ? (
        <div className="mb-2 flex items-center justify-end">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Sort</span>
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-900"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              aria-label="Sort upcoming standbys"
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
              <option value="platoon">Platoon</option>
            </select>
          </div>
        </div>
      ) : null}

      {empty ? (
        <EmptyState tabLabel={emptyText} />
      ) : (
        <div className="space-y-2">
          {sortedItems.map((it) => {
            if (it.type === "bundle") {
              return (
                <div
                  key={it.bundle_id}
                  className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onRenameBundle?.(it.bundle_id, it.bundle_label)}
                      className="min-w-0 text-sm font-extrabold text-slate-900 truncate hover:underline"
                      title="Rename group"
                    >
                      {it.bundle_label || "Shift group"}
                    </button>

                    <button
                      type="button"
                      onClick={() => onRenameBundle?.(it.bundle_id, it.bundle_label)}
                      className="shrink-0 text- xs font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Rename
                    </button>
                  </div>

                  {/* Group rows (not individual cards) */}
                  <div className="divide-y divide-slate-200">
                    {it.rows.map((s) => {
                      const { date, platoon, nsds, name } = formatUpcomingLine(s);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onOpenDetail?.(s)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 active:bg-slate-50 transition flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 truncate">
                            <span className="text-sm font-semibold text-slate-900">
                              {date} ({platoon} {nsds})
                            </span>
                            <span className="text-sm font-medium text-slate-700">
                              {" "}
                              - {name}
                            </span>
                          </div>
                          <div className="shrink-0 text-slate-400 font-semibold">›</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // singles: individual card per row
            const s = it.row;
            const { date, platoon, nsds, name } = formatUpcomingLine(s);

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpenDetail?.(s)}
                className="w-full text-left px-3 py-2 rounded-md border border-slate-200 bg-white shadow-sm hover:bg-slate-50 active:bg-slate-50 transition flex items-center justify-between gap-3"
              >
                <div className="min-w-0 truncate">
                  <span className="text-sm font-semibold text-slate-900">
                    {date} ({platoon} {nsds})
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {" "}
                    - {name}
                  </span>
                </div>
                <div className="shrink-0 text-slate-400 font-semibold">›</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
