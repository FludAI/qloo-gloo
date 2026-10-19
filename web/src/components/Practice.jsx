import { useEffect, useState } from "react";
import { api, newKey } from "../api.js";
import SayIt from "./SayIt.jsx";

// One prompt at a time. Say the answer, or tap a choice. Cues stay hidden here.
export default function Practice({ term, health, guard, onAttempt, onDone }) {
  const [data, setData] = useState(null);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState(null);
  const [heard, setHeard] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey());

  const load = async (after) => {
    setData(await api.next(term.id, after)); setHint(""); setResult(null); setHeard(""); setKey(newKey());
  };
  useEffect(() => { load().catch(() => {}); }, [term.id]);

  const submit = (value) => guard(async () => {
    if (busy || result || !String(value).trim()) return;
    setBusy(true); setHeard(value);
    try { setResult(await api.attempt({ prompt_id: data.prompt.id, response: value, idempotency_key: key })); onAttempt?.(); }
    finally { setBusy(false); }
  });

  if (!data) return null;
  const p = data.prompt;
  const tone = result?.outcome === "correct" ? "border-sea bg-sea/20" : result?.outcome === "uncertain" ? "border-gloo/60 bg-gloo/15" : "border-red-400/60 bg-red-500/15";
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between">
        <div className="step">Try it</div>
        <span className="font-mono text-[10px] text-paper/60">{data.total - data.remaining}/{data.total} on your own · {p.skill}</span>
      </div>
      <p className="mt-2 text-xl leading-snug">{p.question}</p>
      {!result && (p.type === "choice" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {p.options.map((o) => <button key={o} className="tile" disabled={busy} onClick={() => submit(o)}>{o}</button>)}
        </div>
      ) : (
        <div className="mt-5"><SayIt big health={health} guard={guard} onText={submit} label={p.type === "number" ? "Hold and say the number" : "Hold and say your answer"} /></div>
      ))}
      {!result && p.has_hint && (
        hint ? <p className="mt-3 text-center text-sm text-gloo">Hint: {hint}</p>
          : <button className="mt-3 w-full text-center text-sm text-paper/60 underline" onClick={() => guard(async () => setHint((await api.hint(p.id)).hint))}>Hint (won't count as on your own)</button>
      )}
      {result && (
        <div className={`mt-4 rounded-2xl border p-3 text-sm ${tone}`}>
          {heard && <div className="mb-1 text-xs text-paper/60">You said: “{heard}”</div>}
          <div className="font-medium">{result.feedback}</div>
          {result.answer && <div className="mt-1 text-paper/80">Answer: {result.answer}</div>}
          {result.note && <div className="mt-1 text-paper/60">{result.note}</div>}
          {result.outcome === "uncertain" && <div className="mt-1 text-paper/60">Not counted. Try again.</div>}
          {result.provisional && <div className="mt-1 text-paper/60">Checked against an unreviewed draft.</div>}
          <div className="mt-3 flex gap-2">
            <button className="btn-light" onClick={() => load(p.id)}>Next question</button>
            {data.remaining <= 1 && onDone && <button className="btn-ghost" onClick={onDone}>Finish</button>}
          </div>
        </div>
      )}
    </section>
  );
}
