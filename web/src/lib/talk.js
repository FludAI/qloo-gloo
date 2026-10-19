import { useCallback, useEffect, useRef, useState } from "react";
import { browserSpeechSupported, micSupported, startBrowserSpeech, startPcmRecording } from "./audio.js";

const MAX_SECONDS = 7;

// Hold-to-talk. Press and hold: record; release: deliver.
//   server speech available  -> onPcm({ pcm16 })   (caller sends it to the server)
//   else browser speech      -> onText({ transcript })
//   else                     -> mode "none" (caller offers typing)
// Returns { mode, listening, holdProps, error }.
export function useHoldToTalk({ stt, onPcm, onText, onError }) {
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
  }, [onPcm, onText, onError]);

  const start = useCallback(async (e) => {
    if (rec.current || mode === "none") return;
    e?.preventDefault?.();
    e?.currentTarget?.setPointerCapture?.(e.pointerId);
    setError("");
    try {
      rec.current = mode === "pcm" ? { kind: "pcm", handle: await startPcmRecording() } : { kind: "browser", handle: startBrowserSpeech() };
      setListening(true);
      timer.current = setTimeout(stop, MAX_SECONDS * 1000);
    } catch (err) {
      rec.current = null;
      const msg = err?.name === "NotAllowedError" || err?.code === "not-allowed"
        ? "Microphone is blocked. Allow it in your browser's site settings, or type the word."
        : "Couldn't start the microphone.";
      setError(msg); onError?.(Object.assign(err ?? new Error(msg), { message: msg }));
    }
  }, [mode, stop, onError]);

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
