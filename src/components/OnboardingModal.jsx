import React, { useEffect } from "react";
import SpotlightOverlay from "./SpotlightOverlay";

const STEPS = [
  {
    title: "Welcome to Shift IOU",
    body: (
      <>
        <p className="text-slate-700 leading-relaxed">
            Shift IOU helps you keep track of your standbys — who you owe, and who owes you.        </p>
        <p className="text-slate-700 leading-relaxed mt-3">
          It’s a <span className="font-semibold">personal ledger</span> for your own reference. Nothing you record here links to any other system or any other user. 
        </p>
      </>
    ),
    primary: "Let's go",
  },
  {
    title: "The one simple rule",
    body: (
      <div className="space-y-3">
       <p className="text-slate-700 leading-relaxed">
          A standby is just an agreement between you and someone else to work shifts for each other.
        </p>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="font-semibold text-slate-900">If you work for someone →</div>
          <div className="text-slate-700"> they owe you a shift</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="font-semibold text-slate-900">If someone works for you →</div>
          <div className="text-slate-700"> you owe them a shift</div>
        </div>
        <p className="text-slate-700 leading-relaxed">
          That’s it. Everything in the app is built around this agreement.
        </p>
      </div>
    ),
    primary: "Next",
  },
  {
    title: "Where to look",
    body: (
      <div className="space-y-3">
        <p className="text-slate-700 leading-relaxed">
          <span className="font-semibold">Tap ☰ to open the menu.</span>
        </p>
        <p className="text-slate-700 leading-relaxed">
          <span className="font-semibold">Owed to me</span> - people who currently owe you a shift.
        </p>
        <p className="text-slate-700 leading-relaxed mt-3">
          <span className="font-semibold">I owe</span> - people you currently owe a shift to. 
        </p>
        <p className="text-slate-700 leading-relaxed mt-3">
          <span className="font-semibold">Upcoming</span> - upcoming standbys you have requested or agreed to fill.
        </p>
        <p className="text-slate-700 leading-relaxed mt-3">
          <span className="font-semibold">Calendar</span> - shows your platoon's shift pattern with your standby commitments overlaid.
        </p>
        <p className="text-slate-700 leading-relaxed">
          You can tap any entry to see details and change it later.
        </p>
      </div>
    ),
    primary: "Next",
  },
  {
    title: "Getting started",
    body: (
      <>
        <p className="text-slate-700 leading-relaxed">
          To get started, <span className="font-semibold">add any standbys you already have.</span>
        </p>
        <p className="text-slate-700 leading-relaxed mt-3">
          Tap <span className="font-semibold">+ Add standby</span>, enter who worked for who, and the app sorts the rest.
        </p>
        <p className="text-slate-700 leading-relaxed mt-3">
          Whenever you arrange a new standby, <span className="font-semibold">add the shift here.</span>
        </p>
        <p className="text-slate-700 leading-relaxed mt-3">
          When the return shift happens, add that too <span className="font-semibold">and select Settle shift</span> to link them together.
        </p>
        <p className="text-slate-700 leading-relaxed mt-3">
          And if you make a mistake, you can edit or delete it. <span className="font-semibold">Nothing is permanent.</span>
        </p>
      </>
    ),
    primary: "Next",
  },
  {
    title: "Your data is safe",
    body: (
      <>
        <p className="text-slate-700 leading-relaxed">
          Only you can see your data. You can’t affect anyone else’s records.
        </p>
        <p className="text-slate-700 leading-relaxed mt-3">
          You can change or delete anything anytime.
        </p>
      </>
    ),
    primary: "Get started",
  },
];

export default function OnboardingModal({
  open,
  stepIndex,
  targetEl,
  onNext,
  onBack,
  onClose,
  showBack = true,
  showSkip = true,
  mode = "onboarding", // "onboarding" | "help"
}) {
  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

// Spotlight overlay (optional per step)

  const step = STEPS[stepIndex] ?? STEPS[0];
  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;

      return (
    <>
      {targetEl ? <SpotlightOverlay targetEl={targetEl} /> : null}

      <div
        className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "help" ? "Help" : "Onboarding"}
      >
        {/* Backdrop */}
        <button
          className={`absolute inset-0 ${targetEl ? "bg-transparent" : "bg-black/40"}`}
          aria-label="Close"
          onClick={onClose}
          type="button"
        />

        {/* Sheet / Modal */}
        <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6 h-[80vh] sm:h-[580px] flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-500">
                {mode === "help" ? "Help" : `Step ${stepIndex + 1} of ${STEPS.length}`}
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mt-1">{step.title}</h2>
            </div>

            <button
              className="p-2 -mr-2 rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto pr-1">
                {step.body}
                </div>


          <div className="mt-5 flex items-center justify-center gap-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full ${i === stepIndex ? "bg-slate-900" : "bg-slate-200"}`}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {showBack && !isFirst && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-4 py-2 rounded-xl font-semibold border border-slate-200 text-slate-900 hover:bg-slate-50"
                >
                  Back
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {showSkip && mode !== "help" && !isLast && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Skip
                </button>
              )}

              <button
                type="button"
                onClick={onNext}
                className="px-4 py-2 rounded-xl font-semibold bg-slate-900 text-white hover:bg-slate-800"
              >
                {isLast ? "Finish" : step.primary}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export { STEPS };
