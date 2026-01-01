// src/components/standby/Drawer.jsx
import React from "react";

export default function Drawer({
  drawerOpen,
  setDrawerOpen,

  drawerGroup,
  setDrawerGroup,

  section,

  goStandbys,
  goUpcoming,
  goHistory,
  goCalendar,
  goSettings,

  onAddStandby,

  overallPlus = 0,
  overallMinus = 0,
  onGoOwed,
  onGoOwe,
  email = "",
}) {
  return (
    <>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/25"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        className={[
          "fixed top-0 left-0 z-40 h-full w-80 bg-white border-r border-slate-200",
          "transform transition-transform duration-200",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-200">
          <div className="text-[24pt] font-extrabold text-slate-900 leading-tight">
            Shift IOU
          </div>
          <div className="text-[16pt] font-light text-slate-400 leading-tight">
             [BETA]
          </div>

          {email ? (
            <div className="mt-1 text-s text-bold text-slate-600 truncate">{email}</div>
          ) : (
            <div className="mt-1 text-s text-bold text-slate-500"> </div>
          )}

          <div className="mt-3">
            <div className="text-xs tracking-wide text-slate-500">
              Overall standby position:
            </div>

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

          </div>
        </div>

        {/* Menu */}
        
        <nav className="p-3 space-y-2">

            <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onAddStandby?.();
                }}
                className="mt-4 w-full rounded-md bg-slate-900 text-white px-3 py-2 text-s font-medium hover:bg-slate-800 active:scale-[0.99] transition"
                title="Add standby"
              >
                + Add Standby
              </button>
              
          <GroupButton
            label="Standbys"
            active={drawerGroup === "standbys" || section === "standbys"}
            onClick={() =>
              setDrawerGroup((g) => (g === "standbys" ? "" : "standbys"))
            }
          />
          {drawerGroup === "standbys" && (
            <div className="ml-2 border-l border-slate-100 pl-3 space-y-1">
              <DrawerButton
                label="Owed to me"
                onClick={() => goStandbys("owed")}
              />
              <DrawerButton label="I owe" onClick={() => goStandbys("owe")} />
            </div>
          )}

          <GroupButton
            label="Upcoming"
            active={drawerGroup === "upcoming" || section === "upcoming"}
            onClick={() =>
              setDrawerGroup((g) => (g === "upcoming" ? "" : "upcoming"))
            }
          />
          {drawerGroup === "upcoming" && (
            <div className="ml-2 border-l border-slate-100 pl-3 space-y-1">
              <DrawerButton
                label="I’ve agreed to"
                onClick={() => goUpcoming("i_work")}
              />
              <DrawerButton
                label="I’ve requested"
                onClick={() => goUpcoming("they_work")}
              />
            </div>
          )}

          <GroupButton
            label="History"
            active={drawerGroup === "history" || section === "history"}
            onClick={() =>
              setDrawerGroup((g) => (g === "history" ? "" : "history"))
            }
          />
          {drawerGroup === "history" && (
            <div className="ml-2 border-l border-slate-100 pl-3 space-y-1">
              <DrawerButton
                label="Settled"
                onClick={() => goHistory("settled")}
              />
              <DrawerButton
                label="Deleted"
                onClick={() => goHistory("deleted")}
              />
            </div>
          )}

          <GroupButton
            label="Calendar"
            active={drawerGroup === "calendar" || section === "calendar"}
            onClick={() =>
              setDrawerGroup((g) => (g === "calendar" ? "" : "calendar"))
            }
          />
          {drawerGroup === "calendar" && (
            <div className="ml-2 border-l border-slate-100 pl-3 space-y-1">
              <DrawerButton
                label="Shift calendar"
                onClick={() => goCalendar("shift")}
              />
              <DrawerButton
                label="My calendar"
                onClick={() => goCalendar("mine")}
              />
            </div>
          )}

          <div className="h-2" />

          <DrawerButton label="Settings and About" onClick={() => goSettings()} />
        </nav>
      </aside>
    </>
  );
}

function DrawerButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-2 rounded-md text-base font-medium transition",
        active
          ? "bg-slate-100 text-slate-900"
          : "text-slate-700 hover:bg-slate-50",
      ].join(" ")}
      type="button"
    >
      {label}
    </button>
  );
}

function GroupButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-1.5 rounded-md text-base font-bold transition leading-tight",
        active
          ? "bg-slate-50 text-slate-900"
          : "text-slate-800 hover:bg-slate-50",
      ].join(" ")}
      type="button"
    >
      {label}
    </button>
  );
}
