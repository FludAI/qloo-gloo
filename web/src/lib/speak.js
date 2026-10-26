// The app talks. One consistent voice: the server synthesizes each line with every sound piece
// pronounced from its IPA (/api/say) and the clip plays through one shared <audio> element.
// When the server has no voice, or a request fails, the browser's own speech synthesis speaks
// instead, with each piece respelled (role.say) so it isn't read phonetically. hush() stops both.
//
// Syllables: the server sends the time of every syllable of the word and pieces in a line (x-gloo-marks); when
// it has none, or the browser speaks, the syllables are spread evenly over the utterance. onSpeech() tells the
// paw what is playing and speechClock() where the voice is, read against the audio element's own clock.
import { respeller } from "./respell.js";
import { estimateDuration, estimateMarks, pawPlan } from "./paw.js";

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let voice = null;
let serverVoice = false;      // health.tts === "google"
let unlocked = false;         // the shared element has played inside a user gesture
let audio = null;
let current = null;           // { controller, settle } of the clip in flight or playing
let lastClip = null;          // { text, term_id } of the last server clip played, for the owner's verify buttons
const clips = new Map();      // `${term_id}|${text}` -> { url, marks } (bounded)

// What is being said right now: { text, term_id, marks, estimated, source: "server" | "browser", startedAt }, or null.
let live = null;
const listeners = new Set();
const emit = () => { for (const fn of listeners) { try { fn(live); } catch { /* a listener's problem */ } } };
// Subscribe to the spoken line; called at once with the current one. Returns the unsubscribe function.
export const onSpeech = (fn) => { listeners.add(fn); try { fn(live); } catch { /* fine */ } return () => listeners.delete(fn); };
export const speaking = () => live;
// Seconds into the current line: the audio element's clock for a server clip, wall time for the browser voice. Null when silent.
export function speechClock() {
  if (!live) return null;
  if (live.source === "server" && audio) return audio.currentTime;
  return (performance.now() - live.startedAt) / 1000;
}
const setLive = (v) => { live = v; emit(); };
// A line's syllable targets: the whole word and the pieces, for estimated marks when the server gave none.
const targetsOf = (term) => (term ? pawPlan(term, term.roles ?? term.pieces ?? []).targets.filter((t) => t.spelling) : []);

function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices();
  return voices.find((v) => /^en[-_]US/i.test(v.lang) && /natural|premium|enhanced|neural/i.test(v.name))
    ?? voices.find((v) => /^en[-_]US/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
}
if (synth) { voice = pickVoice(); synth.addEventListener?.("voiceschanged", () => { voice = pickVoice(); }); }

export const canSpeak = () => Boolean(synth) || serverVoice;
export const configureSpeech = ({ tts } = {}) => { serverVoice = tts === "google"; };
export const speechMode = () => (serverVoice && unlocked ? "server" : synth ? "browser" : "none");
export const lastSpoken = () => lastClip;

