import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Camera from "./components/Camera.jsx";
import Flow from "./components/Flow.jsx";
import Passcode from "./components/Passcode.jsx";
import AmbientGate from "./components/AmbientGate.jsx";
import { useHoldToTalk } from "./lib/talk.js";
import { sfx, warmAudio } from "./lib/sfx.js";
import { configureSpeech, lastSpoken, speechMode, unlockAudio } from "./lib/speak.js";
import { CameraIcon, CloseIcon, InfoIcon, LockIcon, MicIcon, PictureIcon } from "./components/Icons.jsx";
import { imageFrom, isPhone } from "./lib/device.js";

// Gloo is a camera. Camera and mic on (phone or glasses), or a shared window on a desktop, or a picture of
// the word; you don't proceed without one of them. No typing anywhere.
// Frame a word and tap, or hold the mic and say it. The scan sweeps the frame, drops a tick per
// piece it finds, then the lesson rises as cards over the viewfinder.
export default function App() {
  const cam = useRef(null);
  const [health, setHealth] = useState(null);
  const [terms, setTerms] = useState([]);
  const [camState, setCamState] = useState("idle");
  const [micGranted, setMicGranted] = useState(false);
  const [source, setSource] = useState(null); // camera | screen | image
  const picker = useRef(null);
  const [busy, setBusy] = useState("");
  const [scan, setScan] = useState(null);
  const [toast, setToast] = useState("");
  const [sheet, setSheet] = useState(null); // { termId, glued }
  const [info, setInfo] = useState(false);
  const [pass, setPass] = useState(null); // { retry }
  const toastTimer = useRef(null);

  const say = useCallback((msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 3500); }, []);
  const loadHealth = useCallback(() => api.health().then((h) => { configureSpeech(h); setHealth(h); }).catch(() => setHealth({ offline: true })), []);
  const loadTerms = useCallback(() => api.terms().then(setTerms).catch(() => {}), []);
  useEffect(() => {
    // A shared link can carry the passcode (?code=...), so nobody has to type it.
    const code = new URLSearchParams(location.search).get("code");
    const boot = code ? api.unlock(code).catch(() => {}).then(() => history.replaceState(null, "", location.pathname)) : Promise.resolve();
    boot.then(() => { loadHealth(); loadTerms(); });
  }, [loadHealth, loadTerms]);

  // Every metered action goes through here: a passcode challenge replays the action once unlocked.
  const guard = useCallback(async (fn) => {
    try { await fn(); }
    catch (e) {
      if (e?.code === "PASSCODE_REQUIRED") setPass({ retry: fn });
      else say(e?.message ?? "Something went wrong.");
    }
  }, [say]);

  // Scan: the sweep runs while the server reads; when the word is known, one tick per piece drops
  // under the frame, the frame locks, and the lesson opens.
  const onGlued = async (result) => {
    await loadTerms();
    let pieces = 0;
    try { pieces = (await api.term(result.term_id)).pieces?.length ?? 0; } catch { /* lesson still opens */ }
    if (pieces) { setScan({ pieces }); sfx("lock", 120 + pieces * 150 + 260); await new Promise((r) => setTimeout(r, 120 + pieces * 150 + 520)); }
    setScan(null);
    setSheet({ termId: result.term_id, glued: result });
  };
  const glue = (body, label) => guard(async () => {
    setBusy(label); if (body.mode === "camera" || body.image) setScan("sweep");
    try { await onGlued(await api.glue(body)); } catch (e) { setScan(null); throw e; } finally { setBusy(""); }
  });
  const frame = () => cam.current?.capture() ?? null;
  const glueFrame = () => {
    const f = frame();
    if (!f) return say(source === "camera" ? "Point the camera at a word first." : "Move the word into the frame first.");
    glue({ mode: "camera", ...f }, "Reading…");
  };
  const talk = useHoldToTalk({
    stt: health?.stt,
    onPcm: ({ pcm16 }) => glue({ mode: "voice", pcm16, ...(frame() ?? {}) }, "Listening…"),
    onText: ({ transcript }) => glue({ mode: "voice", text: transcript, ...(frame() ?? {}) }, "Listening…"),
  });

  const openCamera = (which = "camera") => { warmAudio(); unlockAudio(); cam.current?.start(which); };
  const showPicture = (file) => { if (!file) return; warmAudio(); unlockAudio(); cam.current?.show(file); };
  const onCamState = (s, extra) => { setCamState(s); setSource(extra?.source ?? null); if (s === "live") setMicGranted((m) => m || Boolean(extra?.mic)); };
  // A screenshot pasted or an image dropped anywhere on the page is the word.
  useEffect(() => {
    const onPaste = (e) => { const f = imageFrom(e.clipboardData); if (f) { e.preventDefault(); showPicture(f); } };
    const onDrop = (e) => { e.preventDefault(); const f = imageFrom(e.dataTransfer); if (f) showPicture(f); };
    const onDrag = (e) => { if ([...(e.dataTransfer?.types ?? [])].includes("Files")) e.preventDefault(); };
    window.addEventListener("paste", onPaste); window.addEventListener("drop", onDrop); window.addEventListener("dragover", onDrag);
    return () => { window.removeEventListener("paste", onPaste); window.removeEventListener("drop", onDrop); window.removeEventListener("dragover", onDrag); };
  }, []);
  const pickFile = (e) => { const f = e.target.files?.[0]; e.target.value = ""; showPicture(f); };
  const live = camState === "live";
  const locked = health?.gated && !health?.unlocked;

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-black text-paper">
      <Camera ref={cam} onState={onCamState} scan={scan}>
        <div className="safe-top absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4">
          <img src="/brand/gloo-logo-on-dark.svg" alt="Gloo" className="h-8 w-auto" draggable="false" />
          <div className="flex items-center gap-2">
            {locked && <button className="round !h-9 !w-9" aria-label="Enter passcode" onClick={() => setPass({ retry: null })}><LockIcon /></button>}
            <button className="round !h-9 !w-9" aria-label="About this demo" onClick={() => setInfo(true)}><InfoIcon /></button>
          </div>
        </div>

        {!live && <AmbientGate state={camState} source={source} onStart={openCamera} onPick={showPicture} />}

        {live && (<>
          <p className="pointer-events-none absolute inset-x-0 z-10 text-center text-sm text-paper/80" style={{ top: "calc(50% - 22vh/2 - clamp(84px,16vh,150px)/2 - 2.2rem)" }}>
            {busy || (talk.listening ? "Listening… release when done" : source === "camera" ? "Frame the word and tap, or hold the mic and say it." : "Drag the word into the frame, then tap or hold the mic and say it.")}
          </p>
          {terms.length > 0 && !sheet && (
            <div className="absolute inset-x-0 z-10 flex gap-2 overflow-x-auto px-4 pb-1" style={{ bottom: "calc(8.5rem + env(safe-area-inset-bottom))", scrollbarWidth: "none" }}>
              {terms.map((t) => (
                <button key={t.id} className="shrink-0 rounded-full bg-black/50 px-3 py-1.5 text-sm text-paper backdrop-blur" onClick={() => setSheet({ termId: t.id, glued: null })}>
                  {t.title}{t.provisional && <span className="ml-1 font-mono text-[10px] opacity-70">draft</span>}
                </button>
              ))}
            </div>
          )}
          <div className="safe-bottom absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-8 px-6">
            <button className="round" aria-label={isPhone() ? "Take a picture of the word" : "Use a picture of the word"} disabled={!!busy} onClick={() => picker.current?.click()}><PictureIcon /></button>
            <input ref={picker} type="file" accept="image/*" capture={isPhone() ? "environment" : undefined} className="hidden" onChange={pickFile} />
            <button className="shutter" aria-label="Gloo it: read the framed word" disabled={!!busy || talk.listening} onClick={glueFrame}>
              <span className="font-display text-xl">Gloo it</span>
            </button>
            {talk.mode !== "none" ? (
              <button className={`round ${talk.listening ? "round-live listening" : ""}`} aria-label="Hold to say the word" aria-pressed={talk.listening} disabled={!!busy} {...talk.holdProps}><MicIcon /></button>
            ) : <span className="h-14 w-14" />}
          </div>
        </>)}

        {(toast || (talk.error && !busy)) && <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-6" style={{ bottom: "calc(12rem + env(safe-area-inset-bottom))" }}><span className="toast">{toast || talk.error}</span></div>}
      </Camera>

      {sheet && <Flow termId={sheet.termId} glued={sheet.glued} health={health} guard={guard}
        onClose={() => { setSheet(null); loadTerms(); }} onRegue={(body) => glue(body, "Gluing…")} />}
      {info && <InfoSheet health={health} micGranted={micGranted} onClose={() => setInfo(false)} onPasscode={() => { setInfo(false); setPass({ retry: null }); }} />}
      {pass && <Passcode onClose={() => setPass(null)} onUnlocked={async () => { const retry = pass.retry; setPass(null); await loadHealth(); if (retry) guard(retry); }} />}
    </div>
  );
}

