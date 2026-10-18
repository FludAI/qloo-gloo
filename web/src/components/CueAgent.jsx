import { useEffect, useState } from "react";
import { api } from "../api.js";

const SOURCE_TONE = {
  "qloo-grounded": "bg-sea text-paper",
  editorial: "bg-ink text-paper",
  synthetic: "bg-gloo-soft text-gloo-deep",
};

export default function CueAgent({ term, agentMode, onCalls }) {
  const [familiar, setFamiliar] = useState("");
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState("");
  const [chosen, setChosen] = useState([]);
  const [declined, setDeclined] = useState(new Set());
  const [coverage, setCoverage] = useState({});
  const [err, setErr] = useState("");
  const roleLabel = Object.fromEntries(term.roles.map((r) => [r.id, r.label]));

  useEffect(() => { api.cues(term.id).then(setChosen); }, [term.id]);

  const ask = async () => {
    setBusy("agent"); setErr("");
    try {
      const items = familiar.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      const data = await api.agent(term.id, items);
      setRun(data);
      onCalls(data.calls ?? []);
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  const checkQloo = async (cue) => {
    setBusy(cue.id);
    try {
      const data = await api.resolve(cue.qloo.entity, cue.qloo.type);
      onCalls([{ request: data.request, envelope: data.envelope }]);
      setCoverage((c) => ({ ...c, [cue.id]: data }));
    } finally { setBusy(""); }
  };

  const choose = async (c) => {
    setErr("");
    try {
      setChosen(await api.addCue({ term_id: term.id, recognized: true, ...c }));
    } catch (e) { setErr(e.message); }
  };
  const remove = async (id) => { await api.removeCue(id); setChosen(await api.cues(term.id)); };
  const [editing, setEditing] = useState(null); // { id, text }
  const saveEdit = async () => {
    if (editing.text.trim()) { await api.editCue(editing.id, editing.text.trim()); setChosen(await api.cues(term.id)); }
    setEditing(null);
  };
  const isChosen = (label, role) => chosen.some((c) => c.label === label && c.role === role);

  return (
    <section className="card">
      <div className="step">03 · Cues · Qloo × agent</div>
      <h2 className="mt-1 font-display text-2xl">Hook it to things you already know</h2>
      <p className="mt-1 text-sm text-muted">
        Name a few brands, films, books, shows or artists you know. The agent looks them up in Qloo, finds what people with
        that taste also tend to know, and proposes up to three cues, each tied to a specific part of “{term.title}”.
      </p>
      <label htmlFor="fam" className="mt-3 block text-sm text-muted">Things you know (comma-separated; no personal details)</label>
      <div className="mt-1 flex gap-2">
        <input id="fam" className="field" placeholder="e.g. Breyers, Moneyball, The Office" value={familiar}
          onChange={(e) => setFamiliar(e.target.value)} onKeyDown={(e) => e.key === "Enter" && familiar.trim() && ask()} />
        <button className="btn shrink-0" disabled={!familiar.trim() || busy} onClick={ask}>{busy === "agent" ? "Thinking…" : "Find cues"}</button>
      </div>
      {agentMode === "unavailable" && <p className="mt-2 text-xs text-muted">The agent isn't configured on this server. Reviewed cues below still work.</p>}
      {err && <p className="mt-2 text-sm text-red-800">{err}</p>}

      {run && (
        <div className="mt-4">
          {run.status !== "ok" && <p className="rounded-xl border border-gloo-soft bg-gloo-soft/40 p-3 text-sm">{run.reason ?? run.notes}</p>}
          {run.trace?.length > 0 && (
            <ol className="mb-3 space-y-0.5 font-mono text-[11px] text-muted" aria-label="Agent steps">
              {run.trace.map((s, i) => (
                <li key={i}>{String(i + 1).padStart(2, "0")} {s.tool}({Object.values(s.args)[0] && JSON.stringify(Object.values(s.args)[0]).slice(0, 60)}) → {s.status} · {s.result_count}</li>
              ))}
            </ol>
          )}
          <ul className="space-y-2">
            {run.cues.filter((c) => !declined.has(c.label + c.role)).map((c) => (
              <li key={c.label + c.role} className="rounded-xl border border-line bg-paper/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="step">{roleLabel[c.role]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${SOURCE_TONE[c.source] ?? "bg-line text-ink"}`}>{c.source}</span>
                  <span className="text-[11px] text-muted">{c.connection_type}</span>
                </div>
                <div className="mt-1 font-medium">{c.label}</div>
                <p className="text-sm">{c.connection}</p>
                <p className="mt-1 text-xs text-muted">{c.grounding}</p>
                {isChosen(c.label, c.role) ? <p className="mt-2 text-sm text-sea">✓ in your cues</p> : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="btn" onClick={() => choose({ role: c.role, label: c.label, connection: c.connection, source: c.source, qloo_entity_id: c.qloo_entity_id, qloo_entity_type: c.qloo_entity_type })}>I recognize this, use it</button>
                    <button className="btn-ghost" onClick={() => setDeclined((d) => new Set(d).add(c.label + c.role))}>I don't recognize it</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {run.status === "ok" && run.cues.length === 0 && <p className="text-sm text-muted">No cue fit a specific part of the term. Try other things you know, or use a reviewed cue.</p>}
        </div>
      )}

      <h3 className="mt-6 font-display text-xl">Reviewed cues</h3>
      <ul className="mt-2 space-y-2">
        {term.editorial_cues.map((c) => {
          const cov = coverage[c.id];
          const hit = cov?.items?.[0];
          return (
            <li key={c.id} className="rounded-xl border border-line p-3">
              <div className="step">{roleLabel[c.role]}</div>
              <div className="mt-1 font-medium">{c.name}</div>
              <p className="text-sm text-muted">{c.connection}</p>
              {cov && (
                <p className="mt-1 text-xs">
                  {hit ? <>Qloo: <span className="font-medium">{hit.name}</span> <span className="font-mono text-muted">{hit.id}</span></>
                    : <span className="text-muted">No Qloo match ({cov.envelope.status}). The cue still works; it just isn't Qloo-verified.</span>}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {isChosen(c.name, c.role) ? <span className="text-sm text-sea">✓ in your cues</span> :
                  <button className="btn-ghost" onClick={() => choose({ role: c.role, label: c.name, connection: c.connection, source: hit ? "qloo-grounded" : "editorial", qloo_entity_id: hit?.id ?? null, qloo_entity_type: c.qloo?.type ?? null })}>I recognize this, use it</button>}
                {c.qloo && !cov && <button className="btn-ghost" disabled={!!busy} onClick={() => checkQloo(c)}>{busy === c.id ? "Checking…" : "Check in Qloo"}</button>}
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-6 font-display text-xl">Your cues</h3>
      {chosen.length === 0 ? <p className="mt-1 text-sm text-muted">None yet. Practice works without cues too.</p> : (
        <ul className="mt-2 space-y-2">
          {chosen.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-gloo-soft/40 p-3">
              <div className="min-w-0 flex-1">
                <div className="step">{roleLabel[c.role]}</div>
                <div className="font-medium">{c.label} <span className="ml-1 text-[11px] font-normal text-muted">{c.source}</span></div>
                {editing?.id === c.id ? (
                  <div className="mt-1 flex gap-2">
                    <input aria-label="Edit connection" className="field text-sm" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                    <button className="btn shrink-0" onClick={saveEdit}>Save</button>
                  </div>
                ) : <p className="text-sm">{c.connection}</p>}
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => setEditing({ id: c.id, text: c.connection })}>Edit</button>
                <button className="btn-ghost" onClick={() => remove(c.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
