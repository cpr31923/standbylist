import React from "react";

export default function FiltersBar({
  // state
  filtersOpen,
  setFiltersOpen,

  // counts
  activeFilterCount,

  // fields
  searchText,
  setSearchText,
  platoonFilter,
  setPlatoonFilter,
  platoonOptions = [],

  // sort
  showSort,
  sortMode,
  setSortMode,

  // actions
  resetFilters,

  // rendering mode
  // "both" = toggle + panel (default)
  // "toggle" = toggle only
  // "panel" = panel only (only shows when filtersOpen)
  mode = "both",

  toggleLabelClosed = "Filters",
  toggleLabelOpen = "Hide filters",

  // ✅ change default: always render on the right
  toggleAlign = "right", // "left" | "right"

  toggleClassName = "",
  containerClassName = "mb-3",
}) {
  const toggleText = filtersOpen ? toggleLabelOpen : toggleLabelClosed;
  const countText = activeFilterCount > 0 ? ` (${activeFilterCount})` : "";

  const showToggle = mode === "both" || mode === "toggle";
  const showPanel = mode === "both" || mode === "panel";

  return (
    <div className={containerClassName}>
      {showToggle ? (
        <div
          className={`flex items-center ${
            toggleAlign === "right" ? "justify-end" : "justify-start"
          } gap-2`}
        >
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={
              "rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition " +
              toggleClassName
            }
          >
            {toggleText}
            {countText}
          </button>
        </div>
      ) : null}

      {showPanel && filtersOpen ? (
        <div className={showToggle ? "mt-2" : ""}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
  <input
    value={searchText}
    onChange={(e) => setSearchText(e.target.value)}
    placeholder="Search name or platoon…"
    className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm sm:flex-1 sm:min-w-[240px]"
  />

  <select
    value={platoonFilter}
    onChange={(e) => setPlatoonFilter(e.target.value)}
    className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm sm:w-[200px]"
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
      className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm sm:w-[200px]"
    >
      <option value="date_desc">Date (newest)</option>
      <option value="date_asc">Date (oldest)</option>
      <option value="name_az">Name (A–Z)</option>
      <option value="name_za">Name (Z–A)</option>
      <option value="platoon_az">Platoon (A–D)</option>
      <option value="platoon_za">Platoon (D–A)</option>
    </select>
  ) : null}

  <button
    type="button"
    onClick={resetFilters}
    className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition sm:w-auto sm:whitespace-nowrap"
  >
    Reset filters
  </button>
</div>
        </div>
      ) : null}
    </div>
  );
}
