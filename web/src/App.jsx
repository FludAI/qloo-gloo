import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Camera, { fileToJpeg } from "./components/Camera.jsx";
import LessonSheet from "./components/LessonSheet.jsx";
import Passcode from "./components/Passcode.jsx";
import { useHoldToTalk } from "./lib/talk.js";
import { CameraIcon, CloseIcon, InfoIcon, KeyboardIcon, LockIcon, MicIcon } from "./components/Icons.jsx";

// Camera first. Frame a word, tap Gloo it, or hold the mic and say it. The lesson rises as a sheet.
export default function App() {
  const cam = useRef(null);
  const [health, setHealth] = useState(null);
  const [terms, setTerms] = useState([]);
  const [camState, setCamState] = useState("idle");
  const [micGranted, setMicGranted] = useState(false);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [sheet, setSheet] = useState(null); // { termId, glued }
  const [typing, setTyping] = useState(false);
  const [info, setInfo] = useState(false);
  const [pass, setPass] = useState(null); // { retry }
  const toastTimer = useRef(null);

  const say = useCallback((msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 3500); }, []);
  const loadHealth = useCallback(() => api.health().then(setHealth).catch(() => setHealth({ offline: true })), []);
  const loadTerms = useCallback(() => api.terms().then(setTerms).catch(() => {}), []);
  useEffect(() => { loadHealth(); loadTerms(); }, [loadHealth, loadTerms]);

  // Every metered action goes through here: a passcode challenge replays the action once unlocked.
  const guard = useCallback(async (fn) => {
    try { await fn(); }
    catch (e) {
      if (e?.code === "PASSCODE_REQUIRED") setPass({ retry: fn });
      else say(e?.message ?? "Something went wrong.");
    }
  }, [say]);

  const onGlued = async (result) => {
    await loadTerms();
    setSheet({ termId: result.term_id, glued: result });
    setTyping(false);
  };
  const glue = (body, label) => guard(async () => {
    setBusy(label);
    try { await onGlued(await api.glue(body)); } finally { setBusy(""); }
  });
  const frame = () => cam.current?.capture() ?? null;
  const glueFrame = () => {
    const f = frame();
    if (!f) return say("Point the camera at a word first.");
    glue({ mode: "camera", ...f }, "Reading…");
  };
  const talk = useHoldToTalk({
    stt: health?.stt,
    onPcm: ({ pcm16 }) => glue({ mode: "voice", pcm16, ...(frame() ?? {}) }, "Listening…"),
    onText: ({ transcript }) => glue({ mode: "voice", text: transcript, ...(frame() ?? {}) }, "Listening…"),
  });

  const openCamera = () => cam.current?.start();
  const onCamState = (s, extra) => { setCamState(s); if (s === "live") setMicGranted(Boolean(extra?.mic)); };
  const photo = (file) => file && guard(async () => { setBusy("Reading…"); try { await onGlued(await api.glue({ mode: "camera", ...(await fileToJpeg(file)) })); } finally { setBusy(""); } });

  const live = camState === "live";
  const locked = health?.gated && !health?.unlocked;

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-black text-paper">
      <Camera ref={cam} onState={onCamState}>
        {/* Top bar */}
        <div className="safe-top absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4">
          <span className="font-display text-2xl tracking-tight">gloo</span>
          <div className="flex items-center gap-2">
            {locked && <button className="round !h-9 !w-9" aria-label="Enter passcode" onClick={() => setPass({ retry: null })}><LockIcon /></button>}
            <button className="round !h-9 !w-9" aria-label="About this demo" onClick={() => setInfo(true)}><InfoIcon /></button>
          </div>
        </div>

        {/* Idle: one tap opens the camera, and asks for the mic in the same prompt. */}
        {(camState === "idle" || camState === "starting") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <h1 className="font-display text-5xl leading-[1.02]">Point at a hard word.<br /><em className="text-gloo">Gloo it.</em></h1>
            <p className="mt-4 max-w-xs text-sm text-paper/70">Frame the word, or just say it. You get the meaning already hidden inside it, hooked to things you already know.</p>
            <button className="btn-light mt-8" disabled={camState === "starting"} onClick={openCamera}><CameraIcon /> {camState === "starting" ? "Opening…" : "Open camera"}</button>
            <button className="mt-4 text-sm text-paper/70 underline" onClick={() => setTyping(true)}>or type a word</button>
          </div>
        )}

        {/* Camera refused or missing: photo and typing still work. */}
        {(camState === "denied" || camState === "unavailable") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <h1 className="font-display text-4xl leading-tight">{camState === "denied" ? "Camera is blocked." : "No camera here."}</h1>
            <p className="mt-3 max-w-xs text-sm text-paper/70">{camState === "denied" ? "Allow the camera in your browser's site settings, or use a photo." : "Use a photo or type the word."}</p>
            <label className="btn-light mt-6 cursor-pointer"><CameraIcon /> Take a photo
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { photo(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <button className="mt-3 text-sm text-paper/70 underline" onClick={() => setTyping(true)}>type a word</button>
            {camState === "denied" && <button className="mt-6 text-xs text-paper/50 underline" onClick={openCamera}>try the camera again</button>}
          </div>
        )}

        {live && (<>
          <p className="pointer-events-none absolute inset-x-0 z-10 text-center text-sm text-paper/80" style={{ top: "calc(50% - 22vh/2 - clamp(84px,16vh,150px)/2 - 2.2rem)" }}>
            {busy || (talk.listening ? "Listening… release when done" : "Frame the word, then tap. Or hold the mic and say it.")}
          </p>
          {/* Your words */}
          {terms.length > 0 && (
            <div className="absolute inset-x-0 z-10 flex gap-2 overflow-x-auto px-4 pb-1" style={{ bottom: "calc(8.5rem + env(safe-area-inset-bottom))", scrollbarWidth: "none" }}>
              {terms.map((t) => (
                <button key={t.id} className="shrink-0 rounded-full bg-black/50 px-3 py-1.5 text-sm text-paper backdrop-blur" onClick={() => setSheet({ termId: t.id, glued: null })}>
                  {t.title}{t.provisional && <span className="ml-1 font-mono text-[10px] opacity-70">draft</span>}
                </button>
              ))}
            </div>
          )}
          {/* Controls */}
          <div className="safe-bottom absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-7 px-6">
            <button className="round" aria-label="Type a word" onClick={() => setTyping(true)}><KeyboardIcon /></button>
            <button className="shutter" aria-label="Gloo it: read the framed word" disabled={!!busy || talk.listening} onClick={glueFrame}>
              <span className="font-display text-xl">Gloo it</span>
            </button>
            {talk.mode !== "none" ? (
              <button className={`round ${talk.listening ? "round-live listening" : ""}`} aria-label="Hold to say the word" aria-pressed={talk.listening} disabled={!!busy} {...talk.holdProps}><MicIcon /></button>
            ) : <span className="h-14 w-14" />}
          </div>
        </>)}

        {toast && <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-6" style={{ bottom: "calc(12rem + env(safe-area-inset-bottom))" }}><span className="toast">{toast}</span></div>}
        {talk.error && !toast && <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-6" style={{ bottom: "calc(12rem + env(safe-area-inset-bottom))" }}><span className="toast">{talk.error}</span></div>}
        {busy && <div className="pointer-events-none absolute inset-0 z-10 bg-black/20" />}
      </Camera>

      {typing && <TypeSheet busy={busy} onClose={() => setTyping(false)} onSubmit={(text) => glue({ text, mode: "typed" }, "Gluing…")} />}
      {sheet && <LessonSheet termId={sheet.termId} glued={sheet.glued} health={health} guard={guard}
        onClose={() => { setSheet(null); loadTerms(); }} onRegue={(body) => glue(body, "Gluing…")} />}
      {info && <InfoSheet health={health} terms={terms} micGranted={micGranted} onClose={() => setInfo(false)} onPasscode={() => { setInfo(false); setPass({ retry: null }); }} />}
      {pass && <Passcode onClose={() => setPass(null)} onUnlocked={async () => { const retry = pass.retry; setPass(null); await loadHealth(); if (retry) guard(retry); }} />}
    </div>
  );
}

function TypeSheet({ busy, onClose, onSubmit }) {
  const [text, setText] = useState("");
  const go = () => text.trim() && onSubmit(text.trim());
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet max-h-[50vh]" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="flex items-center justify-between"><h2 className="font-display text-3xl">Type it</h2><button aria-label="Close" className="round !h-10 !w-10 !bg-line/60 !text-ink" onClick={onClose}><CloseIcon /></button></div>
        <p className="mt-1 text-sm text-muted">Spelling doesn't have to be right.</p>
        <div className="mt-3 flex gap-2">
          <input autoFocus aria-label="Word to gloo" className="field" placeholder="e.g. cholecystokinin" autoCapitalize="none" value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
          <button className="btn shrink-0" disabled={!text.trim() || !!busy} onClick={go}>{busy ? "…" : "Gloo it"}</button>
        </div>
      </div>
    </div>
  );
}

