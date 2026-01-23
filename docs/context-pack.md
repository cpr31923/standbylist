# Shift IOU — Context Pack (paste into new Code chats)

## 1) What the app is
A React (Vite) + Tailwind + Supabase app for firefighters to track “Standbys (shift IOUs)”.
Users log events where either:
- I worked for someone (I owe them), or
- Someone worked for me (they owe me)
Goal: super fast entry + calm, obvious UI.

## 2) Non-negotiable UX rules
- Default view: **Owed to me** (they owe me).
- Two primary lists: **Owed to me** + **I owe** (can be tabs/segments).
- Main list should be simple and instantly clear:  
  - "Owed to me" list:
    -- Entries “<Name> → owes you <X> shifts” (tap to drill down).
  - "I owe" list:
    --Entries “You owe <Name> <X> shifts” (tap to drill down).
- Drill-down page shows all standbys for that person.
- Tapping a standby opens a detail popup/modal.
- Privacy reassurance should be obvious.

## 3) Data model (Supabase)
Table: `standby_events`
Columns assumed:
- id (uuid)
- user_id (uuid)
- person_name (text)
- platoon (text, nullable)
- duty_platoon (text, nullable)
- shift_date (date) // YYYY-MM-DD
- shift_type (text) // "Day" | "Night"
- worked_for_me (bool) // TRUE: I owe them. FALSE: they owe me.
- settled (bool)
- settled_at (timestamptz, nullable)
- created_at (timestamptz)

Core logic:
- **worked_for_me = true** → they worked for me → **I owe**
- **worked_for_me = false** → I worked for them → **owed to me**
- settled events usually hidden from active lists (unless viewing history)

## 4) Codebase map (important files only)
- src/components/StandbyList.jsx
  - main screen controller (fetch, filter, list rendering, open modals)
- src/components/CalendarView.jsx
  - calendar-style views for events (if used)
- src/components/standby/Drawer.jsx
  - nav drawer/menu
- src/components/standby/FiltersBar.jsx
  - filters/search/segments
- src/components/standby/ListRowCompact.jsx
  - list row UI (compact style)
- src/components/standby/data.js
  - Supabase fetch/insert/update helpers (e.g., fetchStandbyById)
- src/components/standby/helpers.js
  - formatting + name normalization + date helpers + grouping keys
- src/components/standby/narratives.js
  - string/copy builders for list rows + detail narrative
