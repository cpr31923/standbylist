import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../supabaseClient"; // adjust path if needed

function shiftTypeLabel(type) {
  return type === "Night" ? "Night" : "Day";
}

// Compute helper that tolerates computeDutyPlatoon returning either:
// - "C"
// - { duty_platoon: "C" }
// - { platoon: "C" }
// - null/undefined
function extractDutyPlatoon(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    return result.duty_platoon || result.platoon || "";
  }
  return "";
}

function isPromiseLike(v) {
  return (
    !!v &&
    (typeof v === "object" || typeof v === "function") &&
    typeof v.then === "function"
  );
}

function makeBundleId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  return `b_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function EditStandbyModal({
  standby,
  onCancel,
  onSaved,
  bundleOptions = [],
  computeDutyPlatoon,
}) {
  const safeBundleOptions = Array.isArray(bundleOptions) ? bundleOptions : [];

const hasExistingGroup = useMemo(() => {
  return !!String(standby?.bundle_id || "").trim();
}, [standby?.bundle_id]);


    const ensuredBundleOptions = useMemo(() => {
    const opts = Array.isArray(safeBundleOptions) ? [...safeBundleOptions] : [];




    const curId = String(standby?.bundle_id || "").trim();
    if (!curId) return opts;

    const already = opts.some(
      (x) => String(x?.bundle_id || x?.id || "").trim() === curId
    );

    if (already) return opts;

    // Inject current shift’s bundle so the dropdown can display it.
    const curLabel = String(standby?.bundle_label || "").trim() || "Current group";

    opts.unshift({
      id: curId,
      label: curLabel,
      bundle_id: curId,
      bundle_label: curLabel,
    });

    return opts;
  }, [safeBundleOptions, standby?.bundle_id, standby?.bundle_label]);


  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState({
    person_name: "",
    platoon: "",
    shift_date: "",
    shift_type: "Day",
    worked_for_me: false,
    notes: "",

    // grouping
    group_enabled: false,
    group_choice: "", // "new" | "existing" | ""
    group_new_label: "",
    group_existing_id: "",
  });

  const [dutyLoading, setDutyLoading] = useState(false);
  const [dutyPlatoonAuto, setDutyPlatoonAuto] = useState("");

  // --- helpers ---
  function setField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function normalizeId(v) {
    return String(v || "").trim();
  }

    function findBundleLabelById(bundleId) {
    const id = String(bundleId || "").trim();
    if (!id) return "";
    const hit = (ensuredBundleOptions || []).find(
      (x) => String(x?.bundle_id || x?.id || "").trim() === id
    );
    return String(hit?.bundle_label || hit?.label || "").trim();
  }


  // Grouping only allowed when "They worked for me" (worked_for_me = true)
const groupingAllowed = draft.worked_for_me === true || hasExistingGroup;

  // --- prefill from standby (including group state) ---
  useEffect(() => {
    if (!standby) return;

    setError("");
    setSaving(false);

    const existingBundleId = normalizeId(standby.bundle_id);
    const hasGroup = !!existingBundleId;

    // Determine initial group choice:
    // - If already in a bundle => must be existing + preselect id
    // - Else blank until user enables grouping + chooses
    const initialGroupChoice = hasGroup ? "existing" : "";

    setDraft({
      person_name: standby.person_name || "",
      platoon: standby.platoon || "",
      shift_date: standby.shift_date || "",
      shift_type: standby.shift_type === "Night" ? "Night" : "Day",
      worked_for_me: !!standby.worked_for_me,
      notes: standby.notes || "",

      group_enabled: hasGroup,
      group_choice: initialGroupChoice,
      group_new_label: "",
      group_existing_id: hasGroup ? existingBundleId : "",
    });

    setDutyPlatoonAuto(standby.duty_platoon || "");
    setDutyLoading(false);
  }, [standby?.id]);

  // If direction flips away from groupingAllowed, clear grouping
  useEffect(() => {
  if (!groupingAllowed) {
    // Only clear grouping if the shift is NOT already in a group.
    // (Prevents the prefill from being wiped on open.)
    if (!hasExistingGroup) {
      setDraft((d) => ({
        ...d,
        group_enabled: false,
        group_choice: "",
        group_new_label: "",
        group_existing_id: "",
      }));
    }
    return;
  }

  // If grouping becomes allowed and group is enabled but no choice selected yet,
  // default to "existing" if there are existing options, else "new".
  setDraft((d) => {
    if (!d.group_enabled) return d;
    if (d.group_choice) return d;
    const hasExisting = (safeBundleOptions || []).length > 0;
    return {
      ...d,
      group_choice: hasExisting ? "existing" : "new",
    };
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [groupingAllowed, hasExistingGroup]);


  // Duty platoon auto recalc (async-safe)
  useEffect(() => {
    let alive = true;

    async function run() {
      if (!computeDutyPlatoon) {
        setDutyPlatoonAuto("");
        setDutyLoading(false);
        return;
      }
      if (!draft.shift_date) {
        setDutyPlatoonAuto("");
        setDutyLoading(false);
        return;
      }

      try {
        setDutyLoading(true);

        let res = computeDutyPlatoon(draft.shift_date, draft.shift_type);
        if (isPromiseLike(res)) res = await res;

        // Back-compat: some callers accept object arg
        if (!res) {
          let res2 = computeDutyPlatoon({
            shift_date: draft.shift_date,
            shift_type: draft.shift_type,
          });
          if (isPromiseLike(res2)) res2 = await res2;
          res = res2;
        }

        const platoon = extractDutyPlatoon(res);
        if (alive) setDutyPlatoonAuto(platoon || "");
      } catch (e) {
        console.error("Duty platoon calc failed:", e);
        if (alive) setDutyPlatoonAuto("");
      } finally {
        if (alive) setDutyLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [computeDutyPlatoon, draft.shift_date, draft.shift_type]);

  const computedDutyLabel = useMemo(() => {
    if (!computeDutyPlatoon) return "—";
    if (dutyLoading) return "Calculating…";
    if (!dutyPlatoonAuto) return "—";
    return `${dutyPlatoonAuto} Platoon ${shiftTypeLabel(draft.shift_type)}`;
  }, [computeDutyPlatoon, dutyLoading, dutyPlatoonAuto, draft.shift_type]);

  const currentGroupLabel = useMemo(() => {
    if (!draft.group_enabled) return "";
    if (draft.group_choice !== "existing") return "";
    return findBundleLabelById(draft.group_existing_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.group_enabled, draft.group_choice, draft.group_existing_id, ensuredBundleOptions]);

  async function save() {
    if (!standby?.id) return;

    setError("");

    const nextName = String(draft.person_name || "").trim();
    if (!nextName) return setError("Name is required.");

    const nextDate = String(draft.shift_date || "").trim();
    if (!nextDate) return setError("Shift date is required.");

    const nextType = draft.shift_type === "Night" ? "Night" : "Day";
    const nextWorkedForMe = !!draft.worked_for_me;
    const nextPlatoon = String(draft.platoon || "").trim();
    const nextNotes = String(draft.notes || "").trim();

    const shouldWriteDuty = !!computeDutyPlatoon && !!dutyPlatoonAuto && !!nextDate;

    // ----- grouping -> bundle_id/bundle_label -----
    let bundle_id = null;
    let bundle_label = null;

    if (nextWorkedForMe && draft.group_enabled) {
      const choice = String(draft.group_choice || "").trim();

      if (choice === "existing") {
        const existingId = normalizeId(draft.group_existing_id);
        if (!existingId) return setError("Choose an existing group.");
        bundle_id = existingId;
        bundle_label = findBundleLabelById(existingId) || null;
      } else if (choice === "new") {
        const label = String(draft.group_new_label || "").trim();
        if (!label) return setError("Enter a group label (e.g. Camping trip).");
        bundle_id = makeBundleId();
        bundle_label = label;
      } else {
        return setError("Choose New Group or Existing Group.");
      }
    }

    const payload = {
      person_name: nextName,
      platoon: nextPlatoon ? nextPlatoon : null,
      shift_date: nextDate,
      shift_type: nextType,
      worked_for_me: nextWorkedForMe,
      notes: nextNotes ? nextNotes : null,
      ...(shouldWriteDuty ? { duty_platoon: dutyPlatoonAuto } : {}),

      // grouping fields
      bundle_id,
      bundle_label,
    };

    try {
      setSaving(true);

      const { data, error: err } = await supabase
        .from("standby_events")
        .update(payload)
        .eq("id", standby.id)
        .select("*")
        .single();

      if (err) throw err;

      onSaved?.(data);
    } catch (e) {
      console.error("Edit save failed:", e);
      setError("Could not save changes. Check console.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <label className="space-y-1">
          <div className="text-xs font-semibold text-slate-500">Name</div>
          <input
            value={draft.person_name}
            onChange={(e) => setField("person_name", e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            disabled={saving}
          />
        </label>

        <label className="space-y-1">
          <div className="text-xs font-semibold text-slate-500">Platoon</div>
          <select
            value={draft.platoon || ""}
            onChange={(e) => setField("platoon", e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            disabled={saving}
          >
            <option value="">—</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs font-semibold text-slate-500">Shift date</div>
            <input
              type="date"
              value={draft.shift_date}
              onChange={(e) => setField("shift_date", e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              disabled={saving}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-semibold text-slate-500">Shift type</div>
            <select
              value={draft.shift_type}
              onChange={(e) => setField("shift_type", e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              disabled={saving}
            >
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </label>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">Platoon on shift:</div>
          <div className="mt-1 text-sm font-extrabold text-slate-900">
            {computedDutyLabel}
          </div>
          {!computeDutyPlatoon ? (
            <div className="mt-1 text-xs font-semibold text-slate-500">
              (No roster calculator wired)
            </div>
          ) : null} 
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-3">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-500">
            Who will work this shift?
          </legend>

          <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
            <input
              type="radio"
              name={`whoWorked-${standby?.id || "x"}`}
              checked={draft.worked_for_me === false}
              onChange={() => setField("worked_for_me", false)}
              disabled={saving}
            />
            <div className="text-sm font-semibold text-slate-900">I worked for them</div>
          </label>

          <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
            <input
              type="radio"
              name={`whoWorked-${standby?.id || "x"}`}
              checked={draft.worked_for_me === true}
              onChange={() => setField("worked_for_me", true)}
              disabled={saving}
            />
            <div className="text-sm font-semibold text-slate-900">They worked for me</div>
          </label>
        </fieldset>
        </div>

        {/* ✅ Group shifts */}
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <label className={`flex items-start gap-3 ${groupingAllowed ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              disabled={!groupingAllowed || saving}
              checked={!!draft.group_enabled && groupingAllowed}
              onChange={(e) => {
                const checked = e.target.checked;

                setDraft((d) => {
                  if (!checked) {
                    return {
                      ...d,
                      group_enabled: false,
                      group_choice: "",
                      group_new_label: "",
                      group_existing_id: "",
                    };
                  }

                  const curId = String(standby?.bundle_id || "").trim();
                  const hasExistingOptions = (ensuredBundleOptions || []).length > 0;

                  return {
                    ...d,
                    group_enabled: true,

                    // If this row already has a group, force "existing"
                    group_choice: curId ? "existing" : (d.group_choice || (hasExistingOptions ? "existing" : "new")),

                    // Keep / prefill existing id if present
                    group_existing_id: curId ? curId : (d.group_existing_id || ""),

                    // only relevant if not forced existing
                    group_new_label: d.group_new_label || "",
                  };
                });
              }}
              className="mt-1"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                Group this shift with others
              </div>
              <div className="text-xs font-semibold text-slate-600">
                Useful for consecutive shifts off
              </div>
              {!groupingAllowed ? (
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  Grouping is only available when{" "}
                  <span className="text-slate-700">they worked for you</span>.
                </div>
              ) : null}
            </div>
          </label>

          {groupingAllowed && draft.group_enabled ? (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <button
                type="button"
                disabled={saving || hasExistingGroup}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    group_choice: "new",
                    group_existing_id: "",
                  }))
                }
                className={
                  "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
                  (hasExistingGroup
                    ? "border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                    : draft.group_choice === "new"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
                }
                title={hasExistingGroup ? "This shift is already in a group. Untick grouping to create a new one." : ""}
              >
                New Group
              </button>

                <button
                type="button"
                disabled={saving}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    group_choice: "existing",
                    group_new_label: "",
                    group_existing_id:
                      String(d.group_existing_id || "").trim() ||
                      String(standby?.bundle_id || "").trim() ||
                      "",
                  }))
                }
                className={
                  "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
                  ((draft.group_choice === "existing" || hasExistingGroup)
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
                }
              >
                Existing Group
              </button>
              </div>

              {hasExistingGroup ? (
  <div className="text-xs font-normalx text-slate-500">
    This shift is already in a group. Untick “Group this shift…” to remove it, then you can create a new group.
  </div>
) : null}

              {draft.group_choice === "existing" ? (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-700">Choose a group</div>
                    {currentGroupLabel ? (
                      <div className="text-xs font-semibold text-slate-500 truncate">
                        Currently in: <span className="text-slate-700">{currentGroupLabel}</span>
                      </div>
                    ) : null}
                  </div>

                  <select
                    value={normalizeId(draft.group_existing_id)}
                    onChange={(e) => setField("group_existing_id", e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
                    disabled={saving}
                  >
                    <option value="">Select…</option>
                    {ensuredBundleOptions.map((b) => {
                      const id = String(b?.bundle_id || b?.id || "").trim();
                      const label = String(b?.bundle_label || b?.label || "Shift group");
                      if (!id) return null;
                      return (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : null}

              {draft.group_choice === "new" ? (
                <div>
                  <div className="text-sm font-semibold text-slate-700">Group label</div>
                  <input
                    value={draft.group_new_label || ""}
                    onChange={(e) => setField("group_new_label", e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
                    placeholder="e.g. Camping trip"
                    disabled={saving}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <label className="space-y-1">
          <div className="text-xs font-semibold text-slate-500">Notes</div>
          <textarea
            value={draft.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className="w-full min-h-[90px] rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm"
            disabled={saving}
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800 active:scale-[0.99] transition"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
