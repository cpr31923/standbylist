// src/components/StandbyList.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

import CalendarView from "./CalendarView";
import OnboardingModal, { STEPS } from "./OnboardingModal";
import Drawer from "./standby/drawer";
import FiltersBar from "./standby/FiltersBar";
import ModalShell from "./standby/ui/ModalShell";

import {
  sectionTitle,
  listTitle,
  totalLabel,
  emptyText,
} from "./standby/services/standbyText";
import { rowSentence, upcomingRowSentence } from "./standby/services/sentences";
import {
  settleTwoStandbys,
  unsettleGroup,
  deleteStandbyCascade,
  restoreStandby,
} from "./standby/services/settlements";

import { useOnboarding } from "../hooks/useOnboarding";
import { useAuthSession } from "./standby/hooks/useAuthSession";
import { useHomePlatoon } from "./standby/hooks/useHomePlatoon";
import { useStandbysQuery } from "./standby/hooks/useStandbysQuery";
import { useOverallCounts } from "./standby/hooks/useOverallCounts";
import { useBundleOptions } from "./standby/hooks/useBundleOptions";
import { useNameSuggestions } from "./standby/hooks/useNameSuggestions";
import { useOppositeCandidates } from "./standby/hooks/useOppositeCandidates";
import { useScrollLock } from "./standby/hooks/useScrollLock";
import { usePreventHorizontalScroll } from "./standby/hooks/usePreventHorizontalScroll";
import { useDrawerAutoCollapse } from "./standby/hooks/useDrawerAutoCollapse";

import AddStandbyModal from "./standby/modals/AddStandbyModal";

// NOTE: keep this import path EXACTLY as your filesystem uses.
import StandbyDetailModal from "./standby/modals/StandbyDetailModal";

import UpcomingView from "./standby/views/UpcomingView";
import StandbysView from "./standby/views/StandbysView";
import HistoryView from "./standby/views/HistoryView";
import SettingsView from "./standby/views/SettingsView";
import SettledPairsView from "./standby/views/SettledPairsViews";

import { normalizeName, toTitleCase } from "./standby/helpers";

