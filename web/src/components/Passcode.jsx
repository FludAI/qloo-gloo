import { useState } from "react";
import { api } from "../api.js";

// Camera, voice and the agent cost money to run. The hosted demo asks once per session.
// A shared link can carry the code (?code=...) so nobody has to type it; this sheet is the fallback.
export default function Passcode({ onUnlocked, onClose }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true); setErr("");
    try { await api.unlock(code.trim()); onUnlocked(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet max-h-[60vh]" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="font-display text-3xl">Demo passcode</h2>
        <p className="mt-1 text-sm text-paper/70">Camera, voice and the cue agent are metered. Use the link you were given, or enter the passcode from it.</p>
        <div className="mt-4 flex gap-2">
          <input autoFocus aria-label="Passcode" className="field" inputMode="text" autoCapitalize="none" autoCorrect="off" value={code}
            onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="passcode" />
          <button className="btn-light shrink-0" disabled={!code.trim() || busy} onClick={submit}>{busy ? "…" : "Unlock"}</button>
        </div>
        {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
        <p className="mt-4 text-xs text-paper/50">The two reviewed lessons work without it.</p>
      </div>
    </div>
  );
}
