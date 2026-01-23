import React, { useEffect, useState } from "react";

export default function ModalShell({
  title,
  subtitle,
  children,
  onClose,

  // NEW (backwards-compatible):
  headerActions = null, // renders left of Done button
  closeLabel = "Done",
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 10);
    return () => clearTimeout(t);
  }, []);

  function requestClose() {
    setOpen(false);
    setTimeout(() => onClose?.(), 160);
  }

  return (
    <div
      className={[
        "fixed inset-0 z-50 flex items-center justify-center px-4",
        "transition duration-150",
        open ? "opacity-100" : "opacity-0",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-default"
        onMouseDown={(e) => {
          e.preventDefault();
          requestClose();
        }}
      />

      <div
        className={[
          "relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-md bg-white shadow-xl border border-slate-200",
          "transition duration-150",
          open ? "scale-100" : "scale-[0.98]",
        ].join(" ")}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-100 bg-white">
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-slate-900 truncate leading-tight">
              {title || ""}
            </div>
            {subtitle ? (
              <div className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</div>
            ) : null}
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {headerActions}
            <button
              onClick={requestClose}
              className="rounded-md px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.98] transition"
              type="button"
            >
              {closeLabel}
            </button>
          </div>
        </div>

        <div className="px-5 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
