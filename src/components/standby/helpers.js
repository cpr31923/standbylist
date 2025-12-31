export function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function isFuture(ymd) {
  if (!ymd) return true;
  return String(ymd) > todayYMD();
}

export function formatPlatoonLabel(platoon) {
  if (!platoon) return "-";
  const p = String(platoon).trim();
  return /platoon/i.test(p) ? p : `${p} Platoon`;
}

export function formatDisplayDate(ymd) {
  if (!ymd) return "-";
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function toTitleCase(s) {
  const raw = String(s || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  return raw
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export function toTitleCaseLive(input) {
  const raw = String(input || "").replace(/\s+/g, " ");
  if (!raw) return "";
  const endsWithSpace = /\s$/.test(input);
  const core = raw.trim();
  const titled = core
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
  return endsWithSpace ? `${titled} ` : titled;
}

export function makeUUID() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function shiftTypeShort(row) {
  const t = (row?.shift_type || "").trim();
  return t ? t : "";
}

export function firstName(full) {
  const s = String(full || "").trim();
  if (!s) return "—";
  return s.split(/\s+/)[0];
}

export async function openStandbyDetailById({ id, resetOverlays, setDrawerOpen, setSelectedStandby }) {
  if (!id) return;

  resetOverlays?.();
  setDrawerOpen?.(false);

  const { data, error } = await supabase
    .from("standby_events")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Open detail fetch error:", error);
    alert("Could not open shift detail. Check console.");
    return;
  }

  setSelectedStandby?.(data);
}
