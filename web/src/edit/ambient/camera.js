// The camera over the lesson, numbers from the study: the map fits the whole grid; a focus centers one
// field; a far move flies in two stages (pull out to 0.38, then settle), a near one in one.
import { COLW, mapSize } from "./grid.js";

export const EASE = { map: "cubic-bezier(.65,0,.35,1)", settle: "cubic-bezier(.16,1,.3,1)", lift: "cubic-bezier(.5,0,.75,0)" };
export const DUR = { open: 1300, map: 900, near: 650, lift: 520, settle: 760, hold: 1300 };
export const FOCUS = { cy: 0.375 }; // the field sits a little above center, as on the study's phone

// The CSS transform for a camera over a viewport { w, h, top?, bottom? } (top and bottom: chrome the map stays clear of).
export function camTransform(cam, vp, lesson) {
  if (!cam) return "translate(0px,0px) scale(1)";
  if (cam.mode === "map") {
    const m = mapSize(lesson), top = vp.top ?? 0, free = vp.h - top - (vp.bottom ?? 0);
    const s = Math.min((vp.w - 28) / m.w, (free - 24) / m.h);
    return `translate(${(vp.w - m.w * s) / 2}px,${top + (free - m.h * s) / 2}px) scale(${s})`;
  }
  const s = cam.s;
  return `translate(${vp.w / 2 - cam.fx * s}px,${vp.h * FOCUS.cy - cam.fy * s}px) scale(${s})`;
}

// The flight from the current camera to a field point { fx, fy }: a list of { cam, dur, ease } stages.
export function flightTo(from, to, { fromMap = false, scale = 1 } = {}) {
  const land = { mode: "pt", fx: to.fx, fy: to.fy, s: scale };
  if (fromMap || !from || from.mode !== "pt") return [{ cam: land, dur: DUR.open, ease: EASE.map }];
  const far = Math.abs(from.fx - to.fx) > COLW * 0.6;
  if (!far) return [{ cam: land, dur: DUR.near, ease: EASE.settle }];
  return [
    { cam: { mode: "pt", fx: (from.fx + to.fx) / 2, fy: (from.fy + to.fy) / 2 + 40, s: 0.38 * scale }, dur: DUR.lift, ease: EASE.lift },
    { cam: land, dur: DUR.settle, ease: EASE.settle },
  ];
}
