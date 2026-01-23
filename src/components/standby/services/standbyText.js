export function sectionTitle(section) {
  if (section === "standbys") return "Standbys";
  if (section === "upcoming") return "Upcoming";
  if (section === "history") return "History";
  if (section === "calendar") return "Calendar";
  if (section === "settings") return "Settings";
  return "Shift IOU";
}

export function listTitle({ section, standbysSubtab, upcomingSubtab, historySubtab }) {
  if (section === "standbys")
    return standbysSubtab === "owed" ? "Standbys - Owed to me" : "Standbys - I owe";
  if (section === "upcoming")
    return upcomingSubtab === "i_work" ? "Upcoming - Standbys I've agreed to work" : "Upcoming - Standbys I've requested";
  return historySubtab === "settled" ? "History - Settled" : "History - Deleted";
}

export function totalLabel({ section, standbysSubtab, upcomingSubtab, historySubtab }) {
  if (section === "standbys" && standbysSubtab === "owed") return "Total owed to me:";
  if (section === "standbys" && standbysSubtab === "owe") return "Total I owe:";
  if (section === "upcoming" && upcomingSubtab === "they_work") return "Upcoming standbys I've requested:";
  if (section === "upcoming" && upcomingSubtab === "i_work") return "Upcoming standbys I’ve agreed to work:";
  if (section === "history" && historySubtab === "settled") return "Total settled:";
  return "Total deleted:";
}

export function emptyText({ section, standbysSubtab, upcomingSubtab, historySubtab }) {
  if (section === "standbys" && standbysSubtab === "owed") return "Nothing owed to you right now.";
  if (section === "standbys" && standbysSubtab === "owe") return "ou don’t owe anyone right now.";
  if (section === "upcoming" && upcomingSubtab === "i_work") return "No upcoming standbys you've agreed to.";
  if (section === "upcoming" && upcomingSubtab === "they_work") return "No upcoming standbys you've requested off.";
  if (section === "history" && historySubtab === "settled") return "Settled standbys will appear here.";
  return "Deleted standbys will appear here.";
}
