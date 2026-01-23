import { supabase } from "../../../supabaseClient";

/**
 * Soft-delete a single standby row.
 * If it belongs to a settlement_group_id, it will also unlink the other row(s) still not deleted.
 */
export async function deleteStandby(id) {
  const rid = String(id || "");
  if (!rid) return { ok: false, error: "Missing id" };

  const ok = window.confirm(
    "Delete this standby? You can restore it later from History → Deleted."
  );
  if (!ok) return { ok: false, cancelled: true };

  const { data: row, error: rowErr } = await supabase
    .from("standby_events")
    .select("id, settlement_group_id, deleted_at")
    .eq("id", rid)
    .single();

  if (rowErr) {
    console.error("deleteStandby read error:", rowErr);
    return { ok: false, error: rowErr };
  }

  if (row?.deleted_at) return { ok: true }; // already deleted

  const nowIso = new Date().toISOString();

  const { error: delErr } = await supabase
    .from("standby_events")
    .update({ deleted_at: nowIso })
    .eq("id", rid);

  if (delErr) {
    console.error("deleteStandby update error:", delErr);
    return { ok: false, error: delErr };
  }

  // If it was part of a settlement group, unsettle remaining partner(s)
  if (row?.settlement_group_id) {
    const gid = row.settlement_group_id;

    const { data: others, error: otherErr } = await supabase
      .from("standby_events")
      .select("id")
      .eq("settlement_group_id", gid)
      .is("deleted_at", null);

    if (!otherErr) {
      const otherIds = (others || []).map((r) => r.id).filter((x) => x !== rid);

      if (otherIds.length > 0) {
        const { error: unlinkErr } = await supabase
          .from("standby_events")
          .update({
            settled: false,
            settled_at: null,
            settlement_group_id: null,
            settlement_status: null,
          })
          .in("id", otherIds);

        if (unlinkErr) console.error("deleteStandby unlink error:", unlinkErr);
      }
    }
  }

  return { ok: true };
}

export async function restoreStandby(id) {
  const rid = String(id || "");
  if (!rid) return { ok: false, error: "Missing id" };

  const { error } = await supabase
    .from("standby_events")
    .update({ deleted_at: null })
    .eq("id", rid);

  if (error) {
    console.error("restoreStandby error:", error);
    alert("Could not restore. Check console.");
    return { ok: false, error };
  }

  return { ok: true };
}

/**
 * Delete a settled pair (by settlement_group_id) => moves both to Deleted.
 */
export async function deleteSettlementGroup(groupId) {
  const gid = String(groupId || "");
  if (!gid) return { ok: false, error: "Missing groupId" };

  const ok = window.confirm(
    "Delete this settled pair? This will move both shifts to History → Deleted."
  );
  if (!ok) return { ok: false, cancelled: true };

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("standby_events")
    .update({ deleted_at: nowIso })
    .eq("settlement_group_id", gid)
    .is("deleted_at", null);

  if (error) {
    console.error("deleteSettlementGroup error:", error);
    alert("Could not delete the pair. Check console.");
    return { ok: false, error };
  }

  return { ok: true };
}

export async function restoreSettlementGroup(groupId) {
  const gid = String(groupId || "");
  if (!gid) return { ok: false, error: "Missing groupId" };

  const ok = window.confirm("Restore this deleted pair?");
  if (!ok) return { ok: false, cancelled: true };

  const { error } = await supabase
    .from("standby_events")
    .update({ deleted_at: null })
    .eq("settlement_group_id", gid)
    .not("deleted_at", "is", null);

  if (error) {
    console.error("restoreSettlementGroup error:", error);
    alert("Could not restore the pair. Check console.");
    return { ok: false, error };
  }

  return { ok: true };
}

/**
 * Rename a bundle (group of shifts).
 */
export async function renameBundle({ userId, bundleId, currentLabel }) {
  if (!userId || !bundleId) return { ok: false, error: "Missing userId/bundleId" };

  const next = window.prompt("Rename this group:", currentLabel || "Shift run");
  if (next == null) return { ok: false, cancelled: true };

  const trimmed = String(next).trim();
  if (!trimmed) {
    alert("Group name can’t be blank.");
    return { ok: false, error: "Blank label" };
  }

  const { error } = await supabase
    .from("standby_events")
    .update({ bundle_label: trimmed })
    .eq("user_id", userId)
    .eq("bundle_id", bundleId)
    .is("deleted_at", null);

  if (error) {
    console.error("renameBundle error:", error);
    alert("Could not rename group. Check console.");
    return { ok: false, error };
  }

  return { ok: true, label: trimmed };
}
