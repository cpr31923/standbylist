// src/components/StandbyList.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import CalendarView from "./CalendarView";
import { fetchStandbyById } from "./standby/data";
import OnboardingModal, { STEPS } from "./OnboardingModal";
import useOnboarding from "../hooks/useOnboarding";

import {
  todayYMD,
  isFuture,
  formatPlatoonLabel,
  formatDisplayDate,
  normalizeName,
  toTitleCase,
  toTitleCaseLive,
  makeUUID,
  shiftTypeShort,
  firstName,
  openStandbyDetailById,
} from "./standby/helpers";

import { detailNarrative } from "./standby/narratives";
import ListRowCompact from "./standby/ListRowCompact";
import FiltersBar from "./standby/FiltersBar";
import Drawer from "./standby/drawer";

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

export default function StandbyList() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);

  // overall summary (unsettled, not deleted)
  const [overallPlus, setOverallPlus] = useState(0); // they owe me
  const [overallMinus, setOverallMinus] = useState(0); // I owe

  // Calendar sub-tabs + home platoon
  const [calendarSubtab, setCalendarSubtab] = useState("shift"); // shift | mine
  const [homePlatoon, setHomePlatoon] = useState("");

  // Drawer / navigation
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerGroup, setDrawerGroup] = useState(""); // "" | standbys | upcoming | history | calendar

  // Top-level section
  const [section, setSection] = useState("standbys"); // standbys | upcoming | history | settings | calendar

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
  const [showOtherReasonPrompt, setShowOtherReasonPrompt] = useState(false);
  const [otherReasonNote, setOtherReasonNote] = useState("");


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
  const pendingNewShiftNoteRef = useRef("");


  // Onboarding spotlight targets
  const menuBtnRef = useRef(null);
  const addBtnRef = useRef(null);

  // Edit form
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    person_name: "",
    platoon: "",
    shift_date: "",
    shift_type: "Day",
    notes: "",
    worked_for_me: false,
  });

  const {
    open: onboardingOpen,
    setOpen: setOnboardingOpen,
    stepIndex,
    next,
    back,
    close,
    reset,
  } = useOnboarding(user?.id);

   const onboardingTargetEl =
   stepIndex === 2 ? menuBtnRef.current :
   stepIndex === 3 ? addBtnRef.current :
   null;


  async function openDetail(row) {
  const id = row?.id;
  if (!id) return;

  // Open immediately so UX never feels dead
  setDrawerOpen(false);
  setShowAddModal(false);
  setIsEditing(false);
  setSettleFlowOpen(false);
  setSettleChoice(null);
  setSettleWithExistingId(null);
  setOppositeCandidates([]);
  setMismatchResolution("");

  // set something immediately (even if partial)
  setSelectedStandby(row);

  // hydrate full row
  const { data, error } = await fetchStandbyById(id);
  if (error) {
    console.error("Fetch standby detail error:", error);
    // keep modal open with the partial row instead of crashing
    return;
  }
  setSelectedStandby(data);
}



  const [refreshTick, setRefreshTick] = useState(0);

  const defaultSort = section === "upcoming" ? "date_asc" : "date_desc";
  const showSort = true;

  // -----------------------------
  // Load & persist Home Platoon (localStorage)
  // -----------------------------
  useEffect(() => {
    try {
      const saved = localStorage.getItem("shift-iou-home-platoon") || "";
      if (saved) setHomePlatoon(saved);
    } catch {}
  }, []);

  function saveHomePlatoon(next) {
    const v = String(next || "").trim().toUpperCase();
    setHomePlatoon(v);
    try {
      localStorage.setItem("shift-iou-home-platoon", v);
    } catch {}
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
  // Prevent horizontal scroll
  // -----------------------------
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflowX;
    const prevBody = document.body.style.overflowX;
    document.documentElement.style.overflowX = "hidden";
    document.body.style.overflowX = "hidden";
    return () => {
      document.documentElement.style.overflowX = prevHtml;
      document.body.style.overflowX = prevBody;
    };
  }, []);

  // -----------------------------
  // Drawer should always open collapsed
  // -----------------------------
  useEffect(() => {
    if (drawerOpen) setDrawerGroup("");
  }, [drawerOpen]);

  // -----------------------------
  // Scroll lock when modal/drawer open
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

  function goSettings() {
    resetOverlays();
    setSection("settings");
    setDrawerGroup("");
    setFiltersOpen(false);
    setDrawerOpen(false);
  }

  function goCalendar(which) {
    resetOverlays();
    setSection("calendar");
    setDrawerGroup("calendar");
    setCalendarSubtab(which); // "shift" | "mine"
    setFiltersOpen(false);
    setDrawerOpen(false);
  }

  // -----------------------------
  // Labels
  // -----------------------------
  function sectionTitle() {
    if (section === "standbys") return "Standbys";
    if (section === "upcoming") return "Upcoming";
    if (section === "history") return "History";
    if (section === "calendar") return "Calendar";
    if (section === "settings") return "Settings";
    return "Shift IOU";
  }

  function listTitle() {
    if (section === "standbys")
      return standbysSubtab === "owed"
        ? "Standbys - Owed to me"
        : "Standbys - I owe";
    if (section === "upcoming")
      return upcomingSubtab === "i_work"
        ? "Upcoming Standbys I've Agreed To"
        : "Upcoming Standbys I've Requested";
    return historySubtab === "settled" ? "Settled" : "Deleted";
  }

  function totalLabel() {
    if (section === "standbys" && standbysSubtab === "owed")
      return "Total standbys owed to me:";
    if (section === "standbys" && standbysSubtab === "owe")
      return "Total standbys I owe:";
    if (section === "upcoming" && upcomingSubtab === "they_work")
      return "Total upcoming shifts off:";
    if (section === "upcoming" && upcomingSubtab === "i_work")
      return "Total upcoming shifts I’ve agreed to:";
    if (section === "history" && historySubtab === "settled")
      return "Total settled:";
    return "Total deleted:";
  }

  function emptyText() {
    if (section === "standbys" && standbysSubtab === "owed")
      return "No one owes you a shift ☹️";
    if (section === "standbys" && standbysSubtab === "owe")
      return "You don't owe any shifts 🎉";
    if (section === "upcoming" && upcomingSubtab === "i_work")
      return "No upcoming shift commitments 🎉";
    if (section === "upcoming" && upcomingSubtab === "they_work")
      return "No upcoming shifts off ☹️";
    if (section === "history" && historySubtab === "settled")
      return "Settled shifts will appear here.";
    return "Deleted shifts will appear here.";
  }

