// src/components/StandbyList.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * standby_events columns assumed:
 * - id (uuid)
 * - user_id (uuid)
 * - person_name (text)
 * - platoon (text, nullable)
 * - duty_platoon (text, nullable)
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
  if (!ymd) return true;
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

function toTitleCase(s) {
  const raw = String(s || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  return raw
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
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
  const cls = t.includes("deleted")
    ? "bg-rose-100 text-rose-800"
    : t.includes("settled")
    ? "bg-emerald-100 text-emerald-800"
    : "bg-slate-100 text-slate-700";
  return <span className={`${base} ${cls}`}>{text}</span>;
}

function firstName(full) {
  const s = String(full || "").trim();
  if (!s) return "—";
  return s.split(/\s+/)[0];
}

function rowSentence(s) {
  const name = firstName(s?.person_name);
  const date = formatDisplayDate(s?.shift_date);
  const platoon = formatPlatoonLabel(s?.duty_platoon || s?.platoon); // prefer duty_platoon if present
  const st = shiftTypeShort(s);
  const stPart = st ? ` ${st}` : "";

  // worked_for_me === true  => they worked for you (so you owe them)
  // worked_for_me === false => you worked for them (so they owe you)
  if (s?.worked_for_me) {
    return `${name} worked for you on ${date} - ${platoon}${stPart}.`;
  }
  return `You worked for ${name} on ${date} - ${platoon}${stPart}.`;
}


export default function StandbyList() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);

  // Drawer / navigation
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Collapsible groups in drawer
  const [drawerGroup, setDrawerGroup] = useState("standbys"); // standbys | upcoming | history (which is expanded)

  // Top-level section
  const [section, setSection] = useState("standbys"); // standbys | upcoming | history

  // Sub-tabs
  const [standbysSubtab, setStandbysSubtab] = useState("owed"); // owed | owe
  const [upcomingSubtab, setUpcomingSubtab] = useState("i_work"); // i_work | they_work
  const [historySubtab, setHistorySubtab] = useState("settled"); // settled | deleted

  // Filters UI
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [standbys, setStandbys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [selectedStandby, setSelectedStandby] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState("date_desc");
  const [platoonFilter, setPlatoonFilter] = useState("");

  // Name suggestions
  const [nameSuggestions, setNameSuggestions] = useState([]);

  // Settle flow in detail modal
  const [settleFlowOpen, setSettleFlowOpen] = useState(false);
  const [settleChoice, setSettleChoice] = useState(null); // null | "new" | "existing"
  const [settleWithExistingId, setSettleWithExistingId] = useState(null);
  const [oppositeCandidates, setOppositeCandidates] = useState([]);
  const [loadingOpposite, setLoadingOpposite] = useState(false);

  // Name mismatch resolution
  const [mismatchResolution, setMismatchResolution] = useState(""); // "" | "threeway" | "same"

  // Add form
  const [form, setForm] = useState({
    worked_for_me: false,
    person_name: "",
    platoon: "",
    duty_platoon: "",
    shift_date: "",
    shift_type: "Day",
    notes: "",
    settle_existing: false,
    settle_with_existing_id: null,
  });

  // Prevent auto-fill fighting the user
  const dutyPlatoonManualRef = useRef(false);

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
  // AUTH
  // -----------------------------
  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        console.error("Session error:", error);
        setSession(null);
        setUser(null);
        return;
      }

      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) return;

    console.warn("Supabase signOut failed, forcing local clear:", error);

    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith("sb-") && k.includes("auth")) localStorage.removeItem(k);
      }
      const skeys = Object.keys(sessionStorage);
      for (const k of skeys) {
        if (k.startsWith("sb-") && k.includes("auth")) sessionStorage.removeItem(k);
      }
    } catch (e) {
      console.warn("Local/session storage clear failed:", e);
    }

    setSession(null);
    setUser(null);
    window.location.reload();
  }

  // -----------------------------
  // Scroll lock when modal open
  // -----------------------------
  useEffect(() => {
    const anyModalOpen = showAddModal || Boolean(selectedStandby) || drawerOpen;
    if (!anyModalOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showAddModal, selectedStandby, drawerOpen]);

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

  // -----------------------------
  // Navigation helpers (ALWAYS closes drawer)
  // -----------------------------
  function clearFiltersForNav(nextSection) {
    setSearchText("");
    setPlatoonFilter("");
    setFiltersOpen(false);
    setSortMode(nextSection === "upcoming" ? "date_asc" : "date_desc");
  }

  function goStandbys(which) {
    resetOverlays();
    setSection("standbys");
    setDrawerGroup("standbys");
    setStandbysSubtab(which);
    clearFiltersForNav("standbys");
    setDrawerOpen(false);
  }

  function goUpcoming(which) {
    resetOverlays();
    setSection("upcoming");
    setDrawerGroup("upcoming");
    setUpcomingSubtab(which);
    clearFiltersForNav("upcoming");
    setDrawerOpen(false);
  }

  function goHistory(which) {
    resetOverlays();
    setSection("history");
    setDrawerGroup("history");
    setHistorySubtab(which);
    clearFiltersForNav("history");
    setDrawerOpen(false);
  }

  function statusText(s) {
    if (s.deleted_at) return "Deleted";
    if (s.settled) return "Settled";
    return "Unsettled";
  }

  function shiftSummaryForDuty(shiftType, dutyPlatoon, dateYMD) {
    const tense = isFuture(dateYMD) ? "will be" : "was";
    const sp = dutyPlatoon ? formatPlatoonLabel(dutyPlatoon) : "—";
    const st = shiftType ? String(shiftType) : "—";
    return `This shift ${tense} a: ${sp} ${st.toLowerCase()} shift`;
  }

  function detailNarrative(s) {
    const name = s?.person_name || "—";
    const platoon = formatPlatoonLabel(s?.platoon);
    const date = formatDisplayDate(s?.shift_date);
    const st = shiftTypeShort(s);
    const stPart = st ? ` ${st}` : "";
    const future = isFuture(s?.shift_date);

    // NOTE CONTINUED: settled + upcoming wording
    if (s?.settled && future) {
      if (s?.worked_for_me) {
        return `Once ${name} works for you on ${date}${stPart}, your shifts will be settled.`;
      }
      return `Once you work for ${name} on ${date}${stPart}, your shifts will be settled.`;
    }

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
  // Fetch standbys (by section/subtab)
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

      // deleted vs not deleted
      if (section === "history" && historySubtab === "deleted") {
        query = query.not("deleted_at", "is", null);
      } else {
        query = query.is("deleted_at", null);
      }

      // STANDBYS
      if (section === "standbys") {
        if (standbysSubtab === "owed") query = query.eq("settled", false).eq("worked_for_me", false);
        if (standbysSubtab === "owe") query = query.eq("settled", false).eq("worked_for_me", true);
      }

      // UPCOMING
      if (section === "upcoming") {
        if (upcomingSubtab === "i_work") query = query.eq("worked_for_me", false).gt("shift_date", todayYMD());
        if (upcomingSubtab === "they_work") query = query.eq("worked_for_me", true).gt("shift_date", todayYMD());
      }

      // HISTORY (settled)
      if (section === "history" && historySubtab === "settled") {
        query = query.eq("settled", true);
      }

      const orderCol =
        section === "history" && historySubtab === "deleted"
          ? "deleted_at"
          : section === "history" && historySubtab === "settled"
          ? "settled_at"
          : "shift_date";

      const ascending = section === "upcoming";
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
  }, [section, standbysSubtab, upcomingSubtab, historySubtab, user?.id, refreshTick]);

  // -----------------------------
  // Platoon auto-fill from roster function
  // -----------------------------
  async function maybeAutofillPlatoon(dateYMD, shiftType) {
    if (!dateYMD || !shiftType) return;
    if (dutyPlatoonManualRef.current) return;

    const { data, error } = await supabase.rpc("get_platoon_on_duty", {
      p_date: dateYMD,
      p_shift_type: shiftType,
    });

    if (error) return;

    if (data) {
      setForm((f) => ({ ...f, duty_platoon: String(data) }));
    }
  }

  useEffect(() => {
    if (!showAddModal) return;
    maybeAutofillPlatoon(form.shift_date, form.shift_type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal, form.shift_date, form.shift_type]);

  // -----------------------------
  // Name suggestions
  // -----------------------------
  async function fetchNameSuggestions() {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("standby_events")
      .select("person_name")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("shift_date", { ascending: false })
      .limit(300);

    if (error) {
      console.warn("Could not load name suggestions:", error);
      return;
    }

    const set = new Set();
    for (const r of data || []) {
      const n = toTitleCase(r.person_name);
      if (n) set.add(n);
    }
    setNameSuggestions(Array.from(set).sort((a, b) => a.localeCompare(b)));
  }

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

    const ok = window.confirm("Unsettle this group? This will return both shifts to their owed/owing lists.");
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
  function openAddStandbyModal(defaults = {}) {
    resetOverlays();
    setDrawerOpen(false);

    dutyPlatoonManualRef.current = false;
    const defaultWorkedForMe = defaults.worked_for_me ?? false;

    setForm({
      worked_for_me: defaultWorkedForMe,
      person_name: defaults.person_name ?? "",
      platoon: defaults.platoon ?? "",
      shift_date: defaults.shift_date ?? "",
      shift_type: defaults.shift_type ?? "Day",
      duty_platoon: "",
      notes: "",
      settle_existing: false,
      settle_with_existing_id: null,
    });

    setMismatchResolution("");
    setFiltersOpen(false);
    setShowAddModal(true);

    fetchNameSuggestions();
  }

  function computeDestinationAfterAdd(payload) {
    const future = isFuture(payload.shift_date);
    if (future) {
      setSection("upcoming");
      setDrawerGroup("upcoming");
      setUpcomingSubtab(payload.worked_for_me ? "they_work" : "i_work");
      setSortMode("date_asc");
    } else {
      setSection("standbys");
      setDrawerGroup("standbys");
      setStandbysSubtab(payload.worked_for_me ? "owe" : "owed");
      setSortMode("date_desc");
    }
  }

  async function submitAddShift(e) {
    e.preventDefault();
    if (!user?.id) return;

    const payload = {
      user_id: user.id,
      person_name: toTitleCase(form.person_name),
      platoon: String(form.platoon || "").trim() || null,
      duty_platoon: String(form.duty_platoon || "").trim() || null,
      shift_date: form.shift_date || null,
      shift_type: (form.shift_type || "").trim() || null,
      notes: String(form.notes || "").trim() || null,
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

    const { data: inserted, error } = await supabase.from("standby_events").insert([payload]).select("*").single();

    if (error) {
      console.error("Insert error:", error);
      alert("Could not add standby. Check console.");
      return;
    }

    if (form.settle_existing && form.settle_with_existing_id) {
      const res = await linkSettlement(inserted.id, form.settle_with_existing_id, {
        threeWay: mismatchResolution === "threeway",
      });
      if (!res.ok) alert("Added standby, but could not settle. Check console.");
    }

    setShowAddModal(false);
    setOppositeCandidates([]);
    setSelectedStandby(null);
    setMismatchResolution("");

    computeDestinationAfterAdd(payload);
    setRefreshTick((t) => t + 1);
  }

  async function saveEdits() {
    if (!selectedStandby) return;

    const updates = {
      person_name: toTitleCase(editForm.person_name),
      platoon: String(editForm.platoon || "").trim() || null,
      shift_date: editForm.shift_date || null,
      shift_type: (editForm.shift_type || "").trim() || null,
      notes: String(editForm.notes || "").trim() || null,
      worked_for_me: Boolean(editForm.worked_for_me),
      duty_platoon: null,
    };

    if (!updates.person_name) return alert("Please enter a name.");
    if (!updates.shift_date) return alert("Please select a date.");
    if (!updates.shift_type) return alert("Please select Day or Night.");

    try {
      const { data: dutyData, error: dutyErr } = await supabase.rpc("get_platoon_on_duty", {
        p_date: updates.shift_date,
        p_shift_type: updates.shift_type,
      });

      if (!dutyErr && dutyData) updates.duty_platoon = String(dutyData);
    } catch (err) {
      // silent
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

    const { data: inserted, error } = await supabase.from("standby_events").insert([newShiftPayload]).select("*").single();

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
  // Filter/sort view rows (non-history-grouped)
  // -----------------------------
  const viewRows = useMemo(() => {
    const q = normalizeName(searchText);
    const pf = String(platoonFilter || "").trim();

    let rows = [...standbys];

    if (q) {
      rows = rows.filter((r) => {
        const a = normalizeName(r.person_name);
        const b = normalizeName(r.platoon);
        return a.includes(q) || b.includes(q);
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

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (String(searchText || "").trim()) n++;
    if (String(platoonFilter || "").trim()) n++;
    const defaultSort = section === "upcoming" ? "date_asc" : "date_desc";
    if (sortMode !== defaultSort) n++;
    return n;
  }, [searchText, platoonFilter, sortMode, section]);

  // -----------------------------
  // History grouping (settled only)
  // -----------------------------
  const historyGroups = useMemo(() => {
    if (!(section === "history" && historySubtab === "settled")) return [];

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
  }, [standbys, section, historySubtab]);

  // -----------------------------
  // Labels
  // -----------------------------
  function sectionTitle() {
    if (section === "standbys") return "Standbys";
    if (section === "upcoming") return "Upcoming";
    return "History";
  }

  function listTitle() {
    if (section === "standbys") return standbysSubtab === "owed" ? "Standbys - Owed to me" : "Standbys - I owe";
    if (section === "upcoming") return upcomingSubtab === "i_work" ? "Upcoming Standbys I've Agreed To" : "Upcoming Standbys I've Requested";
    return historySubtab === "settled" ? "Settled" : "Deleted";
  }

  function totalLabel() {
    if (section === "standbys" && standbysSubtab === "owed") return "Total standbys owed to me:";
    if (section === "standbys" && standbysSubtab === "owe") return "Total standbys I owe:";
    if (section === "history" && historySubtab === "settled") return "Total settled:";
    return "Total deleted:";
  }

  function emptyText() {
    if (section === "standbys" && standbysSubtab === "owed") return "No one owes you a shift currently.";
    if (section === "standbys" && standbysSubtab === "owe") return "You don't owe anyone a shift currently.";
    if (section === "upcoming" && upcomingSubtab === "i_work") return "No upcoming shift commitments 🎉";
    if (section === "upcoming" && upcomingSubtab === "they_work") return "No upcoming shifts off ☹️";
    if (section === "history" && historySubtab === "settled") return "Settled shifts will appear here.";
    return "Deleted shifts will appear here.";
  }

  // -----------------------------
  // Drawer (collapsible submenu)
  // -----------------------------
  function Drawer() {
    if (!drawerOpen) return null;

    const emailLabel = session?.user?.email || user?.email || "Signed in";

    const Group = ({ id, title, children }) => {
      const open = drawerGroup === id;
      return (
        <div className="mb-1">
          <button
            type="button"
            onClick={() => setDrawerGroup((cur) => (cur === id ? "" : id))}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 rounded-md"
          >
            <span>{title}</span>
            <span className="text-slate-400">{open ? "▾" : "▸"}</span>
          </button>
          {open && <div className="ml-2 mt-1 border-l border-slate-200 pl-2">{children}</div>}
        </div>
      );
    };

    const SubItem = ({ label, active, onClick }) => (
      <button
        type="button"
        onClick={onClick}
        className={[
          "w-full text-left px-3 py-2 text-sm rounded-md transition",
          active ? "bg-slate-100 text-slate-900 font-semibold" : "text-slate-700 hover:bg-slate-50",
        ].join(" ")}
      >
        {label}
      </button>
    );

    return (
      <div className="fixed inset-0 z-50">
        <div
          className="absolute inset-0 bg-black/25"
          onMouseDown={() => setDrawerOpen(false)}
        />
        <div className="absolute inset-y-0 left-0 w-[80%] max-w-[330px] bg-white text-slate-900 shadow-xl border-r border-slate-200 flex flex-col">
          <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900 leading-tight">Shift IOU</div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">{emailLabel}</div>
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-md p-2 text-slate-700 hover:bg-slate-100 active:scale-[0.98] transition"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <div className="px-4 py-3 border-b border-slate-100">
            <button
              type="button"
              onClick={() => openAddStandbyModal()}
              className="w-full rounded-md bg-slate-900 text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-800 active:scale-[0.99] transition"
            >
              + Add Standby
            </button>
          </div>

          <div className="px-3 py-3 overflow-y-auto">
            <Group id="standbys" title="Standbys">
              <SubItem
                label="Owed to me"
                active={section === "standbys" && standbysSubtab === "owed"}
                onClick={() => goStandbys("owed")}
              />
              <SubItem
                label="I owe"
                active={section === "standbys" && standbysSubtab === "owe"}
                onClick={() => goStandbys("owe")}
              />
            </Group>

            <Group id="upcoming" title="Upcoming">
              <SubItem
                label="Shifts I have to work"
                active={section === "upcoming" && upcomingSubtab === "i_work"}
                onClick={() => goUpcoming("i_work")}
              />
              <SubItem
                label="Shifts off"
                active={section === "upcoming" && upcomingSubtab === "they_work"}
                onClick={() => goUpcoming("they_work")}
              />
            </Group>

            <Group id="history" title="History">
              <SubItem
                label="Settled"
                active={section === "history" && historySubtab === "settled"}
                onClick={() => goHistory("settled")}
              />
              <SubItem
                label="Deleted"
                active={section === "history" && historySubtab === "deleted"}
                onClick={() => goHistory("deleted")}
              />
            </Group>
          </div>

          <div className="mt-auto px-4 py-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------
  // Compact row (list look)
  // -----------------------------
  function ListRowCompact({ s }) {
    return (
      <button
        onClick={() => setSelectedStandby((prev) => (prev?.id === s.id ? null : s))}
        className="w-full text-left"
        type="button"
      >
        <div className="px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-slate-900 truncate">{toTitleCase(s.person_name)}</div>
              <div className="text-[12px] text-slate-500 truncate">
                {rowSentence(s)}
                </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {formatDisplayDate(s.shift_date)}
                {shiftTypeShort(s) ? ` • ${shiftTypeShort(s)}` : ""}
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

  // -----------------------------
  // Filters UI
  // -----------------------------
  function resetFilters() {
    setSearchText("");
    setPlatoonFilter("");
    setSortMode(section === "upcoming" ? "date_asc" : "date_desc");
  }

  function FiltersBar() {
    const showSort = !(section === "history" && historySubtab === "settled");
    const defaultSort = section === "upcoming" ? "date_asc" : "date_desc";

    return (
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
          >
            {filtersOpen ? "Hide filters" : "Filters"}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
          >
            Reset
          </button>
        </div>

        {filtersOpen && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search name or platoon…"
              className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm"
            />

            <select
              value={platoonFilter}
              onChange={(e) => setPlatoonFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm"
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
                className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm"
              >
                <option value={defaultSort}>
                  {defaultSort === "date_asc" ? "Date (oldest)" : "Date (newest)"}
                </option>
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

            <div />
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
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Names don’t match</div>
          <div className="mt-1">
            Could be a typo, or a <span className="font-semibold">three way standby</span>.
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMismatchResolution("threeway")}
              className={[
                "rounded-md px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                mismatchResolution === "threeway"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white border-amber-200 text-amber-900",
              ].join(" ")}
            >
              Three way standby
            </button>

            <button
              type="button"
              onClick={() => setMismatchResolution("same")}
              className={[
                "rounded-md px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                mismatchResolution === "same"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white border-amber-200 text-amber-900",
              ].join(" ")}
            >
              Same person (just a typo)
            </button>
          </div>

          {mismatchResolution === "threeway" && (
            <div className="mt-2 text-xs text-amber-800">
              Adds note to both shifts: “Three way standby”.
            </div>
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
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-800 active:scale-[0.99] transition"
              type="button"
            >
              New shift
            </button>
            <button
              onClick={() => setSettleChoice("existing")}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition"
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
              className="rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.99] transition"
              type="button"
            >
              Cancel
            </button>
          </div>
        )}

        {settleChoice === "existing" && (
          <div className="mt-3 space-y-3">
            <div className="text-sm text-slate-600">Pick a shift from the opposite list:</div>

            {loadingOpposite ? (
              <p className="text-slate-500">Loading…</p>
            ) : oppositeCandidates.length === 0 ? (
              <p className="text-slate-500">No available shifts in the opposite list.</p>
            ) : (
              <div className="rounded-md border border-slate-200 overflow-hidden">
                {oppositeCandidates.map((s, idx) => (
                  <div key={s.id} className={["p-3 flex items-center justify-between gap-3", idx ? "border-t border-slate-200" : ""].join(" ")}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{toTitleCase(s.person_name)}</div>
                      <div className="text-xs text-slate-500 truncate">{formatPlatoonLabel(s.platoon)}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
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
                        "shrink-0 rounded-md px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                        settleWithExistingId === s.id
                          ? "bg-slate-100 border-slate-300 text-slate-900"
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
                className="rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.99] transition"
                type="button"
              >
                Back
              </button>

              {settleWithExistingId && (
                <button
                  onClick={() => settleSelectedWithExisting(settleWithExistingId)}
                  className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-800 active:scale-[0.99] transition"
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
  // Render list
  // -----------------------------
  function renderList() {
    if (loading) return <p className="text-slate-500">Loading…</p>;

    // History settled grouped
    if (section === "history" && historySubtab === "settled") {
      const groups = historyGroups;
      const count = standbys.length;

      return (
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-slate-900">{listTitle()}</div>
              <div className="text-sm text-slate-600 mt-1 font-semibold">
                {totalLabel()} <span className="text-slate-900">{count}</span>
              </div>
            </div>
          </div>

          {groups.length === 0 ? (
            <EmptyState tabLabel={emptyText()} />
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.gid} className="rounded-md border border-slate-200 bg-white overflow-hidden">
                  {!g.isSingle && (
                    <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
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

                  <div className="divide-y divide-slate-200">
                    {g.rows.map((s) => (
                      <ListRowCompact key={s.id} s={s} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    const rows = viewRows;
    const count = rows.length;

    return (
      <div>
        <div className="mb-3">
          <div className="text-lg font-extrabold text-slate-900">{listTitle()}</div>
          <div className="text-sm text-slate-600 mt-1 font-semibold">
            {totalLabel()} <span className="text-slate-900">{count}</span>
          </div>
        </div>

        {section !== "history" && <FiltersBar />}
        {section === "history" && historySubtab === "deleted" && <FiltersBar />}

        {rows.length === 0 ? (
          <EmptyState tabLabel={emptyText()} />
        ) : (
          <div className="rounded-md border border-slate-200 bg-white overflow-hidden divide-y divide-slate-200">
            {rows.map((s) => (
              <ListRowCompact key={s.id} s={s} />
            ))}
          </div>
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
        <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-700 font-semibold">You’re not logged in.</div>
          <div className="mt-2 text-sm text-slate-600">Go to your login screen, sign in, then come back.</div>
        </div>
      </div>
    );
  }

  // -----------------------------
  // Main render
  // -----------------------------
  return (
    <div className="min-h-screen bg-white">
      <Drawer />

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-100">
        <div className="mx-auto max-w-xl px-4 py-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="text-sm font-extrabold text-slate-900 truncate">{sectionTitle()}</div>

          <button
            type="button"
            onClick={() => openAddStandbyModal()}
            className="rounded-md bg-slate-900 text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 active:scale-[0.99] transition"
          >
            + Add
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 pt-4 pb-10">
        {fetchError && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
            <span className="font-bold">Fetch error:</span> {fetchError}
          </div>
        )}

        {renderList()}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <ModalShell
          title="Add Standby"
          onClose={() => {
            setShowAddModal(false);
            setOppositeCandidates([]);
            setMismatchResolution("");
          }}
        >
          <form onSubmit={submitAddShift} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">Shift date</label>
              <input
                type="date"
                value={form.shift_date}
                onChange={(e) => {
                  dutyPlatoonManualRef.current = false;
                  setForm((f) => ({ ...f, shift_date: e.target.value }));
                }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Shift type</label>
              <select
                value={form.shift_type}
                onChange={(e) => {
                  dutyPlatoonManualRef.current = false;
                  setForm((f) => ({ ...f, shift_type: e.target.value }));
                }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
              >
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900 mb-2">
                {isFuture(form.shift_date) ? "Who will work this shift?" : "Who worked this shift?"}
              </div>
              <div className="space-y-2">
                <label className="flex items-start gap-3 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="worked_for_me"
                    checked={form.worked_for_me === false}
                    onChange={() => setForm((f) => ({ ...f, worked_for_me: false, settle_with_existing_id: null }))}
                    className="mt-1"
                  />
                  <div className="font-semibold">
                    {isFuture(form.shift_date) ? "I will work for them" : "I worked for them"}
                  </div>
                </label>

                <label className="flex items-start gap-3 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="worked_for_me"
                    checked={form.worked_for_me === true}
                    onChange={() => setForm((f) => ({ ...f, worked_for_me: true, settle_with_existing_id: null }))}
                    className="mt-1"
                  />
                  <div className="font-semibold">
                    {isFuture(form.shift_date) ? "They will work for me" : "They worked for me"}
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Name</label>
              <input
                list="nameSuggestions"
                value={form.person_name}
                onChange={(e) => setForm((f) => ({ ...f, person_name: toTitleCase(e.target.value) }))}
                placeholder="Start typing…"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
              />
              <datalist id="nameSuggestions">
                {nameSuggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>

            <InputField
              label="What platoon is this person on?"
              placeholder='e.g. "C"'
              value={form.platoon}
              onChange={(v) => setForm((f) => ({ ...f, platoon: v }))}
            />

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs font-semibold text-slate-600">
                {shiftSummaryForDuty(form.shift_type, form.duty_platoon, form.shift_date)}
              </div>
            </div>

            <TextAreaField
              label="Notes (optional)"
              value={form.notes}
              onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            />

            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={form.settle_existing}
                onChange={(e) => setForm((f) => ({ ...f, settle_existing: e.target.checked, settle_with_existing_id: null }))}
                className="mt-1"
              />
              <div className="font-semibold">Use this to settle an existing standby</div>
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
                  className="flex-1 rounded-md bg-slate-900 text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-800 active:scale-[0.99] transition"
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
                  className="flex-1 rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
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
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <div className="text-sm font-extrabold text-slate-900">Standby</div>
                <div className="mt-2 text-sm text-slate-700 leading-relaxed">{detailNarrative(selectedStandby)}</div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-500">Status</div>
                  <StatusPill text={statusText(selectedStandby)} />
                </div>

                <div className="mt-3 text-xs text-slate-400">
                  {formatDisplayDate(selectedStandby.shift_date)}
                  {shiftTypeShort(selectedStandby) ? ` • ${shiftTypeShort(selectedStandby)}` : ""}
                </div>
              </div>

              {selectedStandby.notes && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-extrabold text-slate-900 mb-1">Notes</div>
                  <div className="whitespace-pre-wrap">{selectedStandby.notes}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <InputField
                label="Name"
                value={editForm.person_name}
                onChange={(v) => setEditForm((f) => ({ ...f, person_name: toTitleCase(v) }))}
              />
              <InputField
                label="What platoon is this person on?"
                value={editForm.platoon}
                onChange={(v) => setEditForm((f) => ({ ...f, platoon: v }))}
              />
              <div>
                <label className="text-sm font-semibold text-slate-700">Shift date</label>
                <input
                  type="date"
                  value={editForm.shift_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, shift_date: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Shift type</label>
                <select
                  value={editForm.shift_type}
                  onChange={(e) => setEditForm((f) => ({ ...f, shift_type: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
                >
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>
              </div>
              <TextAreaField
                label="Notes (optional)"
                value={editForm.notes}
                onChange={(v) => setEditForm((f) => ({ ...f, notes: v }))}
              />
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900 mb-2">
                  {isFuture(editForm.shift_date) ? "Who will work this shift?" : "Who worked this shift?"}
                </div>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="edit_worked_for_me"
                      checked={editForm.worked_for_me === false}
                      onChange={() => setEditForm((f) => ({ ...f, worked_for_me: false }))}
                      className="mt-1"
                    />
                    <div className="font-semibold">{isFuture(editForm.shift_date) ? "I will work for them" : "I worked for them"}</div>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="edit_worked_for_me"
                      checked={editForm.worked_for_me === true}
                      onChange={() => setEditForm((f) => ({ ...f, worked_for_me: true }))}
                      className="mt-1"
                    />
                    <div className="font-semibold">{isFuture(editForm.shift_date) ? "They will work for me" : "They worked for me"}</div>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 -mx-5 px-5 py-4 bg-white border-t border-slate-100 mt-5">
            {section === "history" && historySubtab === "deleted" ? (
              <div className="flex gap-2">
                <button
                  onClick={() => restoreStandby(selectedStandby.id)}
                  className="flex-1 rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text--slate-900 hover:bg-emerald-500 active:scale-[0.99] transition"
                  type="button"
                >
                  Restore
                </button>
                <button
                  onClick={resetOverlays}
                  className="flex-1 rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
                  type="button"
                >
                  Close
                </button>
              </div>
            ) : !isEditing ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
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
                    className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
                    type="button"
                  >
                    Settle
                  </button>
                )}

                {!selectedStandby.deleted_at && (
                  <button
                    onClick={() => deleteStandby(selectedStandby.id)}
                    className="rounded-md bg-rose-600 text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-rose-700 active:scale-[0.99] transition"
                    type="button"
                  >
                    Delete
                  </button>
                )}

                <button
                  onClick={resetOverlays}
                  className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
                  type="button"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={saveEdits}
                  className="flex-1 rounded-md bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-800 active:scale-[0.99] transition"
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
                      duty_platoon: selectedStandby.duty_platoon || "",
                      shift_date: selectedStandby.shift_date || "",
                      shift_type: selectedStandby.shift_type || "Day",
                      notes: selectedStandby.notes || "",
                      worked_for_me: Boolean(selectedStandby.worked_for_me),
                    });
                  }}
                  className="flex-1 rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
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

function EmptyState({ tabLabel }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-center">
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
    <div className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
      <div className="text-sm font-extrabold text-slate-900">Select an existing shift</div>

      {loadingOpposite ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : oppositeCandidates.length === 0 ? (
        <p className="text-slate-500 text-sm">No available shifts to settle with.</p>
      ) : (
        <select
          value={form.settle_with_existing_id || ""}
          onChange={(e) => {
            setForm((f) => ({ ...f, settle_with_existing_id: e.target.value || null }));
            setMismatchResolution("");
          }}
          className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
        >
          <option value="">— Select —</option>
          {oppositeCandidates.map((s) => (
            <option key={s.id} value={s.id}>
              {toTitleCase(s.person_name)} ({formatPlatoonLabel(s.platoon)}) • {formatDisplayDate(s.shift_date)}
              {shiftTypeShort(s) ? ` • ${shiftTypeShort(s)}` : ""}
            </option>
          ))}
        </select>
      )}

      {mismatch && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Names don’t match</div>
          <div className="mt-1">
            Could be a typo, or a <span className="font-semibold">three way standby</span>.
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMismatchResolution("threeway")}
              className={[
                "rounded-md px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                mismatchResolution === "threeway"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white border-amber-200 text-amber-900",
              ].join(" ")}
            >
              Three way standby
            </button>

            <button
              type="button"
              onClick={() => setMismatchResolution("same")}
              className={[
                "rounded-md px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                mismatchResolution === "same"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white border-amber-200 text-amber-900",
              ].join(" ")}
            >
              It’s the same person
            </button>
          </div>

          {mismatchResolution === "threeway" && (
            <div className="mt-2 text-xs text-amber-800">Adds “Three way standby” note to both shifts.</div>
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
        <InputField
          label="Name"
          value={mini.person_name}
          onChange={(v) => setMini((m) => ({ ...m, person_name: toTitleCase(v) }))}
        />
        <InputField
          label="What platoon is this person on?"
          value={mini.platoon}
          onChange={(v) => setMini((m) => ({ ...m, platoon: v }))}
        />

        <div>
          <label className="text-sm font-semibold text-slate-700">Shift date</label>
          <input
            type="date"
            value={mini.shift_date}
            onChange={(e) => setMini((m) => ({ ...m, shift_date: e.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700">Shift type</label>
          <select
            value={mini.shift_type}
            onChange={(e) => setMini((m) => ({ ...m, shift_type: e.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
          >
            <option value="Day">Day</option>
            <option value="Night">Night</option>
          </select>
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
                person_name: toTitleCase(mini.person_name),
                platoon: String(mini.platoon || "").trim() || null,
                shift_date: mini.shift_date || null,
                shift_type: (mini.shift_type || "").trim() || null,
                notes: String(mini.notes || "").trim() || null,
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
            className="flex-1 rounded-md bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-800 active:scale-[0.99] transition"
            type="button"
          >
            Create & settle
          </button>
          <button
            onClick={onBack}
            className="flex-1 rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
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
          "relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-md bg-white shadow-xl border border-slate-200",
          "transition duration-150",
          open ? "scale-100" : "scale-[0.98]",
        ].join(" ")}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-white">
          <div className="text-base font-extrabold text-slate-900 truncate">{title || ""}</div>
          <button
            onClick={requestClose}
            className="rounded-md p-2 text-slate-700 hover:bg-slate-100 active:scale-[0.98] transition"
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
        className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
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
        className="mt-1 w-full min-h-[90px] rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
      />
    </div>
  );
}