// 0.1 s of silence as a WAV data URL (8 kHz, 8-bit mono): a valid clip any browser will play.
function silence() {
  const n = 800, h = new Uint8Array(44 + n);
  const w = (o, str) => str.split("").forEach((c, i) => (h[o + i] = c.charCodeAt(0)));
  const u32 = (o, v) => { h[o] = v & 255; h[o + 1] = (v >> 8) & 255; h[o + 2] = (v >> 16) & 255; h[o + 3] = (v >>> 24) & 255; };
  const u16 = (o, v) => { h[o] = v & 255; h[o + 1] = (v >> 8) & 255; };
  w(0, "RIFF"); u32(4, 36 + n); w(8, "WAVE"); w(12, "fmt "); u32(16, 16); u16(20, 1); u16(22, 1); u32(24, 8000); u32(28, 8000); u16(32, 1); u16(34, 8); w(36, "data"); u32(40, n);
  h.fill(128, 44);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...h))}`;
}

function element() {
  if (audio || typeof Audio === "undefined") return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  return audio;
}

// Call once from a user gesture (the camera button): iOS only lets an element play that has played in a tap.
export function unlockAudio() {
  const a = element();
  if (!a || unlocked) return;
  a.src = silence();
  a.muted = true;
  const p = a.play();
  unlocked = true;
  Promise.resolve(p).catch(() => {}).finally(() => { a.pause(); a.muted = false; a.removeAttribute("src"); try { a.load(); } catch { /* fine */ } });
}

function stopCurrent() {
  const c = current;
  current = null;
  if (!c) return;
  c.controller.abort();
  const a = audio;
  if (a) { a.onended = a.onerror = a.onloadedmetadata = null; try { a.pause(); } catch { /* fine */ } }
  if (live) setLive(null);
  c.settle();
}

// Marks ride in a header as base64 JSON (IPA can't travel in a header as is). null when the clip has none.
function readMarks(res) {
  const h = res.headers.get("x-gloo-marks");
  if (!h) return null;
  try { const m = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(h), (c) => c.charCodeAt(0)))); return Array.isArray(m) && m.length ? m : null; }
  catch { return null; }
}

async function fetchClip(text, termId, signal) {
  const key = `${termId ?? ""}|${text}`;
  const hit = clips.get(key);
  if (hit) return hit;
  const res = await fetch("/api/say", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, term_id: termId ?? undefined }), signal });
  if (!res.ok) { const err = new Error(`say ${res.status}`); err.status = res.status; throw err; }
  const clip = { url: URL.createObjectURL(await res.blob()), marks: readMarks(res) };
  if (clips.size >= 60) { const [k, v] = clips.entries().next().value; clips.delete(k); URL.revokeObjectURL(v.url); }
  clips.set(key, clip);
  return clip;
}

// Plays a clip on the shared element and tells the paw: real marks at once, or estimated ones as soon as the
// clip's length is known.
function playUrl(clip, controller, line, term) {
  const a = element();
  return new Promise((resolve) => {
    if (!a || controller.signal.aborted) return resolve();
    const done = () => { a.onended = a.onerror = a.onloadedmetadata = null; if (live?.source === "server") setLive(null); resolve(); };
    a.onended = done; a.onerror = done;
    const base = { text: line, term_id: term?.id ?? null, source: "server", startedAt: performance.now() };
    if (clip.marks) setLive({ ...base, marks: clip.marks, estimated: false });
    else {
      setLive({ ...base, marks: null, estimated: true });
      a.onloadedmetadata = () => { if (live?.source === "server" && live.text === line) setLive({ ...live, marks: estimateMarks(line, targetsOf(term), Number.isFinite(a.duration) ? a.duration : estimateDuration(line)) }); };
    }
    a.src = clip.url;
    a.play().catch(done);
  });
}

function speakBrowser(text, { rate = 0.95, line = text, term = null } = {}) {
  if (!synth || !text) return Promise.resolve();
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(String(text));
    if (voice) u.voice = voice;
    u.lang = "en-US"; u.rate = rate;
    const me = { text: line, term_id: term?.id ?? null, source: "browser", startedAt: performance.now(), estimated: true, marks: estimateMarks(line, targetsOf(term), estimateDuration(line)) };
    const done = () => { if (live === me) setLive(null); resolve(); };
    u.onend = done; u.onerror = done;
    u.onstart = () => { if (live === me) { me.startedAt = performance.now(); emit(); } }; // the clock starts when the voice does
    setLive(me);
    synth.speak(u);
    setTimeout(done, Math.min(12000, 400 + text.length * 90)); // some engines never fire onend
  });
}

// Speak plain text; pass the term so its pieces are pronounced right on either path.
// A new call interrupts the previous one. Resolves when done (or at once if speech is unavailable).
export function speak(text, { term, rate = 0.95 } = {}) {
  const line = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!line) return Promise.resolve();
  stopCurrent();
  synth?.cancel();
  const fallback = () => speakBrowser(respeller(term)(line).replace(/(^|\s)-(?=\p{L})/gu, "$1"), { rate, line, term });
  if (!serverVoice || !unlocked) return fallback();
  const controller = new AbortController();
  let settle;
  const finished = new Promise((r) => { settle = r; });
  const me = { controller, settle };
  current = me;
  (async () => {
    try {
      const clip = await fetchClip(line, term?.id ?? null, controller.signal);
      if (controller.signal.aborted) return;
      lastClip = { text: line, term_id: term?.id ?? null };
      await playUrl(clip, controller, line, term);
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e?.status === 401 || e?.status === 503) serverVoice = false; // locked or unconfigured: stay on the browser voice
      await fallback();
    } finally {
      if (current === me) { current = null; settle(); }
    }
  })();
  return finished;
}

export function hush() { stopCurrent(); synth?.cancel(); }
