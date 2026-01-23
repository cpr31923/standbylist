import React, { useMemo, useState } from "react";
import EmptyState from "../ui/EmptyState";
import { makeSettlementGroups } from "../services/settledPairs";
import { formatDisplayDate, toTitleCase } from "../helpers";
import StatusPill from "../ui/StatusPill";

/**
 * SettledPairsView
 * - shows ONE row per settlement_group_id
 * - tap a group to drill down and see the paired shifts
 *
 * 3-way pill logic (alpha-safe):
 * - show 3-way if settlement_group_id exists (we’re in this view already)
 * - AND any row notes contain a known 3-way marker
 *
 * Layout updates:
 * - Group list rows: 3-Way pill sits on the RIGHT, vertically centered, immediately left of chevron.
 * - Group detail: top bar has Back left, 3-Way pill right (higher, inline with back).
 * - Group detail header: title row no longer carries the 3-Way pill.
 */
export default function SettledPairsView({
  title = "Settled",
  rows = [],
  emptyText = "No settled shifts yet.",
  onOpenDetail,
  onUnsettleGroup,
}) {
  const [openGroupId, setOpenGroupId] = useState(null);

  const groups = useMemo(() => makeSettlementGroups(rows), [rows]);

  const openGroup = useMemo(() => {
    if (!openGroupId) return null;
    return groups.find((g) => g.id === openGroupId) || null;
  }, [groups, openGroupId]);

  const empty = !groups || groups.length === 0;

  function hasThreeWayMarkerInNotes(group) {
    const groupRows = group?.rows || [];
    return groupRows.some((r) => {
      const notes = String(r?.notes ?? "").toLowerCase();
      return (
        notes.includes("3-way") ||
        notes.includes("3 way") ||
        notes.includes("3way") ||
        notes.includes("[3way]") ||
        notes.includes("three_way") ||
        notes.includes("three way")
      );
    });
  }

  function settledRowSentence(s) {
    const name = toTitleCase(s?.person_name || "—");
    const date = s?.shift_date ? formatDisplayDate(s.shift_date) : "—";

    // worked_for_me = true  => they worked for me => I owe => "<Name> worked for you..."
    // worked_for_me = false => I worked for them => owed to me => "You worked for <Name>..."
    if (s?.worked_for_me) return `${name} worked for you on ${date}`;
    return `You worked for ${name} on ${date}`;
  }

  // ===== Group detail view =====
  if (openGroup) {
    const settledDate =
      openGroup.settledDateYMD ? formatDisplayDate(openGroup.settledDateYMD) : "";

    const isThreeWayGroup = hasThreeWayMarkerInNotes(openGroup);

    return (
      <div className="space-y-3">
        {/* Top bar: Back left, 3-Way right (higher, inline with back) */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setOpenGroupId(null)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
          >
            <span className="text-slate-500">‹</span> Back
          </button>

          {isThreeWayGroup && <StatusPill threeWay />}
        </div>

        {/* Header */}
        <div className="mb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-slate-900 truncate">
                {openGroup.label}
              </div>

              <div className="text-xs text-slate-500 mt-0.5">
                {settledDate ? `Settled on ${settledDate}` : "Settled"}{" "}
                <span className="text-slate-400">•</span>{" "}
                {openGroup.rows.length}{" "}
                {openGroup.rows.length === 1 ? "shift" : "shifts"}
              </div>
            </div>

            {/* Unsettle button */}
            <button
              type="button"
              onClick={() => onUnsettleGroup?.(openGroup.id)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] transition"
              title="Unsettle these shifts"
            >
              <span className="text-sm">↺</span>
              Unsettle
            </button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {openGroup.rows.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenDetail?.(s)}
              className="w-full text-left px-3 py-2 rounded-md border border-slate-200 bg-white shadow-sm hover:bg-slate-50 active:bg-slate-50 transition flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {settledRowSentence(s)}
                </div>
              </div>

              <div className="shrink-0 text-slate-400 font-semibold">›</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ===== Group list view =====
  return (
    <div>
      <div className="mb-3">
        <div className="text-lg font-extrabold text-slate-900">{title}</div>
        <div className="text-sm text-slate-600 mt-1 font-semibold">
          {groups.length} {groups.length === 1 ? "standby" : "standbys"}
        </div>
      </div>

      {empty ? (
        <EmptyState tabLabel={emptyText} />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const isThreeWayGroup = hasThreeWayMarkerInNotes(g);

            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setOpenGroupId(g.id)}
                className="w-full text-left px-3 py-2 rounded-md border border-slate-200 bg-white shadow-sm hover:bg-slate-50 active:bg-slate-50 transition flex items-center justify-between gap-3"
              >
                {/* Left: label + date */}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {g.label}
                  </div>

                  <div className="text-xs text-slate-500 truncate">
                    {g.settledDateYMD ? formatDisplayDate(g.settledDateYMD) : ""}
                  </div>
                </div>

                {/* Right: pill (if any) + chevron; vertically centered */}
                <div className="shrink-0 flex items-center gap-2">
                  {isThreeWayGroup && <StatusPill threeWay />}
                  <div className="text-slate-400 font-semibold">›</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
