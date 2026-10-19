import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import Hooks from "./Hooks.jsx";
import Practice from "./Practice.jsx";
import SayIt from "./SayIt.jsx";
import ConceptMap from "./ConceptMap.jsx";
import Provenance from "./Provenance.jsx";
import { CloseIcon } from "./Icons.jsx";

const HOW = { typed: "typed", voice: "heard", ocr: "read from a photo", camera: "read from the camera" };

// The lesson as a sheet over the camera: attempt first, then meaning, hooks and practice. Depth is one tap away.
export default function LessonSheet({ termId, glued, health, guard, onClose, onRegue }) {
  const [term, setTerm] = useState(null);
  const [progress, setProgress] = useState(null);
  const [log, setLog] = useState([]);
  const [err, setErr] = useState("");
  const load = useCallback(() => api.term(termId).then(setTerm).catch((e) => setErr(e.message)), [termId]);
  const refresh = useCallback(() => api.progress(termId).then(setProgress).catch(() => {}), [termId]);
  useEffect(() => { setTerm(null); load(); refresh(); }, [load, refresh]);
  const onCalls = (calls) => setLog((l) => [...calls.slice().reverse(), ...l]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={term?.title ?? "Lesson"}>
        <div className="sheet-handle" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[2rem] leading-none">{term?.title ?? "…"}</h2>
            {term?.pronunciation?.approx && term.pronunciation.approx !== "—" && <p className="mt-1 font-mono text-sm text-muted">{term.pronunciation.approx}</p>}
          </div>
          <button aria-label="Back to camera" className="round !h-10 !w-10 !bg-line/60 !text-ink" onClick={onClose}><CloseIcon /></button>
        </div>
        {glued && <Captured glued={glued} onRegue={onRegue} />}
        {term?.provisional && <p className="mt-3 rounded-xl bg-gloo-soft/60 px-3 py-2 text-xs">Provisional draft by the agent, not reviewed. Check it against a trusted source.</p>}
        {err && <p className="mt-3 text-sm text-red-700">{err}</p>}

        {term?.locked && <FirstAttempt term={term} health={health} guard={guard} onSaved={() => { load(); refresh(); }} />}
        {term && !term.locked && (<>
          <Means term={term} />
          <Hooks term={term} health={health} guard={guard} onCalls={onCalls} />
          <Practice term={term} health={health} guard={guard} onAttempt={refresh} />
          <Skills progress={progress} />
          <details className="mt-5 text-xs text-muted">
            <summary className="cursor-pointer">Sources and every Qloo call</summary>
            <p className="mt-2">{term.provisional ? "Not reviewed" : `Reviewed ${term.review.reviewed_at}`} · content v{term.version}</p>
            {term.sources?.length > 0 && <p className="mt-1">{term.provisional ? "Suggested by the agent (unverified): " : ""}
              {term.sources.map((s, i) => <span key={s.url}>{i > 0 && " · "}<a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</p>}
            <div className="mt-2"><Provenance log={log} /></div>
          </details>
        </>)}
      </div>
    </div>
  );
}

function Captured({ glued, onRegue }) {
  const r = glued.resolution;
  const [fixing, setFixing] = useState(false);
  const [text, setText] = useState("");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>{HOW[r.mode] ?? r.mode}{r.input.toLowerCase() !== r.word ? ` “${r.input}”` : ""} · {r.method}</span>
      {glued.alternatives?.length > 0 && <span>· also: {glued.alternatives.slice(0, 3).map((a) => <button key={a} className="mx-0.5 underline" onClick={() => onRegue({ text: a, mode: "typed" })}>{a}</button>)}</span>}
      {!fixing ? <button className="underline" onClick={() => setFixing(true)}>Wrong word?</button> : (
        <span className="flex w-full gap-2 pt-1">
          <input aria-label="Correct word" className="field py-1 text-sm" autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && text.trim() && (setFixing(false), onRegue({ text, mode: "typed" }))} />
          <button className="btn shrink-0 py-1" onClick={() => { if (text.trim()) { setFixing(false); onRegue({ text, mode: "typed" }); } }}>Fix</button>
        </span>
      )}
    </div>
  );
}

