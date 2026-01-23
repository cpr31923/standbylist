import React, { useMemo, useState } from "react";
import {
  formatDisplayDate,
  formatPlatoonLabel,
  shiftTypeShort,
  toTitleCase,
  normalizeName,
} from "../helpers";

import {
  useOppositeCandidates,
  buildOppositePersonOptions,
} from "../hooks/useOppositeCandidates";

import {
  appendNoteToIds,
  renameStandbyPerson,
  deleteStandbyCascade,
} from "../services/settlements";

import { rowSentence } from "../services/sentences";

import ModalShell from "../ui/ModalShell";
import EditStandbyModal from "../modals/EditStandbyModal";
import StatusPill from "../ui/StatusPill";

export default function StandbyDetailModal({
  userId,
  standby,
  standbys = [],
  onClose,
  onDelete, // optional override (if parent wants to handle)
  onRestore,
  onUnsettleGroup,
  computeDutyPlatoon,
  onSettleExistingPair,
  onCreateNewToSettle,
  bundleOptions,
  onUpdated, // (updatedRow) => void
}) {
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleMode, setSettleMode] = useState(null); // "existing" | "new" | null
  const [selectedOldestId, setSelectedOldestId] = useState("");

  // Edit overlay modal
  const [editOpen, setEditOpen] = useState(false);

  const notes = String(standby?.notes ?? "").toLowerCase();
  const isThreeWay =
  Boolean(standby?.settlement_group_id) &&
  (notes.includes("3-way") ||
    notes.includes("3 way") ||
    notes.includes("3way") ||
    notes.includes("[3way]") ||
    notes.includes("three_way") ||
    notes.includes("three way"));


  // Barrier + resolution choice
  const [barrierOpen, setBarrierOpen] = useState(false);
  const [barrierChoice, setBarrierChoice] = useState(null); // "threeWay" | "typo" | "other" | null
  const [barrierNote, setBarrierNote] = useState("");
  const [barrierCandidate, setBarrierCandidate] = useState(null);

  // Pending settlement (only executed on Done)
  const [pending, setPending] = useState(null);
  // pending = { candidateId, choice, note, candidateName }

  // destructive actions
  const [deleting, setDeleting] = useState(false);
  
  const [restoring, setRestoring] = useState(false);