- src/components/standby/drawer/* (if split)
  - drawer-related components
- src/supabaseClient.js
  - supabase init

## 5) Navigation / screens (current intent)
Primary:
Standbys
- Owed to me (default)
- I owe
Upcoming standbys:
- I've agreed to (List of future dated standby shifts I have agreed to work for others)
- I've requested (List of future dated standby shifts I have requested (shifts off))
History:
- Settled (List of settled shift pairs. Displays as grouped pairs of shifts that settled eachother)
- Deleted (All shifts that have been deleted)
Calendar:
- My calendar (Shows calendar view with specified platoon pattern and any standby shift events overlaid)
- Shift Calendar (Calendar showing all shift patterns. No interaction occurs with this calendar, reference only.)
- Person detail screen (drill-down)
Settings (account details, sign out, starting point, re-run onboarding entry, set platoon for calendar view, privacy copy)

## 6) Known risk: name variants breaking grouping
Names may be entered inconsistently (first names, nicknames, casing).
Fix approach:
- A single canonical function creates a `person_key` from `person_name`
- Grouping and person detail routing use `person_key`
- Display name remains original / “best known”
Optional later: alias mapping UI.

## 7) What I want from ChatGPT for each code ticket
For every change request I will provide:
- Goal + acceptance criteria
- Repro steps (if bug)
- The exact file(s) in scope (pasted current versions)
- Desired output: “drop-in patch” or “full rewrite”

## 8) Recent changes
###  Fix Add Modal
Added auto duty-platoon calculation from roster based on shift date + type.
Reworked Add Standby modal UX (field order, clear radio logic, readable “C Platoon S/N” summary).
Replaced free-text platoon entry with a dropdown (A–D) to prevent inconsistencies.
Stabilised roster → modal wiring with caching and safe error handling.
###  Fix bundling row functionality
Standbys now show one row per person with a total count (instead of one per shift).
Added list-level sort on Standbys (most owed, name, platoon); removed sort from Filters there.
FiltersBar sort remains for Upcoming and History only.
Person rows drill into their outstanding shifts; shifts still open the Detail Modal.
Grouping is canonicalised by name and shows the person’s actual platoon (not duty platoon).
### Fix Settlement Functionality
Added guarded settlement flow with mismatch barrier (3-way / typo / other) before pairing shifts.
Implemented 3-way standby support (marker note + amber “3-way” pill on affected rows).
Made settlement idempotent (prevents duplicate 3-way markers and duplicate pills).
Improved settlement UX: existing vs new shift, deferred execution until confirmation, safe cancel paths.
Still to fix: “↺ Unsettle” button is rendering in the wrong place (still on individual detail modal, not on the paired card header in History → Settled).
### Add Edit Functionality
Edit standby flow added: Standbys can now be edited (name, platoon, date, type, direction, notes) via a dedicated edit-only modal layered over the detail view.
Cleaner UX separation: Settlement actions are hidden while editing; saving or cancelling returns the user to the standby detail modal.
Direction copy aligned: Edit modal now matches Add modal wording (“Who will work this shift?” with consistent tense), reducing ambiguity.
Auto duty-platoon recalculation: Duty platoon now recalculates live from shift date/type (async-safe) and persists on save.
Immediate UI updates: Edits propagate back to the controller so standbys regroup and move between Owed to me / I owe instantly without a full refetch.
### Fix Filter UI and logic
Unified filter placement: Filters button is now consistently top-right, aligned with the page title (both Standbys and Upcoming), removing left/right jumping between views.
Clean filter expansion: Filter fields open directly beneath the page title in a single horizontal row, keeping context and avoiding layout collisions with Back or list controls.
Drill-down clarity: In person drill-down views, Back lives on the left and Filters on the right, with filter fields rendered below—no duplicated buttons or wrapped layouts.
Upcoming view parity: Upcoming shifts now use the same header + filter pattern as Standbys, ensuring consistent interaction and visual rhythm across primary list screens.
Separation of concerns: FiltersBar now supports toggle-only vs panel-only rendering, enabling flexible placement without duplicating state or UI logic.
### Fixed Settled view, edit settled shifts
Refactored StandbyList.jsx to remove “handlers defined inside hooks” issues by wiring a single top-level handleUnsettleGroup (via useCallback) and passing it consistently to SettledPairsView, HistoryView, and StandbyDetailModal.
Fixed the root cause of onUnsettleGroup is not defined by moving unsettle logic out of useMemo(upcomingItems) and into a stable, reusable handler.
Cleaned up structure so list rendering paths are clearer and less fragile (section switching, filters/sort reset, modal open/close flows).
Normalised modal wiring so Add/Detail flows refresh reliably via refreshTick after unsettle/settle/edit actions.
Corrected/standardised imports (notably StandbyDetailModal casing/path) to avoid case-sensitive runtime breakage.
### Fixed Delete shift not working
Delete flow fixed end-to-end: Delete now correctly hits the DB via deleteStandbyCascade, refreshes state, and immediately removes the shift from active lists while appearing in History → Deleted.
History rendering corrected: Deleted tab no longer groups unrelated entries; each deleted standby renders as its own bordered card, and non-settled deleted rows are no longer hidden by settlement grouping logic.
Restore functionality wired: Restore Shift now clears deleted_at in the DB, refreshes controller state, and returns the standby to the correct active or settled list.
Controller responsibility clarified: Destructive actions (delete/restore) are now owned by StandbyList rather than modal fallbacks, ensuring predictable refresh and list consistency.
UX consistency improved: Delete/restore actions close the detail modal, keep the user on the same list, and reflect changes immediately without manual reloads.
### UX improvement to detail modal - settlement window
When the Settle shift panel is open (settleOpen === true), Edit and Delete actions are temporarily disabled and visually muted to prevent conflicting actions and mis-clicks; normal behaviour resumes immediately when the settlement panel is closed.
### Calendar view upgrades
My Calendar now overlays your personal pattern properly: each day cell is split into 3 fixed lanes (Date / Day lane / Night lane), with the date locked to the top and pills pinned to their correct lane.
Pills are now compact + cell-safe: full-width pills that shrink/truncate cleanly so nothing spills outside the grid, and short labels match the lane width for consistent visual weight.
SBYA handling improved: when an SBYA exists for a lane, the base roster pill is hidden in the calendar cell (instead of struck-through), while the Day Detail modal still shows the base shift struck-through for clarity.
Copy tightened for calendar readability: the long “SBY/SBYA (DS/NS)” style labels were reduced to shorter, more scannable chips to avoid overflow.
Wiring fix in progress/just addressed: calendar “Add Standby” was previously not opening the modal due to mismatched state (addOpen vs showAddModal). The fix is to route calendar adds into the same showAddModal flow and prefill shift_date.
### Standby list filter bug fix
Root cause fixed: StandbysView was rendering rows={standbys} (unfiltered) while the count used viewRows.length, so filters only changed the count, not the list.
Patch applied: StandbysView now receives rows={viewRows} so the displayed list matches the active filter/search state.
Stability guard added: Drill-down state now auto-resets if filters remove the selected person; inGroupDetail is based on selectedGroup to avoid “hidden header / stuck” UI.
No FiltersBar changes needed: filter toggle/panel logic was already working correctly.