function upcomingRowSentence(s) {
  // Only override for future rows in Upcoming that are already linked/settled as a pair
  if (section === "upcoming" && s?.settled && s?.settlement_group_id && isFuture(s?.shift_date)) {
    const first = firstName(s?.person_name);
    const date = formatDisplayDate(s?.shift_date);
    const dutyPlatoon = formatPlatoonLabel(s?.duty_platoon || s?.platoon);
    const st = shiftTypeShort(s);
    const stPart = st ? ` ${st}` : "";

    // worked_for_me === true => they will work for you (repayment shift)
    if (s.worked_for_me) {
      return `Once ${first} works for you on ${date} - ${dutyPlatoon}${stPart}, your shifts will be settled.`;
    }

    // worked_for_me === false => you will work for them
    return `Once you work for ${first} on ${date} - ${dutyPlatoon}${stPart}, your shifts will be settled.`;
  }

  // Default behaviour everywhere else (and for non-settled future shifts)
  return rowSentence(s);
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
    return `This ${tense} a ${sp} ${st.toLowerCase()} shift`;
  }

  // -----------------------------
  // Partner lookup + row sentence
  // -----------------------------
  function findPartnerShift(row) {
    if (!row?.settlement_group_id) return null;
    const gid = row.settlement_group_id;
    const other = standbys.find(
      (r) => r.settlement_group_id === gid && r.id !== row.id
    );
    return other || null;
  }

  function nameWithPlatoonLocal(row) {
    const nameFull = toTitleCase(row?.person_name || "—");
    const p = formatPlatoonLabel(row?.platoon);
    return `${nameFull} (${p})`;
  }

  function rowSentence(row) {
    if (row?.deleted_at) {
      const date = formatDisplayDate(row?.shift_date);
      const st = shiftTypeShort(row);
      return `${date}${st ? ` ${st}` : ""}`;
    }

    const who = nameWithPlatoonLocal(row);
    const first = firstName(row?.person_name);
    const date = formatDisplayDate(row?.shift_date);
    const dutyPlatoon = formatPlatoonLabel(row?.duty_platoon || row?.platoon);
    const st = shiftTypeShort(row);
    const stPart = st ? ` ${st}` : "";
    const future = isFuture(row?.shift_date);

    if (row?.settled && row?.settlement_group_id) {
      const other = findPartnerShift(row);
      if (other) {
        const myDate = String(row.shift_date || "");
        const otherDate = String(other.shift_date || "");
        const isSettlingShift =
          myDate > otherDate ||
          (myDate === otherDate && String(row.id) > String(other.id));

        if (isSettlingShift) {
          const alreadyHappened = !isFuture(row.shift_date);

        // Obligation shift (the earlier one in the settled pair):
        // Show plain factual wording, with NO "owe/owed" sentence.
        if (!isSettlingShift) {
          if (row.worked_for_me) {
            return `${who} worked for you on ${date} - ${dutyPlatoon}${stPart}.`;
          }
          return `You worked for ${who} on ${date} - ${dutyPlatoon}${stPart}.`;
        }

          if (row.worked_for_me) {
            return alreadyHappened
           ? `Now that ${first} has worked for you on ${date} - ${dutyPlatoon}${stPart}, your shifts are settled.`
           : `Once ${first} works for you on ${date} - ${dutyPlatoon}${stPart}, your shifts will be settled.`;
          }

            return alreadyHappened
           ? `Now that you have worked for ${first} on ${date} - ${dutyPlatoon}${stPart}, your shifts are settled.`
           : `Once you work for ${first} on ${date} - ${dutyPlatoon}${stPart}, your shifts will be settled.`;
          }
      }
    }
    // ✅ Guard: any row that is already settled should NEVER show "owe/owed" wording in list preview.
    // (Even if we can't find its partner row at render time.)
    if (row?.settled && row?.settlement_group_id) {
      if (row.worked_for_me) {
        return `${who} worked for you on ${date} - ${dutyPlatoon}${stPart}.`;
      }
      return `You worked for ${who} on ${date} - ${dutyPlatoon}${stPart}.`;
    }


    // worked_for_me === true  => they worked for you (you owe them)
    // worked_for_me === false => you worked for them (they owe you)
    if (row?.worked_for_me) {
      return future
        ? `${who} will work for you on ${date} - ${dutyPlatoon}${stPart}. You will owe them a shift.`
        : `${who} worked for you on ${date} - ${dutyPlatoon}${stPart}. You owe them a shift.`;
    }

    return future
      ? `You will work for ${who} on ${date} - ${dutyPlatoon}${stPart}. They will owe you a shift.`
      : `You worked for ${who} on ${date} - ${dutyPlatoon}${stPart}. They owe you a shift.`;
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
      shift_date: selectedStandby.shift_date || "",
      shift_type: selectedStandby.shift_type || "Day",
      notes: selectedStandby.notes || "",
      worked_for_me: Boolean(selectedStandby.worked_for_me),
    });
  }, [selectedStandby]);

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

      let query = supabase
        .from("standby_events")
        .select("*")
        .eq("user_id", user.id);

      if (section === "history" && historySubtab === "deleted") {
        query = query.not("deleted_at", "is", null);
      } else {
        query = query.is("deleted_at", null);
      }

      if (section === "standbys") {
        if (standbysSubtab === "owed")
          query = query.eq("settled", false).eq("worked_for_me", false);
        if (standbysSubtab === "owe")
          query = query.eq("settled", false).eq("worked_for_me", true);
      }

      if (section === "upcoming") {
        if (upcomingSubtab === "i_work")
          query = query.eq("worked_for_me", false).gt("shift_date", todayYMD());
        if (upcomingSubtab === "they_work")
          query = query.eq("worked_for_me", true).gt("shift_date", todayYMD());
      }

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
  // Overall standby position
  // -----------------------------
  useEffect(() => {
    if (!user?.id) {
      setOverallPlus(0);
      setOverallMinus(0);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("standby_events")
        .select("worked_for_me, settled, deleted_at")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .eq("settled", false);

      if (error) {
        console.warn("Overall counts fetch failed:", error);
        setOverallPlus(0);
        setOverallMinus(0);
        return;
      }

      let plus = 0;
      let minus = 0;
      for (const r of data || []) {
        if (r.worked_for_me) minus += 1;
        else plus += 1;
      }

      setOverallPlus(plus);
      setOverallMinus(minus);
    })();
  }, [user?.id, refreshTick]);

  // -----------------------------
  // Platoon auto-fill (roster function)
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
    const { data: rows, error } = await supabase
      .from("standby_events")
      .select("id, notes")
      .in("id", ids);

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
      const { error: upErr } = await supabase
        .from("standby_events")
        .update({ notes: u.notes })
        .eq("id", u.id);
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

    const ok = window.confirm(
      "Unsettle this group? This will return both shifts to their owed/owing lists."
    );
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
  async function deleteSettlementGroup(groupId) {
  if (!groupId) return;

  const ok = window.confirm("Delete this settled pair? This will move both shifts to History → Deleted.");
  if (!ok) return;

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("standby_events")
    .update({ deleted_at: nowIso })
    .eq("settlement_group_id", groupId)
    .is("deleted_at", null);

  if (error) {
    console.error("Delete settlement group error:", error);
    alert("Could not delete the pair. Check console.");
    return;
  }

  setSelectedStandby(null);
  setRefreshTick((t) => t + 1);
}

