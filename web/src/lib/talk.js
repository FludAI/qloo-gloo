import { useCallback, useEffect, useRef, useState } from "react";
import { browserSpeechSupported, micSupported, startBrowserSpeech, startPcmRecording } from "./audio.js";
import { micFix } from "./device.js";

const MAX_SECONDS = 7;

// Hold-to-talk. Press and hold: record; release: deliver.
//   server speech available  -> onPcm({ pcm16 })   (caller sends it to the server)
//   else browser speech      -> onText({ transcript })
//   else                     -> mode "none" (caller offers typing)
// onLevel(rms, seconds): the loudness of the learner's voice per ~50 ms frame while recording (pcm mode only).
// onListening(bool): the hold started / ended.
// Returns { mode, listening, holdProps, error }.
export function useHoldToTalk({ stt, onPcm, onText, onError, onLevel, onListening }) {
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
    if (!r || r.kind === "pending") return; // released before the mic opened: start() sees the slot emptied and stops it
    onListening?.(false);
    try {
      if (r.kind === "pcm") {
        const { pcm16, seconds, peak } = r.handle.stop();
        if (seconds < 0.35) return setError("Hold the button while you speak.");
        if (peak < 0.01) return setError("Didn't hear anything. Hold and speak up.");
        await onPcm?.({ pcm16, seconds });
      } else {
        const { transcript } = await r.handle.stop();
        if (!transcript.trim()) return setError("Didn't catch that. Try again.");
        await onText?.({ transcript });
      }
    } catch (e) { setError(e.message); onError?.(e); }
  }, [onPcm, onText, onError, onListening]);

  const start = useCallback(async (e) => {
    if (rec.current || mode === "none") return;
    e?.preventDefault?.();
    e?.currentTarget?.setPointerCapture?.(e.pointerId);
    setError("");
    try {
      const claim = { kind: "pending" }; // claim the slot before the await so a second press doesn't start twice
      rec.current = claim;
      const r = mode === "pcm" ? { kind: "pcm", handle: await startPcmRecording({ onLevel }) } : { kind: "browser", handle: startBrowserSpeech() };
      if (rec.current !== claim) { try { r.handle.stop(); } catch { /* fine */ } return; } // released meanwhile
      rec.current = r;
      setListening(true);
      onListening?.(true);
      timer.current = setTimeout(stop, MAX_SECONDS * 1000);
    } catch (err) {
      rec.current = null;
      const msg = err?.name === "NotAllowedError" || err?.code === "not-allowed"
        ? micFix()
        : "Couldn't start the microphone.";
      setError(msg); onError?.(Object.assign(err ?? new Error(msg), { message: msg }));
    }
  }, [mode, stop, onError, onLevel, onListening]);

  useEffect(() => () => { clearTimeout(timer.current); try { rec.current?.handle?.stop?.(); } catch { /* unmounted */ } }, []);

  const holdProps = {
    onPointerDown: start, onPointerUp: stop, onPointerCancel: stop, onLostPointerCapture: stop,
    onContextMenu: (e) => e.preventDefault(),
    onKeyDown: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!rec.current) start(); } },
    onKeyUp: (e) => { if (e.key === " " || e.key === "Enter") stop(); },
    style: { touchAction: "none", WebkitUserSelect: "none", userSelect: "none" },
  };
  return { mode, listening, holdProps, error, clearError: () => setError("") };
}
