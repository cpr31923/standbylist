// src/components/CalendarView.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

// ---------- date helpers ----------
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

// ---------- styling helpers ----------
function platoonLetterClass(letter) {
  const L = clampPlatoonLetter(letter);
  if (L === "A") return "text-sky-700"; // Blue
  if (L === "B") return "text-slate-900"; // Black-ish
  if (L === "C") return "text-emerald-700"; // Green
  if (L === "D") return "text-rose-700"; // Red
  return "text-slate-400";
}

function dayNightPillClass(kind) {
  // kind: "DAY" | "NIGHT"
  if (kind === "DAY") return "bg-rose-100 text-rose-800 border-rose-200";
  if (kind === "NIGHT") return "bg-sky-100 text-sky-800 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function standbyPillClass(kind) {
  // kind: "SBYA" | "SBY_DAY" | "SBY_NIGHT"
  if (kind === "SBYA") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (kind === "SBY_DAY") return "bg-rose-100 text-rose-800 border-rose-200";
  if (kind === "SBY_NIGHT") return "bg-sky-100 text-sky-800 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function toMonthValue(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function fromMonthValue(v) {
  // v = "YYYY-MM"
  if (!v) return null;
  const [yy, mm] = String(v).split("-");
  const y = Number(yy);
  const m = Number(mm);
  if (!Number.isFinite(y) || !Number.isFinite(m) || y < 1900 || m < 1 || m > 12) return null;
  return new Date(y, m - 1, 1);
}

/**
 * CalendarView
 * Props:
 * - userId (uuid)
 * - mode: "shift" | "mine"
 * - homePlatoon: "A"|"B"|"C"|"D"|""
 * - onSelectStandby: (standbyRow) => void   // for opening detail modal
 */