export default function StandbyList() {
  // Auth + user
  const { user, session } = useAuthSession();
  const userId = user?.id || null;

  // Home platoon
  const { homePlatoon, saveHomePlatoon } = useHomePlatoon();

  // --- Navigation state
  const [section, setSection] = useState("standbys"); // standbys | upcoming | history | calendar | settings
  const [standbysSubtab, setStandbysSubtab] = useState("owed"); // owed | owe
  const [upcomingSubtab, setUpcomingSubtab] = useState("i_work"); // i_work | they_work
  const [historySubtab, setHistorySubtab] = useState("settled"); // settled | deleted
  const [calendarSubtab, setCalendarSubtab] = useState("shift"); // shift | mine

  // --- Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerGroup, setDrawerGroup] = useState("");

  // --- Filters state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const defaultSort = section === "upcoming" ? "date_asc" : "date_desc";
  const [sortMode, setSortMode] = useState(defaultSort);
  const [platoonFilter, setPlatoonFilter] = useState("");

  // --- Overlays
  const [selectedStandby, setSelectedStandby] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Used when creating a “new shift to settle against” from Detail modal
  const [addSettleTarget, setAddSettleTarget] = useState(null); // { id, label }

  // Calendar → Add Standby prefill (shift_date)
  const [addPrefill, setAddPrefill] = useState(null); // { shift_date: "YYYY-MM-DD" } | null

  // --- Refresh tick
  const [refreshTick, setRefreshTick] = useState(0);

  // Prevent horizontal scroll, lock background when modals open, etc.
  usePreventHorizontalScroll(true);
  useDrawerAutoCollapse(drawerOpen, setDrawerGroup);
  useScrollLock(showAddModal || Boolean(selectedStandby) || drawerOpen);

  // Keep sort/filter state in sync when switching section
  useEffect(() => {
    setSortMode(section === "upcoming" ? "date_asc" : "date_desc");
    setSearchText("");
    setPlatoonFilter("");
    setFiltersOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // --- Onboarding (MUST be top-level)
  const {
    open: onboardingOpen,
    stepIndex,
    next,
    back,
    close,
    reset: resetOnboarding,
  } = useOnboarding(userId);

  // Onboarding spotlight targets
  const menuBtnRef = useRef(null);
  const addBtnRef = useRef(null);

  // Map onboarding step -> target element
  const onboardingTargetEl = useMemo(() => {
    // Adjust if your STEPS mapping differs
    if (stepIndex === 0) return menuBtnRef.current;
    if (stepIndex === 1) return addBtnRef.current;
    return null;
  }, [stepIndex]);

  // --- Add form state (for AddStandbyModal)
  const [form, setForm] = useState({
    worked_for_me: false,
    person_name: "",
    platoon: "",
    duty_platoon: "",
    shift_date: "",
    shift_type: "Day",
    notes: "",

    // settlement (optional)
    settle_existing: false,
    settle_target_oldest_id: "",
    settle_with_standby_id: null,
    settle_confirmed: false,
    settle_three_way: false,

    // grouping (bundles)
    group_enabled: false,
    group_choice: "", // "new" | "existing" | ""
    group_new_label: "",
    group_existing_id: "",
  });

  // --- Data
  const { standbys, loading, fetchError } = useStandbysQuery({
    userId,
    section,
    standbysSubtab,
    upcomingSubtab,
    historySubtab,
    refreshTick,
  });

  const { overallPlus, overallMinus } = useOverallCounts({
    userId,
    refreshTick,
  });

  const { bundleOptions, fetchBundleOptions } = useBundleOptions({
    userId,
    enabled: showAddModal,
    refreshTick,
  });
  const safeBundleOptions = Array.isArray(bundleOptions) ? bundleOptions : [];

  const { nameSuggestions, fetchNameSuggestions } = useNameSuggestions({
    userId,
  });
  const safeNameSuggestions = Array.isArray(nameSuggestions) ? nameSuggestions : [];

  // Kept for parity — modal hooks may rely on it elsewhere.
  useOppositeCandidates({ userId });

  // --- Derived titles/copy
  const titles = useMemo(() => {
    return {
      sectionTitle: sectionTitle(section),
      listTitle: listTitle({ section, standbysSubtab, upcomingSubtab, historySubtab }),
      totalLabel: totalLabel({ section, standbysSubtab, upcomingSubtab, historySubtab }),
      emptyText: emptyText({ section, standbysSubtab, upcomingSubtab, historySubtab }),
    };
  }, [section, standbysSubtab, upcomingSubtab, historySubtab]);

  // --- Platoon filter options (from loaded rows)
  const platoonOptions = useMemo(() => {
    const set = new Set();
    for (const r of standbys || []) {
      const p = String(r?.platoon || "").trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [standbys]);

  // --- Filter + sort rows for views
  const viewRows = useMemo(() => {
    const q = normalizeName(searchText);
    const pf = String(platoonFilter || "").trim();

    let rows = [...(standbys || [])];

    if (q) {
      rows = rows.filter((r) => {
        const a = normalizeName(r?.person_name);
        const b = normalizeName(r?.platoon);
        return a.includes(q) || b.includes(q);
      });
    }

    if (pf) {
      rows = rows.filter((r) => String(r?.platoon || "").trim() === pf);
    }

    const cmpDate = (a, b) =>
      String(a?.shift_date || "").localeCompare(String(b?.shift_date || ""));
    const cmpName = (a, b) =>
      normalizeName(a?.person_name).localeCompare(normalizeName(b?.person_name));
    const cmpPlatoon = (a, b) =>
      String(a?.platoon || "").trim().localeCompare(String(b?.platoon || "").trim());

    if (sortMode === "date_desc") rows.sort((a, b) => cmpDate(b, a));
    if (sortMode === "date_asc") rows.sort((a, b) => cmpDate(a, b));
    if (sortMode === "name_az") rows.sort((a, b) => cmpName(a, b));
    if (sortMode === "name_za") rows.sort((a, b) => cmpName(b, a));
    if (sortMode === "platoon_az") rows.sort((a, b) => cmpPlatoon(a, b));
    if (sortMode === "platoon_za") rows.sort((a, b) => cmpPlatoon(b, a));

    return rows;
  }, [standbys, searchText, platoonFilter, sortMode]);

  // --- Active filter count
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (String(searchText || "").trim()) n++;
    if (String(platoonFilter || "").trim()) n++;
    if (sortMode !== defaultSort) n++;
    return n;
  }, [searchText, platoonFilter, sortMode, defaultSort]);

  function renderFiltersBar(overrides = {}) {
    if (section === "calendar" || section === "settings") return null;

    return (
      <FiltersBar
        {...overrides}
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
        activeFilterCount={activeFilterCount}
        searchText={searchText}
        setSearchText={setSearchText}
        platoonFilter={platoonFilter}
        setPlatoonFilter={setPlatoonFilter}
        platoonOptions={platoonOptions}
        showSort={false}
        sortMode={sortMode}
        setSortMode={setSortMode}
        defaultSort={defaultSort}
        resetFilters={() => {
          setSearchText("");
          setPlatoonFilter("");
          setSortMode(defaultSort);
        }}
      />
    );
  }

  // --- Stable handlers (NO hooks inside)
  const noop = useCallback(() => {}, []);

  const handleChangePassword = useCallback(async () => {
    const email = user?.email;
    if (!email) {
      alert("No email on this account.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      console.error(error);
      alert("Could not send password reset email.");
      return;
    }
    alert("Password reset email sent. Check your inbox.");
  }, [user?.email]);

  const handleSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error(error);
      alert("Sign out failed.");
    }
  }, []);

  const handleResetTour = useCallback(() => {
    resetOnboarding();
  }, [resetOnboarding]);

  const handleSendFeedback = useCallback(() => {
    const subject = encodeURIComponent("Shift IOU feedback");
    const body = encodeURIComponent(
      `Quick feedback:\n\n(What happened / what you'd like changed)\n\n---\nApp: Shift IOU\nUser: ${user?.email || "—"}\n`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, [user?.email]);

  // --- Bundle/group helpers
  function makeBundleId() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch {}
    return `b_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function findBundleLabelById(bundleId) {
    const id = String(bundleId || "").trim();
    if (!id) return "";
    const hit = (safeBundleOptions || []).find(
      (x) => String(x?.bundle_id || x?.id || "").trim() === id
    );
    return String(hit?.bundle_label || hit?.label || "").trim();
  }

  function openAddStandbyModal(defaults = {}) {
    const prefillDate = defaults?.shift_date || addPrefill?.shift_date || "";

    setForm((prev) => ({
      ...(prev || {}),
      worked_for_me: defaults.worked_for_me ?? false,
      person_name: defaults.person_name ?? "",
      platoon: defaults.platoon ?? "",
      duty_platoon: "",
      shift_date: prefillDate ?? "",
      shift_type: defaults.shift_type ?? "Day",
      notes: "",

      // settlement
      settle_existing: false,
      settle_target_oldest_id: "",
      settle_with_standby_id: null,
      settle_confirmed: false,
      settle_three_way: false,

      // grouping (bundles)
      group_enabled: false,
      group_choice: "",
      group_new_label: "",
      group_existing_id: "",
    }));

    try {
      fetchNameSuggestions?.();
      fetchBundleOptions?.();
    } catch {}

    setShowAddModal(true);
  }

  const openDetail = useCallback((row) => {
    if (!row?.id) return;
    setDrawerOpen(false);
    setShowAddModal(false);
    setSelectedStandby(row);
  }, []);

  // --- Duty platoon lookup for Add modal
  const dutyPlatoonCacheRef = useRef(new Map());

  const getDutyPlatoonForShift = useCallback(async (ymd, shiftType) => {
    if (!ymd || !shiftType) return "";

    const typeKey = String(shiftType).toLowerCase();
    const key = `${ymd}|${typeKey}`;

    if (dutyPlatoonCacheRef.current.has(key)) {
      return dutyPlatoonCacheRef.current.get(key) || "";
    }

    try {
      const { data, error } = await supabase.rpc("get_roster_code_range", {
        p_start: ymd,
        p_end: ymd,
      });

      if (error) {
        console.error("Roster RPC error (modal platoon):", error);
        dutyPlatoonCacheRef.current.set(key, "");
        return "";
      }

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        dutyPlatoonCacheRef.current.set(key, "");
        return "";
      }

      const isNight =
        typeKey === "night" || typeKey === "n" || typeKey.startsWith("night");

      const platoonRaw = isNight ? row.night_platoon : row.day_platoon;
      const platoon = platoonRaw ? String(platoonRaw).toUpperCase().trim() : "";

      dutyPlatoonCacheRef.current.set(key, platoon);
      return platoon;
    } catch (e) {
      console.error("Roster lookup crashed (modal platoon):", e);
      dutyPlatoonCacheRef.current.set(key, "");
      return "";
    }
  }, []);

  // --- Submit Add shift
  const submitAddShift = useCallback(
    async (e) => {
      e.preventDefault();
      if (!userId) return;

      const payload = {
        user_id: userId,
        person_name: toTitleCase(String(form.person_name || "").trim()),
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
        bundle_id: null,
        bundle_label: null,
      };

      // grouping (bundles) — only for "They worked for me"
      const groupingAllowed = payload.worked_for_me === true;

      if (groupingAllowed && form?.group_enabled) {
        const choice = String(form?.group_choice || "").trim();

        if (choice === "existing") {
          const existingId = String(form?.group_existing_id || "").trim();
          if (existingId) {
            payload.bundle_id = existingId;
            payload.bundle_label = findBundleLabelById(existingId) || null;
          }
        }

        if (choice === "new") {
          const label = String(form?.group_new_label || "").trim();
          if (label) {
            payload.bundle_id = makeBundleId();
            payload.bundle_label = label;
          }
        }
      }

      if (!payload.person_name) return alert("Please enter a name.");
      if (!payload.shift_date) return alert("Please select a date.");
      if (!payload.shift_type) return alert("Please select Day or Night.");

      const { data: created, error } = await supabase
        .from("standby_events")
        .insert([payload])
        .select("id")
        .single();

      if (error) {
        console.error("Insert error:", error);
        alert("Could not add standby. Check console.");
        return;
      }

      const newId = created?.id;

      // Settlement (optional)
      const targetFromDetail = form?.settle_with_standby_id;
      const targetFromDropdown = form?.settle_target_oldest_id;
      const shouldSettleExisting = !!form?.settle_existing;

      let targetId = null;
      if (targetFromDetail) targetId = targetFromDetail;
      else if (shouldSettleExisting && targetFromDropdown) targetId = targetFromDropdown;

      if (targetId && newId) {
        const res = await settleTwoStandbys(newId, targetId, {
          threeWay: !!form?.settle_three_way,
        });
        if (!res?.ok) alert("Could not settle. Check console.");
      }

      setForm((prev) => ({
        ...(prev || {}),
        settle_existing: false,
        settle_target_oldest_id: "",
        settle_with_standby_id: null,
        settle_confirmed: false,
        settle_three_way: false,
      }));

      setShowAddModal(false);
      setAddPrefill(null);
      setRefreshTick((t) => t + 1);
    },
    [userId, form, findBundleLabelById]
  );

  // --- ONE canonical unsettle handler (used everywhere)
  const handleUnsettleGroup = useCallback(
    async (gid) => {
      const res = await unsettleGroup(gid);
      if (res?.cancelled) return;
      if (!res?.ok) {
        alert("Could not unsettle. Check console.");
        return;
      }
      setRefreshTick((t) => t + 1);
    },
    [setRefreshTick]
  );

  // --- Upcoming items: group by bundle_id
  const upcomingItems = useMemo(() => {
    if (section !== "upcoming") return [];

    const rows = [...viewRows];
    const bundles = new Map();
    const singles = [];

    for (const r of rows) {
      const bid = r?.bundle_id || null;
      if (bid) {
        if (!bundles.has(bid)) {
          bundles.set(bid, {
            type: "bundle",
            bundle_id: bid,
            bundle_label: r?.bundle_label || "Shift group",
            rows: [],
          });
        }
        bundles.get(bid).rows.push(r);
      } else {
        singles.push({ type: "single", row: r });
      }
    }

    const bundleItems = Array.from(bundles.values()).map((g) => {
      const sortedRows = [...g.rows].sort((a, b) => {
        const A = String(a?.shift_date || "");
        const B = String(b?.shift_date || "");
        if (sortMode === "date_desc") return B.localeCompare(A);
        return A.localeCompare(B);
      });

      return {
        ...g,
        rows: sortedRows,
        keyDate: sortedRows[0]?.shift_date || "",
      };
    });

    const singleItems = singles.map((x) => ({
      ...x,
      keyDate: x.row?.shift_date || "",
    }));

    const items = [...bundleItems, ...singleItems];
    items.sort((a, b) => {
      const A = String(a.keyDate || "");
      const B = String(b.keyDate || "");
      if (sortMode === "date_desc") return B.localeCompare(A);
      return A.localeCompare(B);
    });

    return items;
  }, [section, viewRows, sortMode]);

  // --- History settled: bundle grouping (optional for HistoryView)
  const historyBundleGroups = useMemo(() => {
    if (!(section === "history" && historySubtab === "settled")) return null;

    const rows = [...(standbys || [])];
    const bundles = new Map();
    const singles = [];

    for (const r of rows) {
      if (r.bundle_id) {
        if (!bundles.has(r.bundle_id)) {
          bundles.set(r.bundle_id, {
            bundle_id: r.bundle_id,
            bundle_label: r.bundle_label || "Shift run",
            rows: [],
          });
        }
        bundles.get(r.bundle_id).rows.push(r);
      } else {
        singles.push(r);
      }
    }

    const bundleArr = Array.from(bundles.values()).map((g) => ({
      ...g,
      rows: g.rows.sort((a, b) =>
        String(b.shift_date || "").localeCompare(String(a.shift_date || ""))
      ),
    }));

    bundleArr.sort((a, b) => {
      const ad = a.rows[0]?.shift_date || "";
      const bd = b.rows[0]?.shift_date || "";
      return String(bd).localeCompare(String(ad));
    });

    return { bundleArr, singles };
  }, [section, historySubtab, standbys]);

  // --- Logged out UI (safe: hooks already ran)
  if (!userId) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-700 font-semibold">You’re not logged in.</div>
          <div className="mt-2 text-sm text-slate-600">
            Go to your login screen, sign in, then come back.
          </div>
        </div>
      </div>
    );
  }

  const drawerEmail = session?.user?.email || user?.email || "";

  return (
    <div className="h-screen bg-white overflow-hidden flex flex-col">
      <Drawer
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        drawerGroup={drawerGroup}
        setDrawerGroup={setDrawerGroup}
        section={section}
        goStandbys={(which) => {
          setSection("standbys");
          setStandbysSubtab(which);
          setDrawerOpen(false);
        }}
        goUpcoming={(which) => {
          setSection("upcoming");
          setUpcomingSubtab(which);
          setDrawerOpen(false);
        }}
        goHistory={(which) => {
          setSection("history");
          setHistorySubtab(which);
          setDrawerOpen(false);
        }}
        goCalendar={(which) => {
          setSection("calendar");
          setCalendarSubtab(which);
          setDrawerOpen(false);
        }}
        goSettings={() => {
          setSection("settings");
          setDrawerOpen(false);
        }}
        email={drawerEmail}
        overallPlus={overallPlus}
        overallMinus={overallMinus}
        userEmail={drawerEmail}
        onAddStandby={() => {
          setAddPrefill(null);
          openAddStandbyModal();
        }}
        onGoOwed={() => {
          setSection("standbys");
          setStandbysSubtab("owed");
          setDrawerOpen(false);
        }}
        onGoOwe={() => {
          setSection("standbys");
          setStandbysSubtab("owe");
          setDrawerOpen(false);
        }}
      />

      {/* Top bar */}
      <div className="shrink-0 bg-white border-b border-slate-100">
        <div className="mx-auto max-w-xl px-4 py-3 flex items-center justify-between gap-2 relative">
          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-m font-bold hover:bg-slate-50 active:scale-[0.99] transition"
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="absolute left-1/2 -translate-x-1/2 max-w-[60%] text-center">
            <div className="text-2xl font-bold text-slate-900 tracking-tight truncate">
              {titles.sectionTitle}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-m font-bold hover:bg-slate-50 active:scale-[0.99] transition"
              aria-label="Refresh"
              title="Refresh"
            >
              ↻
            </button>

            <button
              ref={addBtnRef}
              type="button"
              onClick={() => {
                setAddPrefill(null);
                openAddStandbyModal();
              }}
              className="rounded-md bg-slate-900 text-white px-3 py-2 text-m font-bold hover:bg-slate-800 active:scale-[0.99] transition"
              aria-label="Add standby"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-xl w-full px-4 pt-4 pb-10">
          {fetchError ? (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
              <span className="font-bold">Fetch error:</span> {fetchError}
            </div>
          ) : null}

          {loading ? (
            <div className="p-4 text-center text-slate-600 font-semibold">
              Just a moment...
            </div>
          ) : section === "calendar" ? (
            <CalendarView
              userId={userId}
              mode={calendarSubtab === "mine" ? "mine" : "shift"}
              homePlatoon={homePlatoon}
              onGoSettings={() => setSection("settings")}
              onSelectStandby={(row) => openDetail(row)}
              onAddStandby={({ shift_date }) => {
                setAddPrefill({ shift_date });
                openAddStandbyModal({ shift_date });
              }}
            />
          ) : section === "settings" ? (
            <SettingsView
              email={user?.email}
              homePlatoon={homePlatoon}
              saveHomePlatoon={saveHomePlatoon}
              onSignOut={handleSignOut}
              onChangePassword={handleChangePassword}
              onResetTour={handleResetTour}
              onSendFeedback={handleSendFeedback || noop}
            />
          ) : section === "upcoming" ? (
            <UpcomingView
              title={titles.listTitle}
              totalLabel={titles.totalLabel}
              count={viewRows.length}
              emptyText={titles.emptyText}
              renderFiltersBar={renderFiltersBar}
              upcomingItems={upcomingItems}
              onRenameBundle={() => {}}
              onOpenDetail={(row) => openDetail(row)}
              listRowSentence={(row) => upcomingRowSentence(row, standbys)}
            />
          ) : section === "history" && historySubtab === "settled" ? (
            <SettledPairsView
              title={titles.listTitle}
              rows={viewRows}
              emptyText={titles.emptyText}
              onOpenDetail={(row) => openDetail(row)}
              onUnsettleGroup={handleUnsettleGroup}
              enableSettlementGrouping={true}
            />
          ) : section === "history" ? (
            <HistoryView
              title={titles.listTitle}
              totalLabel={titles.totalLabel}
              count={(standbys || []).length}
              emptyText={titles.emptyText}
              renderFiltersBar={renderFiltersBar}
              historyBundleGroups={historyBundleGroups}
              rows={viewRows}
              onRenameBundle={() => {}}
              listRowSentence={(row) => rowSentence(row, standbys)}
              onOpenDetail={(row) => openDetail(row)}
              onUnsettleGroup={handleUnsettleGroup}
              enableSettlementGrouping={historySubtab === "settled"}
            />
          ) : (
              <StandbysView
                title={titles.listTitle}
                totalLabel={titles.totalLabel}
                count={viewRows.length}
                emptyText={titles.emptyText}
                renderFiltersBar={renderFiltersBar}
                rows={viewRows}
                groupMode={standbysSubtab === "owe" ? "owe" : "owed"}
                listRowSentence={(row) => rowSentence(row, standbys)}
                onOpenDetail={(row) => openDetail(row)}
              />
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <ModalShell
          title="Add Standby"
          onClose={() => {
            setShowAddModal(false);
            setAddSettleTarget(null);
            setAddPrefill(null);
          }}
        >
          <AddStandbyModal
            userId={userId}
            form={form}
            setForm={setForm}
            onSubmit={submitAddShift}
            onClose={() => {
              setShowAddModal(false);
              setAddSettleTarget(null);
              setAddPrefill(null);
            }}
            nameSuggestions={safeNameSuggestions}
            bundleOptions={safeBundleOptions}
            computeDutyPlatoon={getDutyPlatoonForShift}
            settleWithStandbyId={addSettleTarget?.id || null}
            settleWithPersonLabel={addSettleTarget?.label || ""}
          />
        </ModalShell>
      )}

      {/* Detail Modal */}
      {selectedStandby && (
        <ModalShell
          title={selectedStandby?.person_name || ""}
          onClose={() => setSelectedStandby(null)}
        >
          <StandbyDetailModal
            userId={userId}
            standby={selectedStandby}
            standbys={standbys}
            onClose={() => setSelectedStandby(null)}
            computeDutyPlatoon={getDutyPlatoonForShift}
            bundleOptions={safeBundleOptions}
            onUpdated={(updatedRow) => {
              setSelectedStandby(updatedRow || null);
              setRefreshTick((t) => t + 1);
            }}
            onDelete={async (id) => {
              const res = await deleteStandbyCascade(id);
              if (!res?.ok) {
                alert("Could not delete shift. Check console.");
                return;
              }
              setSelectedStandby(null);
              setRefreshTick((t) => t + 1);
            }}
            onRestore={async (id) => {
              const res = await restoreStandby(id);
              if (!res?.ok) {
                alert("Could not restore shift. Check console.");
                return;
              }
              setSelectedStandby(null);
              setRefreshTick((t) => t + 1);
            }}
            onUnsettleGroup={handleUnsettleGroup}
            onSettleExistingPair={async (idA, idB, options = {}) => {
              const res = await settleTwoStandbys(idA, idB, options);
              if (!res?.ok) {
                alert("Could not settle. Check console.");
                return;
              }
              setSelectedStandby(null);
              setRefreshTick((t) => t + 1);
            }}
            onCreateNewToSettle={(s) => {
              setSelectedStandby(null);

              setForm((prev) => {
                const next = { ...(prev || {}) };

                next.shift_date = prev?.shift_date || s.shift_date || null;
                next.shift_type = prev?.shift_type || s.shift_type || "Day";

                next.settle_with_standby_id = s.id;
                next.settle_confirmed = false;

                next.settle_with_person_name = s.person_name || "";
                next.settle_with_worked_for_me = !!s.worked_for_me;

                next.person_name = s.person_name || "";
                next.worked_for_me = !s.worked_for_me;

                next.settle_three_way = false;

                return next;
              });

              setAddSettleTarget({ id: s.id, label: s.person_name || "" });
              setShowAddModal(true);
            }}
          />
        </ModalShell>
      )}

      {/* Tour */}
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
