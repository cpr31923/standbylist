import {
  formatPlatoonLabel,
  formatDisplayDate,
  normalizeName,
  toTitleCase,
  shiftTypeShort,
  firstName,
  isFuture,
} from "../helpers";

// NOTE: this module stays pure: it receives data + standbys list.

function findPartnerShift(row, standbys) {
  if (!row?.settlement_group_id) return null;
  const gid = row.settlement_group_id;
  const other = (standbys || []).find(
    (r) => r.settlement_group_id === gid && r.id !== row.id
  );
  return other || null;
}

function nameWithPlatoonLocal(row) {
  const nameFull = toTitleCase(row?.person_name || "—");
  const p = formatPlatoonLabel(row?.platoon);
  return `${nameFull} (${p})`;
}

export function rowSentence(row, standbys) {
  if (row?.deleted_at) {
    const date = formatDisplayDate(row?.shift_date);
    const st = shiftTypeShort(row);
    return `${date}${st ? ` ${st}` : ""}`;
  }

  const who = nameWithPlatoonLocal(row);
  const first = firstName(row?.person_name);
  const date = formatDisplayDate(row?.shift_date);
  const dutyPlatoon = formatPlatoonLabel(row?.duty_platoon || row?.platoon);
  const st = shiftTypeShort(row);
  const stPart = st ? ` ${st}` : "";
  const future = isFuture(row?.shift_date);

  if (row?.settled && row?.settlement_group_id) {
    const other = findPartnerShift(row, standbys);
    if (other) {
      const myDate = String(row.shift_date || "");
      const otherDate = String(other.shift_date || "");
      const isSettlingShift =
        myDate > otherDate || (myDate === otherDate && String(row.id) > String(other.id));

      // Obligation shift (earlier one): plain factual line (no owe/owed wording)
      if (!isSettlingShift) {
        if (row.worked_for_me) return `${who} worked for me on ${date} - ${dutyPlatoon}${stPart}.`;
        return `I worked for ${who} on ${date} - ${dutyPlatoon}${stPart}.`;
      }

      const alreadyHappened = !isFuture(row.shift_date);

      if (row.worked_for_me) {
        return alreadyHappened
          ? `Now that ${first} has worked for me on ${date} - ${dutyPlatoon}${stPart}, our shifts are settled.`
          : `Once ${first} works for me on ${date} - ${dutyPlatoon}${stPart}, our shifts will be settled.`;
      }

      return alreadyHappened
        ? `Now that I have worked for ${first} on ${date} - ${dutyPlatoon}${stPart}, our shifts are settled.`
        : `Once I work for ${first} on ${date} - ${dutyPlatoon}${stPart}, our shifts will be settled.`;
    }

    // Guard: settled rows should never show owe/owed preview even if partner not found
    if (row.worked_for_me) return `${who} worked for me on ${date} - ${dutyPlatoon}${stPart}.`;
    return `I worked for ${who} on ${date} - ${dutyPlatoon}${stPart}.`;
  }

  // worked_for_me === true  => they worked for you (you owe them)
  // worked_for_me === false => you worked for them (they owe you)
  if (row?.worked_for_me) {
    return future
      ? `${who} will work for me on ${date} - ${dutyPlatoon}${stPart}.`
      : `${who} worked for me on ${date} - ${dutyPlatoon}${stPart}.`;
  }

  return future
    ? `I will work for ${who} on ${date} - ${dutyPlatoon}${stPart}.`
    : `I worked for ${who} on ${date} - ${dutyPlatoon}${stPart}.`;
}

export function upcomingRowSentence(row, standbys) {
  // Only override for future rows in Upcoming that are already linked/settled as a pair
  if (row?.settled && row?.settlement_group_id && isFuture(row?.shift_date)) {
    const first = firstName(row?.person_name);
    const date = formatDisplayDate(row?.shift_date);
    const dutyPlatoon = formatPlatoonLabel(row?.duty_platoon || row?.platoon);
    const st = shiftTypeShort(row);
    const stPart = st ? ` ${st}` : "";

    if (row.worked_for_me) {
      return `Once ${first} works for me on ${date} - ${dutyPlatoon}${stPart}, our shifts will be settled.`;
    }
    return `Once I work for ${first} on ${date} - ${dutyPlatoon}${stPart}, our shifts will be settled.`;
  }

  return rowSentence(row, standbys);
}

export function getNameMismatchInfo(aName, bName) {
  const a = normalizeName(aName);
  const b = normalizeName(bName);
  const mismatch = a && b && a !== b;
  return { mismatch, a, b };
}

export function isThreeWay(row) {
  const notes = String(row?.notes || "");
  return notes.toLowerCase().includes("three way standby");
}

