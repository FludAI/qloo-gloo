import { useEffect, useState } from "react";
import { api, newKey } from "../api.js";

export default function Practice({ term, onAttempt }) {
  const [data, setData] = useState(null);
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey());

  const load = async (after) => {
    setData(await api.next(term.id, after)); setAnswer(""); setHint(""); setResult(null); setKey(newKey());
  };
  useEffect(() => { load(); }, [term.id]);

  const submit = async (value = answer) => {
    if (busy || result) return;
    setBusy(true);
    try {
      setResult(await api.attempt({ prompt_id: data.prompt.id, response: value, idempotency_key: key }));
      onAttempt();
    } finally { setBusy(false); }
  };

  if (!data) return null;
  const p = data.prompt;
  const tone = result?.outcome === "correct" ? "border-sea bg-sea/10" : result?.outcome === "uncertain" ? "border-gloo-soft bg-gloo-soft/40" : "border-red-300 bg-red-50";
  return (
    <section className="card">
      <div className="step">04 · Practice · {data.total - data.remaining}/{data.total} recalled on your own</div>
      <p className="mt-1 text-xs text-muted">Skill: {p.skill}. Cues are hidden here; recall it without them.</p>
      <p className="mt-3 text-lg">{p.question}</p>
      {p.type === "choice" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {p.options.map((o) => <button key={o} className="btn-ghost" disabled={!!result || busy} onClick={() => submit(o)}>{o}</button>)}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <input aria-label="Your answer" className="field" inputMode={p.type === "number" ? "decimal" : "text"} value={answer}
            disabled={!!result} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && answer.trim() && submit()} />
          <button className="btn shrink-0" disabled={!answer.trim() || busy || !!result} onClick={() => submit()}>Submit</button>
        </div>
      )}
      {!result && p.has_hint && (
        hint ? <p className="mt-2 text-sm text-gloo-deep">Hint: {hint}</p>
          : <button className="mt-2 text-sm text-muted underline" onClick={async () => setHint((await api.hint(p.id)).hint)}>Show a hint (won't count as independent)</button>
      )}
      {result && (
        <div className={`mt-3 rounded-xl border p-3 text-sm ${tone}`}>
          <div className="font-medium">{result.feedback}</div>
          {result.answer && <div className="mt-1">Answer: {result.answer}</div>}
          {result.note && <div className="mt-1 text-muted">{result.note}</div>}
          {result.outcome === "uncertain" && <div className="mt-1 text-muted">Not counted. You can try again.</div>}
          <button className="btn mt-3" onClick={() => load(p.id)}>Next</button>
        </div>
      )}
    </section>
  );
}
