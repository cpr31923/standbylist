import { supabase } from "../../../supabaseClient";
import { makeUUID } from "../helpers";

/**
 * Settle two standbys together (ids can be in either order).
 * Returns { ok: true, settlementGroupId } or { ok: false, error }.
 */
export async function settleTwoStandbys(idA, idB, options = {}) {
  return linkSettlement(idA, idB, options);
}


/**
 * Append a marker note to the given standby IDs (used for three-way standby).
 */
export async function applyThreeWayNoteToIds(ids = []) {
  const clean = (ids || []).filter(Boolean);
  if (clean.length === 0) return { ok: true };

  const { data: rows, error } = await supabase
    .from("standby_events")
    .select("id, notes")
    .in("id", clean);

  if (error) {
    console.error("applyThreeWayNoteToIds read error:", error);
    return { ok: false, error };
  }

  const marker = "Three way standby";

  for (const r of rows || []) {
    const existing = (r.notes || "").trim();
    const next =
      existing.length === 0
        ? marker
        : existing.toLowerCase().includes(marker.toLowerCase())
        ? existing
        : `${existing}\n\n${marker}`;

    const { error: upErr } = await supabase
      .from("standby_events")
      .update({ notes: next })
      .eq("id", r.id);

    if (upErr) console.error("applyThreeWayNoteToIds update error:", upErr);
  }

  return { ok: true };
}

/**
 * Append a note to the given standby IDs.
 * - Adds as a new paragraph if notes already exist
 * - Skips if note is empty
 */
export async function appendNoteToIds(ids = [], noteText = "") {
  const clean = (ids || []).filter(Boolean);
  const note = String(noteText || "").trim();
  if (clean.length === 0) return { ok: true };
  if (!note) return { ok: true };

  const { data: rows, error } = await supabase
    .from("standby_events")
    .select("id, notes")
    .in("id", clean);

  if (error) {
    console.error("appendNoteToIds read error:", error);
    return { ok: false, error };
  }

  for (const r of rows || []) {
    const existing = (r.notes || "").trim();
    const next = existing ? `${existing}\n\n${note}` : note;

    const { error: upErr } = await supabase
      .from("standby_events")
      .update({ notes: next })
      .eq("id", r.id);

    if (upErr) console.error("appendNoteToIds update error:", upErr);
  }

  return { ok: true };
}

/**
 * Rename person_name for a standby (used for "Typo in the name" resolution).
 */
export async function renameStandbyPerson(id, newPersonName) {
  const sid = String(id || "");
  const name = String(newPersonName || "").trim();
  if (!sid) return { ok: false, error: "Missing id" };
  if (!name) return { ok: false, error: "Missing name" };

  const { error } = await supabase
    .from("standby_events")
    .update({ person_name: name })
    .eq("id", sid)
    .is("deleted_at", null);

  if (error) {
    console.error("renameStandbyPerson error:", error);
    return { ok: false, error };
  }

  return { ok: true };
}


/**
 * Link two shifts together as "settled" in a settlement group.
 * Returns { ok: true, settlementGroupId } or { ok: false, error }.
 */
export async function linkSettlement(idA, idB, options = {}) {
  const a = String(idA || "");
  const b = String(idB || "");
  if (!a || !b) return { ok: false, error: "Missing ids" };
  if (a === b) return { ok: false, error: "IDs cannot be identical" };

  const settlementGroupId = makeUUID();
  const nowIso = new Date().toISOString();

  // Safety: ensure neither is deleted
  const { data: pair, error: pairErr } = await supabase
    .from("standby_events")
    .select("id, deleted_at")
    .in("id", [a, b]);

  if (pairErr) {
    console.error("linkSettlement pair read error:", pairErr);
    return { ok: false, error: pairErr };
  }

  if ((pair || []).some((x) => x?.deleted_at)) {
    console.error("linkSettlement blocked: one row is deleted");
    return { ok: false, error: "Cannot settle deleted rows" };
  }

  const { error: updErr } = await supabase
    .from("standby_events")
    .update({
      settlement_group_id: settlementGroupId,
      settlement_status: "settled",
      settled: true,
      settled_at: nowIso,
    })
    .in("id", [a, b]);

  if (updErr) {
    console.error("linkSettlement update error:", updErr);
    return { ok: false, error: updErr };
  }

  if (options?.threeWay) {
    await applyThreeWayNoteToIds([a, b]);
  }

  return { ok: true, settlementGroupId };
}

