import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import Practice from "./Practice.jsx";
import SayIt from "./SayIt.jsx";
import { CloseIcon } from "./Icons.jsx";

// After capture: one card at a time over the camera. Say it → meaning → your picks → practice → progress.
// No typing anywhere. Picks are favorites among options that all carry the cue, so any choice works.
const HOW = { typed: "typed", voice: "heard", ocr: "read from a photo", camera: "read from the camera" };

export default function Flow({ termId, glued, health, guard, onClose, onRegue }) {
  const [term, setTerm] = useState(null);
  const [progress, setProgress] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const load = useCallback(() => api.term(termId).then(setTerm).catch((e) => setErr(e.message)), [termId]);
  const refresh = useCallback(() => api.progress(termId).then(setProgress).catch(() => {}), [termId]);
  useEffect(() => { setTerm(null); setStep(0); load(); refresh(); api.cues(termId).then(setChosen).catch(() => {}); }, [termId, load, refresh]);

  const pickRoles = useMemo(() => (term?.roles ?? []).filter((r) => r.pick?.options?.length), [term]);
  // Steps: 0 meaning · 1..n picks · n+1 practice · n+2 progress
  const steps = ["meaning", ...pickRoles.map((r) => `pick:${r.id}`), "practice", "progress"];
  const current = steps[Math.min(step, steps.length - 1)];
  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const pickFor = (roleId) => chosen.find((c) => c.role === roleId);
  const choose = (role, o) => guard(async () => {
    const prev = pickFor(role.id);
    if (prev) await api.removeCue(prev.id);
    setChosen(await api.addCue({ term_id: term.id, recognized: true, role: role.id, label: o.name, connection: o.connection, source: "pick", qloo_entity_id: null, qloo_entity_type: o.qloo?.type ?? null }));
    setTimeout(next, 350);
  });

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={term?.title ?? "Lesson"}>
        <div className="sheet-handle" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[2rem] leading-none">{term?.title ?? "…"}</h2>
            {term?.pronunciation?.approx && term.pronunciation.approx !== "—" && <p className="mt-1 font-mono text-sm text-paper/60">{term.pronunciation.approx}</p>}
          </div>
          <button aria-label="Back to camera" className="round !h-10 !w-10" onClick={onClose}><CloseIcon /></button>
        </div>
        {glued && <Captured glued={glued} onRegue={onRegue} onClose={onClose} />}
        {term?.provisional && <p className="mt-3 rounded-xl bg-gloo/20 px-3 py-2 text-xs text-paper/80">Provisional draft by the agent, not reviewed.</p>}
        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}

        {term?.locked && <FirstAttempt term={term} health={health} guard={guard} onSaved={() => { load(); refresh(); }} />}

        {term && !term.locked && (<>
          <Dots steps={steps} at={step} onPick={setStep} />
          {current === "meaning" && <Meaning term={term} onNext={next} />}
          {current.startsWith("pick:") && (() => {
            const role = pickRoles.find((r) => `pick:${r.id}` === current);
            const mine = pickFor(role.id);
            return (
              <section className="mt-4">
                <div className="step">{role.label}</div>
                <p className="mt-1 text-xl leading-snug">{role.pick.question}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {role.pick.options.map((o) => (
                    <button key={o.name} className={`tile ${mine?.label === o.name ? "tile-on" : ""}`} onClick={() => choose(role, o)}>{o.name}</button>
                  ))}
                </div>
                {mine && <p className="mt-3 text-sm text-paper/70">{mine.connection}</p>}
                <Nav onBack={back} onNext={next} nextLabel={mine ? "Next" : "Skip"} />
              </section>
            );
          })()}
          {current === "practice" && (<>
            <Practice term={term} health={health} guard={guard} onAttempt={refresh} onDone={next} />
            <Nav onBack={back} onNext={next} nextLabel="Done" />
          </>)}
          {current === "progress" && (<>
            <Skills progress={progress} chosen={chosen} term={term} />
            <div className="mt-5 flex gap-2">
              <button className="btn-light flex-1" onClick={onClose}>Gloo another word</button>
              <button className="btn-ghost" onClick={() => setStep(steps.indexOf("practice"))}>Practice more</button>
            </div>
          </>)}
        </>)}
      </div>
    </div>
  );
}

function Dots({ steps, at, onPick }) {
  return (
    <div className="mt-3 flex gap-1.5" aria-label="Steps">
      {steps.map((s, i) => <button key={s} aria-label={s} className={`h-1.5 flex-1 rounded-full ${i <= at ? "bg-gloo" : "bg-paper/20"}`} onClick={() => onPick(i)} />)}
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel }) {
  return (
    <div className="mt-5 flex items-center justify-between">
      <button className="btn-ghost" onClick={onBack}>Back</button>
      <button className="btn-light" onClick={onNext}>{nextLabel}</button>
    </div>
  );
}

