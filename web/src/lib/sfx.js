// Five short effects, synthesized in the browser, lifted from the design tool's motion studies.
// Mono, each under 400 ms, separate from the spoken line. They follow the sound setting.
let ac = null;
let enabled = true;
const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);

function ctx() {
  if (!AC) return null;
  ac ??= new AC();
  if (ac.state === "suspended") ac.resume().catch(() => {});
  return ac;
}
function tone(f0, f1, dur, type = "sine", gain = 0.18, t0 = 0) {
  const a = ctx();
  if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
}
const KIT = {
  tick: () => tone(2400, 1900, 0.035, "square", 0.05),
  lock: () => { tone(150, 55, 0.1, "sine", 0.4); tone(660, 990, 0.13, "triangle", 0.13, 0.025); },
  chime: () => { tone(880, 0, 0.38, "sine", 0.16); tone(1320, 0, 0.34, "sine", 0.09, 0.05); },
  miss: () => { tone(210, 150, 0.12, "triangle", 0.22); tone(210, 150, 0.12, "triangle", 0.22, 0.15); },
  lift: () => tone(420, 1260, 0.34, "sine", 0.14),
};

export const sfx = (name, delay = 0) => { if (!enabled || !KIT[name]) return; setTimeout(() => { try { KIT[name](); } catch { /* no audio */ } }, delay); };
export const setSound = (on) => { enabled = Boolean(on); if (on) ctx(); };
export const soundOn = () => enabled;
// Call from a user gesture once (the camera button) so iOS lets later effects play.
export const warmAudio = () => { ctx(); };
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
