import { useCallback, useEffect, useRef, useState } from "react";
import { browserSpeechSupported, micSupported, startBrowserSpeech, startPcmRecording } from "./audio.js";
import { isIOS, isPhone, micFix } from "./device.js";
import { api } from "../api.js";

const MAX_SECONDS = 7;

// Hold-to-talk. Press and hold: record; release: deliver.
//   server speech available  -> onPcm({ pcm16 })   (caller sends it to the server)
//   else browser speech      -> onText({ transcript })
//   else                     -> mode "none" (caller offers typing)
// onLevel(rms, seconds): the loudness of the learner's voice per ~50 ms frame while recording (pcm mode only).
// onListening(bool): the hold started / ended.
// where: which mic this is ("gate", "first_attempt", "practice"), for the report.
// Returns { mode, listening, holdProps, error }.
// A hold that ends without a request (released early, too short, silent, refused) is reported as a "talk" beacon:
// state, mode, where, the hold length and peak level rounded, platform. No audio, no transcript, nothing typed.
const platform = () => (isIOS() ? "ios" : isPhone() ? "android" : "desktop");
const report = (state, mode, where, extra = {}) => api.beacon({ event: "talk", state, mode, where: where ?? null, platform: platform(),
  ...(extra.seconds != null && { seconds: Number(extra.seconds.toFixed(2)) }), ...(extra.peak != null && { peak: Number(extra.peak.toFixed(3)) }), ...(extra.error && { error: String(extra.error).slice(0, 40) }) });
// Whether this page has been granted the microphone yet: "unknown" until the first hold, then "granted" or "blocked".
let micState = "unknown";
const micListeners = new Set();
export const micStatus = () => micState;
const setMicState = (s) => { if (micState === s) return; micState = s; micListeners.forEach((f) => f(s)); };

export function useHoldToTalk({ stt, where, onPcm, onText, onError, onLevel, onListening, onMic }) {
  useEffect(() => { if (!onMic) return; micListeners.add(onMic); return () => micListeners.delete(onMic); }, [onMic]);
  const mode = stt === "google" || stt === "mock" ? (micSupported() ? "pcm" : browserSpeechSupported() ? "browser" : "none")
    : browserSpeechSupported() ? "browser" : "none";
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef(null);
  const timer = useRef(null);

  const stop = useCallback(async () => {
    clearTimeout(timer.current);
    const r = rec.current;
    rec.current = null;
    setListening(false);
    if (!r) return;
    if (r.kind === "pending") { report("released_early", mode, where); return; } // released before the mic opened: start() sees the slot emptied and stops it
    onListening?.(false);
    try {
      if (r.kind === "pcm") {
        const { pcm16, seconds, peak } = r.handle.stop();
        if (seconds < 0.35) { report("short", mode, where, { seconds, peak }); return setError("Hold the button while you speak."); }
        if (peak < 0.01) { report("silent", mode, where, { seconds, peak }); return setError("Didn't hear anything. Hold and speak up."); }
        await onPcm?.({ pcm16, seconds });
      } else {
        const { transcript } = await r.handle.stop();
        if (!transcript.trim()) { report("empty", mode, where); return setError("Didn't catch that. Try again."); }
        await onText?.({ transcript });
      }
    } catch (e) {
      // The browser-speech fallback reports a refusal here, at release: the same device fix applies.
      const blocked = e?.code === "not-allowed" || e?.name === "NotAllowedError";
      if (blocked) setMicState("blocked");
      report(blocked ? "blocked" : "failed", mode, where, { error: e?.name ?? e?.code ?? "error" });
      setError(blocked ? micFix() : e.message); onError?.(e);
    }
  }, [mode, where, onPcm, onText, onError, onListening]);

  const start = useCallback(async (e) => {
    if (rec.current || mode === "none") return;
    e?.preventDefault?.();
    e?.currentTarget?.setPointerCapture?.(e.pointerId);
    setError("");
    try {
      const claim = { kind: "pending" }; // claim the slot before the await so a second press doesn't start twice
      rec.current = claim;
      const r = mode === "pcm" ? { kind: "pcm", handle: await startPcmRecording({ onLevel }) } : { kind: "browser", handle: startBrowserSpeech() };
      if (mode === "pcm") setMicState("granted");
      if (rec.current !== claim) { try { r.handle.stop(); } catch { /* fine */ } return; } // released meanwhile
      rec.current = r;
      setListening(true);
      onListening?.(true);
      timer.current = setTimeout(stop, MAX_SECONDS * 1000);
    } catch (err) {
      rec.current = null;
      const blocked = err?.name === "NotAllowedError" || err?.code === "not-allowed";
      if (blocked) setMicState("blocked");
      report(blocked ? "blocked" : "start_failed", mode, where, { error: err?.name ?? err?.code ?? "error" });
      const msg = blocked ? micFix() : "Couldn't start the microphone.";
      setError(msg); onError?.(Object.assign(err ?? new Error(msg), { message: msg }));
    }
  }, [mode, where, stop, onError, onLevel, onListening]);

  useEffect(() => () => { clearTimeout(timer.current); try { rec.current?.handle?.stop?.(); } catch { /* unmounted */ } }, []);

  const holdProps = {
    onPointerDown: start, onPointerUp: stop, onPointerCancel: stop, onLostPointerCapture: stop,
    onContextMenu: (e) => e.preventDefault(),
    onKeyDown: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!rec.current) start(); } },
    onKeyUp: (e) => { if (e.key === " " || e.key === "Enter") stop(); },
    style: { touchAction: "none", WebkitUserSelect: "none", userSelect: "none" },
  };
  return { mode, listening, holdProps, error, mic: micState, clearError: () => setError("") };
}
