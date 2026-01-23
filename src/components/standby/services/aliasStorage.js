export function aliasStorageKey(userId) {
  return `shift-iou:aliases:${userId || "anon"}`;
}

export function loadAliasMap(userId) {
  try {
    const raw = localStorage.getItem(aliasStorageKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveAliasMap(userId, map) {
  try {
    localStorage.setItem(aliasStorageKey(userId), JSON.stringify(map || {}));
  } catch {}
}
