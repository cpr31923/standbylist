import React from "react";

export default function EmptyState({ tabLabel }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-center">
      <div className="text-3xl">🗂️</div>
      <div className="mt-2 text-sm font-semibold text-slate-700">{tabLabel}</div>
    </div>
  );
}