// Owner's debug area: did the last clip sound right? Right pins it forever; wrong unpins it. Not part of the learner flow.
function VerifyClip() {
  const last = lastSpoken();
  const [state, setState] = useState("");
  if (!last) return <p className="mt-4 font-mono text-[11px] text-paper/40">debug · voice {speechMode()} · nothing played yet</p>;
  const mark = (verified) => api.sayVerify({ ...last, verified }).then((r) => setState(r.verified ? "pinned" : "unpinned")).catch((e) => setState(e.message));
  return (
    <div className="mt-4 rounded-xl border border-paper/15 px-3 py-2 font-mono text-[11px] text-paper/60">
      <div>debug · voice {speechMode()} · last: “{last.text.slice(0, 60)}{last.text.length > 60 ? "…" : ""}”</div>
      <div className="mt-1.5 flex items-center gap-2">
        <button className="rounded-full border border-paper/30 px-2 py-0.5" onClick={() => mark(true)}>sounds right</button>
        <button className="rounded-full border border-paper/30 px-2 py-0.5" onClick={() => mark(false)}>sounds wrong</button>
        {state && <span>{state}</span>}
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
  const row = (label, ok, note) => <li className="flex items-center justify-between"><span>{label}</span><span className={`rounded-full px-2 py-0.5 text-[11px] ${ok ? "bg-sea text-paper" : "bg-gloo/30 text-paper"}`}>{note}</span></li>;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet max-h-[75vh]" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="flex items-center justify-between"><h2 className="font-display text-3xl">Gloo × Qloo</h2><button aria-label="Close" className="round !h-10 !w-10" onClick={onClose}><CloseIcon /></button></div>
        <p className="mt-2 text-sm text-paper/80">Gloo pulls the sound pieces out of a hard word and hooks each one to something you already like. Your picks are the hooks. Practice hides them.</p>
        {health && !health.offline && (
          <ul className="mt-4 space-y-1.5 text-sm">
            {row("Camera reading", health.camera === "live", health.camera)}
            {row("Speech", health.stt === "google", health.stt === "google" ? "server" : health.stt === "mock" ? "mock" : "browser only")}
            {row("Voice", health.tts === "google", health.tts === "google" ? health.voice ?? "server" : "browser only")}
            {row("Microphone", micGranted, micGranted ? "allowed" : "ask when held")}
            {row("Cue agent", health.agent.mode === "live", health.agent.mode === "live" ? health.agent.model : health.agent.mode)}
            {row("Qloo", health.qloo.ready, health.qloo.mode === "mock" ? "mock data" : health.qloo.ready ? "live" : "key missing")}
            {health.gated && row("Passcode", health.unlocked, health.unlocked ? "unlocked" : "locked")}
          </ul>
        )}
        {health?.gated && !health?.unlocked && <button className="btn-light mt-3" onClick={onPasscode}>Enter passcode</button>}
        {health?.tts === "google" && health?.unlocked && <VerifyClip />}
        <p className="mt-4 text-xs text-paper/50">Only the framed crop and a few seconds of audio go to the server; nothing is stored. Motion studies: <a className="underline" href="/motion/studies.html">/motion/studies.html</a>.</p>
        <p className="mt-3 flex gap-3 text-xs text-paper/60">
          <button className="underline" onClick={download}>Export my data</button>
          <button className="underline" onClick={wipe}>Delete my data</button>
          {msg && <span>{msg}</span>}
        </p>
      </div>
    </div>
  );
}
