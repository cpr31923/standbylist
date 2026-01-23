import React, { useMemo } from "react";
import EmptyState from "../ui/EmptyState";
import ListRowCompact from "../ListRowCompact";
import { formatDisplayDate, toTitleCase } from "../helpers";

/**
 * HistoryView
 *
 * Supports:
 * 1) Bundles (bundle_id) blocks + "Settled" singles section (historyBundleGroups)
 * 2) Flat rows list fallback
 *
 * NEW:
 * - For Settled rows, we group by settlement_group_id so the pair (or 3-way) shows together.
 * - Each settlement group card shows a header with ↺ Unsettle (calls onUnsettleGroup(gid)).
 * - Deleted list-level rows have custom compact layout (Name, bi line, date + direction)
 */
export default function HistoryView({
  title,
  totalLabel,
  count,
  emptyText,
  renderFiltersBar,

  historyBundleGroups = null, // { bundleArr, singles }
  rows = [],

  onRenameBundle,
  onOpenDetail,
  listRowSentence,
  onUnsettleGroup,
  enableSettlementGrouping = false,
}) {
  const hasBundleGroups =
    historyBundleGroups &&
    Array.isArray(historyBundleGroups.bundleArr) &&
    Array.isArray(historyBundleGroups.singles);

  // Helper: build settlement groups from a list of rows
  const buildSettlementGroups = (inputRows) => {
    const settledRows = (inputRows || []).filter(
      (r) => r?.settled && r?.settlement_group_id
    );
    if (settledRows.length === 0) return [];

    const map = new Map();
    for (const r of settledRows) {
      const gid = r.settlement_group_id;
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid).push(r);
    }

    const groups = Array.from(map.entries()).map(([gid, groupRows]) => {
      const sorted = [...groupRows].sort((a, b) =>
        String(a.shift_date || "").localeCompare(String(b.shift_date || ""))
      );
      return { gid, rows: sorted };
    });

    // Sort groups by settled_at desc (best effort)
    groups.sort((ga, gb) =>
      String(gb.rows?.[0]?.settled_at || "").localeCompare(
        String(ga.rows?.[0]?.settled_at || "")
      )
    );

    return groups;
  };

  const singlesSettlementGroups = useMemo(() => {
    if (!hasBundleGroups || !enableSettlementGrouping) return [];
    return buildSettlementGroups(historyBundleGroups.singles || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBundleGroups, historyBundleGroups, enableSettlementGrouping]);

  const rowsSettlementGroups = useMemo(() => {
    if (hasBundleGroups || !enableSettlementGrouping) return [];
    return buildSettlementGroups(rows || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBundleGroups, rows, enableSettlementGrouping]);

  function renderSettlementGroupCard(g) {
    const names = Array.from(
      new Set(
        (g.rows || [])
          .map((r) => String(r?.person_name || "").trim())
          .filter(Boolean)
      )
    );

    const headerLeft =
      names.length <= 1
        ? `Settled with ${names[0] || "—"}`
        : names.length === 2
        ? `Settled between ${names[0]} and ${names[1]}`
        : `Settled (multiple)`;

    return (
      <div
        key={g.gid}
        className="rounded-md border border-slate-200 bg-white overflow-hidden"
      >
        <div className="px-3 py-2 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-900 truncate">
              {headerLeft}
            </div>
            <div className="text-xs text-slate-500">{g.rows.length} shifts</div>
          </div>

          <button
            type="button"
            onClick={() => onUnsettleGroup?.(g.gid)}
            className="shrink-0 text-xs font-extrabold text-slate-600 hover:text-slate-900"
            title="Unsettle both shifts"
          >
            ↺ Unsettle
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {g.rows.map((s) => (
            <ListRowCompact
              key={s.id}
              s={s}
              rowSentence={listRowSentence}
              onToggleSelect={(row) => onOpenDetail?.(row)}
            />
          ))}
        </div>
      </div>
    );
  }

  // Deleted row renderer (list-level only)
  function renderDeletedRowCard(s) {
    const name = toTitleCase(String(s?.person_name || "—").trim());
    const date = s?.shift_date ? formatDisplayDate(s.shift_date) : "—";

    // worked_for_me = true  => they worked for me => I owe
    // worked_for_me = false => I worked for them => owed to me
    const whoWorkedForWho = s?.worked_for_me
      ? `${name} worked for you`
      : `You worked for ${name}`;

    return (
      <button
        key={s.id}
        type="button"
        onClick={() => onOpenDetail?.(s)}
        className="w-full text-left rounded-md border border-slate-200 bg-white shadow-sm hover:bg-slate-50 active:bg-slate-50 transition px-3 py-2"
      >
        {/* Name */}
        <div className="text-sm font-extrabold text-slate-900 truncate">{name}</div>

        {/* Bi line */}
        <div className="text-xs text-slate-500 mt-0.5 truncate">Deleted shift</div>

        {/* Date + who worked for who */}
        <div className="text-sm font-semibold text-slate-700 mt-1 truncate">
          {date} — {whoWorkedForWho}
        </div>
      </button>
    );
  }

  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold text-slate-900">{title}</div>
          <div className="text-sm text-slate-600 mt-1 font-semibold">
            {totalLabel} <span className="text-slate-900">{count}</span>
          </div>
        </div>
      </div>

      {renderFiltersBar?.()}

      {count === 0 ? (
        <EmptyState tabLabel={emptyText} />
      ) : hasBundleGroups ? (
        <div className="space-y-3">
          {/* Bundle blocks (unchanged) */}
          {historyBundleGroups.bundleArr.map((g) => (
            <div
              key={g.bundle_id}
              className="rounded-md border border-slate-200 bg-white overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-slate-200 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onRenameBundle?.(g.bundle_id, g.bundle_label)}
                    className="text-sm font-extrabold text-slate-900 hover:underline truncate"
                    title="Rename group"
                  >
                    {g.bundle_label || "Shift run"}
                  </button>
                  <div className="text-xs text-slate-500">{g.rows.length} shifts</div>
                </div>

                <button
                  type="button"
                  onClick={() => onRenameBundle?.(g.bundle_id, g.bundle_label)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Rename
                </button>
              </div>

              <div className="divide-y divide-slate-200">
                {g.rows.map((s) => (
                  <ListRowCompact
                    key={s.id}
                    s={s}
                    rowSentence={listRowSentence}
                    onToggleSelect={(row) => onOpenDetail?.(row)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Settled singles section — grouped by settlement_group_id with ↺ Unsettle */}
          {enableSettlementGrouping && historyBundleGroups.singles.length > 0 && (
            <div className="space-y-3">
              {singlesSettlementGroups.map(renderSettlementGroupCard)}
            </div>
          )}
        </div>
      ) : enableSettlementGrouping && rowsSettlementGroups.length > 0 ? (
        <div className="space-y-3">{rowsSettlementGroups.map(renderSettlementGroupCard)}</div>
      ) : (
        <div className="space-y-2">
          {safeRows.map((s) => {
            const isDeleted = Boolean(s?.deleted_at); // <-- adjust if your flag differs

            return isDeleted ? (
              renderDeletedRowCard(s)
            ) : (
              <div
                key={s.id}
                className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <ListRowCompact
                  s={s}
                  rowSentence={listRowSentence}
                  onToggleSelect={(row) => onOpenDetail?.(row)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
