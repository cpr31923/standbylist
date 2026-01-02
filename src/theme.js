const KEY = "shift-iou:theme"; // "light" | "dark" | "system"

function getSystemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getThemePreference() {
  try {
    return localStorage.getItem(KEY) || "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref) {
  const root = document.documentElement;
  const effectiveDark = pref === "dark" || (pref === "system" && getSystemPrefersDark());

  root.classList.toggle("dark", effectiveDark);

  // optional: lets browser UI (form controls, scrollbars) match
  root.style.colorScheme = effectiveDark ? "dark" : "light";
}

export function setThemePreference(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  applyTheme(pref);
}

export function initTheme() {
  const pref = getThemePreference();
  applyTheme(pref);

  // If “system”, react to OS changes
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getThemePreference() === "system") applyTheme("system");
    };
    // Safari compat
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange));
  }

  return () => {};
}