async function restoreSettlementGroup(groupId) {
  if (!groupId) return;

  const ok = window.confirm("Restore this deleted pair?");
  if (!ok) return;

  const { error } = await supabase
    .from("standby_events")
    .update({ deleted_at: null })
    .eq("settlement_group_id", groupId)
    .not("deleted_at", "is", null);

  if (error) {
    console.error("Restore settlement group error:", error);
    alert("Could not restore the pair. Check console.");
    return;
  }

  setSelectedStandby(null);
  setRefreshTick((t) => t + 1);
}

  
  async function deleteStandby(id) {
    if (!id) return;

    const ok = window.confirm(
      "Delete this standby? You can restore it later from History → Deleted."
    );
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
    const { error: delErr } = await supabase
      .from("standby_events")
      .update({ deleted_at: nowIso })
      .eq("id", id);

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
        const otherIds = (others || [])
          .map((r) => r.id)
          .filter((rid) => rid !== id);
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

          if (unlinkErr)
            console.error("Unsettle remaining after delete error:", unlinkErr);
        }
      }
    }

    setSelectedStandby(null);
    setRefreshTick((t) => t + 1);
  }

  async function restoreStandby(id) {
    if (!id) return;

    const { error } = await supabase
      .from("standby_events")
      .update({ deleted_at: null })
      .eq("id", id);

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

  // If settling with existing and names mismatch flow is active, apply notes as needed
  if (form.settle_existing && form.settle_with_existing_id && mismatchResolution) {
    const existingId = form.settle_with_existing_id;

    // helper to append a note to an existing standby row
    async function appendNoteToStandby(id, noteToAdd) {
      if (!noteToAdd) return;

      // get current notes
      const { data: row, error: readErr } = await supabase
        .from("standby_events")
        .select("notes")
        .eq("id", id)
        .single();
      if (readErr) throw readErr;

      const current = (row?.notes || "").trim();
      const merged = current
        ? `${current}\n${noteToAdd}`.trim()
        : noteToAdd.trim();

      const { error: updErr } = await supabase
        .from("standby_events")
        .update({ notes: merged })
        .eq("id", id);
      if (updErr) throw updErr;
    }

    if (mismatchResolution === "three_way") {
      const stamp = `[Three-way standby]`;
      // append to BOTH: the existing standby and the new one (after insert we also do it—see next section)
      await appendNoteToStandby(existingId, stamp);
      // for the NEW shift: store a pending note we’ll apply after insert
      pendingNewShiftNoteRef.current = stamp;
    }

    if (mismatchResolution === "other") {
      const text = (otherReasonNote || "").trim();
      const stamp = text ? `[Name mismatch: ${text}]` : `[Name mismatch: Other reason]`;
      await appendNoteToStandby(existingId, stamp);
      pendingNewShiftNoteRef.current = stamp;
    }

    // typo => do nothing
  }


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

    const { data: inserted, error } = await supabase
      .from("standby_events")
      .insert([payload])
      .select("*")
      .single();

    if (pendingNewShiftNoteRef.current) {
  await (async () => {
    const noteToAdd = pendingNewShiftNoteRef.current;
    pendingNewShiftNoteRef.current = "";

    const current = (inserted?.notes || "").trim();
    const merged = current
      ? `${current}\n${noteToAdd}`.trim()
      : noteToAdd.trim();

    const { error: updErr } = await supabase
      .from("standby_events")
      .update({ notes: merged })
      .eq("id", inserted.id);

    if (updErr) throw updErr;
  })();
}


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
    } catch {}

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
    if (sortMode !== defaultSort) n++;
    return n;
  }, [searchText, platoonFilter, sortMode, defaultSort]);

  // -----------------------------
  // History grouping (settled only)
  // -----------------------------
  const historyGroups = useMemo(() => {
    if (!(section === "history" && (historySubtab === "settled" || historySubtab === "deleted"))) return [];

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
  // Filters UI
  // -----------------------------
  function resetFilters() {
    setSearchText("");
    setPlatoonFilter("");
    setSortMode(defaultSort);
  }

  function renderFiltersBar() {
    if (section === "calendar" || section === "settings") return null;

    return (
      <FiltersBar
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
        activeFilterCount={activeFilterCount}
        searchText={searchText}
        setSearchText={setSearchText}
        platoonFilter={platoonFilter}
        setPlatoonFilter={setPlatoonFilter}
        platoonOptions={platoonOptions}
        showSort={showSort}
        sortMode={sortMode}
        setSortMode={setSortMode}
        defaultSort={defaultSort}
        resetFilters={resetFilters}
      />
    );
  }

const renderSettleFlow = () => {
  if (!selectedStandby || !settleFlowOpen) return null;
  if (selectedStandby.deleted_at) return null;
  if (selectedStandby.settled) return null;

};

function listRowSentence(row) {
  // Upcoming has a special override for future settled pairs
  if (section === "upcoming") return upcomingRowSentence(row);
  return rowSentence(row);
}


  function renderList() {
    if (loading) return <p className="text-slate-500">Loading…</p>;

    // History grouped (settled + deleted)
      if (section === "history" && (historySubtab === "settled" || historySubtab === "deleted")) {
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

          {renderFiltersBar()}

          {groups.length === 0 ? (
            <EmptyState tabLabel={emptyText()} />
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.gid} className="rounded-md border border-slate-200 bg-white overflow-hidden">
                  {!g.isSingle && (
                    <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-500">
                        {historySubtab === "settled" ? "Settled together" : "Deleted together"}
                      </div>

                    {historySubtab === "deleted" && (
                      <button
                        onClick={() => restoreSettlementGroup(g.gid)}
                        className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4 decoration-slate-300 hover:decoration-slate-600 transition"
                        type="button"
                        title="Restore pair"
                      >
                        Restore pair ↩︎
                      </button>
                    )}
                    </div>
                  )}
                  <div className="divide-y divide-slate-200">
                    {g.rows.map((s) => (
                      <ListRowCompact
                        key={s.id}
                        s={s}
                        rowSentence={listRowSentence}
                        onToggleSelect={(row) =>
                          openStandbyDetailById({
                            id: row?.id,
                            resetOverlays,
                            setDrawerOpen,
                            setSelectedStandby,
                          })
                        }

                      />
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

        {renderFiltersBar()}

        {rows.length === 0 ? (
          <EmptyState tabLabel={emptyText()} />
        ) : (
          <div className="rounded-md border border-slate-200 bg-white overflow-hidden divide-y divide-slate-200">
            {rows.map((s) => (
              <ListRowCompact
                key={s.id}
                s={s}
                rowSentence={listRowSentence}
                onToggleSelect={(row) => openDetail(row)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderSettings() {
    const email = session?.user?.email || user?.email || "—";

    async function sendPasswordReset() {
      if (!email || email === "—") return alert("No email found.");
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        console.error("Password reset error:", error);
        alert("Could not send reset email. Check console.");
        return;
      }
      alert("Password reset email sent.");
    }

    function sendFeedbackEmail() {
      const to = "cameron.reyniers@gmail.com";
      const subject = encodeURIComponent("Shift IOU feedback");
      const body = encodeURIComponent(`Hi,\n\nI have some feedback on Shift IOU:\n\n\n\n—\nUser: ${email}\n`);
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    }

    return (
      <div>
        <div className="mb-3">
          <div className="text-xl font-extrabold text-slate-900">Settings</div>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-md font-extrabold text-slate-900">Account</div>

            <div className="mt-2 text-sm text-slate-700">
              <div className="text-xs font-semibold text-slate-500">Email</div>
              <div className="mt-0.5 font-semibold">{email}</div>
            </div>

            <div className="mt-4 text-sm text-slate-700">
              <div className="text-xs font-semibold text-slate-500">Home platoon</div>
              <select
                value={homePlatoon || ""}
                onChange={(e) => saveHomePlatoon(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold"
              >
                <option value="">— Select —</option>
                <option value="A">A Platoon</option>
                <option value="B">B Platoon</option>
                <option value="C">C Platoon</option>
                <option value="D">D Platoon</option>
              </select>
              <div className="mt-1 text-xs text-slate-500">
                Used for “My calendar” (shows Day/Night/off + overlays your standbys).
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={sendPasswordReset}
                className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
              >
                Change password
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Help */}
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-md font-extrabold text-slate-900">Help</div>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => {
                    reset();                 // resets localStorage + opens step 1
                }}
                className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
              >
                Re-run app tour
              </button>

              <button
                type="button"
                onClick={() => alert("User guide PDF coming soon (placeholder).")}
                className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
              >
                User guide (coming soon)
              </button>
            </div>
          </div>


          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-md font-extrabold text-slate-900">About</div>

            <div className="mt-3">
              <button
                type="button"
                onClick={sendFeedbackEmail}
                className="w-full rounded-md bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800 active:scale-[0.99] transition shadow-sm"
              >
                Send app feedback
              </button>
            </div>

            <div className="mt-3 text-sm text-slate-700 leading-relaxed space-y-3">
              <p>
                This app started as a personal side project. I built it because I was frustrated that there wasn’t an easy way
                to track standby commitments, after trying spreadsheets, Notes apps, and old-fashioned pen and paper with limited
                success.
              </p>

              <p>
                It’s designed as a simple, private tool to help individuals keep track of their own arrangements. It is not an
                official system of record and should not be relied on as your only source of truth for anything important.
              </p>

              <p>This app is not affiliated with, endorsed by, or connected to DFES or any other organisation.</p>

              <p>
                Your data is stored per-account and protected by access controls, but this is a personal beta project and no
                guarantees are made about uptime, accuracy, or data retention. Please keep your own backup if the information
                matters to you.
              </p>

              <p>
                By using this app you accept that it is provided “as-is”, and that no responsibility is taken for any data loss,
                errors, or consequences arising from its use.
              </p>

              <div className="pt-2 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-500">Privacy</div>
                <div className="text-sm text-slate-700">
                  Your entries are private to your account and are not visible to other users. No data is sold, shared, or used
                  for any purpose other than providing the app’s functionality.
                </div>
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
            <div>
              Developed by <span className="font-semibold text-slate-700">Cameron Reyniers [BETA]</span>
            </div>
            <div>© {new Date().getFullYear()} Cameron Reyniers. All rights reserved.</div>
          </div>
        </div>
      </div>
    );
  }

  // Logged out
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

  const drawerEmail = session?.user?.email || user?.email || "";

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Drawer
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        drawerGroup={drawerGroup}
        setDrawerGroup={setDrawerGroup}
        section={section}
        goStandbys={goStandbys}
        goUpcoming={goUpcoming}
        goHistory={goHistory}
        goCalendar={goCalendar}
        goSettings={goSettings}
        email={drawerEmail}
        overallPlus={overallPlus}
        overallMinus={overallMinus}
        userEmail={session?.user?.email || user?.email || ""}
        onAddStandby={() => openAddStandbyModal()}
        onGoOwed={() => goStandbys("owed")}
        onGoOwe={() => goStandbys("owe")}
      />

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-100">
        <div className="mx-auto max-w-xl px-4 py-3 flex items-center justify-between gap-2">
          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-m font-bold hover:bg-slate-50 active:scale-[0.99] transition"
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="text-2xl font-bold text-slate-900 tracking-tight truncate">{sectionTitle()}</div>

          <button
            ref={addBtnRef}
            type="button"
            onClick={() => openAddStandbyModal()}
            className="rounded-md bg-slate-900 text-white px-3 py-2 text-m font-bold hover:bg-slate-800 active:scale-[0.99] transition"
          >
             + 
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 pt-4 pb-10">
        {fetchError && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
            <span className="font-bold">Fetch error:</span> {fetchError}
          </div>
        )}

        {section === "settings" ? (
          renderSettings()
        ) : section === "calendar" ? (
          <CalendarView
            userId={user?.id}
            mode={calendarSubtab === "mine" ? "mine" : "shift"}
            homePlatoon={homePlatoon}
            onGoSettings={() => goSettings()}
            onSelectStandby={(row) =>
              openStandbyDetailById({
                id: row?.id,
                resetOverlays,
                setDrawerOpen,
                setSelectedStandby,
              })
            }
          />
        ) : (
          renderList()
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <ModalShell
          title="Add Standby"
          onClose={() => {
            setShowAddModal(false);
            setOppositeCandidates([]);
            setMismatchResolution("");
            pendingNewShiftNoteRef.current = "";
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

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs font-semibold text-slate-600">
                {shiftSummaryForDuty(form.shift_type, form.duty_platoon, form.shift_date)}
              </div>
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
                onChange={(e) => setForm((f) => ({ ...f, person_name: toTitleCaseLive(e.target.value) }))}
                onBlur={() => setForm((f) => ({ ...f, person_name: toTitleCase(f.person_name) }))}
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

            <TextAreaField
              label="Notes (optional)"
              value={form.notes}
              onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            />

            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={form.settle_existing}
                onChange={(e) =>
                  setForm((f) => ({ ...f, settle_existing: e.target.checked, settle_with_existing_id: null }))
                }
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

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={
                    loading ||
                    (form.settle_existing && !mismatchResolution) // must pick one option
                  }
                  className={`flex-1 rounded-md px-3 py-2.5 text-sm font-semibold transition active:scale-[0.99]
                    ${
                      loading || (form.settle_existing && !mismatchResolution)
                        ? "bg-slate-300 text-white cursor-not-allowed"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                >
                  {loading ? "Working…" : "Add"}
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
        <ModalShell title={toTitleCase(selectedStandby.person_name)} onClose={resetOverlays}>
          {!isEditing ? (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <div className="mt-2 text-md text-slate-700"> {(() => {
                    try {
                      return detailNarrative?.(selectedStandby, findPartnerShift) || "";
                    } catch (e) {
                      console.error("detailNarrative crashed:", e);
                      return "Could not render this standby detail. Check console.";
                    }
                  })()}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <StatusPill text={statusText(selectedStandby)} />
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
              <div>
                <label className="text-sm font-semibold text-slate-700">Name</label>
                <input
                  value={editForm.person_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, person_name: toTitleCaseLive(e.target.value) }))}
                  onBlur={() => setEditForm((f) => ({ ...f, person_name: toTitleCase(f.person_name) }))}
                  placeholder="Start typing…"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2"
                />
              </div>

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
                    <div className="font-semibold">
                      {isFuture(editForm.shift_date) ? "I will work for them" : "I worked for them"}
                    </div>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="edit_worked_for_me"
                      checked={editForm.worked_for_me === true}
                      onChange={() => setEditForm((f) => ({ ...f, worked_for_me: true }))}
                      className="mt-1"
                    />
                    <div className="font-semibold">
                      {isFuture(editForm.shift_date) ? "They will work for me" : "They worked for me"}
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4">
            {section === "history" && historySubtab === "deleted" ? (
              <div className="flex gap-2">
                <button
                  onClick={() => restoreStandby(selectedStandby.id)}
                  className="flex-1 rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 active:scale-[0.99] transition"
                  type="button"
                >
                  Restore
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

                {selectedStandby.settled && selectedStandby.settlement_group_id && !selectedStandby.deleted_at && (
                  <button
                    onClick={() => unsettleGroup(selectedStandby.settlement_group_id)}
                    className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
                    type="button"
                  >
                    Unsettle pair
                  </button>
                )}

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
                    <>
                      {selectedStandby.settled && selectedStandby.settlement_group_id ? (
                        <button
                          onClick={() => deleteSettlementGroup(selectedStandby.settlement_group_id)}
                          className="rounded-md bg-rose-600 text-white px-3 py-2.5 text-sm font-semibold hover:bg-rose-700 active:scale-[0.99] transition"
                          type="button"
                        >
                          Delete pair
                        </button>
                      ) : null}

                      <button
                        onClick={() => deleteStandby(selectedStandby.id)}
                        className="rounded-md border border-rose-200 bg-white text-rose-700 px-3 py-2.5 text-sm font-semibold hover:bg-rose-50 active:scale-[0.99] transition"
                        type="button"
                      >
                        Delete shift
                      </button>
                    </>
                  )}

              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={saveEdits}
                  className="flex-1 rounded-md bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 active:scale-[0.99] transition"
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

            {/* Onboarding / Tour */}
      <OnboardingModal
        open={onboardingOpen}
        stepIndex={stepIndex}
        targetEl={onboardingTargetEl}
        onNext={() => {
          const isLast = stepIndex === STEPS.length - 1;
          if (isLast) close();
          else next(STEPS.length);
        }}
        onBack={back}
        onClose={close}
      />

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
  // Local UI state (must be INSIDE component)
  const [showOtherReasonPrompt, setShowOtherReasonPrompt] = useState(false);
  const [otherReasonNote, setOtherReasonNote] = useState("");

  const other = oppositeCandidates.find((x) => x.id === form.settle_with_existing_id);
  const mismatch = other ? getNameMismatchInfo(form.person_name, other.person_name).mismatch : false;

  // Keep the "Other reason" prompt synced if parent mismatchResolution changes
  useEffect(() => {
    if (mismatchResolution !== "other") {
      setShowOtherReasonPrompt(false);
      setOtherReasonNote("");
    } else {
      setShowOtherReasonPrompt(true);
    }
  }, [mismatchResolution]);

  // If you need the note later when you submit, store it on the form so the parent can access it
  useEffect(() => {
    if (mismatchResolution === "other") {
      setForm((f) => ({ ...f, pending_other_reason_note: otherReasonNote }));
    } else {
      setForm((f) => ({ ...f, pending_other_reason_note: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherReasonNote, mismatchResolution]);

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
            setMismatchResolution(""); // reset choice when they pick a different shift
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
            Is it a <span className="font-semibold">typo</span>, a{" "}
            <span className="font-semibold">three way standby</span>, or another reason?
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setMismatchResolution("typo");
                setShowOtherReasonPrompt(false);
                setOtherReasonNote("");
              }}
              className={[
                "rounded-md px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                mismatchResolution === "typo"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white border-amber-200 text-amber-900",
              ].join(" ")}
            >
              Typo (same person)
            </button>

            <button
              type="button"
              onClick={() => {
                setMismatchResolution("threeway");
                setShowOtherReasonPrompt(false);
                setOtherReasonNote("");
              }}
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
              onClick={() => {
                setMismatchResolution("other");
                setShowOtherReasonPrompt(true);
              }}
              className={[
                "rounded-md px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                mismatchResolution === "other"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white border-amber-200 text-amber-900",
              ].join(" ")}
            >
              Other reason
            </button>
          </div>

          {mismatchResolution === "threeway" && (
            <div className="mt-2 text-xs text-amber-800">Adds “Three way standby” note to both shifts.</div>
          )}

          {showOtherReasonPrompt && mismatchResolution === "other" && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">Optional note</div>
              <div className="text-xs text-slate-600 mt-1">
                Add a quick note for why these names don’t match (optional).
              </div>

              <textarea
                value={otherReasonNote}
                onChange={(e) => setOtherReasonNote(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm"
                rows={3}
              />
            </div>
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
            className="flex-1 rounded-md bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 active:scale-[0.99] transition"
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

function ModalShell({ title, subtitle, children, onClose }) {
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
          e.preventDefault(); // prevents focus weirdness
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
            <div className="text-lg font-extrabold text-slate-900 truncate leading-tight">{title || ""}</div>
            {subtitle ? <div className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</div> : null}
          </div>

          <button
            onClick={requestClose}
            className="rounded-md px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.98] transition"
            type="button"
          >
            Done
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
