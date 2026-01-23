# Shift IOU — Notes & Source of Truth

Last updated: (manually update date)

## Purpose of this file
This is the running “source of truth” for:
- what the app does,
- where key logic lives,
- current UX decisions,
- current build status,
so code changes don’t drift and we don’t lose context across ChatGPT chats.


## Product intent (plain English)
Track standby/shift IOUs quickly and clearly.

Two directions:
- **Owed to me**: someone worked for me (they owe me)
- **I owe**: I worked for someone (I owe them)

Primary goal: A new user can add a swap/standby in under 10 seconds.

## UX rules (non-negotiables)
- Default view: **Owed to me**
- Two simple primary lists (owed to me / i owe)
- Main list should read like a sentence:
  - “Jamie → owes you 2 shifts”
  - “Alex → you owe 1 shift”
- Tapping a person opens a **person detail** list of standbys
- Tapping a standby opens a **detail popup/modal**
- Keep screens calm and obvious (no “which way is this again?”)
- Privacy reassurance visible

Alpha exit criteria (definition of “done enough”):
- New user can add a swap in <10 seconds
- Main screen is calm and instantly clear
- No one asks “which way is this again?”
- Privacy reassurance is obvious

## Data model (Supabase)
### `standby_events`
Assumed columns:
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

Interpretation:
worked_for_me = true  => they worked for me  => I owe
worked_for_me = false => I worked for them  => owed to me
---
## Code map (where things live)
### Main screen / controller
- `src/components/StandbyList.jsx`
  - fetch events
  - decide which view/section is active
  - open add modal / open detail modal
  - list rendering and state glue

### UI components
- `src/components/standby/Drawer.jsx` — nav drawer
- `src/components/standby/FiltersBar.jsx` — filters/search/toggles
- `src/components/standby/ListRowCompact.jsx` — compact list rows
- `src/components/CalendarView.jsx` — calendar views (if used)

### Logic helpers
- `src/components/standby/helpers.js`
  - date helpers
  - formatting helpers
  - **canonical person key** (must live here or in a dedicated file)
- `src/components/standby/narratives.js`
  - sentence/copy builders for rows + detail narrative

### Data access
- `src/components/standby/data.js`
  - Supabase queries and helpers (fetch by id, inserts, updates)

### Supabase client
- `src/supabaseClient.js`

---

## Name normalization / grouping strategy
Problem: person_name may be entered inconsistently (case, spacing, nicknames).

Rule:
- Grouping and person drill-down must use a canonical `person_key`.
- Display can use `person_name` as entered (or “best known”).

Implementation idea:
- `person_key = normalize(person_name)`
  - lowercase
  - trim
  - collapse spaces
  - remove punctuation
Optional later:
- alias map (e.g., `jam` -> `jamie`)

---

## Current build status
(Keep this updated every time you land a change)

### Working
- [ ] …

### Broken / missing
- [ ] …

### Next 5 tasks (priority order)
0. [ ] Return to previously achieved full functionality
1. [ ] Group by person in main list (owed to me + i owe)
2. [ ] Person detail drill-down screen
3. [ ] Copy tweaks while touching screens
4. [ ] Onboarding + starting point
5. [ ] Settings entry for “Set your starting point”

---

## ChatGPT workflow rules (so we don’t regress)
When requesting changes:
- Provide goal + acceptance criteria
- Paste the current file(s) being modified
- Prefer small patches over full rewrites unless necessary
- Always update this notes file after meaningful changes


REMOVED COUNTER CODE
            <button
                type="button"
                onClick={onGoOwed}
                className={[
                  "text-xl font-extrabold hover:underline active:scale-[0.98] transition",
                  overallPlus > 0 ? "text-emerald-600" : "text-slate-400",
                ].join(" ")}
              >
                + {overallPlus}
              </button>
              <span className="text-slate-400 mx-2 text-2xl font-bold select-none">/</span>
              <button
                type="button"
                onClick={onGoOwe}
                className={[
                  "text-xl font-extrabold hover:underline active:scale-[0.98] transition",
                  overallMinus > 0 ? "text-rose-600" : "text-slate-400",
                ].join(" ")}
              >
                - {overallMinus}
              </button>