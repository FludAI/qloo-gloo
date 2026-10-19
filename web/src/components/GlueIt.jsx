import { useRef, useState } from "react";
import { api } from "../api.js";

const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

// Capture a word three ways. No spelling confirmation: the server resolves it in the background.
export default function GlueIt({ onGlued }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [listening, setListening] = useState(false);
  const fileRef = useRef(null);

  const glue = async (body) => {
    setErr(""); setStatus("Gluing…");
    try { onGlued(await api.glue(body)); setText(""); }
    catch (e) { setErr(e.message); }
    finally { setStatus(""); }
  };

  const listen = () => {
    const rec = new SpeechRecognition();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => glue({ text: e.results[0][0].transcript, mode: "voice" });
    rec.onerror = (e) => setErr(e.error === "not-allowed" ? "Microphone permission was denied. You can type or use the camera." : "Didn't catch that. Try again or type it.");
    rec.onend = () => setListening(false);
    setListening(true); setErr("");
    rec.start();
  };

  const readPhoto = async (file) => {
    if (!file) return;
    setErr(""); setStatus("Reading the photo on your device…");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(file);
      await worker.terminate();
      await glue({ mode: "ocr", words: data.text.split(/\s+/).filter(Boolean) });
    } catch { setErr("Couldn't read that photo. Try again closer, or type the word."); setStatus(""); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <section className="card border-ink/20 bg-white">
      <div className="step">Gloo it</div>
      <p className="mt-1 text-sm text-muted">Point your camera at a word, say it however it sounds to you, or type it.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="btn cursor-pointer">
          <span aria-hidden>📷</span> Camera
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => readPhoto(e.target.files?.[0])} />
        </label>
        {SpeechRecognition && (
          <button className="btn" onClick={listen} disabled={listening || !!status}>
            <span aria-hidden>🎙</span> {listening ? "Listening…" : "Say it"}
          </button>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <input aria-label="Type a word to gloo" className="field" placeholder="or type a word, e.g. cholecystokinin" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && text.trim() && glue({ text, mode: "typed" })} />
        <button className="btn shrink-0" disabled={!text.trim() || !!status} onClick={() => glue({ text, mode: "typed" })}>Gloo it</button>
      </div>
      {status && <p className="mt-2 text-sm text-muted" role="status">{status}</p>}
      {err && <p className="mt-2 text-sm text-red-800">{err}</p>}
      <p className="mt-2 text-[11px] text-muted">
        Photos are read on your device and never uploaded; only the words go to the server.
        {SpeechRecognition && " Speech is transcribed by your browser's speech service."}
      </p>
    </section>
  );
}

const HOW = { typed: "typed", voice: "heard", ocr: "read from your photo" };
export function Resolution({ glued, onRegue }) {
  const [fixing, setFixing] = useState(false);
  const [text, setText] = useState("");
  if (!glued) return null;
  const r = glued.resolution;
  return (
    <div className="mt-3 rounded-xl border border-line bg-paper/70 px-3 py-2 text-xs text-muted">
      <span>Glued “{r.word}” · {HOW[r.mode]}{r.input.toLowerCase() !== r.word ? ` as “${r.input}”` : ""} · matched by {r.method}{r.score != null ? ` (${r.score})` : ""}</span>
      {glued.alternatives?.length > 0 && (
        <span className="ml-1">· also in photo:{" "}
          {glued.alternatives.map((a) => <button key={a} className="mx-0.5 underline" onClick={() => onRegue({ text: a, mode: "typed" })}>{a}</button>)}
        </span>
      )}
      {!fixing ? <button className="ml-2 underline" onClick={() => setFixing(true)}>Wrong word?</button> : (
        <span className="mt-2 flex gap-2">
          <input aria-label="Correct word" className="field py-1 text-sm" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && text.trim() && (setFixing(false), onRegue({ text, mode: "typed" }))} />
          <button className="btn shrink-0" onClick={() => { setFixing(false); onRegue({ text, mode: "typed" }); }}>Fix</button>
        </span>
      )}
    </div>
  );
}
