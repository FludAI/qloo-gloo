import { useEffect, useState } from "react";
import { api } from "../api.js";
import { CloseIcon } from "./Icons.jsx";

// The words sheet: reviewed lessons, this learner's recent words, and the words people look up most.
// One tap opens a lesson, camera or not. Opened from a small button in the top bar; the gate stays clean.
export default function WordsSheet({ onPick, onClose }) {
  const [words, setWords] = useState(null);
  useEffect(() => { api.words().then(setWords).catch(() => setWords({ reviewed: [], recent: [], popular: [] })); }, []);
  const group = (title, list, note) => list?.length > 0 && (
    <section className="mt-4">
      <h3 className="font-mono text-[11px] uppercase tracking-wider text-paper/50">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map((w) => (
          <button key={w.id} className="rounded-full border border-paper/20 bg-paper/5 px-3 py-1.5 text-sm text-paper active:scale-95" onClick={() => onPick(w.id)}>
            {w.title}{w.provisional && <span className="ml-1 font-mono text-[10px] opacity-60">draft</span>}{note?.(w)}
          </button>
        ))}
      </div>
    </section>
  );
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet max-h-[75vh]" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="flex items-center justify-between"><h2 className="font-display text-3xl">Words</h2><button aria-label="Close" className="round !h-10 !w-10" onClick={onClose}><CloseIcon /></button></div>
        <p className="mt-1 text-sm text-paper/70">Tap a word to open it. No camera needed.</p>
        {!words && <p className="mt-4 text-sm text-paper/50">Loading…</p>}
        {words && group("Reviewed", words.reviewed)}
        {words && group("Your recent words", words.recent)}
        {words && group("Looked up most this week", words.popular, (w) => w.count > 1 ? <span className="ml-1 font-mono text-[10px] opacity-60">×{w.count}</span> : null)}
        {words && !words.reviewed?.length && !words.recent?.length && !words.popular?.length && <p className="mt-4 text-sm text-paper/50">No words yet.</p>}
      </div>
    </div>
  );
}
