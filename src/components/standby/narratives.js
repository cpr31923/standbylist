import { isFuture, formatDisplayDate, formatPlatoonLabel } from "./helpers";

function nameWithPlatoon(s) {
  const name = String(s?.person_name || "—").trim() || "—";
  const p = formatPlatoonLabel(s?.platoon);
  return `${name} (${p})`;
}

function dutyPlatoonLabel(s) {
  // prefer duty_platoon; fallback to platoon if missing
  return formatPlatoonLabel(s?.duty_platoon || s?.platoon);
}

export function detailNarrative(s, findPartnerShift) {
  if (!s) return "";

  const future = isFuture(s.shift_date);
  const date = formatDisplayDate(s.shift_date);
  const dutyPlatoon = dutyPlatoonLabel(s);
  const stPart = s.shift_type ? ` ${s.shift_type}` : "";
  const who = nameWithPlatoon(s);

  // -----------------------------
  // Settled pair logic
  // -----------------------------
  if (s?.settled && s?.settlement_group_id) {
    const other = findPartnerShift?.(s);

    if (other) {
      const myDate = String(s.shift_date || "");
      const otherDate = String(other.shift_date || "");

      // later shift (or tie-breaker by id) is the "settling shift"
      const isSettlingShift =
        myDate > otherDate || (myDate === otherDate && String(s.id) > String(other.id));

      // 1) OBLIGATION SHIFT (earlier shift): plain factual line, no owe/owed
      if (!isSettlingShift) {
        return s.worked_for_me
          ? `${who} worked for you on ${date} - ${dutyPlatoon}${stPart}.`
          : `You worked for ${who} on ${date} - ${dutyPlatoon}${stPart}.`;
      }

      // 2) SETTLING SHIFT (later shift): Once/After ... shifts settled
      const alreadyHappened = !future;

      if (s.worked_for_me) {
        // they work for you (this settles)
        return alreadyHappened
          ? `After ${who} worked for you on ${date} - ${dutyPlatoon}${stPart}, your shifts are settled.`
          : `Once ${who} works for you on ${date} - ${dutyPlatoon}${stPart}, your shifts will be settled.`;
      }

      // you work for them (this settles)
      return alreadyHappened
        ? `After you worked for ${who} on ${date} - ${dutyPlatoon}${stPart}, your shifts are settled.`
        : `Once you work for ${who} on ${date} - ${dutyPlatoon}${stPart}, your shifts will be settled.`;
    }
  }

  // -----------------------------
  // Unsettled
  // -----------------------------
  if (s.worked_for_me) {
    return future
      ? `${who} will work for you on ${date} - ${dutyPlatoon}${stPart}. You will owe them a shift.`
      : `${who} worked for you on ${date} - ${dutyPlatoon}${stPart}. You owe them a shift.`;
  }

  return future
    ? `You will work for ${who} on ${date} - ${dutyPlatoon}${stPart}. They will owe you a shift.`
    : `You worked for ${who} on ${date} - ${dutyPlatoon}${stPart}. They owe you a shift.`;
}
