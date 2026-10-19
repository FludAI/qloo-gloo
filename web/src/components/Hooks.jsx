import { useEffect, useState } from "react";
import { api } from "../api.js";

const TONE = { "qloo-grounded": "bg-sea text-paper", editorial: "bg-ink text-paper", synthetic: "bg-gloo-soft text-gloo-deep" };

// Hook the term to things the learner already knows. Compact: one input, cue cards, yes/no.
export default function Hooks({ term, health, onCalls, guard }) {
  const [familiar, setFamiliar] = useState("");
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState([]);
  const [declined, setDeclined] = useState(() => new Set());
  const roleLabel = Object.fromEntries(term.roles.map((r) => [r.id, r.label]));
  useEffect(() => { api.cues(term.id).then(setChosen).catch(() => {}); }, [term.id]);

  const ask = () => guard(async () => {
    const items = familiar.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    setBusy(true);
    try { const data = await api.agent(term.id, items); setRun(data); onCalls?.(data.calls ?? []); }
    finally { setBusy(false); }
  });
  const choose = (c) => guard(async () => setChosen(await api.addCue({ term_id: term.id, recognized: true, ...c })));
  const remove = (id) => guard(async () => { await api.removeCue(id); setChosen(await api.cues(term.id)); });
  const isChosen = (label, role) => chosen.some((c) => c.label === label && c.role === role);
  const agentOff = health?.agent?.mode === "unavailable";

  const proposals = run?.cues?.filter((c) => !declined.has(c.label + c.role)) ?? [];
  const reviewed = term.editorial_cues ?? [];

  return (
    <section className="mt-5">
      <div className="step">Hook it</div>
      <p className="mt-1 text-sm text-muted">Name a few things you like. The agent finds hooks people with your taste already know.</p>
      <div className="mt-2 flex gap-2">
        <input className="field" placeholder="Breyers, Moneyball, The Office…" value={familiar} autoCapitalize="words"
          onChange={(e) => setFamiliar(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
        <button className="btn shrink-0" disabled={!familiar.trim() || busy || agentOff} onClick={ask}>{busy ? "…" : "Find"}</button>
      </div>
      {agentOff && <p className="mt-1 text-xs text-muted">The agent isn't configured here; the reviewed hooks still work.</p>}
      {run && run.status !== "ok" && <p className="mt-2 rounded-xl bg-gloo-soft/50 p-2 text-sm">{run.reason ?? run.notes}</p>}
      {run?.status === "ok" && proposals.length === 0 && <p className="mt-2 text-sm text-muted">No hook fit a specific part. Try other things you like.</p>}

      {(proposals.length > 0 || reviewed.length > 0) && (
        <ul className="mt-3 space-y-2">
          {proposals.map((c) => <Cue key={"p" + c.label + c.role} label={c.label} role={roleLabel[c.role]} text={c.connection} source={c.source}
            chosen={isChosen(c.label, c.role)}
            onYes={() => choose({ role: c.role, label: c.label, connection: c.connection, source: c.source, qloo_entity_id: c.qloo_entity_id, qloo_entity_type: c.qloo_entity_type })}
            onNo={() => setDeclined((d) => new Set(d).add(c.label + c.role))} />)}
          {reviewed.filter((c) => !declined.has(c.name + c.role)).map((c) => <Cue key={"r" + c.id} label={c.name} role={roleLabel[c.role]} text={c.connection} source="editorial"
            chosen={isChosen(c.name, c.role)}
            onYes={() => choose({ role: c.role, label: c.name, connection: c.connection, source: "editorial", qloo_entity_id: null, qloo_entity_type: c.qloo?.type ?? null })}
            onNo={() => setDeclined((d) => new Set(d).add(c.name + c.role))} />)}
        </ul>
      )}

      {chosen.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chosen.map((c) => (
            <span key={c.id} className="chip">
              <span className="font-medium">{c.label}</span><span className="text-muted">· {roleLabel[c.role]}</span>
              <button aria-label={`Remove ${c.label}`} className="ml-1 text-muted" onClick={() => remove(c.id)}>×</button>
            </span>
          ))}
        </div>
      )}
      {run?.trace?.length > 0 && (
        <p className="mt-2 font-mono text-[10px] text-muted">
          {run.trace.map((s, i) => `${s.tool.replace("qloo_", "")}→${s.result_count}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function Cue({ label, role, text, source, chosen, onYes, onNo }) {
  return (
    <li className="rounded-2xl border border-line bg-white/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{label} <span className="ml-1 font-mono text-[10px] font-normal uppercase tracking-wider text-muted">{role}</span></div>
          <p className="mt-0.5 text-sm text-ink/80">{text}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${TONE[source] ?? "bg-line text-ink"}`}>{source === "qloo-grounded" ? "Qloo" : source}</span>
      </div>
      <div className="mt-2 flex gap-2">
        {chosen ? <span className="text-sm text-sea">✓ yours</span> : <>
          <button className="btn py-1.5" onClick={onYes}>I know this</button>
          <button className="btn-ghost" onClick={onNo}>Not for me</button>
        </>}
      </div>
    </li>
  );
}