// When Settlement panel is expanded, prevent other destructive/edit actions.
// This reduces mis-clicks and keeps the user focused on settlement flow.
const lockActions = settleOpen;

  const { oppositeCandidates, loadingOpposite, fetchOppositeCandidates } =
    useOppositeCandidates({ userId });

  if (!standby) return null;

  const partner = useMemo(() => {
    const gid = standby?.settlement_group_id;
    if (!gid) return null;
    return (
      (standbys || []).find(
        (r) => r.settlement_group_id === gid && r.id !== standby.id
      ) || null
    );
  }, [standby?.settlement_group_id, standby?.id, standbys]);

  const date = formatDisplayDate(standby.shift_date);
  const platoon = formatPlatoonLabel(standby.duty_platoon || standby.platoon);
  const st = shiftTypeShort(standby);

  const isSettled = !!standby?.settled && !!standby?.settlement_group_id;
  const isDeleted = !!standby?.deleted_at;

  // Settlement actions only on active (non-deleted, non-settled) shifts
  const canSettle = !isDeleted && !standby.settled;

  // ✅ Allow edits for deleted and settled too (per acceptance criteria)
  const canEdit = true;

  const wantWorkedForMe = !standby.worked_for_me;
  const dropdownMode = standby.worked_for_me ? "owed" : "owe";

  const options = useMemo(() => {
    return buildOppositePersonOptions(oppositeCandidates, dropdownMode);
  }, [oppositeCandidates, dropdownMode]);

  function resetBarrier() {
    setBarrierOpen(false);
    setBarrierChoice(null);
    setBarrierNote("");
    setBarrierCandidate(null);
  }

  function resetPending() {
    setPending(null);
  }

  async function openExistingSettle() {
    setSettleOpen(true);
    setSettleMode("existing");
    setSelectedOldestId("");
    resetBarrier();
    resetPending();
    await fetchOppositeCandidates(wantWorkedForMe);
  }

  function openCreateNew() {
    setSettleOpen(false);
    setSettleMode(null);
    setSelectedOldestId("");
    resetBarrier();
    resetPending();
    onCreateNewToSettle?.(standby);
  }

  function armPending(candidateId, choice, note = "") {
    const candidate =
      (oppositeCandidates || []).find((c) => c.id === candidateId) || null;

    setPending({
      candidateId,
      choice, // "normal" | "threeWay" | "typo" | "other"
      note,
      candidateName: candidate?.person_name || "",
    });
  }

  function handlePickCandidate(candidateId) {
    setSelectedOldestId(candidateId);
    resetBarrier();
    resetPending();

    const candidate =
      (oppositeCandidates || []).find((c) => c.id === candidateId) || null;
    if (!candidate) return;

    const a = normalizeName(standby.person_name);
    const b = normalizeName(candidate.person_name);

    const mismatch = a && b && a !== b;

    if (mismatch) {
      setBarrierCandidate(candidate);
      setBarrierOpen(true);
      return;
    }

    armPending(candidate.id, "normal");
  }

  function chooseThreeWay() {
    if (!barrierCandidate?.id) return;
    setBarrierChoice("threeWay");
    armPending(barrierCandidate.id, "threeWay");
  }

  function chooseTypo() {
    if (!barrierCandidate?.id) return;
    setBarrierChoice("typo");
    armPending(barrierCandidate.id, "typo");
  }

  function chooseOther() {
    if (!barrierCandidate?.id) return;
    setBarrierChoice("other");
    armPending(barrierCandidate.id, "other", barrierNote);
  }

  function updateOtherNote(v) {
    setBarrierNote(v);
    if (pending?.choice === "other") {
      setPending((p) => (p ? { ...p, note: v } : p));
    }
  }

  async function applyPendingSettlementIfAny() {
    // If nothing armed, just close
    if (!pending?.candidateId) {
      onClose?.();
      return;
    }

    const candidateId = pending.candidateId;

    if (pending.choice === "other") {
      const note = String(pending.note || "").trim();
      if (!note) {
        alert("Please add a note for 'Other'.");
        return;
      }
      const res = await appendNoteToIds([standby.id, candidateId], note);
      if (!res?.ok) {
        alert("Could not add note. Check console.");
        return;
      }
    }

    if (pending.choice === "typo") {
      const before = toTitleCase(pending.candidateName || "—");
      const after = toTitleCase(standby.person_name || "—");

      const resRename = await renameStandbyPerson(
        candidateId,
        standby.person_name
      );
      if (!resRename?.ok) {
        alert("Could not rename. Check console.");
        return;
      }

      await appendNoteToIds(
        [standby.id, candidateId],
        `Name corrected during settlement: "${before}" → "${after}"`
      );
    }

    const settleOptions = pending.choice === "threeWay" ? { threeWay: true } : {};
    await onSettleExistingPair?.(standby.id, candidateId, settleOptions);

    setSettleOpen(false);
    setSettleMode(null);
    setSelectedOldestId("");
    resetBarrier();
    resetPending();
    onClose?.();
  }

  function closeSettlementPanel() {
    setSettleOpen(false);
    setSettleMode(null);
    setSelectedOldestId("");
    resetBarrier();
    resetPending();
  }

  // StandbyDetailModal.jsx
// REPLACE the entire existing handleDeleteClick() with this version.

