// src/components/DayDetailModal.jsx
import React, { useMemo } from "react";
import ModalShell from "./standby/ui/ModalShell";

/**
 * DayDetailModal
 * Props:
 * - mode: "shift" | "mine"
 * - dateObj: Date
 * - dateKey: "YYYY-MM-DD"
 * - roster: { day: "A|B|C|D|", night: "A|B|C|D|" }
 * - home: "A|B|C|D|" (for "mine" mode)
 * - standbysHere: array of standby rows (only for "mine")
 * - onPickStandby: (standbyRow) => void
 * - onAddStandby: ({ shift_date }) => void
 * - onClose: () => void
 */
export default function DayDetailModal({
  mode = "shift",
  dateObj,
  dateKey,
  roster = { day: "", night: "" },
  home = "",
  standbysHere = [],
  onPickStandby,
  onAddStandby,
  onClose,
}) {
  const title = useMemo(() => {
    if (!dateObj) return "";
    return dateObj.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [dateObj]);

  const safeRoster = roster || { day: "", night: "" };
  const homePlatoon = String(home || "").trim().toUpperCase();

  const items = useMemo(() => {
    // Always render in DS then NS order
    const out = [];

    const daySBYA = (standbysHere || []).find(
      (s) =>
        !s?.deleted_at &&
        s?.worked_for_me === true &&
        String(s.shift_type || "").trim().toLowerCase() === "day"
    );
    const nightSBYA = (standbysHere || []).find(
      (s) =>
        !s?.deleted_at &&
        s?.worked_for_me === true &&
        String(s.shift_type || "").trim().toLowerCase() === "night"
    );

    const daySBY = (standbysHere || []).find(
      (s) =>
        !s?.deleted_at &&
        s?.worked_for_me === false &&
        String(s.shift_type || "").trim().toLowerCase() === "day"
    );
    const nightSBY = (standbysHere || []).find(
      (s) =>
        !s?.deleted_at &&
        s?.worked_for_me === false &&
        String(s.shift_type || "").trim().toLowerCase() === "night"
    );

    const youHaveDay = mode === "mine" && homePlatoon && safeRoster.day === homePlatoon;
    const youHaveNight = mode === "mine" && homePlatoon && safeRoster.night === homePlatoon;

    // Helper: choose display platoon for a standby row
    const standbyPlatoonLabel = (row) => {
      const p = String(row?.duty_platoon || row?.platoon || "").trim().toUpperCase();
      return p ? `${p} Platoon` : "—";
    };

    // Helper: shift label
    const shiftLabel = (shiftType) =>
      String(shiftType || "").trim().toLowerCase() === "night" ? "Night shift" : "Day shift";

    // 1) Day lane
    if (mode === "mine") {
      // Base roster shift (if you are rostered on)
if (youHaveDay) {
  // If SBYA exists, ONLY show the base shift struck-through.
  // Make it clickable to open the SBYA standby detail.
  out.push({
    kind: "roster",
    lane: "day",
    title: `Day shift — ${homePlatoon} Platoon`,
    struck: !!daySBYA,
    pill: daySBYA ? "SBYA" : null,
    // NEW: click-through target
    pickRow: daySBYA || null,
  });
}

// Standby event on Day:
// - If it's SBYA: do NOT show a second card (handled via roster card above)
// - If it's SBY: show it as its own card
if (daySBY) {
  const row = daySBY;
  const name = String(row?.person_name || "—").trim();
  out.push({
    kind: "standby",
    lane: "day",
    row,
    title: `Day shift — ${name} — ${standbyPlatoonLabel(row)}`,
    pill: "SBY",
  });
}
    } else {
      // Shift reference calendar
      out.push({
        kind: "ref",
        lane: "day",
        title: `Day: ${String(safeRoster.day || "—")} Platoon`,
      });
    }

    // 2) Night lane
    if (mode === "mine") {
      if (youHaveNight) {
  out.push({
    kind: "roster",
    lane: "night",
    title: `Night shift — ${homePlatoon} Platoon`,
    struck: !!nightSBYA,
    pill: nightSBYA ? "SBYA" : null,
    pickRow: nightSBYA || null,
  });
}

if (nightSBY) {
  const row = nightSBY;
  const name = String(row?.person_name || "—").trim();
  out.push({
    kind: "standby",
    lane: "night",
    row,
    title: `Night shift — ${name} — ${standbyPlatoonLabel(row)}`,
    pill: "SBY",
  });
}
    } else {
      out.push({
        kind: "ref",
        lane: "night",
        title: `Night: ${String(safeRoster.night || "—")} Platoon`,
      });
    }

    // If mine-mode and literally nothing to show (not rostered + no standbys)
    if (mode === "mine" && out.length === 0) {
      out.push({
        kind: "empty",
        title: "No shifts on this day",
      });
    } else if (mode === "mine") {
      // If you’re not rostered and there are no standbys, show empty
      const anyStandby = (standbysHere || []).some((s) => !s?.deleted_at);
      const anyRoster = youHaveDay || youHaveNight;
      if (!anyStandby && !anyRoster) {
        return [{ kind: "empty", title: "No shifts on this day" }];
      }
    }

    return out;
  }, [mode, standbysHere, safeRoster.day, safeRoster.night, homePlatoon]);

  function Pill({ text }) {
    if (!text) return null;
    const t = String(text).toLowerCase();
    const cls =
      t === "sbya"
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : t === "sby"
        ? "bg-orange-100 text-orange-800 border-orange-200"
        : "bg-slate-100 text-slate-700 border-slate-200";

    return (
      <span
        className={[
          "inline-flex items-center justify-center",
          "px-2 py-0.5 rounded-full border",
          "text-[11px] font-extrabold leading-none",
          cls,
        ].join(" ")}
      >
        {text}
      </span>
    );
  }

  function Card({ children, onClick, disabled }) {
    const base =
      "w-full rounded-md border border-slate-200 bg-white px-4 py-4 text-left";
    const interactive = !disabled
      ? "hover:bg-slate-50 active:scale-[0.995] transition"
      : "";
    const cls = [base, interactive].join(" ");

    if (onClick && !disabled) {
      return (
        <button type="button" className={cls} onClick={onClick}>
          {children}
        </button>
      );
    }
    return <div className={cls}>{children}</div>;
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-3">
        {items.map((it, idx) => {
          if (it.kind === "empty") {
            return (
              <div
                key={`empty-${idx}`}
                className="w-full rounded-md border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-600"
              >
                {it.title}
              </div>
            );
          }

          if (it.kind === "ref") {
            return (
              <Card key={`ref-${it.lane}-${idx}`}>
                <div className="text-sm font-extrabold text-slate-900">
                  {it.title}
                </div>
              </Card>
            );
          }

          if (it.kind === "roster") {
            const clickable = !!it.pickRow;
            return (
              <Card
                key={`roster-${it.lane}-${idx}`}
                onClick={clickable ? () => onPickStandby?.(it.pickRow) : undefined}
                disabled={!clickable}
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={[
                      "text-sm font-extrabold text-slate-900",
                      it.struck ? "line-through opacity-50" : "",
                    ].join(" ")}
                  >
                    {it.title}
                  </div>
                  {it.pill ? <Pill text={it.pill} /> : null}
                </div>
              </Card>
            );
          }

          // standby
          return (
            <Card
              key={`standby-${it.lane}-${idx}`}
              onClick={() => onPickStandby?.(it.row)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-extrabold text-slate-900">
                  {it.title}
                </div>
                <Pill text={it.pill} />
              </div>
            </Card>
          );
        })}

        {/* Add Standby button — moved BELOW cards, full width, black bg */}
        {mode === "mine" ? (
          <button
            type="button"
            onClick={() => onAddStandby?.({ shift_date: dateKey })}
                className="mt-4 w-full rounded-md bg-slate-900 text-white px-3 py-2 text-s font-medium hover:bg-slate-800 active:scale-[0.99] transition"
          >
            Add standby
          </button>
        ) : null}
      </div>
    </ModalShell>
  );
}
