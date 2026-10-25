// The app talks. One consistent voice: the server synthesizes each line with every sound piece
// pronounced from its IPA (/api/say) and the clip plays through one shared <audio> element.
// When the server has no voice, or a request fails, the browser's own speech synthesis speaks
// instead, with each piece respelled (role.say) so it isn't read phonetically. hush() stops both.
import { respeller } from "./respell.js";

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let voice = null;
let serverVoice = false;      // health.tts === "google"
let unlocked = false;         // the shared element has played inside a user gesture
let audio = null;
let current = null;           // { controller, settle } of the clip in flight or playing
let lastClip = null;          // { text, term_id } of the last server clip played, for the owner's verify buttons
const clips = new Map();      // `${term_id}|${text}` -> blob URL (bounded)

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
  if (a) { a.onended = a.onerror = null; try { a.pause(); } catch { /* fine */ } }
  c.settle();
}

async function fetchClip(text, termId, signal) {
  const key = `${termId ?? ""}|${text}`;
  const hit = clips.get(key);
  if (hit) return hit;
  const res = await fetch("/api/say", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, term_id: termId ?? undefined }), signal });
  if (!res.ok) { const err = new Error(`say ${res.status}`); err.status = res.status; throw err; }
  const url = URL.createObjectURL(await res.blob());
  if (clips.size >= 60) { const [k, v] = clips.entries().next().value; clips.delete(k); URL.revokeObjectURL(v); }
  clips.set(key, url);
  return url;
}

function playUrl(url, controller) {
  const a = element();
  return new Promise((resolve) => {
    if (!a || controller.signal.aborted) return resolve();
    const done = () => { a.onended = a.onerror = null; resolve(); };
    a.onended = done; a.onerror = done;
    a.src = url;
    a.play().catch(done);
  });
}

function speakBrowser(text, { rate = 0.95 } = {}) {
  if (!synth || !text) return Promise.resolve();
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(String(text));
    if (voice) u.voice = voice;
    u.lang = "en-US"; u.rate = rate;
    u.onend = resolve; u.onerror = resolve;
    synth.speak(u);
    setTimeout(resolve, Math.min(12000, 400 + text.length * 90)); // some engines never fire onend
  });
}

// Speak plain text; pass the term so its pieces are pronounced right on either path.
// A new call interrupts the previous one. Resolves when done (or at once if speech is unavailable).
export function speak(text, { term, rate = 0.95 } = {}) {
  const line = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!line) return Promise.resolve();
  stopCurrent();
  synth?.cancel();
  const fallback = () => speakBrowser(respeller(term)(line).replace(/(^|\s)-(?=\p{L})/gu, "$1"), { rate });
  if (!serverVoice || !unlocked) return fallback();
  const controller = new AbortController();
  let settle;
  const finished = new Promise((r) => { settle = r; });
  const me = { controller, settle };
  current = me;
  (async () => {
    try {
      const url = await fetchClip(line, term?.id ?? null, controller.signal);
      if (controller.signal.aborted) return;
      lastClip = { text: line, term_id: term?.id ?? null };
      await playUrl(url, controller);
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