function Captured({ glued, onRegue, onClose }) {
  const r = glued.resolution;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-paper/60">
      <span>{HOW[r.mode] ?? r.mode}{r.input.toLowerCase() !== r.word ? ` “${r.input}”` : ""}</span>
      {glued.alternatives?.length > 0 && <span>· not this? {glued.alternatives.slice(0, 3).map((a) => <button key={a} className="mx-0.5 underline" onClick={() => onRegue({ text: a, mode: "typed" })}>{a}</button>)}</span>}
      <button className="underline" onClick={onClose}>gloo again</button>
    </div>
  );
}

// Saved before anything about the term is shown. Say it, or admit you don't know it yet.
function FirstAttempt({ term, health, guard, onSaved }) {
  const [busy, setBusy] = useState(false);
  const save = (body) => guard(async () => { setBusy(true); try { await api.firstAttempt(term.id, body); onSaved(); } finally { setBusy(false); } });
  return (
    <section className="mt-5">
      <div className="step">First, your try</div>
      <p className="mt-1 text-xl leading-snug">{term.first_attempt?.question ?? "How would you say it? A guess is fine."}</p>
      <div className="mt-6"><SayIt big health={health} guard={guard} onText={(t) => save({ response: t })} label="Hold and say it" /></div>
      <button className="mt-6 w-full text-sm text-paper/60 underline" disabled={busy} onClick={() => save({ skipped: true })}>I don't know it yet</button>
    </section>
  );
}

function Meaning({ term, onNext }) {
  const [more, setMore] = useState(false);
  return (
    <section className="mt-4">
      <p className="text-xl leading-snug">{term.summary}</p>
      {term.components?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {term.components.map((c) => <span key={c.part} className="chip"><span className="font-mono">{c.part}</span><span className="text-paper/50">=</span><span className="font-medium">{c.meaning}</span></span>)}
        </div>
      )}
      {term.formula && <div className="mt-4 rounded-2xl bg-paper/10 px-4 py-3 font-mono"><div>{term.formula}</div><div className="mt-1 text-[11px] text-paper/60">{term.rules?.join(" · ")}</div></div>}
      {term.examples && (
        <ul className="mt-3 space-y-1 text-sm text-paper/80">{term.examples.map((e) => <li key={e.story} className="flex justify-between gap-3"><span>{e.story}</span><span className="font-mono shrink-0">{e.loss}</span></li>)}</ul>
      )}
      <button className="mt-3 text-sm text-paper/60 underline" onClick={() => setMore(!more)}>{more ? "Less" : "More"}</button>
      {more && (
        <div className="mt-3 space-y-2 text-sm text-paper/80">
          <p>{term.definition}</p>
          {term.origin && <p className="text-paper/60">{term.origin}</p>}
          {term.distinctions?.length > 0 && <ul className="list-disc space-y-1 pl-5">{term.distinctions.map((d) => <li key={d}>{d}</li>)}</ul>}
          {term.family && <ul className="space-y-1">{term.family.map(([w, why]) => <li key={w}><span className="font-medium text-paper">{w}</span> <span className="text-paper/60">— {why}</span></li>)}</ul>}
          {term.transfer && <ul className="space-y-1">{term.transfer.map(([d, x]) => <li key={d}><span className="font-medium text-paper">{d}.</span> <span className="text-paper/60">{x}</span></li>)}</ul>}
          {term.sources?.length > 0 && <p className="text-xs text-paper/50">{term.sources.map((s, i) => <span key={s.url}>{i > 0 && " · "}<a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</p>}
        </div>
      )}
      <div className="mt-5 flex justify-end"><button className="btn-light" onClick={onNext}>Next</button></div>
    </section>
  );
}

const DOT = { "retained (pilot rule)": "bg-sea", "independently recalled": "bg-sea", practicing: "bg-gloo", "insufficient evidence": "bg-paper/30", "not assessed": "bg-paper/30" };
function Skills({ progress, chosen, term }) {
  const roleLabel = Object.fromEntries((term?.roles ?? []).map((r) => [r.id, r.label]));
  return (
    <section className="mt-4">
      <div className="step">Where you stand</div>
      {progress && (
        <ul className="mt-2 space-y-1.5 text-sm">
          {Object.entries(progress.skills).filter(([k]) => k !== "pronunciation").map(([skill, s]) => (
            <li key={skill} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${DOT[s.state] ?? "bg-paper/30"}`} /><span className="capitalize">{skill}</span><span className="text-paper/60">· {s.state.replace(" (pilot rule)", "")}{s.independent > 0 ? ` (${s.independent} on your own)` : ""}</span></li>
          ))}
        </ul>
      )}
      {chosen.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {chosen.map((c) => <span key={c.id} className="chip"><span className="font-medium">{c.label}</span><span className="text-paper/50">· {roleLabel[c.role] ?? c.role}</span></span>)}
        </div>
      )}
      <p className="mt-3 text-xs text-paper/50">Next review: {progress ? "30 min, then 4 h, 1 day, 3 days, 7 days" : "…"}. Hinted answers don't count as on your own.</p>
    </section>
  );
}
