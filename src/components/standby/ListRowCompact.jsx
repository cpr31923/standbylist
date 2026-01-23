import React from "react";
import { toTitleCase } from "./helpers";

function hasThreeWayMarker(notes) {
  const n = String(notes || "").toLowerCase();
  return n.includes("three way standby") || n.includes("three-way standby");
}

function formatUpcomingDate(ymd) {
  // ymd expected "YYYY-MM-DD"
  if (!ymd || typeof ymd !== "string") return "";
  // Force local date parsing without timezone surprises
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;

  // “9 Jan 2026” style (clean + readable)
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ListRowCompact({
  s,
  rowSentence,
  onToggleSelect,
  isSelected,
  variant = "default", // "default" | "upcoming"
}) {
  const threeWay = hasThreeWayMarker(s?.notes);

  const name = toTitleCase(s?.person_name || "");
  const dateText = variant === "upcoming" ? formatUpcomingDate(s?.shift_date) : "";

  return (
    <button onClick={() => onToggleSelect?.(s)} className="w-full text-left" type="button">
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {/* Primary line */}
            <div className="text-[15px] font-medium text-slate-900 truncate">
              {variant === "upcoming" && dateText ? (
                <span>
                  <span className="font-extrabold">{dateText}</span>
                  <span className="text-slate-400"> — </span>
                  {name}
                </span>
              ) : (
                name
              )}
            </div>

            {/* Secondary line */}
            <div className="text-[12px] text-slate-500 truncate">
              {rowSentence?.(s)}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {threeWay ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 text-amber-900 px-2 py-0.5 text-[11px] font-extrabold">
                3-way
              </span>
            ) : null}

            <span className="text-slate-300" aria-hidden>
              ›
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
