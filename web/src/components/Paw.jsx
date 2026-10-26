import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PAW_PATH, TOE_CIRCLES } from "./paw-path.js";
import { TOES, assignToes, marksFor, pawPlan, syllableCount } from "../lib/paw.js";
import { createNucleusDetector } from "../lib/envelope.js";
import { onSpeech, speechClock } from "../lib/speak.js";
import { reducedMotion } from "../lib/sfx.js";

// The syllable paw (decision 26). The gecko paw from the brand kit, light on black: a dim gold palm and five
// toes that light one per syllable, with a glow per toe. States per toe: off (barely there), heard (dim gold,
// while the learner speaks), lit (full gold with glow), wrong (dim paper, no glow). An idle paw breathes: a slow
// gold pulse crosses the glows, unless the learner prefers reduced motion.
//
// <Paw states=[...] />                 one paw, up to five toes.
// <PawRow n states=[...] />            ceil(n / 5) paws, toes assigned left to right, continuing onto the next paw.
// <SpokenPaw term pieces? />           a PawRow that follows the voice: toe k lights at syllable mark k of the word
//                                      (or of a piece's segment) as speak() plays it.

const OPACITY = { off: 0.16, heard: 0.55, lit: 1, wrong: 0.3 };
const GLOW = { off: 0, heard: 0.22, lit: 0.9, wrong: 0 };

export function Paw({ states = [], toes = TOES, size = 72, breath = true, className = "", label }) {
  const uid = useId().replace(/:/g, "");
  const idle = breath && !states.some((s) => s && s !== "off") && !reducedMotion();
  const w = size, h = Math.round(size * (500 / 600));
  return (
    <svg className={`paw ${idle ? "paw-breath" : ""} ${className}`} width={w} height={h} viewBox="-60 -40 600 500" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={`${uid}-toe`} gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="0" y2="275"><stop offset="0" stopColor="#f6cb5c" /><stop offset="1" stopColor="#c98a12" /></linearGradient>
        <radialGradient id={`${uid}-glow`}><stop offset="0" stopColor="#f6cb5c" stopOpacity=".9" /><stop offset=".4" stopColor="#e0a526" stopOpacity=".4" /><stop offset="1" stopColor="#e0a526" stopOpacity="0" /></radialGradient>
        {TOE_CIRCLES.map(([cx, cy, r], i) => <clipPath key={i} id={`${uid}-c${i}`}><circle cx={cx} cy={cy} r={r} /></clipPath>)}
      </defs>
      <path d={PAW_PATH} fill="#dfaa37" fillRule="evenodd" opacity=".14" />
      {TOE_CIRCLES.slice(0, Math.min(TOES, toes)).map(([cx, cy], i) => {
        const s = states[i] ?? "off";
        return (
          <g key={i} className={`paw-toe paw-${s}`} data-toe={i} data-state={s}>
            <circle className="paw-glow" cx={cx} cy={cy} r="105" fill={`url(#${uid}-glow)`} style={{ opacity: GLOW[s] ?? 0, animationDelay: `${i * 0.32}s` }} />
            <path className="paw-pad" d={PAW_PATH} clipPath={`url(#${uid}-c${i})`} fill={s === "wrong" ? "#f6f1e7" : `url(#${uid}-toe)`} fillRule="evenodd" style={{ opacity: OPACITY[s] ?? OPACITY.off }} />
          </g>
        );
      })}
    </svg>
  );
}

// n toes over as many paws as it takes. states: one entry per toe, in order.
export function PawRow({ n, states = [], size = 72, breath = true, className = "", label }) {
  const paws = assignToes(n);
  return (
    <div className={`paw-row flex items-end justify-center gap-1 ${className}`} role={label ? "img" : undefined} aria-label={label}>
      {paws.map((toes, p) => <Paw key={p} toes={toes} states={states.slice(p * TOES, p * TOES + toes)} size={size} breath={breath} />)}
    </div>
  );
}

