import React from "react";
import { toTitleCase } from "./helpers";

export default function ListRowCompact({ s, rowSentence, onToggleSelect, isSelected }) {
  return (
    <button
      onClick={() => onToggleSelect?.(s)}
      className="w-full text-left"
      type="button"
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-slate-900 truncate">
              {toTitleCase(s.person_name)}
            </div>
            <div className="text-[12px] text-slate-500 truncate">
              {rowSentence?.(s)}
            </div>
          </div>

          <span className="text-slate-300" aria-hidden>
            ›
          </span>
        </div>
      </div>
    </button>
  );
}