export default function CalendarView({
  userId,
  mode = "shift",
  homePlatoon = "",
  onSelectStandby,
}) {
  const [cursorMonth, setCursorMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(false);
  const [rosterRows, setRosterRows] = useState([]);
  const [standbyRows, setStandbyRows] = useState([]);

  const monthInputRef = useRef(null);

  // Compute visible calendar grid range (Sun-first, full weeks)
  const grid = useMemo(() => {
    const first = startOfMonth(cursorMonth);
    const last = endOfMonth(cursorMonth);

    const offset = weekdaySunFirst(first); // 0..6, Sun first
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

  // roster lookup
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

  // standby lookup (my calendar only)
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

  // Fetch roster + (optional) standbys for the visible grid range
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const start = ymd(grid.gridStart);
        const end = ymd(grid.gridEnd);

        // 1) roster via RPC
        const { data: rosterData, error: rosterErr } = await supabase.rpc("get_roster_code_range", {
          p_start: start,
          p_end: end,
        });

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

  function goPrevMonth() {
    setCursorMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function goNextMonth() {
    setCursorMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function goToday() {
    setCursorMonth(new Date());
  }

  // IMPORTANT: showPicker() can throw on some browsers. Keep this crash-proof.
  function openMonthPicker() {
    const el = monthInputRef.current;
    if (!el) return;

    try {
      // some browsers support it, some throw, some ignore
      if (typeof el.showPicker === "function") el.showPicker();
    } catch (e) {
      // ignore
    }

    try {
      el.focus();
      el.click();
    } catch (e) {
      // ignore
    }
  }

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const home = clampPlatoonLetter(homePlatoon);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-extrabold text-slate-900 truncate">{monthLabel(cursorMonth)}</div>
        </div>

        <div className="flex items-center gap-2">
          {/* Month/Year picker */}
          <button
            type="button"
            onClick={openMonthPicker}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            title="Jump to month"
          >
            Month
          </button>

          {/* Keep it in the DOM (not display:none) so click/focus works reliably */}
          <input
            ref={monthInputRef}
            type="month"
            value={toMonthValue(cursorMonth)}
            onChange={(e) => {
              const next = fromMonthValue(e.target.value);
              if (next) setCursorMonth(next);
            }}
            className="absolute -left-[9999px] -top-[9999px] opacity-0"
            aria-hidden="true"
            tabIndex={-1}
          />

          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goPrevMonth}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            aria-label="Previous month"
            title="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNextMonth}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            aria-label="Next month"
            title="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500 mb-2">Loading…</div>}

      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {weekdayLabels.map((w) => (
            <div key={w} className="px-2 py-2 text-[11px] font-extrabold text-slate-600 uppercase tracking-wide">
              {w}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {grid.days.map((d) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === cursorMonth.getMonth();
            const today = isToday(d);

            const roster = rosterByDate.get(key) || { day: "", night: "" };

            // --- SHIFT CALENDAR (platoon letters) ---
            if (mode === "shift") {
              return (
                <div
                  key={key}
                  className={[
                    "min-h-[92px] border-b border-slate-200 border-r border-slate-200 last:border-r-0",
                    "p-2 overflow-hidden",
                    inMonth ? "bg-white" : "bg-slate-50",
                    today ? "ring-2 ring-slate-900 ring-inset" : "",
                  ].join(" ")}
                >
                  {/* top row: date centered */}
                  <div className={["text-base font-medium text-center", inMonth ? "text-slate-900" : "text-slate-400"].join(" ")}>
                    {dayNum(d)}
                  </div>

                  {/* bottom row: letters left/right */}
                  <div className="mt-2 flex items-center justify-between px-1">
                    <span className={["text-lg font-extrabold", platoonLetterClass(roster.day)].join(" ")}>
                      {roster.day || ""}
                    </span>
                    <span className={["text-lg font-extrabold", platoonLetterClass(roster.night)].join(" ")}>
                      {roster.night || ""}
                    </span>
                  </div>
                </div>
              );
            }

            // --- MY CALENDAR ---
            const standbysHere = standbysByDate.get(key) || [];
            const dayStandby = standbysHere.find((s) => String(s.shift_type || "").toLowerCase() === "day");
            const nightStandby = standbysHere.find((s) => String(s.shift_type || "").toLowerCase() === "night");

            const youHaveDay = home && roster.day === home;
            const youHaveNight = home && roster.night === home;

            // worked_for_me === true => they work for you (you owe them) => SBYA (green)
            // worked_for_me === false => you work for them => SBY (colour by day/night)
            const dayHasSBYA = Boolean(dayStandby && dayStandby.worked_for_me);
            const nightHasSBYA = Boolean(nightStandby && nightStandby.worked_for_me);

            const clickableStandby = dayStandby || nightStandby;
            const canClick = Boolean(clickableStandby && typeof onSelectStandby === "function");

            return (
              <button
                key={key}
                type="button"
                disabled={!canClick}
                onClick={() => {
                  if (!canClick) return;
                  onSelectStandby(dayStandby || nightStandby);
                }}
                className={[
                  "min-h-[110px] border-b border-slate-200 border-r border-slate-200 last:border-r-0",
                  "p-2 text-left overflow-hidden",
                  inMonth ? "bg-white" : "bg-slate-50",
                  today ? "ring-2 ring-slate-900 ring-inset" : "",
                  canClick ? "hover:bg-slate-50 active:scale-[0.995] transition" : "cursor-default",
                ].join(" ")}
                title={canClick ? "Tap to view standby" : undefined}
              >
                {/* date number (not bold, slightly larger) */}
                <div className={["text-base font-medium text-center", inMonth ? "text-slate-900" : "text-slate-400"].join(" ")}>
                  {dayNum(d)}
                </div>

                {/* fixed vertical lanes */}
                <div className="relative mt-2 h-[72px]">
                  {/* DAY lane (higher) */}
                  <div className="absolute left-0 right-0 top-0 flex justify-center">
                    <div className="flex items-center gap-2">
                      {youHaveDay && (
                        <span
                          className={[
                            "inline-flex items-center justify-center w-14 sm:w-16 px-2 py-1 text-xs font-extrabold rounded-full border",
                            dayNightPillClass("DAY"),
                            dayHasSBYA ? "line-through opacity-60" : "",
                          ].join(" ")}
                        >
                          Day
                        </span>
                      )}

                      {dayStandby && (
                        <span
                          className={[
                            "inline-flex items-center justify-center w-14 sm:w-16 px-2 py-1 text-xs font-extrabold rounded-full border",
                            standbyPillClass(dayStandby.worked_for_me ? "SBYA" : "SBY_DAY"),
                          ].join(" ")}
                        >
                          {dayStandby.worked_for_me ? "SBYA" : "SBY"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* NIGHT lane (lower) */}
                  <div className="absolute left-0 right-0 bottom-0 flex justify-center">
                    <div className="flex items-center gap-2">
                      {youHaveNight && (
                        <span
                          className={[
                            "inline-flex items-center justify-center w-14 sm:w-16 px-2 py-1 text-xs font-extrabold rounded-full border",
                            dayNightPillClass("NIGHT"),
                            nightHasSBYA ? "line-through opacity-60" : "",
                          ].join(" ")}
                        >
                          Night
                        </span>
                      )}

                      {nightStandby && (
                        <span
                          className={[
                            "inline-flex items-center justify-center w-14 sm:w-16 px-2 py-1 text-xs font-extrabold rounded-full border",
                            standbyPillClass(nightStandby.worked_for_me ? "SBYA" : "SBY_NIGHT"),
                          ].join(" ")}
                        >
                          {nightStandby.worked_for_me ? "SBYA" : "SBY"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