function InfoSheet({ health, micGranted, onClose, onPasscode }) {
  const [msg, setMsg] = useState("");
  const download = async () => {
    const blob = new Blob([JSON.stringify(await api.exportData(), null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "gloo-my-data.json" });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const wipe = async () => { await api.deleteData(); setMsg("Deleted. Reloading…"); setTimeout(() => location.reload(), 800); };
  const row = (label, ok, note) => <li className="flex items-center justify-between"><span>{label}</span><span className={`rounded-full px-2 py-0.5 text-[11px] ${ok ? "bg-sea text-paper" : "bg-gloo-soft text-gloo-deep"}`}>{note}</span></li>;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet max-h-[75vh]" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="flex items-center justify-between"><h2 className="font-display text-3xl">Gloo × Qloo</h2><button aria-label="Close" className="round !h-10 !w-10 !bg-line/60 !text-ink" onClick={onClose}><CloseIcon /></button></div>
        <p className="mt-2 text-sm">Gloo pulls the meaning already inside a hard word, then an agent uses Qloo's taste graph to hook each part to things people like you already know. You confirm every hook. Practice hides them.</p>
        {health && !health.offline && (
          <ul className="mt-4 space-y-1.5 text-sm">
            {row("Qloo", health.qloo.ready, health.qloo.mode === "mock" ? "mock data" : health.qloo.ready ? "live" : "key missing")}
            {row("Cue agent", health.agent.mode === "live", health.agent.mode === "live" ? health.agent.model : health.agent.mode)}
            {row("Camera reading", health.camera === "live", health.camera)}
            {row("Speech", health.stt === "google", health.stt === "google" ? "server" : health.stt === "mock" ? "mock" : "browser only")}
            {row("Microphone", micGranted, micGranted ? "allowed" : "ask when held")}
            {health.gated && row("Passcode", health.unlocked, health.unlocked ? "unlocked" : "locked")}
          </ul>
        )}
        {health?.gated && !health?.unlocked && <button className="btn mt-3" onClick={onPasscode}>Enter passcode</button>}
        <p className="mt-4 text-xs text-muted">Only the framed crop and a few seconds of audio go to the server; nothing is stored. Qloo results describe what groups tend to like, not what one person knows. Not in this build: pronunciation scoring, glasses, rewards.</p>
        <p className="mt-3 flex gap-3 text-xs text-muted">
          <button className="underline" onClick={download}>Export my data</button>
          <button className="underline" onClick={wipe}>Delete my data</button>
          {msg && <span>{msg}</span>}
        </p>
      </div>
    </div>
  );
}
