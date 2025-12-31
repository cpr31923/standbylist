import React from "react";

export default function FiltersBar({
  filtersOpen,
  setFiltersOpen,
  activeFilterCount,
  searchText,
  setSearchText,
  platoonFilter,
  setPlatoonFilter,
  platoonOptions,
  showSort,
  sortMode,
  setSortMode,
  defaultSort,
  resetFilters,
}) {
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
      </div>

      {filtersOpen && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
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

          <div>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            >
              Reset filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
