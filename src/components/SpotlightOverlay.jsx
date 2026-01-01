import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function getRect(el) {
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
  };
}

export default function SpotlightOverlay({ targetEl, padding = 10, radius = 14 }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!targetEl) return;

    const update = () => setRect(getRect(targetEl));

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true); // captures scroll in nested containers
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [targetEl]);

  if (!targetEl || !rect) return null;

  const x = rect.left - padding;
  const y = rect.top - padding;
  const w = rect.width + padding * 2;
  const h = rect.height + padding * 2;

  return createPortal(
    <div className="fixed inset-0 z-[120] pointer-events-none">

      {/* “hole” effect */}
      <div
        className="absolute"
        style={{
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: radius,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
          background: "transparent",
        }}
      />

      {/* outline */}
      <div
        className="absolute border border-white/70"
        style={{
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: radius,
        }}
      />
    </div>,
    document.body
  );
}
