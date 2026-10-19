import { useEffect, useState } from "react";
import { api, newKey } from "../api.js";
import SayIt from "./SayIt.jsx";

// One prompt at a time. Say the answer or type it. Hooks stay hidden here.
export default function Practice({ term, health, onAttempt, guard }) {
  const [data, setData] = useState(null);
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey());

  const load = async (after) => {
    setData(await api.next(term.id, after)); setAnswer(""); setHint(""); setResult(null); setKey(newKey());
  };
  useEffect(() => { load().catch(() => {}); }, [term.id]);

  const submit = (value = answer) => guard(async () => {
    if (busy || result || !String(value).trim()) return;
    setBusy(true);
    try { setResult(await api.attempt({ prompt_id: data.prompt.id, response: value, idempotency_key: key })); onAttempt?.(); }
    finally { setBusy(false); }
  });

  if (!data) return null;
  const p = data.prompt;
  const tone = result?.outcome === "correct" ? "border-sea bg-sea/10" : result?.outcome === "uncertain" ? "border-gloo-soft bg-gloo-soft/40" : "border-red-300 bg-red-50";
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between">
        <div className="step">Try it</div>
        <span className="font-mono text-[10px] text-muted">{data.total - data.remaining}/{data.total} on your own · {p.skill}</span>
      </div>
      <p className="mt-2 text-lg leading-snug">{p.question}</p>
      {p.type === "choice" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {p.options.map((o) => <button key={o} className="btn-ghost" disabled={!!result || busy} onClick={() => submit(o)}>{o}</button>)}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <input aria-label="Your answer" className="field" inputMode={p.type === "number" ? "decimal" : "text"} value={answer} placeholder="say it or type it"
            disabled={!!result} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {!result && p.type !== "number" && <SayIt health={health} guard={guard} onText={(t) => { setAnswer(t); submit(t); }} />}
          <button className="btn shrink-0" disabled={!answer.trim() || busy || !!result} onClick={() => submit()}>Go</button>
        </div>
      )}
      {!result && p.has_hint && (
        hint ? <p className="mt-2 text-sm text-gloo-deep">Hint: {hint}</p>
          : <button className="mt-2 text-sm text-muted underline" onClick={() => guard(async () => setHint((await api.hint(p.id)).hint))}>Hint (won't count as on your own)</button>
      )}
      {result && (
        <div className={`mt-3 rounded-2xl border p-3 text-sm ${tone}`}>
          <div className="font-medium">{result.feedback}</div>
          {result.answer && <div className="mt-1">Answer: {result.answer}</div>}
          {result.note && <div className="mt-1 text-muted">{result.note}</div>}
          {result.outcome === "uncertain" && <div className="mt-1 text-muted">Not counted. Try again.</div>}
          {result.provisional && <div className="mt-1 text-muted">Checked against an unreviewed draft.</div>}
          <button className="btn mt-3" onClick={() => load(p.id)}>Next</button>
        </div>
      )}
    </section>
  );
}
