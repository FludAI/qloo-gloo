import { useState } from "react";
import { api } from "../api.js";

// Saved before anything about the term is revealed.
export default function FirstAttempt({ term, onSaved }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (skipped) => {
    setBusy(true);
    try { await api.firstAttempt(term.id, skipped ? { skipped: true } : { response: text }); onSaved(); }
    finally { setBusy(false); }
  };
  return (
    <section className="card">
      <div className="step">01 · First attempt</div>
      <h2 className="mt-1 font-display text-3xl">{term.title}</h2>
      <label htmlFor="fa" className="mt-3 block text-ink">{term.first_attempt.question}</label>
      <textarea id="fa" rows={3} className="field mt-2" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" disabled={!text.trim() || busy} onClick={() => save(false)}>Save my attempt</button>
        <button className="btn-ghost" disabled={busy} onClick={() => save(true)}>I don't know yet</button>
      </div>
      <p className="mt-3 text-xs text-muted">Your guess is saved before the lesson opens, so we can see what you already knew.</p>
    </section>
  );
}
