import { useEffect, useState } from "react";

export function useHomePlatoon() {
  const [homePlatoon, setHomePlatoon] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("shift-iou-home-platoon") || "";
      if (saved) setHomePlatoon(saved);
    } catch {}
  }, []);

  function saveHomePlatoon(next) {
    const v = String(next || "").trim().toUpperCase();
    setHomePlatoon(v);
    try {
      localStorage.setItem("shift-iou-home-platoon", v);
    } catch {}
  }

  return { homePlatoon, saveHomePlatoon };
}
