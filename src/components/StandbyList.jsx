// StandbyList.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * standby_events columns assumed:
 * - id (uuid)
 * - user_id (uuid)
 * - person_name (text)
 * - platoon (text, nullable)
 * - shift_date (date)  // YYYY-MM-DD
 * - shift_type (text)  // "Day" | "Night"
 * - worked_for_me (bool)   TRUE: I owe them. FALSE: they owe me.
 * - settled (bool)
 * - settled_at (timestamptz, nullable)
 * - settlement_group_id (uuid, nullable)
 * - settlement_status (text, nullable)
 * - notes (text, nullable)
 * - deleted_at (timestamptz, nullable)
 */

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isFuture(ymd) {
  if (!ymd) return false;
  return String(ymd) > todayYMD();
}

function formatPlatoonLabel(platoon) {
  if (!platoon) return "-";
  const p = String(platoon).trim();
  return /platoon/i.test(p) ? p : `${p} Platoon`;
}

function formatDisplayDate(ymd) {
  if (!ymd) return "-";
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function makeUUID() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function shiftTypeShort(row) {
  const t = (row?.shift_type || "").trim();
  return t ? t : "";
}

function StatusPill({ text }) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";
  const t = (text || "").toLowerCase();
  const cls =
    t.includes("deleted")
      ? "bg-rose-100 text-rose-800"
      : t.includes("settled")
      ? "bg-emerald-100 text-emerald-800"
      : "bg-slate-100 text-slate-700";
  return <span className={`${base} ${cls}`}>{text}</span>;
}

