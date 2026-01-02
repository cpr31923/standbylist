// src/components/CalendarView.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

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

function dayNightPillClass(kind) {
  // kind: "DAY" | "NIGHT"
  if (kind === "DAY") return "bg-rose-100 text-rose-800 border-rose-200";
  if (kind === "NIGHT") return "bg-sky-100 text-sky-800 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function standbyPillClass(kind) {
  // kind: "SBYA" | "SBY_DAY" | "SBY_NIGHT"
  if (kind === "SBYA") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (kind === "SBY_DAY") return "bg-orange-100 text-orange-800 border-orange-200";
  if (kind === "SBY_NIGHT") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
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
  if (!Number.isFinite(y) || !Number.isFinite(m) || y < 1900 || m < 1 || m > 12) return null;
  return new Date(y, m - 1, 1);
}

/* =========================================================
   CalendarView
   Props:
   - userId (uuid)
   - mode: "shift" | "mine"
   - homePlatoon: "A"|"B"|"C"|"D"|""
   - onSelectStandby: (standbyRow) => void
   - onGoSettings?: () => void
========================================================= */
export default function CalendarView({
  userId,
  mode = "shift",
  homePlatoon = "",
  onSelectStandby,
  onGoSettings,
}) {
  const [cursorMonth, setCursorMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(false);
  const [rosterRows, setRosterRows] = useState([]);
  const [standbyRows, setStandbyRows] = useState([]);

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
     Standby lookup by date (for My Calendar overlay)
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

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      {/* prompt if home platoon missing */}
      {needsHomePlatoon && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-extrabold text-amber-900">
            Set your Home Platoon to use “My calendar”
          </div>
          <div className="mt-1 text-sm text-amber-900/80">Go to Settings → Home platoon, then come back.</div>
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
      <div className="mb-3 space-y-2">
        <div className="text-2xl font-extrabold text-slate-900 text-center">{monthLabel(cursorMonth)}</div>

        {mode === "mine" && home && (
          <div className="mt-1 text-center text-xs text-slate-500">Viewing {home} Platoon’s pattern</div>
        )}

        <div className="flex items-center justify-center gap-2">
          <input
            type="month"
            value={toMonthValue(cursorMonth)}
            onChange={(e) => {
              const next = fromMonthValue(e.target.value);
              if (next) setCursorMonth(next);
            }}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
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
            <div key={w} className="py-2 text-[11px] font-extrabold text-slate-600 uppercase text-center">
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

            // =====================================================
            // SHIFT CALENDAR (platoon letters)
            // =====================================================
            if (mode === "shift") {
              return (
                <div
                  key={key}
                  className={[
                    "min-h-[92px] border-b border-slate-200 border-r border-slate-200 last:border-r-0",
                    inMonth ? "bg-white" : "bg-slate-50",
                    today ? "ring-2 ring-slate-900 ring-inset" : "",
                  ].join(" ")}
                >
                  <div className={["text-xl font-bold text-center", inMonth ? "text-slate-900" : "text-slate-400"].join(" ")}>
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
                      title={roster.night ? `Night: ${roster.night} Platoon` : "Night: —"}
                    >
                      {roster.night || "—"}
                    </span>
                  </div>
                </div>
              );
            }

            // =====================================================
            // MY CALENDAR (home platoon + standby overlay)
            // =====================================================
            const standbysHere = standbysByDate.get(key) || [];

            const dayStandby = standbysHere.find(
              (s) =>
                !s?.deleted_at && String(s.shift_type || "").trim().toLowerCase() === "day"
            );

            const nightStandby = standbysHere.find(
              (s) =>
                !s?.deleted_at && String(s.shift_type || "").trim().toLowerCase() === "night"
            );

            const youHaveDay = home && roster.day === home;
            const youHaveNight = home && roster.night === home;

            // ✅ SBYA = "they work for me" (worked_for_me === true) AND shift type matches.
            // We use .some() so it works even if there are multiple entries on the same date.
            const dayHasSBYA = standbysHere.some(
              (s) =>
                !s?.deleted_at &&
                s?.worked_for_me === true &&
                String(s.shift_type || "").trim().toLowerCase() === "day"
            );

            const nightHasSBYA = standbysHere.some(
              (s) =>
                !s?.deleted_at &&
                s?.worked_for_me === true &&
                String(s.shift_type || "").trim().toLowerCase() === "night"
            );

            // Click priority: an SBYA on this date (most important), else whatever exists
            const clickableStandby =
              standbysHere.find((s) => !s?.deleted_at && s?.worked_for_me === true) ||
              dayStandby ||
              nightStandby;

            const hasClickHandler = typeof onSelectStandby === "function";
            const canClick = Boolean(clickableStandby && hasClickHandler);

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (!hasClickHandler) return;
                  if (!clickableStandby) return;
                  onSelectStandby(clickableStandby);
                }}
                className={[
                  "min-h-[88px] border-b border-slate-200 border-r border-slate-200 last:border-r-0",
                  "p-1.5 text-left overflow-hidden",
                  inMonth ? "bg-white" : "bg-slate-50",
                  today ? "ring-2 ring-slate-900 ring-inset" : "",
                  canClick ? "hover:bg-slate-50 active:scale-[0.995] transition" : "cursor-default",
                ].join(" ")}
                title={canClick ? "Tap to view standby" : undefined}
              >
                <div
                  className={[
                    "text-[15px] font-medium text-center leading-none",
                    inMonth ? "text-slate-900" : "text-slate-400",
                  ].join(" ")}
                >
                  {dayNum(d)}
                </div>

                {/* fixed vertical lanes */}
                <div className="relative mt-1.5 h-[56px]">
                  {/* DAY lane */}
                  <div className="absolute left-0 right-0 top-0 flex justify-center">
                    <div className="flex flex-col items-center gap-1">
                      {youHaveDay && (
                        <span
                          className={[
                            "inline-flex items-center justify-center w-12 sm:w-14 px-2 py-0.5 text-[9px] font-semibold rounded-full border leading-none",
                            dayNightPillClass("DAY"),
                            dayHasSBYA ? "line-through opacity-40" : "",
                          ].join(" ")}
                        >
                          Day
                        </span>
                      )}

                      {dayStandby && (
                        <span
                          className={[
                            "inline-flex items-center justify-center w-12 sm:w-14 px-2 py-0.5 text-[9px] font-semibold rounded-full border leading-none",
                            standbyPillClass(dayStandby.worked_for_me ? "SBYA" : "SBY_DAY"),
                          ].join(" ")}
                        >
                          {dayStandby.worked_for_me ? "SBYA(DS)" : "SBY(DS)"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* NIGHT lane */}
                  <div className="absolute left-0 right-0 bottom-0 flex justify-center">
                    <div className="flex flex-col items-center gap-1">
                      {youHaveNight && (
                        <span
                          className={[
                            "inline-flex items-center justify-center w-12 sm:w-14 px-2 py-0.5 text-[9px] font-semibold rounded-full border leading-none",
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
                            "inline-flex items-center justify-center w-12 sm:w-14 px-2 py-0.5 text-[9px] font-semibold rounded-full border leading-none",
                            standbyPillClass(nightStandby.worked_for_me ? "SBYA" : "SBY_NIGHT"),
                          ].join(" ")}
                        >
                          {nightStandby.worked_for_me ? "SBYA(NS)" : "SBY(NS)"}
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
