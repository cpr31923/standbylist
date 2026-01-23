import React from "react";

function normalizeText(v) {
  return String(v ?? "").toLowerCase().trim();
}

function isThreeWayMarker(text) {
  const t = normalizeText(text);
  if (!t) return false;

  // accept a few common markers without being too strict
  // e.g. "3-way", "3 way", "3way", "[3WAY]", "three_way", "three way"
  return (
    t.includes("3-way") ||
    t.includes("3 way") ||
    t.includes("3way") ||
    t.includes("[3way]") ||
    t.includes("three_way") ||
    t.includes("three way")
  );
}

/**
 * StatusPill
 * Supports:
 * - deleted / settled / sby / sbya
 * - 3-way settlement (either explicit "threeway" text OR pass { threeWay: true })
 */
export default function StatusPill({ text, threeWay = false }) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap border";

  const t = normalizeText(text);

  const showThreeWay = Boolean(threeWay) || isThreeWayMarker(t);

  const cls = showThreeWay
    ? "bg-violet-100 text-violet-800 border-violet-200"
    : t.includes("deleted")
    ? "bg-rose-100 text-rose-800 border-rose-200"
    : t.includes("settled")
    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : t === "sbya"
    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : t === "sby"
    ? "bg-orange-100 text-orange-800 border-orange-200"
    : "bg-slate-100 text-slate-700 border-slate-200";

  const label = showThreeWay ? "3-Way" : text;

  if (!label) return null;

  return <span className={`${base} ${cls}`}>{label}</span>;
}