// Saved before anything about the term is shown. Say it, or type it, or skip.
function FirstAttempt({ term, health, guard, onSaved }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = (body) => guard(async () => { setBusy(true); try { await api.firstAttempt(term.id, body); onSaved(); } finally { setBusy(false); } });
  return (
    <section className="mt-5">
      <div className="step">First, your try</div>
      <p className="mt-1 text-lg leading-snug">{term.first_attempt?.question ?? "How would you say it? A guess is fine."}</p>
      <div className="mt-5"><SayIt big health={health} guard={guard} onText={(t) => save({ response: t })} label="Hold and say it" /></div>
      <div className="mt-4 flex gap-2">
        <input aria-label="Type your attempt" className="field" placeholder="or type it" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && text.trim() && save({ response: text })} />
        <button className="btn shrink-0" disabled={!text.trim() || busy} onClick={() => save({ response: text })}>Save</button>
      </div>
      <button className="mt-3 text-sm text-muted underline" disabled={busy} onClick={() => save({ skipped: true })}>I don't know it yet</button>
    </section>
  );
}

function Means({ term }) {
  const [more, setMore] = useState(false);
  return (
    <section className="mt-5">
      <p className="text-lg leading-snug">{term.summary}</p>
      {term.components?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {term.components.map((c) => <span key={c.part} className="chip"><span className="font-mono">{c.part}</span><span className="text-muted">=</span><span className="font-medium">{c.meaning}</span></span>)}
        </div>
      )}
      {term.formula && <div className="mt-3 rounded-2xl bg-ink px-4 py-3 font-mono text-paper"><div>{term.formula}</div><div className="mt-1 text-[11px] opacity-70">{term.rules?.join(" · ")}</div></div>}
      <button className="mt-3 text-sm text-muted underline" onClick={() => setMore(!more)}>{more ? "Less" : "More: definition, examples, what to keep straight"}</button>
      {more && (
        <div className="mt-3 space-y-3 text-sm">
          <p><span className="font-medium">Definition.</span> {term.definition}</p>
          {term.origin && <p className="text-muted">{term.origin}</p>}
          {term.examples && (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="font-normal">Story</th><th className="px-2 text-right font-normal">p</th><th className="px-2 text-right font-normal">y</th><th className="pl-2 text-right font-normal">loss</th></tr></thead>
              <tbody>{term.examples.map((e) => (
                <tr key={e.story} className="border-t border-line"><td className="py-1.5 pr-2">{e.story}</td><td className="px-2 text-right font-mono">{e.p}</td><td className="px-2 text-right font-mono">{e.y}</td><td className="pl-2 text-right font-mono">{e.loss}</td></tr>
              ))}</tbody>
            </table>
          )}
          {term.components?.some((c) => c.cue && c.cue !== "—") && (
            <ul className="space-y-1">{term.components.filter((c) => c.cue && c.cue !== "—").map((c) => <li key={c.part}><span className="font-mono">{c.part}</span> <span className="text-muted">· {c.cue}</span></li>)}</ul>
          )}
          {term.scene && <p className="rounded-xl bg-gloo-soft/50 p-3"><span className="font-medium">Picture it.</span> {term.scene}</p>}
          {term.distinctions?.length > 0 && (<>
            <p className="font-medium">Keep these straight</p>
            <ul className="list-disc space-y-1 pl-5">{term.distinctions.map((d) => <li key={d}>{d}</li>)}</ul>
          </>)}
          {term.transfer && (<>
            <p className="font-medium">Same operation, other worlds</p>
            <ul className="space-y-1">{term.transfer.map(([d, x]) => <li key={d}><span className="font-medium">{d}.</span> <span className="text-muted">{x}</span></li>)}</ul>
          </>)}
          {term.family && (<>
            <p className="font-medium">The word family</p>
            <ul className="space-y-1">{term.family.map(([w, why]) => <li key={w}><span className="font-medium">{w}</span> <span className="text-muted">— {why}</span></li>)}</ul>
          </>)}
          {term.graph?.edges?.length > 0 && <details><summary className="cursor-pointer text-muted">Map of cues and meanings</summary><div className="mt-2"><ConceptMap graph={term.graph} /></div></details>}
        </div>
      )}
    </section>
  );
}

const DOT = { "retained (pilot rule)": "bg-sea", "independently recalled": "bg-sea", practicing: "bg-gloo", "insufficient evidence": "bg-line", "not assessed": "bg-line" };
function Skills({ progress }) {
  if (!progress) return null;
  const items = Object.entries(progress.skills).filter(([k]) => k !== "pronunciation");
  return (
    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([skill, s]) => (
        <span key={skill} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${DOT[s.state] ?? "bg-line"}`} />{skill}: {s.state.replace(" (pilot rule)", "")}{s.independent > 0 ? ` (${s.independent})` : ""}</span>
      ))}
    </div>
  );
}
