// src/components/CalendarView.jsx
import React, { useMemo, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import DayDetailModal from "./DayDetailModal";

/* =========================================================
   Date helpers (YYYY-MM-DD)
========================================================= */
function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function weekdaySunFirst(d) {
  return d.getDay(); // Sun=0..Sat=6
}

function monthLabel(d) {
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function dayNum(d) {
  return d.getDate();
}

function isToday(d) {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function clampPlatoonLetter(v) {
  const s = String(v || "").trim().toUpperCase();
  return s === "A" || s === "B" || s === "C" || s === "D" ? s : "";
}

/* =========================================================
   Styling helpers
========================================================= */
function rosterPillClass(letter) {
  const L = clampPlatoonLetter(letter);
  if (L === "A") return "bg-sky-100 text-sky-800 border-sky-200";
  if (L === "B") return "bg-slate-200 text-slate-900 border-slate-300";
  if (L === "C") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (L === "D") return "bg-rose-100 text-rose-800 border-rose-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

/* =========================================================
   Month input helpers
========================================================= */
function toMonthValue(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function fromMonthValue(v) {
  if (!v) return null;
  const [yy, mm] = String(v).split("-");
  const y = Number(yy);
  const m = Number(mm);
  if (!Number.isFinite(y) || !Number.isFinite(m) || y < 1900 || m < 1 || m > 12)
    return null;
  return new Date(y, m - 1, 1);
}

/* =========================================================
   CalendarView
   Props:
   - userId (uuid)
   - mode: "shift" | "mine"
   - homePlatoon: "A"|"B"|"C"|"D"|""
   - onSelectStandby: (standbyRow) => void
   - onAddStandby?: ({ shift_date }) => void
   - onGoSettings?: () => void
========================================================= */
export default function CalendarView({
  userId,
  mode = "shift",
  homePlatoon = "",
  onSelectStandby,
  onAddStandby,
  onGoSettings,
}) {
  const [cursorMonth, setCursorMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(false);
  const [rosterRows, setRosterRows] = useState([]);
  const [standbyRows, setStandbyRows] = useState([]);

  // Day detail modal state (works for both modes)
  const [dayOpen, setDayOpen] = useState(false);
  const [selectedDateObj, setSelectedDateObj] = useState(null); // Date
  const [selectedDateKey, setSelectedDateKey] = useState(""); // YYYY-MM-DD

  const home = clampPlatoonLetter(homePlatoon);
  const needsHomePlatoon = mode === "mine" && !home;

  /* -----------------------------
     Build visible grid (Sun-first, full weeks)
  ----------------------------- */
  const grid = useMemo(() => {
    const first = startOfMonth(cursorMonth);
    const last = endOfMonth(cursorMonth);

    const offset = weekdaySunFirst(first); // 0..6
    const gridStart = addDays(first, -offset);

    const lastWeekday = weekdaySunFirst(last);
    const trailing = 6 - lastWeekday;
    const gridEnd = addDays(last, trailing);

    const days = [];
    let cur = new Date(gridStart);
    while (cur <= gridEnd) {
      days.push(new Date(cur));
      cur = addDays(cur, 1);
    }

    return { first, last, gridStart, gridEnd, days };
  }, [cursorMonth]);

  /* -----------------------------
     Roster lookup by date
     rosterRows shape from RPC: { date, day_platoon, night_platoon }
  ----------------------------- */
  const rosterByDate = useMemo(() => {
    const m = new Map();
    for (const r of rosterRows || []) {
      const key = String(r.date || "");
      if (!key) continue;
      m.set(key, {
        day: clampPlatoonLetter(r.day_platoon),
        night: clampPlatoonLetter(r.night_platoon),
      });
    }
    return m;
  }, [rosterRows]);

  /* -----------------------------
     Standby lookup by date (for My Calendar)
  ----------------------------- */
  const standbysByDate = useMemo(() => {
    const m = new Map();
    for (const s of standbyRows || []) {
      const key = String(s.shift_date || "");
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(s);
    }
    return m;
  }, [standbyRows]);

  /* -----------------------------
     Fetch roster + (optional) standbys for visible range
  ----------------------------- */
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const start = ymd(grid.gridStart);
        const end = ymd(grid.gridEnd);

        // 1) roster via RPC
        const { data: rosterData, error: rosterErr } = await supabase.rpc(
          "get_roster_code_range",
          {
            p_start: start,
            p_end: end,
          }
        );

        if (!cancelled) {
          if (rosterErr) {
            console.error("Roster RPC error:", rosterErr);
            setRosterRows([]);
          } else {
            setRosterRows(rosterData || []);
          }
        }

        // 2) standbys overlay only for "mine"
        if (mode === "mine") {
          const { data: standbyData, error: standbyErr } = await supabase
            .from("standby_events")
            .select(
              "id, shift_date, shift_type, person_name, platoon, duty_platoon, worked_for_me, settled, settlement_group_id, deleted_at"
            )
            .eq("user_id", userId)
            .is("deleted_at", null)
            .gte("shift_date", start)
            .lte("shift_date", end);

          if (!cancelled) {
            if (standbyErr) {
              console.error("Standby overlay fetch error:", standbyErr);
              setStandbyRows([]);
            } else {
              setStandbyRows(standbyData || []);
            }
          }
        } else {
          if (!cancelled) setStandbyRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, grid.gridStart, grid.gridEnd, mode]);

  /* -----------------------------
     Nav
  ----------------------------- */
  function goPrevMonth() {
    setCursorMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function goNextMonth() {
    setCursorMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function goToday() {
    setCursorMonth(new Date());
  }

  function openDayModal(d) {
    const key = ymd(d);
    setSelectedDateObj(new Date(d));
    setSelectedDateKey(key);
    setDayOpen(true);
  }

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const selectedRoster = selectedDateKey
    ? rosterByDate.get(selectedDateKey) || { day: "", night: "" }
    : { day: "", night: "" };

  const selectedStandbys = selectedDateKey
    ? standbysByDate.get(selectedDateKey) || []
    : [];

  // Shared chip styles for My Calendar
  const chipBase = [
  "flex items-center justify-center",
  "w-full",                       // ✅ always matches lane width
  "min-w-0",                      // ✅ allows shrinking
  "px-1.5 py-0.5",                // tighter padding
  "text-[9px] font-extrabold",
  "rounded-full border leading-none",
  "whitespace-nowrap overflow-hidden text-ellipsis", // ✅ truncate safely
].join(" ");

  return (
    <div>
      {/* Day modal (both modes) */}
      {dayOpen && selectedDateObj ? (
        <DayDetailModal
          mode={mode}
          dateObj={selectedDateObj}
          dateKey={selectedDateKey}
          roster={selectedRoster}
          home={home}
          standbysHere={mode === "mine" ? selectedStandbys : []}
          onPickStandby={(row) => {
            setDayOpen(false);
            onSelectStandby?.(row);
          }}
          onAddStandby={(payload) => {
            setDayOpen(false);
            onAddStandby?.(payload);
          }}
          onClose={() => setDayOpen(false)}
        />
      ) : null}

      {/* prompt if home platoon missing */}
      {needsHomePlatoon && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-extrabold text-amber-900">
            Set your Home Platoon to use “My calendar”
          </div>
          <div className="mt-1 text-sm text-amber-900/80">
            Go to Settings → Home platoon, then come back.
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onGoSettings?.()}
              className="rounded-md bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800 active:scale-[0.99] transition"
            >
              Go to Settings
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-white pb-3">
        <div className="pt-1 space-y-2">
          <div className="text-2xl font-extrabold text-slate-900 text-center">
            {monthLabel(cursorMonth)}
          </div>

          {mode === "mine" && home && (
            <div className="mt-1 text-center text-xs text-slate-500">
              Viewing {home} Platoon’s pattern
            </div>
          )}

          <div className="flex items-center justify-center gap-2">
            <input
              type="month"
              value={toMonthValue(cursorMonth)}
              onChange={(e) => {
                const next = fromMonthValue(e.target.value);
                if (next) setCursorMonth(next);
              }}
              className="h-10 rounded-md border border-slate-200 bg-white text-slate-900 px-3 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            />

            <button
              type="button"
              onClick={goToday}
              className="h-10 rounded-md border border-slate-200 bg-white text-slate-900 px-3 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            >
              Today
            </button>

            <button
              type="button"
              onClick={goPrevMonth}
              className="h-10 rounded-md border border-slate-200 bg-white text-slate-900 px-3 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
              aria-label="Previous month"
              title="Previous month"
            >
              ‹
            </button>

            <button
              type="button"
              onClick={goNextMonth}
              className="h-10 rounded-md border border-slate-200 bg-white text-slate-900 px-3 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
              aria-label="Next month"
              title="Next month"
            >
              ›
            </button>
          </div>

          {loading && (
            <div className="text-sm text-slate-500 text-center">Loading…</div>
          )}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        {/* Weekday header */}
        <div className="bg-slate-200">
          <div className="grid grid-cols-7 gap-px bg-slate-200">
            {weekdayLabels.map((w) => (
              <div
                key={w}
                className="bg-slate-50 py-2 text-[11px] font-extrabold text-slate-600 uppercase text-center"
              >
                {w}
              </div>
            ))}
          </div>
        </div>

        {/* Days grid */}
        <div className="bg-slate-200">
          <div className="grid grid-cols-7 gap-px bg-slate-200">
            {grid.days.map((d) => {
              const key = ymd(d);
              const inMonth = d.getMonth() === cursorMonth.getMonth();
              const today = isToday(d);
              const roster = rosterByDate.get(key) || { day: "", night: "" };

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => openDayModal(d)}
                  className={[
                    "min-h-[84px] p-1.5 text-left overflow-hidden",
                    inMonth ? "bg-white" : "bg-slate-50",
                    today ? "ring-2 ring-slate-900 ring-inset" : "",
                    "hover:bg-slate-50 active:scale-[0.995] transition",
                  ].join(" ")}
                  title="Tap to view day details"
                >
                  {/* =====================================================
                      SHIFT CALENDAR (platoon letters)
                  ===================================================== */}
                  {mode === "shift" ? (
                    <>
                      <div
                        className={[
                          "text-[15px] font-medium text-center leading-none",
                          inMonth ? "text-slate-900" : "text-slate-400",
                        ].join(" ")}
                      >
                        {dayNum(d)}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 px-1">
                        <span
                          className={[
                            "inline-flex items-center justify-center w-10 h-8 rounded-full border text-sm font-medium",
                            rosterPillClass(roster.day),
                            !roster.day ? "opacity-50" : "",
                          ].join(" ")}
                          title={roster.day ? `Day: ${roster.day} Platoon` : "Day: —"}
                        >
                          {roster.day || "—"}
                        </span>

                        <span
                          className={[
                            "inline-flex items-center justify-center w-10 h-8 rounded-full border text-sm font-medium",
                            rosterPillClass(roster.night),
                            !roster.night ? "opacity-50" : "",
                          ].join(" ")}
                          title={
                            roster.night ? `Night: ${roster.night} Platoon` : "Night: —"
                          }
                        >
                          {roster.night || "—"}
                        </span>
                      </div>
                    </>
                  ) : null}

                  {/* =====================================================
                      MY CALENDAR (3 lanes: date / day / night)
                      - max 2 pills total (one per lane)
                      - if SBYA exists for lane, hide roster pill
                  ===================================================== */}
                  {mode === "mine" ? (() => {
                    const standbysHere = standbysByDate.get(key) || [];

                    // Pick ONE standby per lane (prioritise SBYA over SBY)
                    const daySBYA = standbysHere.find(
                      (s) =>
                        !s?.deleted_at &&
                        s?.worked_for_me === true &&
                        String(s.shift_type || "").trim().toLowerCase() === "day"
                    );
                    const nightSBYA = standbysHere.find(
                      (s) =>
                        !s?.deleted_at &&
                        s?.worked_for_me === true &&
                        String(s.shift_type || "").trim().toLowerCase() === "night"
                    );

                    const daySBY = standbysHere.find(
                      (s) =>
                        !s?.deleted_at &&
                        s?.worked_for_me === false &&
                        String(s.shift_type || "").trim().toLowerCase() === "day"
                    );
                    const nightSBY = standbysHere.find(
                      (s) =>
                        !s?.deleted_at &&
                        s?.worked_for_me === false &&
                        String(s.shift_type || "").trim().toLowerCase() === "night"
                    );

                    const youHaveDay = home && roster.day === home;
                    const youHaveNight = home && roster.night === home;

                    const dayChip = daySBYA
                      ? {
                          text: "SBYA",
                          cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
                        }
                      : daySBY
                      ? {
                          text: "SBY",
                          cls: "bg-orange-100 text-orange-800 border-orange-200",
                        }
                      : youHaveDay
                      ? {
                          text: "Day",
                          cls: "bg-rose-100 text-rose-800 border-rose-200",
                        }
                      : null;

                    const nightChip = nightSBYA
                      ? {
                          text: "SBYA",
                          cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
                        }
                      : nightSBY
                      ? {
                          text: "SBY",
                          cls: "bg-orange-100 text-orange-800 border-orange-200",
                        }
                      : youHaveNight
                      ? {
                          text: "Night",
                          cls: "bg-sky-100 text-sky-800 border-sky-200",
                        }
                      : null;

                    return (
                      <div className="h-full grid grid-rows-[22px_1fr_1fr]">
                        {/* TOP lane: date */}
                        <div
                          className={[
                            "text-[15px] font-medium text-center leading-none",
                            inMonth ? "text-slate-900" : "text-slate-400",
                          ].join(" ")}
                        >
                          {dayNum(d)}
                        </div>

                        {/* MIDDLE lane: Day */}
<div className="flex items-center justify-center w-full px-1 min-w-0">

                          {dayChip ? (
                            <span className={`${chipBase} ${dayChip.cls}`}>
                              {dayChip.text}
                            </span>
                          ) : null}
                        </div>

                        {/* BOTTOM lane: Night */}
<div className="flex items-center justify-center w-full px-1 min-w-0">

                          {nightChip ? (
                            <span className={`${chipBase} ${nightChip.cls}`}>
                              {nightChip.text}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })() : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