async function handleDeleteClick() {
  if (deleting) return;

  const name = toTitleCase(standby?.person_name || "—");
  const when = standby?.shift_date ? formatDisplayDate(standby.shift_date) : "—";
  const type = standby?.shift_type || "";

  const msg = isSettled
    ? `Delete this settled standby?\n\nThis shift will move to Deleted, and the paired shift will return to your active list.\n\n${name} • ${when} • ${type}`
    : `Delete this standby?\n\nYou can restore it later from History → Deleted.\n\n${name} • ${when} • ${type}`;

  const ok = window.confirm(msg);
  if (!ok) return;

  try {
    setDeleting(true);

    // 1) Execute delete (parent handler if provided; otherwise service fallback)
    if (onDelete) {
      await onDelete(standby.id);
    } else {
      const res = await deleteStandbyCascade(standby.id);
      if (!res?.ok) {
        alert("Could not delete shift. Check console.");
        return;
      }
    }

    // 2) Optimistically update UI so the row disappears from active lists immediately
    //    (and shows in History → Deleted without needing a full refetch)
    const nowIso = new Date().toISOString();
    onUpdated?.({
      ...standby,
      deleted_at: nowIso,
      // defensive: if your UI treats deleted as non-settled in some paths
      // (DB truth will be reflected on next fetch anyway)
      settled: standby?.settled ?? false,
    });

    // 3) Close detail modal, stay on the same list view behind it
    onClose?.();
  } catch (e) {
    console.error("Delete failed:", e);
    alert("Delete failed. Check console.");
  } finally {
    setDeleting(false);
  }
}

  return (
    <>
      {/* Overlay Edit Modal (sits on top of Detail) */}
      {editOpen ? (
        <ModalShell title="Edit standby" onClose={() => setEditOpen(false)}>
          <EditStandbyModal
            standby={standby}
            bundleOptions={bundleOptions}
            computeDutyPlatoon={computeDutyPlatoon}
            onCancel={() => setEditOpen(false)}
            onSaved={(updatedRow) => {
              onUpdated?.(updatedRow);
              setEditOpen(false);
            }}
          />
        </ModalShell>
      ) : null}

      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-lg font-bold text-slate-900">Summary</div>

            <div className="shrink-0 flex items-center gap-2">
              {isDeleted ? (
                <StatusPill text="Deleted" />
              ) : isSettled ? (
                <>
                  <StatusPill text="Settled" />
                  {isThreeWay && <StatusPill threeWay />}
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-2 text-sm text-slate-700 space-y-2">
            <div className="text-sm font-semibold text-slate-900">
              {rowSentence(standby, standbys)}
            </div>

            <div className="text-xs text-slate-500 font-semibold">
              {date} · {platoon} · {st}
            </div>

            {standby?.bundle_label ? (
              <div className="text-xs text-slate-500 font-semibold">
                Shift forms part of{" "}
                <span className="text-slate-900 font-extrabold">
                  {standby.bundle_label}
                </span>
              </div>
            ) : null}

            {standby.notes ? (
              <div className="pt-2 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-500">Notes</div>
                <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                  {standby.notes}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Settle section */}
        {canSettle ? (
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-extrabold text-slate-900">
                Settlement
              </div>
              <button
                type="button"
                onClick={() => {
                  if (settleOpen) {
                    closeSettlementPanel();
                  } else {
                    setSettleOpen(true);
                    setSettleMode(null);
                    setSelectedOldestId("");
                    resetBarrier();
                    resetPending();
                  }
                }}
                className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
              >
                {settleOpen ? "Close" : "Settle shift"}
              </button>
            </div>

            {settleOpen ? (
              <div className="mt-3 space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={openExistingSettle}
                    className="flex-1 rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
                  >
                    Use existing shift
                  </button>
                  <button
                    type="button"
                    onClick={openCreateNew}
                    className="flex-1 rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
                  >
                    Create new shift
                  </button>
                </div>

                {settleMode === "existing" ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-500">
                      Choose who to settle against:
                    </div>

                    <select
                      value={selectedOldestId}
                      onChange={(e) => handlePickCandidate(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                      disabled={loadingOpposite}
                    >
                      <option value="">
                        {loadingOpposite ? "Loading…" : "Select a person…"}
                      </option>
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>

                    {barrierOpen && barrierCandidate ? (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                        <div className="text-sm font-extrabold text-amber-900">
                          These shifts have different names.
                          </div>
                        <div className="text-xs font-medium text-amber-800">
                          This may be a typo, or a 3-way standby between{" "}<br></br>
                          <span className="text-amber-800 font-bold">{toTitleCase(standby.person_name || "—")}, {" "}
                          {toTitleCase(barrierCandidate.person_name || "—")} and
                          you?</span>
                        </div>

                  <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={chooseTypo}
                            className={
                              "rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
                              (barrierChoice === "typo"
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
                            }
                          >
                            Same person (typo)
                          </button>

                        
                          <button
                            type="button"
                            onClick={chooseThreeWay}
                            className={
                              "rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
                              (barrierChoice === "threeWay"
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
                            }
                          >
                            3-way standby
                          </button>

                          <button
                            type="button"
                            onClick={chooseOther}
                            className={
                              "rounded-md px-3 py-2 text-sm font-semibold transition active:scale-[0.99] " +
                              (barrierChoice === "other"
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
                            }
                          >
                            Other reason
                          </button>
                        </div>

                        {barrierChoice === "other" ? (
                          <div className="space-y-2 pt-1">
                            <textarea
                              value={barrierNote}
                              onChange={(e) => updateOtherNote(e.target.value)}
                              className="w-full min-h-[70px] rounded-md border border-amber-200 bg-white text-slate-900 px-3 py-2 text-sm"
                              placeholder="(Optional) Add a note to explain why the names are different."
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {pending?.candidateId ? (
                      <div className="text-xs font-semibold text-slate-600 pt-1">
                        Ready to settle — press{" "}
                        <span className="text-slate-900">Done</span> to apply.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {/* Keep unsettle grouped down here (NOT top-right) */}

          {standby.deleted_at ? (
            <button
              type="button"
              onClick={async () => {
                if (restoring) return;
                try {
                  setRestoring(true);
                  await onRestore?.(standby.id);
                  onClose?.();
                } finally {
                  setRestoring(false);
                }
              }}
              disabled={restoring}
              className={
                "rounded-md border border-green-300 bg-green-100 text-green-900 px-3 py-2 text-sm font-semibold hover:bg-green-50 active:scale-[0.99] transition " +
                (restoring ? "opacity-60 cursor-not-allowed" : "")
              }
            >
              {restoring ? "Restoring…" : "Restore shift"}
            </button>

          ) : (
            <button
              type="button"
              onClick={() => {
                if (lockActions) return;
                handleDeleteClick();
              }}
              disabled={deleting || lockActions}
              className={
                "rounded-md my-3 border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2 text-sm font-semibold transition " +
                (deleting || lockActions ? "opacity-50 cursor-not-allowed" : "hover:bg-rose-100 active:scale-[0.99]")
              }
              title={lockActions ? "Close Settlement to delete or edit this shift." : undefined}
            >
              {deleting ? "Deleting…" : "Delete shift"}
            </button>
          )}

          {isSettled ? (
            <button
              type="button"
              onClick={() => onUnsettleGroup?.(standby.settlement_group_id)}
              className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            >
              Undo settlement
            </button>
          ) : null}

          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                if (lockActions) return;
                setEditOpen(true);
              }}
              disabled={lockActions}
              className={
                "rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold transition " +
                (lockActions ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 active:scale-[0.99]")
              }
              title={lockActions ? "Close Settlement to delete or edit this shift." : undefined}
            >
              Edit shift
            </button>
          ) : null}

          {/* Single “Done” — no extra Cancel */}
          <button
            type="button"
            onClick={applyPendingSettlementIfAny}
            className="rounded-md bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800 active:scale-[0.99] transition"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
