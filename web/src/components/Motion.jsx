import { useEffect, useRef } from "react";
import { sfx, reducedMotion } from "../lib/sfx.js";

// Reusable motion parts from the studies: the tick rail under a word, the five-tick meter,
// a ring that flashes outward on a lock-in, and a ring that closes on a correct answer.

// Rail: a line with one tick per piece. `lit` ticks are filled; ticks drop in with a click when `animate`.
export function Rail({ count, lit = count, cool = false, animate = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!animate || !ref.current || reducedMotion()) return;
    const ticks = ref.current.querySelectorAll("[data-tick]");
    ticks.forEach((t, i) => {
      t.animate([{ opacity: 0, transform: "translateY(-12px)" }, { opacity: 1, transform: "none" }], { duration: 180, delay: 120 + i * 150, fill: "both", easing: "cubic-bezier(.3,1.5,.5,1)" });
      sfx("tick", 120 + i * 150);
    });
    const line = ref.current.querySelector("[data-line]");
    line?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 260, delay: 120 + ticks.length * 150, fill: "both", easing: "cubic-bezier(.16,1,.3,1)" });
  }, [animate, count]);
  const color = cool ? "var(--sea-lit)" : "var(--gloo)";
  return (
    <div ref={ref} className={`relative h-5 ${className}`} aria-hidden>
      <div data-line className="absolute inset-x-0 bottom-0 h-0.5 origin-left" style={{ background: color }} />
      <div className="absolute inset-x-0 bottom-0.5 flex justify-around">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} data-tick className="block h-4 w-1 rounded-sm" style={{ background: i < lit ? color : "rgba(246,241,231,.35)" }} />
        ))}
      </div>
    </div>
  );
}

// Meter: five ticks, filled to `n`, hot (gloo) or cool (sea). Fills with clicks when `animate`.
export function Meter({ n = 0, cool = false, animate = false, small = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!animate || !ref.current || reducedMotion()) return;
    ref.current.querySelectorAll("[data-fill]").forEach((f, i) => {
      if (i >= n) return;
      f.animate([{ opacity: 0, transform: "scaleY(.15)" }, { opacity: 1, transform: "scaleY(1)" }], { duration: 110, delay: 200 + i * 120, fill: "both", easing: "cubic-bezier(.3,1.5,.5,1)" });
      sfx("tick", 200 + i * 120);
    });
  }, [animate, n]);
  const fill = cool ? "var(--sea-lit)" : "var(--gloo)";
  const w = small ? 10 : 22, h = small ? 26 : 56, gap = small ? 6 : 12;
  return (
    <div ref={ref} className="inline-flex" style={{ gap }} aria-label={`${n} of 5`} role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="relative block rounded-md border-2" style={{ width: w, height: h, borderColor: cool && i < n ? fill : "rgba(246,241,231,.5)" }}>
          <span data-fill className="absolute inset-0.5 origin-bottom rounded" style={{ background: fill, opacity: i < n ? 1 : 0 }} />
        </span>
      ))}
    </div>
  );
}

// One ring flash outward from an element's box (the lock-in). Call with a DOM node.
export function flashRing(node) {
  if (!node || reducedMotion()) return;
  const r = node.getBoundingClientRect();
  const ring = document.createElement("div");
  ring.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:3px solid var(--gloo);border-radius:22px;pointer-events:none;z-index:70`;
  document.body.appendChild(ring);
  ring.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.55)" }], { duration: 440, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }).onfinish = () => ring.remove();
  node.animate([{ background: "rgba(246,241,231,0)" }, { background: "rgba(246,241,231,.38)", offset: 0.3 }, { background: "rgba(246,241,231,0)" }], { duration: 280, easing: "ease-out" });
}

// Answer ring: closes fully on a hit, to 70% and dims on uncertain; a miss shakes the host instead.
export function AnswerRing({ outcome, size = 180 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !outcome) return;
    const L = 2 * Math.PI * (size / 2 - 6);
    c.style.strokeDasharray = `${L}`; c.style.strokeDashoffset = `${L}`;
    if (reducedMotion()) { c.style.strokeDashoffset = outcome === "correct" ? "0" : `${L * 0.3}`; return; }
    if (outcome === "correct") {
      c.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 420, delay: 60, fill: "forwards", easing: "cubic-bezier(.16,1,.3,1)" });
      c.animate([{ strokeWidth: 5 }, { strokeWidth: 10, offset: 0.3 }, { strokeWidth: 5 }], { duration: 360, delay: 460, fill: "forwards", easing: "ease-out" });
      sfx("chime", 420);
    } else if (outcome === "uncertain") {
      c.animate([{ strokeDashoffset: L }, { strokeDashoffset: L * 0.3 }], { duration: 700, delay: 60, fill: "forwards", easing: "cubic-bezier(.16,1,.3,1)" });
      c.animate([{ opacity: 1 }, { opacity: 0.55 }], { duration: 500, delay: 760, fill: "forwards" });
      sfx("tick", 60);
    }
  }, [outcome, size]);
  if (!outcome || outcome === "incorrect") return null;
  return (
    <svg className="pointer-events-none absolute inset-0 m-auto" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle ref={ref} cx={size / 2} cy={size / 2} r={size / 2 - 6} fill="none" stroke={outcome === "correct" ? "#f6f1e7" : "rgba(246,241,231,.5)"} strokeWidth={outcome === "correct" ? 5 : 3} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

export function shake(node) {
  if (!node || reducedMotion()) return;
  node.animate([0, -16, 14, -10, 6, -2, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 380, easing: "linear" });
  sfx("miss");
}