// Toe states that follow the voice. targets: [{ spelling, offset, count }] (pawPlan). While a line that contains
// a target plays, that target's toes go off and then light one by one at its marks, read against the clip's
// own clock every frame (requestAnimationFrame, never a timer), so slow devices stay in step.
// Returns the states array for n toes.
export function useSpokenToes(n, targets) {
  const [states, setStates] = useState(() => Array(n).fill("off"));
  const ref = useRef({ states: Array(n).fill("off") });
  const key = targets.map((t) => `${t.spelling}:${t.offset}:${t.count}`).join("|");
  useEffect(() => {
    let frame = 0;
    let active = null; // { marks: [{ time, toe }] } for the line now playing
    const set = (next) => { ref.current.states = next; setStates(next); };
    const tick = () => {
      frame = 0;
      if (!active) return;
      const now = speechClock();
      if (now == null) return;
      let changed = false;
      const next = [...ref.current.states];
      for (const m of active.marks) {
        if (now + 0.03 >= m.time && next[m.toe] !== "lit") { next[m.toe] = "lit"; changed = true; }
      }
      if (changed) set(next);
      if (active.marks.some((m) => now + 0.03 < m.time)) frame = requestAnimationFrame(tick);
    };
    const stop = onSpeech((live) => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!live?.marks) { active = null; return; }
      // Which targets does this line say? Their toes reset, then follow their marks.
      const marks = [];
      const reset = new Set();
      for (const t of targets) {
        const mine = marksFor(live.marks, t.spelling);
        if (!mine.length) continue;
        for (let k = 0; k < t.count; k++) reset.add(t.offset + k);
        mine.forEach((m, k) => { const toe = t.offset + k; if (toe < n) marks.push({ time: m.time, toe }); });
      }
      if (!marks.length) { active = null; return; }
      const next = [...ref.current.states];
      for (const toe of reset) if (toe < n) next[toe] = "off";
      set(next);
      active = { marks };
      tick(); // a syllable at time zero lights now, not a frame later
    });
    return () => { stop(); if (frame) cancelAnimationFrame(frame); };
  }, [n, key]);
  return states;
}

// A paw for a term that lights with the voice: the whole word's syllables, segmented by piece when the pieces
// account for every one. `pieces` overrides term.roles (the locked packet's list). With `piece` (one role), the
// paw is that piece's syllables alone: a one-syllable piece lights one toe.
export function SpokenPaw({ term, pieces, piece, size = 64, className = "" }) {
  const plan = useMemo(() => {
    if (piece) { const count = syllableCount(piece, piece.say); return { count, targets: [{ spelling: String(piece.part ?? "").split("/")[0].trim().replace(/^-+/, ""), offset: 0, count }] }; }
    return pawPlan(term, pieces);
  }, [term?.id, term?.pronunciation?.approx, pieces?.length, piece?.id, piece?.part]);
  const states = useSpokenToes(plan.count, plan.targets);
  return <PawRow n={plan.count} states={states} size={size} className={className} label={`${plan.count} syllable${plan.count === 1 ? "" : "s"}`} />;
}

// Toes that follow the learner's voice while the mic is held, then settle to right and wrong once the attempt is
// scored. plan: pawPlan(term, pieces). Returns { states, onLevel, onListening, settle(scored), reset() }.
//   onLevel / onListening go to <SayIt>; a syllable nucleus in the energy lights the next toe "heard", up to the count.
//   settle({ pieces: [{ part, said }], said_count }) turns each piece's toes lit or wrong (by position, pieces in
//   role order); when the pieces don't segment the word, the toes light in proportion to the pieces said.
export function useHeardToes(plan) {
  const [states, setStates] = useState(() => Array(plan.count).fill("off"));
  const detector = useRef(null);
  useEffect(() => { setStates(Array(plan.count).fill("off")); }, [plan.count]);
  const reset = () => { detector.current = null; setStates(Array(plan.count).fill("off")); };
  const onListening = (on) => { if (on) { detector.current = createNucleusDetector(); setStates(Array(plan.count).fill("off")); } else detector.current = null; };
  const onLevel = (rms, t) => {
    const d = detector.current;
    if (!d || !d.push(rms, t)) return;
    setStates((prev) => { const k = prev.indexOf("off"); if (k < 0) return prev; const next = [...prev]; next[k] = "heard"; return next; });
  };
  const settle = (scored) => {
    detector.current = null;
    if (!scored?.pieces) return;
    const next = Array(plan.count).fill("wrong");
    const segments = plan.targets.filter((t) => !t.whole);
    if (plan.segmented && segments.length === scored.pieces.length) {
      segments.forEach((seg, i) => { for (let k = 0; k < seg.count; k++) next[seg.offset + k] = scored.pieces[i]?.said ? "lit" : "wrong"; });
    } else {
      const lit = Math.round((plan.count * (scored.said_count ?? 0)) / Math.max(1, scored.pieces.length));
      for (let k = 0; k < lit; k++) next[k] = "lit";
    }
    setStates(next);
  };
  return { states, onLevel, onListening, settle, reset };
}
