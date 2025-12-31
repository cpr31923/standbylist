// src/components/standby/narratives.jsx
import { isFuture, formatDisplayDate, formatPlatoonLabel } from "./helpers";

export function detailNarrative(s, findPartnerShift) {
  if (!s) return "";

  const future = isFuture(s.shift_date);
  const date = formatDisplayDate(s.shift_date);
  const dutyPlatoon = formatPlatoonLabel(s.duty_platoon || s.platoon);
  const stPart = s.shift_type ? ` ${s.shift_type}` : "";
  const name = s.person_name || "—";

  // Settled pair logic
  if (s?.settled && s?.settlement_group_id) {
    const other = typeof findPartnerShift === "function" ? findPartnerShift(s) : null;

    if (other) {
      const myDate = String(s.shift_date || "");
      const otherDate = String(other.shift_date || "");
      const isSettlingShift =
        myDate > otherDate || (myDate === otherDate && String(s.id) > String(other.id));

      // obligation shift (the earlier one): keep plain wording
      if (!isSettlingShift) {
        return s.worked_for_me
          ? `${name} worked for you on ${date}${stPart}.`
          : `You worked for ${name} on ${date}${stPart}.`;
      }

      const alreadyHappened = !future;

      if (s.worked_for_me) {
        return alreadyHappened
          ? `After ${name} worked for you on ${date} - ${dutyPlatoon}${stPart}, your shifts are settled.`
          : `Once ${name} works for you on ${date} - ${dutyPlatoon}${stPart}, your shifts will be settled.`;
      }

      return alreadyHappened
        ? `After you worked for ${name} on ${date} - ${dutyPlatoon}${stPart}, your shifts are settled.`
        : `Once you work for ${name} on ${date} - ${dutyPlatoon}${stPart}, your shifts will be settled.`;
    }
  }

  // Unsettled
  if (s.worked_for_me) {
    return future
      ? `${name} will work for you on ${date} - ${dutyPlatoon}${stPart}. You will owe them a shift.`
      : `${name} worked for you on ${date} - ${dutyPlatoon}${stPart}. You owe them a shift.`;
  }

  return future
    ? `You will work for ${name} on ${date} - ${dutyPlatoon}${stPart}. They will owe you a shift.`
    : `You worked for ${name} on ${date} - ${dutyPlatoon}${stPart}. They owe you a shift.`;
}