export default function StandbyList() {
  const [user, setUser] = useState(null);

  // Primary nav tabs
  const [tab, setTab] = useState("owed"); // owed | owe | upcoming | history
  const [historySubtab, setHistorySubtab] = useState("settled"); // settled | deleted

  const [standbys, setStandbys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [selectedStandby, setSelectedStandby] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Settle flow in detail modal
  const [settleFlowOpen, setSettleFlowOpen] = useState(false);
  const [settleChoice, setSettleChoice] = useState(null); // null | "new" | "existing"
  const [settleWithExistingId, setSettleWithExistingId] = useState(null);
  const [oppositeCandidates, setOppositeCandidates] = useState([]);
  const [loadingOpposite, setLoadingOpposite] = useState(false);

  // Search/filter/sort
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState("date_desc"); // date_desc | date_asc | name_az | name_za | platoon_az | platoon_za
  const [platoonFilter, setPlatoonFilter] = useState(""); // "" = all

  // Name mismatch resolution
  const [mismatchResolution, setMismatchResolution] = useState(""); // "" | "threeway" | "same"

  // Add form
  const [form, setForm] = useState({
    worked_for_me: false,
    person_name: "",
    platoon: "",       // their home platoon (manual)
    duty_platoon: "",  // the platoon you’re working on (auto)
    shift_date: "",
    shift_type: "Day",
    notes: "",
    settle_existing: false,
    settle_with_existing_id: null,
  });

  // Track whether platoon was manually overridden (so auto-fill doesn’t fight user)
  const platoonManualRef = useRef(false);

  // Edit form
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    person_name: "",
    platoon: "",
    duty_platoon: "",
    shift_date: "",
    shift_type: "Day",
    notes: "",
    worked_for_me: false,
  });

  const [refreshTick, setRefreshTick] = useState(0);

  // -----------------------------
  // Scroll lock when modal open
  // -----------------------------
  useEffect(() => {
    const anyModalOpen = showAddModal || Boolean(selectedStandby);
    if (!anyModalOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showAddModal, selectedStandby]);

  function resetOverlays() {
    setSelectedStandby(null);
    setShowAddModal(false);
    setIsEditing(false);

    setSettleFlowOpen(false);
    setSettleChoice(null);
    setSettleWithExistingId(null);
    setOppositeCandidates([]);
    setMismatchResolution("");
  }

  function goTab(nextTab) {
    resetOverlays();
    setTab(nextTab);
    setSearchText("");
    setSortMode("date_desc");
    setPlatoonFilter("");
  }

  function statusText(s) {
    if (s.deleted_at) return "Deleted";
    if (s.settled) return "Settled";
    return "Active";
  }

  function detailNarrative(s) {
    const name = s?.person_name || "—";
    const platoon = formatPlatoonLabel(s?.platoon);
    const date = formatDisplayDate(s?.shift_date);
    const st = shiftTypeShort(s);
    const stPart = st ? ` ${st}` : "";
    const future = isFuture(s?.shift_date);

    if (s?.worked_for_me) {
      if (future)
        return `${name} (${platoon}) will work for you on ${date}${stPart}. You will owe them a shift.`;
      return `${name} (${platoon}) worked for you on ${date}${stPart}. You owe them a shift.`;
    }
    if (future)
      return `You will work for ${name} (${platoon}) on ${date}${stPart}. They will owe you a shift.`;
    return `You worked for ${name} (${platoon}) on ${date}${stPart}. They owe you a shift.`;
  }

  // -----------------------------
  // AUTH
  // -----------------------------
  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        console.error("Session error:", error);
        setUser(null);
        return;
      }

      setUser(data.session?.user ?? null);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // -----------------------------
  // Keep edit form in sync
  // -----------------------------
  useEffect(() => {
    if (!selectedStandby) {
      setIsEditing(false);
      return;
    }

    setIsEditing(false);
    setEditForm({
      person_name: selectedStandby.person_name || "",
      platoon: selectedStandby.platoon || "",
      duty_platoon: selectedStandby.duty_platoon || "",
      shift_date: selectedStandby.shift_date || "",
      shift_type: selectedStandby.shift_type || "Day",
      notes: selectedStandby.notes || "",
      worked_for_me: Boolean(selectedStandby.worked_for_me),
    });
  }, [selectedStandby]);

  // -----------------------------
  // ✅ FIX: Keep this hook BEFORE any early returns
  // Upcoming default sort: oldest first
  // -----------------------------
  useEffect(() => {
    if (tab === "upcoming") setSortMode("date_asc");
    if (tab !== "upcoming" && sortMode === "date_asc") setSortMode("date_desc");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // -----------------------------
  // Fetch standbys
  // -----------------------------
  useEffect(() => {
    if (!user?.id) {
      setStandbys([]);
      setLoading(false);
      setFetchError(null);
      return;
    }

    async function fetchStandbys() {
      setLoading(true);
      setFetchError(null);

      let query = supabase.from("standby_events").select("*").eq("user_id", user.id);

      // common: exclude deleted unless historySubtab=deleted
      if (tab === "history" && historySubtab === "deleted") {
        query = query.not("deleted_at", "is", null);
      } else {
        query = query.is("deleted_at", null);
      }

      if (tab === "owed") {
        query = query.eq("settled", false).eq("worked_for_me", false);
      } else if (tab === "owe") {
        query = query.eq("settled", false).eq("worked_for_me", true);
      } else if (tab === "upcoming") {
        // future shifts you are working for someone
        query = query.eq("worked_for_me", false).gt("shift_date", todayYMD());
        // include settled and unsettled
      } else if (tab === "history" && historySubtab === "settled") {
        query = query.eq("settled", true);
      }

      const orderCol =
        tab === "history" && historySubtab === "deleted"
          ? "deleted_at"
          : tab === "history" && historySubtab === "settled"
          ? "settled_at"
          : "shift_date";

      const ascending = tab === "upcoming"; // upcoming should read in chronological order
      const { data, error } = await query.order(orderCol, { ascending });

      if (error) {
        console.error("Error fetching standbys:", error);
        setFetchError(error.message);
        setStandbys([]);
        setSelectedStandby(null);
        setLoading(false);
        return;
      }

      setStandbys(data || []);
      setSelectedStandby(null);
      setLoading(false);
    }

    fetchStandbys();
  }, [tab, historySubtab, user?.id, refreshTick]);

  // -----------------------------
  // Platoon auto-fill from roster function
  // -----------------------------
  async function maybeAutofillPlatoon(dateYMD, shiftType) {
    if (!dateYMD || !shiftType) return;
    if (platoonManualRef.current) return;

    const { data, error } = await supabase.rpc("get_platoon_on_duty", {
      p_date: dateYMD,
      p_shift_type: shiftType,
    });

    if (error) {
      // silent fail; roster may not be configured yet
      return;
    }

    if (data) {
      setForm((f) => ({ ...f, duty_platoon: String(data) }));
    }
  }

  // when add form date/type changes, auto populate platoon (unless user typed it)
  useEffect(() => {
    if (!showAddModal) return;
    maybeAutofillPlatoon(form.shift_date, form.shift_type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal, form.shift_date, form.shift_type]);

  // -----------------------------
  // Opposite candidates for settlement
  // -----------------------------
  async function fetchOppositeCandidates(wantWorkedForMe) {
    if (!user?.id) return;

    setLoadingOpposite(true);

    const { data, error } = await supabase
      .from("standby_events")
      .select("id, person_name, platoon, shift_date, worked_for_me, settled, deleted_at, shift_type")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .eq("settled", false)
      .eq("worked_for_me", wantWorkedForMe)
      .order("shift_date", { ascending: false });

    if (error) {
      console.error("Error fetching opposite candidates:", error);
      setOppositeCandidates([]);
    } else {
      setOppositeCandidates(data || []);
    }

    setLoadingOpposite(false);
  }

  useEffect(() => {
    if (!user?.id) return;
    if (!selectedStandby) return;
    if (!settleFlowOpen) return;
    if (settleChoice !== "existing") return;

    const wantWorkedForMe = !selectedStandby.worked_for_me;
    fetchOppositeCandidates(wantWorkedForMe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedStandby, settleFlowOpen, settleChoice]);

  useEffect(() => {
    if (!user?.id) return;
    if (!showAddModal) return;
    if (!form.settle_existing) return;

    const wantWorkedForMe = !form.worked_for_me;
    fetchOppositeCandidates(wantWorkedForMe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, showAddModal, form.settle_existing, form.worked_for_me]);

  function getNameMismatchInfo(aName, bName) {
    const a = normalizeName(aName);
    const b = normalizeName(bName);
    const mismatch = a && b && a !== b;
    return { mismatch, a, b };
  }

  // -----------------------------
  // Settlement actions
  // -----------------------------
  async function applyThreeWayNoteToIds(ids) {
    const { data: rows, error } = await supabase.from("standby_events").select("id, notes").in("id", ids);

    if (error) {
      console.error("Fetch notes for three-way error:", error);
      return;
    }

    const updates = (rows || []).map((r) => {
      const existing = (r.notes || "").trim();
      const marker = "Three way standby";
      const next =
        existing.length === 0
          ? marker
          : existing.toLowerCase().includes(marker.toLowerCase())
          ? existing
          : `${existing}\n\n${marker}`;
      return { id: r.id, notes: next };
    });

    for (const u of updates) {
      const { error: upErr } = await supabase.from("standby_events").update({ notes: u.notes }).eq("id", u.id);
      if (upErr) console.error("Three-way note update error:", upErr);
    }
  }

  async function linkSettlement(idA, idB, options = {}) {
    const settlementGroupId = makeUUID();
    const nowIso = new Date().toISOString();

    const { data: pair, error: pairErr } = await supabase
      .from("standby_events")
      .select("id, deleted_at")
      .in("id", [idA, idB]);

    if (pairErr) {
      console.error("Link settlement fetch error:", pairErr);
      return { ok: false };
    }

    if (pair.some((x) => x.deleted_at)) {
      console.error("Cannot settle: one row is deleted");
      return { ok: false };
    }

    const { error: updErr } = await supabase
      .from("standby_events")
      .update({
        settlement_group_id: settlementGroupId,
        settlement_status: "settled",
        settled: true,
        settled_at: nowIso,
      })
      .in("id", [idA, idB]);

    if (updErr) {
      console.error("Link settlement update error:", updErr);
      return { ok: false };
    }

    if (options.threeWay) {
      await applyThreeWayNoteToIds([idA, idB]);
    }

    setRefreshTick((t) => t + 1);
    return { ok: true };
  }

  async function unsettleGroup(groupId) {
    if (!groupId) return;

    const ok = window.confirm("Unsettle this group? The shifts will return to their lists.");
    if (!ok) return;

    const { error } = await supabase
      .from("standby_events")
      .update({
        settled: false,
        settled_at: null,
        settlement_group_id: null,
        settlement_status: null,
      })
      .eq("settlement_group_id", groupId)
      .is("deleted_at", null);

    if (error) {
      console.error("Unsettle error:", error);
      alert("Could not unsettle. Check console.");
      return;
    }

    setSelectedStandby(null);
    setRefreshTick((t) => t + 1);
  }

  // -----------------------------
  // Delete / restore
  // -----------------------------
  async function deleteStandby(id) {
    if (!id) return;

    const ok = window.confirm("Delete this standby? You can restore it later from History → Deleted.");
    if (!ok) return;

    const { data: row, error: rowErr } = await supabase
      .from("standby_events")
      .select("id, settlement_group_id, deleted_at")
      .eq("id", id)
      .single();

    if (rowErr) {
      console.error("Delete fetch error:", rowErr);
      return;
    }
    if (row?.deleted_at) return;

    const nowIso = new Date().toISOString();

    const { error: delErr } = await supabase.from("standby_events").update({ deleted_at: nowIso }).eq("id", id);
    if (delErr) {
      console.error("Soft delete error:", delErr);
      return;
    }

    // If it was settled with another, "unsettle" the partner by clearing settlement fields
    if (row?.settlement_group_id) {
      const { data: others, error: otherErr } = await supabase
        .from("standby_events")
        .select("id")
        .eq("settlement_group_id", row.settlement_group_id)
        .is("deleted_at", null);

      if (!otherErr) {
        const otherIds = (others || []).map((r) => r.id).filter((rid) => rid !== id);
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

          if (unlinkErr) console.error("Unsettle remaining after delete error:", unlinkErr);
        }
      }
    }

    setSelectedStandby(null);
    setRefreshTick((t) => t + 1);
  }

  async function restoreStandby(id) {
    if (!id) return;

    const { error } = await supabase.from("standby_events").update({ deleted_at: null }).eq("id", id);

    if (error) {
      console.error("Restore error:", error);
      alert("Could not restore. Check console.");
      return;
    }

    setSelectedStandby(null);
    setRefreshTick((t) => t + 1);
  }

  // -----------------------------
  // Add / edit
  // -----------------------------
  function openAddShiftModal() {
    resetOverlays();

    const defaultWorkedForMe = tab === "owe" ? true : false;

    platoonManualRef.current = false;

    setForm({
      worked_for_me: defaultWorkedForMe,
      person_name: "",
      platoon: "",
      shift_date: "",
      shift_type: "Day",
      duty_platoon: "",
      notes: "",
      settle_existing: false,
      settle_with_existing_id: null,
    });

    setMismatchResolution("");
    setShowAddModal(true);
  }

  async function submitAddShift(e) {
    e.preventDefault();
    if (!user?.id) return;

    const payload = {
      user_id: user.id,
      person_name: form.person_name.trim(),
      platoon: form.platoon.trim() || null,
      duty_platoon: form.duty_platoon.trim() || null,
      shift_date: form.shift_date || null,
      shift_type: (form.shift_type || "").trim() || null,
      notes: form.notes.trim() || null,
      worked_for_me: Boolean(form.worked_for_me),
      settled: false,
      settled_at: null,
      settlement_group_id: null,
      settlement_status: null,
      deleted_at: null,
    };

    if (!payload.person_name) return alert("Please enter a name.");
    if (!payload.shift_date) return alert("Please select a date.");
    if (!payload.shift_type) return alert("Please select Day or Night.");

    const { data: inserted, error } = await supabase
      .from("standby_events")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      console.error("Insert error:", error);
      alert("Could not add shift. Check console.");
      return;
    }

    if (form.settle_existing && form.settle_with_existing_id) {
      const res = await linkSettlement(inserted.id, form.settle_with_existing_id, {
        threeWay: mismatchResolution === "threeway",
      });
      if (!res.ok) alert("Added shift, but could not settle. Check console.");
    }

    setShowAddModal(false);
    setOppositeCandidates([]);
    setSelectedStandby(null);
    setMismatchResolution("");
    setRefreshTick((t) => t + 1);
  }

async function saveEdits() {
  if (!selectedStandby) return;

  const updates = {
    person_name: editForm.person_name.trim(),
    platoon: editForm.platoon.trim() || null,   // their normal platoon
    shift_date: editForm.shift_date || null,
    shift_type: (editForm.shift_type || "").trim() || null,
    notes: editForm.notes.trim() || null,
    worked_for_me: Boolean(editForm.worked_for_me),
    duty_platoon: null,                         // will be recomputed below
  };

  if (!updates.person_name) return alert("Please enter a name.");
  if (!updates.shift_date) return alert("Please select a date.");
  if (!updates.shift_type) return alert("Please select Day or Night.");

  // 👇 THIS is the new part
  try {
    const { data: dutyData, error: dutyErr } = await supabase.rpc("get_platoon_on_duty", {
      p_date: updates.shift_date,
      p_shift_type: updates.shift_type,
    });

    if (!dutyErr && dutyData) {
      updates.duty_platoon = String(dutyData);
    }
  } catch (err) {
    // silent fail — roster might not exist yet
  }

  const { data, error } = await supabase
    .from("standby_events")
    .update(updates)
    .eq("id", selectedStandby.id)
    .select("*")
    .single();

  if (error) {
    console.error("Edit update error:", error);
    alert("Could not save changes. Check console.");
    return;
  }

  setSelectedStandby(data);
  setIsEditing(false);
  setRefreshTick((t) => t + 1);
}


  async function settleSelectedWithExisting(otherId) {
    if (!selectedStandby) return;

    const res = await linkSettlement(selectedStandby.id, otherId, {
      threeWay: mismatchResolution === "threeway",
    });

    if (res.ok) {
      setSettleFlowOpen(false);
      setSettleChoice(null);
      setSettleWithExistingId(null);
      setOppositeCandidates([]);
      setMismatchResolution("");
      setSelectedStandby(null);
      setRefreshTick((t) => t + 1);
    }
  }

  async function createShiftAndSettleWithSelected(newShiftPayload, threeWay) {
    if (!selectedStandby) return;

    const { data: inserted, error } = await supabase
      .from("standby_events")
      .insert([newShiftPayload])
      .select("*")
      .single();

    if (error) {
      console.error("Insert (settle new shift) error:", error);
      alert("Could not create shift. Check console.");
      return;
    }

    const res = await linkSettlement(selectedStandby.id, inserted.id, { threeWay });
    if (res.ok) {
      setSettleFlowOpen(false);
      setSettleChoice(null);
      setOppositeCandidates([]);
      setMismatchResolution("");
      setSelectedStandby(null);
      setRefreshTick((t) => t + 1);
    }
  }

  // -----------------------------
  // Options for platoon filter
  // -----------------------------
  const platoonOptions = useMemo(() => {
    const set = new Set();
    for (const r of standbys) {
      const p = String(r?.platoon || "").trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [standbys]);

  // -----------------------------
  // Filter/sort view rows
  // -----------------------------
  const viewRows = useMemo(() => {
    const q = normalizeName(searchText);
    const pf = String(platoonFilter || "").trim();

    let rows = [...standbys];

    if (q) {
      rows = rows.filter((r) => {
        const a = normalizeName(r.person_name);
        const b = normalizeName(r.platoon);
        const c = normalizeName(r.shift_type);
        return a.includes(q) || b.includes(q) || c.includes(q);
      });
    }

    if (pf) {
      rows = rows.filter((r) => String(r.platoon || "").trim() === pf);
    }

    const cmpDate = (a, b) => String(a.shift_date || "").localeCompare(String(b.shift_date || ""));
    const cmpName = (a, b) => normalizeName(a.person_name).localeCompare(normalizeName(b.person_name));
    const cmpPlatoon = (a, b) => String(a.platoon || "").trim().localeCompare(String(b.platoon || "").trim());

    if (sortMode === "date_desc") rows.sort((a, b) => cmpDate(b, a));
    if (sortMode === "date_asc") rows.sort((a, b) => cmpDate(a, b));
    if (sortMode === "name_az") rows.sort((a, b) => cmpName(a, b));
    if (sortMode === "name_za") rows.sort((a, b) => cmpName(b, a));
    if (sortMode === "platoon_az") rows.sort((a, b) => cmpPlatoon(a, b));
    if (sortMode === "platoon_za") rows.sort((a, b) => cmpPlatoon(b, a));

    return rows;
  }, [standbys, searchText, platoonFilter, sortMode]);

  // -----------------------------
  // History grouping (settled groups only)
  // -----------------------------
  const historyGroups = useMemo(() => {
    if (!(tab === "history" && historySubtab === "settled")) return [];

    const rows = [...standbys];

    const groupsMap = new Map();
    const singles = [];

    for (const r of rows) {
      if (r.settlement_group_id) {
        if (!groupsMap.has(r.settlement_group_id)) groupsMap.set(r.settlement_group_id, []);
        groupsMap.get(r.settlement_group_id).push(r);
      } else {
        singles.push(r);
      }
    }

    const grouped = Array.from(groupsMap.entries()).map(([gid, arr]) => {
      const settledAt = arr.reduce((m, x) => {
        const v = x.settled_at ? String(x.settled_at) : "";
        return v > m ? v : m;
      }, "");

      const sortKey = settledAt || gid;

      const sortedArr = [...arr].sort((a, b) => String(b.shift_date || "").localeCompare(String(a.shift_date || "")));

      return { gid, sortKey, rows: sortedArr, isSingle: false };
    });

    grouped.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));

    const singleGroups = singles.map((r) => ({
      gid: `single-${r.id}`,
      sortKey: r.settled_at || r.shift_date || r.id,
      rows: [r],
      isSingle: true,
    }));

    singleGroups.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));

    return [...grouped, ...singleGroups];
  }, [standbys, tab, historySubtab]);

  // -----------------------------
  // UI components
  // -----------------------------
  function BottomTab({ label, active, onClick }) {
    return (
      <button
        onClick={onClick}
        className={[
          "flex-1 py-2 rounded-2xl transition active:scale-[0.99]",
          active ? "bg-slate-200 text-slate-900" : "text-slate-700 hover:bg-slate-100",
        ].join(" ")}
        type="button"
      >
        <div className="text-[12px] font-semibold leading-tight">{label}</div>
      </button>
    );
  }

  function SegTab({ label, active, onClick }) {
    return (
      <button
        onClick={onClick}
        className={[
          "px-3 py-2 rounded-2xl text-sm font-semibold transition",
            active
            ? "bg-slate-900 text-white"
            : "bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 hover:text-slate-900",
        ].join(" ")}
        type="button"
      >
        {label}
      </button>
    );
  }

  function ListRow({ s }) {
    return (
      <button
        onClick={() => setSelectedStandby((prev) => (prev?.id === s.id ? null : s))}
        className="w-full text-left group"
        type="button"
      >
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition active:scale-[0.99] hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-extrabold text-slate-900 truncate">{s.person_name}</div>
              <div className="text-sm text-slate-500 truncate">{formatPlatoonLabel(s.platoon)}</div>
              <div className="mt-1 text-xs text-slate-400">
                {formatDisplayDate(s.shift_date)}
                {shiftTypeShort(s) ? ` • ${shiftTypeShort(s)}` : ""}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <StatusPill text={statusText(s)} />
              <span className="text-slate-300 group-hover:text-slate-400 transition" aria-hidden>
                ›
              </span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  function totalLabel() {
    if (tab === "owed") return "Total standbys owed to me:";
    if (tab === "owe") return "Total standbys I owe:";
    if (tab === "upcoming") return "Total upcoming commitments:";
    if (tab === "history" && historySubtab === "settled") return "Total settled standbys:";
    return "Total deleted standbys:";
  }

  function titleLabel() {
    if (tab === "owed") return "Standbys Owed To Me";
    if (tab === "owe") return "Standbys I Owe";
    if (tab === "upcoming") return "Upcoming Standby Commitments";
    return "History";
  }

  // -----------------------------
  // Render list
  // -----------------------------
  function renderList() {
    if (loading) return <p className="text-slate-500">Loading…</p>;

    const title = titleLabel();

    // History → Settled grouped view
    if (tab === "history" && historySubtab === "settled") {
      const groups = historyGroups;
      const count = standbys.length;

      return (
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-xl font-extrabold text-slate-900">{title}</div>
              <div className="text-sm text-slate-600 mt-1 font-semibold">
                {totalLabel()} <span className="text-slate-900">{count}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <SegTab label="Settled" active={historySubtab === "settled"} onClick={() => setHistorySubtab("settled")} />
              <SegTab label="Deleted" active={historySubtab === "deleted"} onClick={() => setHistorySubtab("deleted")} />
            </div>
          </div>

          {groups.length === 0 ? (
            <EmptyState tabLabel="Settled shifts will appear here." />
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.gid} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {!g.isSingle && (
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-500">Settled together</div>
                      <button
                        onClick={() => unsettleGroup(g.gid)}
                        className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4 decoration-slate-300 hover:decoration-slate-600 transition"
                        type="button"
                        title="Unsettle"
                      >
                        Unsettle ↩︎
                      </button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {g.rows.map((s) => (
                      <ListRow key={s.id} s={s} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // History → Deleted list view + all other tabs list view
    const rows = viewRows;
    const count = rows.length;

    return (
      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-xl font-extrabold text-slate-900">{title}</div>
            <div className="text-sm text-slate-600 mt-1 font-semibold">
              {totalLabel()} <span className="text-slate-900">{count}</span>
            </div>
          </div>

          {tab === "history" && (
            <div className="flex gap-2">
              <SegTab label="Settled" active={historySubtab === "settled"} onClick={() => setHistorySubtab("settled")} />
              <SegTab label="Deleted" active={historySubtab === "deleted"} onClick={() => setHistorySubtab("deleted")} />
            </div>
          )}
        </div>

        <ControlsBar
          searchText={searchText}
          setSearchText={setSearchText}
          platoonFilter={platoonFilter}
          setPlatoonFilter={setPlatoonFilter}
          platoonOptions={platoonOptions}
          sortMode={sortMode}
          setSortMode={setSortMode}
          onReset={() => {
            setSearchText("");
            setSortMode(tab === "upcoming" ? "date_asc" : "date_desc");
            setPlatoonFilter("");
          }}
          showSort={tab !== "history"}
        />

        {rows.length === 0 ? (
          <EmptyState tabLabel="Nothing here yet." />
        ) : (
          <div className="space-y-2">
            {rows.map((s) => (
              <ListRow key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // -----------------------------
  // Settle flow UI (detail modal)
  // -----------------------------
  function renderSettleFlow() {
    if (!selectedStandby || !settleFlowOpen) return null;
    if (selectedStandby.deleted_at) return null;
    if (selectedStandby.settled) return null;

    const mismatchWarning = (() => {
      if (!settleWithExistingId) return null;
      const other = oppositeCandidates.find((x) => x.id === settleWithExistingId);
      if (!other) return null;

      const { mismatch } = getNameMismatchInfo(selectedStandby.person_name, other.person_name);
      if (!mismatch) return null;

      return (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-extrabold">Names don’t match</div>
          <div className="mt-1">
            This might be a typo, or it might be a <span className="font-semibold">three way standby</span>. You can still settle it.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMismatchResolution("threeway")}
              className={[
                "rounded-2xl px-3 py-2 text-sm font-semibold shadow-sm transition active:scale-[0.99]",
                mismatchResolution === "threeway" ? "bg-slate-900 text-white" : "bg-white border border-amber-200 text-amber-900",
              ].join(" ")}
            >
              Three way standby
            </button>

            <button
              type="button"
              onClick={() => setMismatchResolution("same")}
              className={[
                "rounded-2xl px-3 py-2 text-sm font-semibold shadow-sm transition active:scale-[0.99]",
                mismatchResolution === "same" ? "bg-slate-900 text-white" : "bg-white border border-amber-200 text-amber-900",
              ].join(" ")}
            >
              It’s the same person
            </button>
          </div>

          {mismatchResolution === "threeway" && (
            <div className="mt-2 text-xs text-amber-800">This will add a note to both shifts: “Three way standby”.</div>
          )}
        </div>
      );
    })();

    return (
      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="text-sm font-semibold text-slate-800 mb-2">Settle this standby</div>

        {settleChoice === null && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSettleChoice("new")}
              className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition"
              type="button"
            >
              New shift
            </button>
            <button
              onClick={() => setSettleChoice("existing")}
              className="rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition"
              type="button"
            >
              Existing shift
            </button>
            <button
              onClick={() => {
                setSettleFlowOpen(false);
                setSettleChoice(null);
                setSettleWithExistingId(null);
                setOppositeCandidates([]);
                setMismatchResolution("");
              }}
              className="rounded-2xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.99] transition"
              type="button"
            >
              Cancel
            </button>
          </div>
        )}

        {settleChoice === "existing" && (
          <div className="mt-3 space-y-3">
            <div className="text-sm text-slate-600">Select an existing shift from the opposite list:</div>

            {loadingOpposite ? (
              <p className="text-slate-500">Loading available shifts…</p>
            ) : oppositeCandidates.length === 0 ? (
              <p className="text-slate-500">No available shifts in the opposite list.</p>
            ) : (
              <div className="space-y-2">
                {oppositeCandidates.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-extrabold text-slate-900 truncate">{s.person_name}</div>
                      <div className="text-sm text-slate-500 truncate">{formatPlatoonLabel(s.platoon)}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {formatDisplayDate(s.shift_date)}
                        {shiftTypeShort(s) ? ` • ${shiftTypeShort(s)}` : ""}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSettleWithExistingId(s.id);
                        setMismatchResolution("");
                      }}
                      className={[
                        "shrink-0 rounded-2xl px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                        settleWithExistingId === s.id
                          ? "bg-slate-200 border-slate-300 text-slate-900"
                          : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50",
                      ].join(" ")}
                      type="button"
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            )}

            {mismatchWarning}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSettleChoice(null);
                  setSettleWithExistingId(null);
                  setOppositeCandidates([]);
                  setMismatchResolution("");
                }}
                className="rounded-2xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.99] transition"
                type="button"
              >
                Back
              </button>

              {settleWithExistingId && (
                <button
                  onClick={() => settleSelectedWithExisting(settleWithExistingId)}
                  className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition"
                  type="button"
                >
                  Settle now
                </button>
              )}
            </div>
          </div>
        )}

        {settleChoice === "new" && (
          <NewShiftMiniForm
            selectedStandby={selectedStandby}
            userId={user?.id}
            onBack={() => setSettleChoice(null)}
            onCreate={(payload, threeWay) => createShiftAndSettleWithSelected(payload, threeWay)}
          />
        )}
      </div>
    );
  }

  // -----------------------------
  // Logged out
  // -----------------------------
  if (!user?.id) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-700 font-semibold">You’re not logged in.</div>
          <div className="mt-2 text-sm text-slate-600">Go to your login screen, sign in, then come back.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-xl px-4 pt-6 pb-28">
        {fetchError && (
          <div className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
            <span className="font-bold">Fetch error:</span> {fetchError}
          </div>
        )}

        {renderList()}
      </div>

      {/* Floating Add */}
      <button
        onClick={openAddShiftModal}
        className="fixed right-5 bottom-[88px] z-40 w-14 h-14 rounded-full shadow-lg transition active:scale-[0.98] bg-slate-900 text-white hover:bg-slate-800 flex items-center justify-center text-2xl font-bold"
        aria-label="Add shift"
        type="button"
      >
        +
      </button>

      {/* Bottom menu */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-3">
          <div className="grid grid-cols-4 gap-2 rounded-3xl bg-white p-2 shadow-sm border border-slate-200">
            <BottomTab label="Standbys Owed To Me" active={tab === "owed"} onClick={() => goTab("owed")} />
            <BottomTab label="Standbys I Owe" active={tab === "owe"} onClick={() => goTab("owe")} />
            <BottomTab label="Upcoming Standbys" active={tab === "upcoming"} onClick={() => goTab("upcoming")} />
            <BottomTab label="History" active={tab === "history"} onClick={() => goTab("history")} />
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <ModalShell
          title="Add shift"
          onClose={() => {
            setShowAddModal(false);
            setOppositeCandidates([]);
            setMismatchResolution("");
          }}
        >
          <form onSubmit={submitAddShift} className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-extrabold text-slate-900 mb-2">Shift direction</div>
              <div className="space-y-2">
                <label className="flex items-start gap-3 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="worked_for_me"
                    checked={form.worked_for_me === false}
                    onChange={() => setForm((f) => ({ ...f, worked_for_me: false, settle_with_existing_id: null }))}
                    className="mt-1"
                  />
                  <div className="font-semibold">I am working this shift for them</div>
                </label>
                <label className="flex items-start gap-3 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="worked_for_me"
                    checked={form.worked_for_me === true}
                    onChange={() => setForm((f) => ({ ...f, worked_for_me: true, settle_with_existing_id: null }))}
                    className="mt-1"
                  />
                  <div className="font-semibold">They are working this shift for me</div>
                </label>
              </div>
            </div>

            <InputField label="Name" value={form.person_name} onChange={(v) => setForm((f) => ({ ...f, person_name: v }))} />

            <InputField
              label="What Platoon is this person on?"
              placeholder='e.g. "C"'
              value={form.platoon}
              onChange={(v) => {
                platoonManualRef.current = true;
                setForm((f) => ({ ...f, platoon: v }));
              }}
            />

            <div>
              <label className="text-sm font-semibold text-slate-700">Shift date</label>
              <input
                type="date"
                value={form.shift_date}
                onChange={(e) => {
                  platoonManualRef.current = false;
                  setForm((f) => ({ ...f, shift_date: e.target.value }));
                }}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-slate-900 shadow-sm"
              />
            </div>

            <div>
              <select
                value={form.shift_type}
                onChange={(e) => {
                  platoonManualRef.current = false;
                  setForm((f) => ({ ...f, shift_type: e.target.value }));
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-slate-900 shadow-sm"
              >
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
              <div className="mt-1 text-xs text-slate-500">Shift type</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs font-semibold text-slate-500">You are working on</div>
              <div className="text-sm font-extrabold text-slate-900">
                {form.duty_platoon ? formatPlatoonLabel(form.duty_platoon) : "—"}
              </div>
            </div>

            <TextAreaField label="Notes (optional)" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />

            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={form.settle_existing}
                onChange={(e) => setForm((f) => ({ ...f, settle_existing: e.target.checked, settle_with_existing_id: null }))}
                className="mt-1"
              />
              <div className="font-semibold">Would you like to use this shift to settle and existing standby?</div>
            </label>

            {form.settle_existing && (
              <AddSettleExistingBlock
                oppositeCandidates={oppositeCandidates}
                loadingOpposite={loadingOpposite}
                form={form}
                setForm={setForm}
                mismatchResolution={mismatchResolution}
                setMismatchResolution={setMismatchResolution}
                getNameMismatchInfo={getNameMismatchInfo}
              />
            )}

            <div className="sticky bottom-0 -mx-5 px-5 py-4 bg-white border-t border-slate-100">
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-slate-900 border border-slate-900 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 hover:border-slate-800 active:scale-[0.99] transition"
                >
                  Add
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setOppositeCandidates([]);
                    setMismatchResolution("");
                  }}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Detail Modal */}
      {selectedStandby && (
        <ModalShell title="" onClose={resetOverlays}>
          {!isEditing ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-extrabold text-slate-900">Standby</div>
                <div className="mt-2 text-sm text-slate-700 leading-relaxed">{detailNarrative(selectedStandby)}</div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-500">Status</div>
                  <StatusPill text={statusText(selectedStandby)} />
                </div>
              </div>

              {selectedStandby.notes && (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shadow-sm">
                  <div className="font-extrabold text-slate-900 mb-1">Notes</div>
                  <div className="whitespace-pre-wrap">{selectedStandby.notes}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <InputField label="Name" value={editForm.person_name} onChange={(v) => setEditForm((f) => ({ ...f, person_name: v }))} />
              <InputField
                label="What Platoon is this person on?"
                value={editForm.platoon}
                onChange={(v) => setEditForm((f) => ({ ...f, platoon: v }))}
              />
              <div>
                <label className="text-sm font-semibold text-slate-700">Shift date</label>
                <input
                  type="date"
                  value={editForm.shift_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, shift_date: e.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-slate-900 shadow-sm"
                />
              </div>
              <div>
                <select
                  value={editForm.shift_type}
                  onChange={(e) => setEditForm((f) => ({ ...f, shift_type: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-slate-900 shadow-sm"
                >
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>
                <div className="mt-1 text-xs text-slate-500">Shift type</div>
              </div>
              <TextAreaField label="Notes (optional)" value={editForm.notes} onChange={(v) => setEditForm((f) => ({ ...f, notes: v }))} />
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-extrabold text-slate-900 mb-2">Shift direction</div>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="edit_worked_for_me"
                      checked={editForm.worked_for_me === false}
                      onChange={() => setEditForm((f) => ({ ...f, worked_for_me: false }))}
                      className="mt-1"
                    />
                    <div className="font-semibold">I am working this shift for them</div>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="edit_worked_for_me"
                      checked={editForm.worked_for_me === true}
                      onChange={() => setEditForm((f) => ({ ...f, worked_for_me: true }))}
                      className="mt-1"
                    />
                    <div className="font-semibold">They are working this shift for me</div>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 -mx-5 px-5 py-4 bg-white border-t border-slate-100 mt-5">
            {(tab === "history" && historySubtab === "deleted") ? (
              <div className="flex gap-2">
                <button
                  onClick={() => restoreStandby(selectedStandby.id)}
                  className="flex-1 rounded-2xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-[0.99] transition"
                  type="button"
                >
                  Restore
                </button>
                <button
                  onClick={resetOverlays}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition"
                  type="button"
                >
                  Close
                </button>
              </div>
            ) : !isEditing ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition"
                  type="button"
                >
                  Edit
                </button>

                {!selectedStandby.settled && !selectedStandby.deleted_at && (
                  <button
                    onClick={() => {
                      setSettleFlowOpen((v) => !v);
                      setSettleChoice(null);
                      setSettleWithExistingId(null);
                      setOppositeCandidates([]);
                      setMismatchResolution("");
                    }}
                    className="rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition"
                    type="button"
                  >
                    Settle
                  </button>
                )}

                {!selectedStandby.deleted_at && (
                  <button
                    onClick={() => deleteStandby(selectedStandby.id)}
                    className="rounded-2xl bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 active:scale-[0.99] transition"
                    type="button"
                  >
                    Delete
                  </button>
                )}

                <button
                  onClick={resetOverlays}
                  className="rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition"
                  type="button"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={saveEdits}
                  className="flex-1 rounded-2xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition"
                  type="button"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm({
                      person_name: selectedStandby.person_name || "",
                      platoon: selectedStandby.platoon || "",
                      shift_date: selectedStandby.shift_date || "",
                      shift_type: selectedStandby.shift_type || "Day",
                      notes: selectedStandby.notes || "",
                      worked_for_me: Boolean(selectedStandby.worked_for_me),
                    });
                  }}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {!isEditing && renderSettleFlow()}
        </ModalShell>
      )}
    </div>
  );
}

/* ---------- Helper Components ---------- */

function ControlsBar({
  searchText,
  setSearchText,
  platoonFilter,
  setPlatoonFilter,
  platoonOptions,
  sortMode,
  setSortMode,
  onReset,
  showSort = true,
}) {
  return (
    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
      <input
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search…"
        className="rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-sm text-slate-900 shadow-sm"
      />

      <select
        value={platoonFilter}
        onChange={(e) => setPlatoonFilter(e.target.value)}
        className="rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-sm text-slate-900 shadow-sm"
      >
        <option value="">All platoons</option>
        {platoonOptions.map((p) => (
          <option key={p} value={p}>
            {p ? (String(p).toUpperCase().includes("PLATOON") ? p : `${p} Platoon`) : "-"}
          </option>
        ))}
      </select>

      {showSort ? (
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value)}
          className="rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-sm text-slate-900 shadow-sm"
        >
          <option value="date_desc">Date (newest)</option>
          <option value="date_asc">Date (oldest)</option>
          <option value="name_az">Name (A–Z)</option>
          <option value="name_za">Name (Z–A)</option>
          <option value="platoon_az">Platoon (A–Z)</option>
          <option value="platoon_za">Platoon (Z–A)</option>
        </select>
      ) : (
        <div />
      )}

      <button
        type="button"
        onClick={onReset}
        className="rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 active:scale-[0.99] transition"
      >
        Reset
      </button>
    </div>
  );
}

function EmptyState({ tabLabel }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div className="text-3xl">🗂️</div>
      <div className="mt-2 text-sm font-semibold text-slate-700">{tabLabel}</div>
    </div>
  );
}

function AddSettleExistingBlock({
  oppositeCandidates,
  loadingOpposite,
  form,
  setForm,
  mismatchResolution,
  setMismatchResolution,
  getNameMismatchInfo,
}) {
  const other = oppositeCandidates.find((x) => x.id === form.settle_with_existing_id);
  const mismatch = other ? getNameMismatchInfo(form.person_name, other.person_name).mismatch : false;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="text-sm font-extrabold text-slate-900">Select an existing shift</div>

      {loadingOpposite ? (
        <p className="text-slate-500 text-sm">Loading available shifts…</p>
      ) : oppositeCandidates.length === 0 ? (
        <p className="text-slate-500 text-sm">No available shifts to settle with.</p>
      ) : (
        <select
          value={form.settle_with_existing_id || ""}
          onChange={(e) => {
            setForm((f) => ({ ...f, settle_with_existing_id: e.target.value || null }));
            setMismatchResolution("");
          }}
          className="w-full rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-slate-900 shadow-sm"
        >
          <option value="">— Select —</option>
          {oppositeCandidates.map((s) => (
            <option key={s.id} value={s.id}>
              {s.person_name} ({formatPlatoonLabel(s.platoon)}) • {formatDisplayDate(s.shift_date)}
              {shiftTypeShort(s) ? ` • ${shiftTypeShort(s)}` : ""}
            </option>
          ))}
        </select>
      )}

      {mismatch && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-extrabold">Names don’t match</div>
          <div className="mt-1">
            This might be a typo, or it might be a <span className="font-semibold">three way standby</span>. You can still settle it.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMismatchResolution("threeway")}
              className={[
                "rounded-2xl px-3 py-2 text-sm font-semibold shadow-sm transition active:scale-[0.99]",
                mismatchResolution === "threeway" ? "bg-slate-900 text-white" : "bg-white border border-amber-200 text-amber-900",
              ].join(" ")}
            >
              Three way standby
            </button>

            <button
              type="button"
              onClick={() => setMismatchResolution("same")}
              className={[
                "rounded-2xl px-3 py-2 text-sm font-semibold shadow-sm transition active:scale-[0.99]",
                mismatchResolution === "same" ? "bg-slate-900 text-white" : "bg-white border border-amber-200 text-amber-900",
              ].join(" ")}
            >
              It’s the same person
            </button>
          </div>

          {mismatchResolution === "threeway" && (
            <div className="mt-2 text-xs text-amber-800">This will add a note to both shifts: “Three way standby”.</div>
          )}
        </div>
      )}
    </div>
  );
}

function NewShiftMiniForm({ selectedStandby, onBack, onCreate, userId }) {
  const defaultWorkedForMe = !selectedStandby.worked_for_me;

  const [mini, setMini] = useState(() => ({
    person_name: selectedStandby.person_name || "",
    platoon: selectedStandby.platoon || "",
    shift_date: "",
    shift_type: "Day",
    notes: "",
    threeWay: false,
  }));

  useEffect(() => {
    setMini({
      person_name: selectedStandby.person_name || "",
      platoon: selectedStandby.platoon || "",
      shift_date: "",
      shift_type: "Day",
      notes: "",
      threeWay: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStandby?.id]);

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="text-sm font-semibold text-slate-800 mb-2">New shift to settle with</div>

      <div className="space-y-4">
        <InputField label="Name" value={mini.person_name} onChange={(v) => setMini((m) => ({ ...m, person_name: v }))} />
        <InputField label="What Platoon is this person on?" value={mini.platoon} onChange={(v) => setMini((m) => ({ ...m, platoon: v }))} />

        <div>
          <label className="text-sm font-semibold text-slate-700">Shift date</label>
          <input
            type="date"
            value={mini.shift_date}
            onChange={(e) => setMini((m) => ({ ...m, shift_date: e.target.value }))}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-slate-900 shadow-sm"
          />
        </div>

        <div>
          <select
            value={mini.shift_type}
            onChange={(e) => setMini((m) => ({ ...m, shift_type: e.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-slate-900 shadow-sm"
          >
            <option value="Day">Day</option>
            <option value="Night">Night</option>
          </select>
          <div className="mt-1 text-xs text-slate-500">Shift type</div>
        </div>

        <TextAreaField label="Notes (optional)" value={mini.notes} onChange={(v) => setMini((m) => ({ ...m, notes: v }))} />

        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={mini.threeWay}
            onChange={(e) => setMini((m) => ({ ...m, threeWay: e.target.checked }))}
            className="mt-1"
          />
          <div>
            <div className="font-semibold">Three way standby</div>
            <div className="text-xs text-slate-500">Adds a note to both shifts</div>
          </div>
        </label>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              if (!userId) return;

              const payload = {
                user_id: userId,
                person_name: mini.person_name.trim(),
                platoon: mini.platoon.trim() || null,
                shift_date: mini.shift_date || null,
                shift_type: (mini.shift_type || "").trim() || null,
                notes: mini.notes.trim() || null,
                worked_for_me: defaultWorkedForMe,
                settled: false,
                settled_at: null,
                settlement_group_id: null,
                settlement_status: null,
                deleted_at: null,
              };

              if (!payload.person_name) return alert("Please enter a name.");
              if (!payload.shift_date) return alert("Please select a date.");
              if (!payload.shift_type) return alert("Please select Day or Night.");

              onCreate(payload, mini.threeWay);
            }}
            className="flex-1 rounded-2xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition"
            type="button"
          >
            Create & settle
          </button>
          <button
            onClick={onBack}
            className="flex-1 rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition"
            type="button"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalShell({ title, children, onClose }) {
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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div
        className={[
          "relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-xl border border-slate-200",
          "transition duration-150",
          open ? "scale-100" : "scale-[0.98]",
        ].join(" ")}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-white rounded-t-3xl">
          <div className="text-lg font-extrabold text-slate-900 truncate">{title || ""}</div>
          <button
            onClick={requestClose}
            className="rounded-full p-2 text-slate-700 hover:bg-slate-100 active:scale-[0.98] transition"
            aria-label="Close"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-slate-900 shadow-sm"
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full min-h-[90px] rounded-2xl border border-slate-200 bg-white text-slate-900 px-3
 py-2 text-slate-900 shadow-sm"
      />
    </div>
  );
}
