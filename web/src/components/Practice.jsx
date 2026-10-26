import { useEffect, useMemo, useRef, useState } from "react";
import { api, newKey } from "../api.js";
import SayIt from "./SayIt.jsx";
import { AnswerRing, shake } from "./Motion.jsx";
import { PawRow, useHeardToes } from "./Paw.jsx";
import { bareTitle, pawPlan } from "../lib/paw.js";
import { speak, hush } from "../lib/speak.js";

const squash = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
// Is this reviewed answer the word itself (not a meaning, a number or a piece)?
const isTheWord = (answer, term) => { const a = squash(answer), w = squash(bareTitle(term)); return Boolean(a && w) && (a === w || a.includes(w)); };

// One prompt at a time. Say the answer, or tap a choice. Cues stay hidden here.
// Feedback: a ring closes with a chime on a hit, a shake and the answer on a miss, a soft ring on uncertain.
// The paw lights toes from the learner's voice while they speak; it settles to right or wrong only when the
// answer was the word itself, and goes back to idle for any other answer.
export default function Practice({ term, health, guard, onAttempt, onDone }) {
  const plan = useMemo(() => pawPlan(term), [term.id]);
  const paw = useHeardToes(plan);
  const [data, setData] = useState(null);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState(null);
  const [heard, setHeard] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey());
  const host = useRef(null);

  const load = async (after) => {
    setData(await api.next(term.id, after)); setHint(""); setResult(null); setHeard(""); setKey(newKey()); paw.reset();
  };
  useEffect(() => { load().catch(() => {}); return hush; }, [term.id]);
  useEffect(() => { if (data?.prompt && !result) speak(data.prompt.question, { term }); }, [data?.prompt?.id]);

  const submit = (value) => guard(async () => {
    if (busy || result || !String(value).trim()) return;
    setBusy(true); setHeard(value); hush();
    try {
      const r = await api.attempt({ prompt_id: data.prompt.id, response: value, idempotency_key: key });
      setResult(r); onAttempt?.();
      // The paw judges only the word itself: every toe gold on a hit, dim on a miss; other answers leave it idle.
      if (isTheWord(r.answer, term) && r.outcome !== "uncertain") paw.settle({ pieces: plan.targets.slice(1).map(() => ({ said: r.outcome === "correct" })), said_count: r.outcome === "correct" ? plan.targets.length - 1 : 0 });
      else paw.reset();
      if (r.outcome === "incorrect") { shake(host.current); setTimeout(() => speak(r.answer ? `${r.feedback} ${r.answer}` : r.feedback, { term }), 480); }
      else if (r.outcome === "correct") setTimeout(() => speak(r.feedback, { term }), 500);
    } finally { setBusy(false); }
  });

  if (!data) return null;
  const p = data.prompt;
  return (
    <section className="mt-4" ref={host}>
      <div className="flex items-baseline justify-between">
        <div className="step">Try it</div>
        <span className="font-mono text-[10px] text-paper/60">{data.total - data.remaining}/{data.total} on your own · {p.skill}</span>
      </div>
      <div className="relative mt-2 flex min-h-[180px] items-center justify-center text-center">
        <AnswerRing outcome={result?.outcome} />
        <p className="relative max-w-[16rem] text-xl leading-snug">{p.question}</p>
      </div>
      {!result && (p.type === "choice" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {p.options.map((o) => <button key={o} className="tile" disabled={busy} onClick={() => submit(o)}>{o}</button>)}
        </div>
      ) : (
        <div className="mt-2">
          <PawRow n={plan.count} states={paw.states} size={plan.count > 5 ? 52 : 64} className="mb-2" label={`${plan.count} syllables`} />
          <SayIt big health={health} guard={guard} promptId={p.id} onText={submit} onLevel={paw.onLevel} onListening={paw.onListening} label={p.type === "number" ? "Hold and say the number" : "Hold and say your answer"} />
        </div>
      ))}
      {!result && p.has_hint && (
        hint ? <p className="mt-3 text-center text-sm text-gloo">Hint: {hint}</p>
          : <button className="mt-3 w-full text-center text-sm text-paper/60 underline" onClick={() => guard(async () => setHint((await api.hint(p.id)).hint))}>Hint (won't count as on your own)</button>
      )}
      {result && (
        <div className="mt-2 text-center text-sm fade-in" style={{ animationDelay: ".45s" }}>
          {heard && <div className="text-xs text-paper/60">You said: “{heard}”</div>}
          <div className={`mt-1 text-lg font-medium ${result.outcome === "incorrect" ? "text-gloo" : ""}`}>{result.outcome === "incorrect" && result.answer ? result.answer : result.feedback}</div>
          {result.note && <div className="mt-1 text-paper/60">{result.note}</div>}
          {result.outcome === "uncertain" && <div className="mt-1 text-paper/60">Not counted. Try again.</div>}
          {result.provisional && <div className="mt-1 text-paper/60">Checked against an unreviewed draft.</div>}
          <div className="mt-3 flex justify-center gap-2">
            <button className="btn-light" onClick={() => load(p.id)}>Next question</button>
            {data.remaining <= 1 && onDone && <button className="btn-ghost" onClick={onDone}>Finish</button>}
          </div>
        </div>
      )}
    </section>
  );
}
