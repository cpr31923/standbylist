import React, { useEffect, useMemo, useState } from "react";
import { useOppositeCandidates, buildOppositePersonOptions } from "../hooks/useOppositeCandidates";
import { toTitleCase, normalizeName } from "../helpers";
import { appendNoteToIds, renameStandbyPerson } from "../services/settlements";


/**
 * AddStandbyModal
 * - Auto-calc duty_platoon (shift_date + shift_type) via computeDutyPlatoon()
 * - Radio buttons for worked_for_me with tense based on shift_date
 * - Settlement workflow UI
 * - ✅ Grouping workflow UI (bundle_id/bundle_label) for worked_for_me=true only
 *
 * IMPORTANT:
 * This modal does NOT insert into Supabase directly (it calls onSubmit from parent).
 */
export default function AddStandbyModal({
  userId,
  form,
  setForm,
  onSubmit,
  onClose,
  nameSuggestions = [],
  bundleOptions = [],
  computeDutyPlatoon,

  // If Add modal opened from Detail modal "Create new shift to settle":
  settleWithStandbyId = null,
  settleWithPersonLabel = "",
}) {
  const f = form || {};

    // ---- Name mismatch barrier for "settle existing" flow ----
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const [mismatchChoice, setMismatchChoice] = useState(null); // "threeWay" | "typo" | "other" | null
  const [mismatchNote, setMismatchNote] = useState("");
  const [mismatchCandidate, setMismatchCandidate] = useState(null); // candidate row {id, person_name, ...}


  const safeBundleOptions = Array.isArray(bundleOptions) ? bundleOptions : [];

  const safeSetForm =
    typeof setForm === "function"
      ? setForm
      : () => console.warn("AddStandbyModal: setForm missing");

  const safeChange = (patch) => safeSetForm((prev) => ({ ...(prev || {}), ...patch }));

  const settleMode = !!(f?.settle_with_standby_id || settleWithStandbyId);

  const settleOtherName = String(f?.settle_with_person_name || settleWithPersonLabel || "").trim();
  const inputName = String(f?.person_name || "").trim();

  const confirmSentence = useMemo(() => {
    if (!settleMode) return "";

    if (f?.settle_three_way) {
      const a = settleOtherName || "(name)";
      const b = inputName || "(name)";
      return `I want to settle a 3-way standby between ${toTitleCase(a)}, ${toTitleCase(b)} and myself.`;
    }

    return `I want to settle a standby with ${toTitleCase(settleOtherName || "—")}`;
  }, [settleMode, f?.settle_three_way, settleOtherName, inputName]);

  // ---- Date helpers ----
  const todayYMD = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const isFutureYMD = (ymd) => {
    if (!ymd) return false;
    return ymd > todayYMD();
  };

  const isFutureShift = useMemo(() => isFutureYMD(f.shift_date), [f.shift_date]);
  const settleSourceName = String(f?.settle_with_person_name || settleWithPersonLabel || "").trim();
  const settleIsFuture = isFutureYMD(f.shift_date);

  // Adapter for settlement logic
  const worked_for_me = !!f.worked_for_me;

  // ---- Opposite candidates ----
  const { oppositeCandidates, loadingOpposite, fetchOppositeCandidates } =
    useOppositeCandidates({ userId });

  // Opposite list: if I'm adding "I owe" (worked_for_me=true), opposite is "owed" (worked_for_me=false)
  const wantWorkedForMe = !worked_for_me;

  // Dropdown label mode depends on which list we are picking FROM (opposite list)
  const dropdownMode = worked_for_me ? "owed" : "owe";

  const oppositeOptions = useMemo(() => {
    return buildOppositePersonOptions(oppositeCandidates, dropdownMode);
  }, [oppositeCandidates, dropdownMode]);

  // ---- Platoon calculation (supports async computeDutyPlatoon) ----
  const dutyPlatoonPreview = useMemo(() => {
    const ymd = f.shift_date || "";
    const st = f.shift_type || "Day";
    if (!ymd) return "";
    if (typeof computeDutyPlatoon !== "function") return "";

    try {
      const v = computeDutyPlatoon(ymd, st);
      if (v && typeof v.then === "function") return "";
      return v ? String(v).toUpperCase().trim() : "";
    } catch {
      return "";
    }
  }, [f.shift_date, f.shift_type, computeDutyPlatoon]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const ymd = f.shift_date || "";
      const st = f.shift_type || "Day";
      if (!ymd) return;
      if (typeof computeDutyPlatoon !== "function") return;

      try {
        const v = computeDutyPlatoon(ymd, st);
        const resolved = v && typeof v.then === "function" ? await v : v;
        if (cancelled) return;

        const platoon = resolved ? String(resolved).toUpperCase().trim() : "";
        if (!platoon) return;

        const current = String(f.duty_platoon || "").toUpperCase().trim();
        if (current === platoon) return;

        safeChange({ duty_platoon: platoon });
      } catch {
        // no-op
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.shift_date, f.shift_type, computeDutyPlatoon]);

  // ---- Copy / tense ----
  const whoTitle = "Who will work this shift?";
  const optIWork = isFutureShift ? "I will work for them" : "I worked for them";
  const optTheyWork = isFutureShift ? "They will work for me" : "They worked for me";
  const whoValue = worked_for_me ? "THEY_WORK_FOR_ME" : "I_WORK_FOR_THEM";

  // ---- Settlement fields ----
  const settleExisting = !!f.settle_existing;
  const selectedOppositeOldestId = f.settle_target_oldest_id || "";
  const confirmSettleWithTarget = !!f.settle_confirmed;

  async function toggleSettleExisting(next) {
    safeChange({
      settle_existing: next,
      settle_target_oldest_id: "",
    });
    resetMismatch();
    if (next) {
      await fetchOppositeCandidates(wantWorkedForMe);
    }
  }

  useEffect(() => {
    if (!settleWithStandbyId && settleExisting) {
      safeChange({ settle_target_oldest_id: "" });
      resetMismatch();
      fetchOppositeCandidates(wantWorkedForMe);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worked_for_me]);


  // ✅ Grouping only allowed when THEY work for me (worked_for_me=true)
  const groupingAllowed = worked_for_me === true;

  // If direction flips away from groupingAllowed, clear grouping fields
  useEffect(() => {
    if (!groupingAllowed) {
      safeChange({
        group_enabled: false,
        group_choice: "",
        group_new_label: "",
        group_existing_id: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupingAllowed]);

  function resetMismatch() {
    setMismatchOpen(false);
    setMismatchChoice(null);
    setMismatchNote("");
    setMismatchCandidate(null);
  }

  function handlePickSettleTarget(candidateId) {
    safeChange({ settle_target_oldest_id: candidateId });

    // Clear prior mismatch state each time user changes selection
    resetMismatch();

    const candidate =
      (oppositeCandidates || []).find((c) => String(c.id) === String(candidateId)) || null;
    if (!candidateId || !candidate) return;

    const typed = String(f?.person_name || "").trim();
    const picked = String(candidate?.person_name || "").trim();

    // If name is blank, just adopt the selected person's name (best UX)
    if (!typed && picked) {
      safeChange({ person_name: picked });
      return;
    }

    const a = normalizeName(typed);
    const b = normalizeName(picked);
    const mismatch = a && b && a !== b;

    if (mismatch) {
      setMismatchCandidate(candidate);
      setMismatchOpen(true);
      return;
    }

    // No mismatch: ensure we don't carry any previous 3-way flag
    safeChange({ settle_three_way: false });
  }

  function chooseMismatchTypo() {
    setMismatchChoice("typo");
    safeChange({ settle_three_way: false });
  }

  function chooseMismatchThreeWay() {
    setMismatchChoice("threeWay");
    safeChange({ settle_three_way: true });
  }

  function chooseMismatchOther() {
    setMismatchChoice("other");
    safeChange({ settle_three_way: false });
  }


    async function handleSubmit(e) {
    // Settlement guards
    if (settleWithStandbyId) {
      if (!confirmSettleWithTarget) {
        e.preventDefault();
        alert("Tick the confirmation box to settle this shift.");
        return;
      }
      safeChange({ settle_with_standby_id: settleWithStandbyId });
    } else if (settleExisting) {
      if (!selectedOppositeOldestId) {
        e.preventDefault();
        alert("Select who to settle against.");
        return;
      }
            // ---- Name mismatch barrier (settle existing) ----
      if (mismatchOpen && mismatchCandidate?.id) {
        if (!mismatchChoice) {
          e.preventDefault();
          alert("These shifts have different names — choose an option to continue.");
          return;
        }

        if (mismatchChoice === "other") {
          const note = String(mismatchNote || "").trim();
          if (!note) {
            e.preventDefault();
            alert("Please add a note for 'Other reason'.");
            return;
          }

          // Add note to the EXISTING row now; we also encourage user to add context to the new row via Notes if desired.
          const res = await appendNoteToIds([mismatchCandidate.id], note);
          if (!res?.ok) {
            e.preventDefault();
            alert("Could not add note. Check console.");
            return;
          }
        }

        if (mismatchChoice === "typo") {
          const typed = String(f?.person_name || "").trim();
          if (!typed) {
            e.preventDefault();
            alert("Enter the correct name first.");
            return;
          }

          // Rename the EXISTING target to match the typed name (only at submit time)
          const before = toTitleCase(mismatchCandidate?.person_name || "—");
          const after = toTitleCase(typed);

          const resRename = await renameStandbyPerson(mismatchCandidate.id, typed);
          if (!resRename?.ok) {
            e.preventDefault();
            alert("Could not rename. Check console.");
            return;
          }

          await appendNoteToIds(
            [mismatchCandidate.id],
            `Name corrected during settlement: "${before}" → "${after}"`
          );
        }
      }
      safeChange({ settle_with_standby_id: null });
    } else {
      safeChange({
        settle_with_standby_id: null,
        settle_target_oldest_id: "",
        settle_confirmed: false,
      });
    }

    // Grouping guard (only when enabled)
    if (groupingAllowed && f?.group_enabled) {
      const choice = String(f?.group_choice || "").trim();
      if (choice === "new") {
        const label = String(f?.group_new_label || "").trim();
        if (!label) {
          e.preventDefault();
          alert("Enter a group label (e.g. Camping trip).");
          return;
        }
      }
      if (choice === "existing") {
        const id = String(f?.group_existing_id || "").trim();
        if (!id) {
          e.preventDefault();
          alert("Choose an existing group.");
          return;
        }
      }
      if (!choice) {
        e.preventDefault();
        alert("Choose New Group or Existing Group.");
        return;
      }
    }

    onSubmit?.(e);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 1) Shift Date */}
      <div>
        <label className="text-sm font-semibold text-slate-700">Shift Date</label>
        <input
          type="date"
          value={f.shift_date || ""}
          onChange={(e) => safeChange({ shift_date: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
        />
      </div>

      {/* 2) Shift Type */}
      <div>
        <label className="text-sm font-semibold text-slate-700">Shift Type</label>
        <select
          value={f.shift_type || "Day"}
          onChange={(e) => safeChange({ shift_type: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
        >
          <option value="Day">Day</option>
          <option value="Night">Night</option>
        </select>
      </div>

      {/* 3) "This will be a <platoon> shift" */}
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="text-sm font-semibold text-slate-900">
          This is a{" "}
          <span className="font-extrabold">
            {(f.duty_platoon || dutyPlatoonPreview || "—").toUpperCase()}
          </span>{" "}
          Platoon <span>{f.shift_type || "Day"}</span> Shift
        </div>
      </div>

      {/* 4) Who will work this shift? */}
      {settleMode ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold text-slate-500">Direction</div>
          <div className="text-sm font-extrabold text-slate-900">
            {f.worked_for_me
              ? settleIsFuture
                ? "They will work for you"
                : "They worked for you"
              : settleIsFuture
              ? "You will work for them"
              : "You worked for them"}
          </div>
          <div className="mt-0.5 text-xs font-normal text-slate-600">
            This is set automatically to match the other shift.
          </div>
        </div>
      ) : (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">  
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-700">{whoTitle}</legend>

          <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
            <input
              type="radio"
              name="whoWorks"
              checked={whoValue === "I_WORK_FOR_THEM"}
              onChange={() => safeChange({ worked_for_me: false })}
              className="mt-1"
            />
            <div className="text-sm font-semibold text-slate-900">{optIWork}</div>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
            <input
              type="radio"
              name="whoWorks"
              checked={whoValue === "THEY_WORK_FOR_ME"}
              onChange={() => safeChange({ worked_for_me: true })}
              className="mt-1"
            />
            <div className="text-sm font-semibold text-slate-900">{optTheyWork}</div>
          </label>
        </fieldset>
        </div>
      )}

      {/* 5) 3-way? */}
      {settleMode ? (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={!!f.settle_three_way}
              onChange={(e) => {
                const checked = e.target.checked;
                safeChange({ settle_three_way: checked });

                if (checked) safeChange({ person_name: "" });
                else if (settleSourceName) safeChange({ person_name: settleSourceName });
              }}
              className="mt-3"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-600">Is this a 3-way standby?</div>
              <div className="text-xs font-normal text-slate-600">
                Enter the name of the third person involved below. 
              </div>
            </div>
          </label>
        </div>
      ) : null}

      {/* 6) Name */}
      <div>
        <label className="text-sm font-semibold text-slate-700">Name</label>
        <input
          value={f.person_name || ""}
          readOnly={settleMode && !f.settle_three_way && !!settleSourceName}
          onChange={(e) => {
            const v = e.target.value;
            if (settleMode && !f.settle_three_way && settleSourceName) {
              safeChange({ person_name: settleSourceName });
              return;
            }
            safeChange({ person_name: v });
          }}
          className={`mt-1 w-full rounded-md border border-slate-200 px-3 py-2 ${
            settleMode && !f.settle_three_way ? "bg-slate-50 text-slate-700" : "bg-white text-slate-900"
          }`}
          placeholder="e.g. John Smith"
          list="nameSuggestions"
        />

        <datalist id="nameSuggestions">
          {nameSuggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      {/* 7) Person platoon */}
      <div>
        <label className="text-sm font-semibold text-slate-700">What platoon is this person on?</label>
        <select
          value={String(f.platoon || "").toUpperCase()}
          onChange={(e) => safeChange({ platoon: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
        >
          <option value="">Select…</option>
          <option value="A">A Platoon</option>
          <option value="B">B Platoon</option>
          <option value="C">C Platoon</option>
          <option value="D">D Platoon</option>
        </select>
      </div>

      {/* 9) Notes */}
      <div>
        <label className="text-sm font-semibold text-slate-700">Notes (optional)</label>
        <textarea
          value={f.notes || ""}
          onChange={(e) => safeChange({ notes: e.target.value })}
          className="mt-1 w-full min-h-[90px] rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
        />
      </div>

{/* 9 ) Group shifts (only when THEY worked for me / I owe) */}
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">  
        <div className="text-sm font-extrabold text-slate-900">Group shifts</div>
        <div className="mt-2 space-y-2"></div>
        <label className={`flex items-start gap-3 ${groupingAllowed ? "" : "opacity-60"}`}>
          <input
            type="checkbox"
            disabled={!groupingAllowed}
            checked={!!f.group_enabled && groupingAllowed}
            onChange={(e) => {
              const checked = e.target.checked;
              safeChange({
                group_enabled: checked,
                group_choice: checked ? (f.group_choice || "") : "",
                group_new_label: checked ? (f.group_new_label || "") : "",
                group_existing_id: checked ? (f.group_existing_id || "") : "",
              });
            }}
            className="mt-1"
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Group this shift with others</div>
            <div className="text-xs text-slate-600">
              Useful for consecutive shifts off
            </div>
            {!groupingAllowed ? (
              <div className="mt-1 text-xs font-semibold text-slate-700">
                Grouping is only available when <span className="text-slate-700">they worked for you</span>.
              </div>
            ) : null}
          </div>
        </label>

        {groupingAllowed && f.group_enabled ? (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  safeChange({
                    group_choice: "new",
                    group_existing_id: "",
                  })
                }
                className={
                  "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
                  (f.group_choice === "new"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
                }
              >
                New Group
              </button>

              <button
                type="button"
                onClick={() =>
                  safeChange({
                    group_choice: "existing",
                    group_new_label: "",
                  })
                }
                className={
                  "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
                  (f.group_choice === "existing"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
                }
              >
                Existing Group
              </button>
            </div>

            {f.group_choice === "new" ? (
              <div>
                <label className="text-sm font-semibold text-slate-700">Group label</label>
                <input
                  value={f.group_new_label || ""}
                  onChange={(e) => safeChange({ group_new_label: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
                  placeholder="e.g. Camping trip"
                />
              </div>
            ) : null}

            {f.group_choice === "existing" ? (
              <div>
                <div className="text-sm font-semibold text-slate-700">Choose a group</div>
                <select
                  value={String(f.group_existing_id || "")}
                  onChange={(e) => safeChange({ group_existing_id: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
                >
                  <option value="">Select…</option>
                  {safeBundleOptions.map((b) => {
                    const id = String(b?.bundle_id || b?.id || "");
                    const label = String(b?.bundle_label || b?.label || "Shift group");
                    return (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 10) Settlement */}
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">  
        <div className="text-sm font-extrabold text-slate-900">Settle shifts</div>

        {settleWithStandbyId ? (
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-4 text-sm font-normal text-slate-700">
              <input
                type="checkbox"
                checked={!!f.settle_confirmed}
                onChange={(e) => safeChange({ settle_confirmed: e.target.checked })}
              />
              {confirmSentence}
            </label>
          </div>
        ) : (
          <>
            <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={!!f.settle_existing}
                onChange={(e) => toggleSettleExisting(e.target.checked)}
              />
              Use this to settle an existing standby
            </label>

            {f.settle_existing ? (
              <div className="mt-2 space-y-2">
                <div className="text-xs font-semibold text-slate-500">
                  Select a person (auto-settles against the oldest outstanding shift)
                </div>

                <select
                  value={f.settle_target_oldest_id || ""}
                  onChange={(e) => handlePickSettleTarget(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                  disabled={loadingOpposite}
                >
                  <option value="">{loadingOpposite ? "Loading…" : "Select…"}</option>
                  {oppositeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {mismatchOpen && mismatchCandidate ? (
  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
    <div className="text-sm font-extrabold text-amber-900">
      These shifts have different names.
    </div>

    <div className="text-xs font-medium text-amber-800">
      This may be a typo, or a 3-way standby between{" "}
      <span className="font-bold">
        {toTitleCase(f.person_name || "—")}, {toTitleCase(mismatchCandidate.person_name || "—")} and you
      </span>
      .
    </div>

    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={chooseMismatchTypo}
        className={
          "rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
          (mismatchChoice === "typo"
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
        }
      >
        Same person (typo)
      </button>

      <button
        type="button"
        onClick={chooseMismatchThreeWay}
        className={
          "rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
          (mismatchChoice === "threeWay"
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
        }
      >
        3-way standby
      </button>

      <button
        type="button"
        onClick={chooseMismatchOther}
        className={
          "rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
          (mismatchChoice === "other"
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
        }
      >
        Other reason
      </button>
    </div>

    {mismatchChoice === "other" ? (
      <div className="space-y-2 pt-1">
        <textarea
          value={mismatchNote}
          onChange={(e) => setMismatchNote(e.target.value)}
          className="w-full min-h-[70px] rounded-md border border-amber-200 bg-white text-slate-900 px-3 py-2 text-sm"
          placeholder="Add a note to explain why the names are different."
        />
      </div>
    ) : null}
  </div>
) : null}

              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-md bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 active:scale-[0.99] transition"
        >
          Save
        </button>

        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