/**
 * Unsettle a settlement group (returns both rows to owed/owing lists).
 */
export async function unsettleGroup(groupId) {
  const gid = String(groupId || "");
  if (!gid) return { ok: false, error: "Missing groupId" };

  const ok = window.confirm(
    "Unsettle this group? This will return both shifts to their owed/owing lists."
  );
  if (!ok) return { ok: false, cancelled: true };

  const { error } = await supabase
    .from("standby_events")
    .update({
      settled: false,
      settled_at: null,
      settlement_group_id: null,
      settlement_status: null,
    })
    .eq("settlement_group_id", gid)
    .is("deleted_at", null);

  if (error) {
    console.error("unsettleGroup error:", error);
    alert("Could not unsettle. Check console.");
    return { ok: false, error };
  }

  return { ok: true };
}

/**
 * Delete a shift.
 * - If shift is settled: delete THIS row, and return the partner row to active lists (unsettled).
 * - If shift is not settled: delete row only.
 *
 * Requires standby_events.deleted_at (timestamptz) column to exist (you already reference it elsewhere).
 */
export async function deleteStandbyCascade(id) {
  const sid = String(id || "");
  if (!sid) return { ok: false, error: "Missing id" };

  const nowIso = new Date().toISOString();

  // Read row to see if it's settled + group id
  const { data: row, error: readErr } = await supabase
    .from("standby_events")
    .select("id, settled, settlement_group_id, deleted_at")
    .eq("id", sid)
    .maybeSingle();

  if (readErr) {
    console.error("deleteStandbyCascade read error:", readErr);
    return { ok: false, error: readErr };
  }
  if (!row) return { ok: false, error: "Row not found" };
  if (row.deleted_at) return { ok: true }; // already deleted

  const gid = String(row.settlement_group_id || "").trim();
  const isSettled = !!row.settled && !!gid;

  // If settled: find partner and unsettle them
  if (isSettled) {
    const { data: pairRows, error: pairErr } = await supabase
      .from("standby_events")
      .select("id")
      .eq("settlement_group_id", gid)
      .is("deleted_at", null);

    if (pairErr) {
      console.error("deleteStandbyCascade pair read error:", pairErr);
      return { ok: false, error: pairErr };
    }

    const partner = (pairRows || []).find((r) => r.id !== sid) || null;

    // 1) Delete this row + clear settlement fields
    const { error: delErr } = await supabase
      .from("standby_events")
      .update({
        deleted_at: nowIso,
        settled: false,
        settled_at: null,
        settlement_group_id: null,
        settlement_status: null,
      })
      .eq("id", sid);

    if (delErr) {
      console.error("deleteStandbyCascade delete error:", delErr);
      return { ok: false, error: delErr };
    }

    // 2) Return partner to active (unsettle)
    if (partner?.id) {
      const { error: upErr } = await supabase
        .from("standby_events")
        .update({
          settled: false,
          settled_at: null,
          settlement_group_id: null,
          settlement_status: null,
        })
        .eq("id", partner.id)
        .is("deleted_at", null);

      if (upErr) {
        console.error("deleteStandbyCascade partner unsettle error:", upErr);
        // We still consider delete ok; partner can be manually fixed if needed
      }
    }

    return { ok: true, unsettledPartner: !!partner?.id };
  }

  // Not settled: just soft delete
  const { error: delErr } = await supabase
    .from("standby_events")
    .update({
      deleted_at: nowIso,
      settled: false,
      settled_at: null,
      settlement_group_id: null,
      settlement_status: null,
    })
    .eq("id", sid);

  if (delErr) {
    console.error("deleteStandbyCascade delete error:", delErr);
    return { ok: false, error: delErr };
  }

  return { ok: true };
}

export async function restoreStandby(id) {
  if (!id) return { ok: false, error: "Missing id" };

  try {
    const { data, error } = await supabase
      .from("standby_events")
      .update({
        deleted_at: null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return { ok: false, error };
    return { ok: true, row: data };
  } catch (e) {
    return { ok: false, error: e };
  }
}
