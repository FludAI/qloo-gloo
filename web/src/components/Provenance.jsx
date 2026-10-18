// Every Qloo call behind the screen: request and full envelope.
export default function Provenance({ log }) {
  if (!log.length) return null;
  return (
    <section className="card">
      <div className="step">Provenance</div>
      <h2 className="mt-1 font-display text-2xl">Every Qloo call behind your cues</h2>
      <div className="mt-3 space-y-2">
        {log.map((entry, i) => (
          <details key={i} className="rounded-xl border border-line bg-paper/60 p-3">
            <summary className="cursor-pointer text-sm">
              <span className="font-mono">{entry.request.operation}</span>
              <span className="ml-2 text-muted">→ {entry.envelope.status}</span>
              {entry.envelope.cache === "hit" && <span className="ml-2 text-muted">(cached)</span>}
              <span className="ml-2 text-muted">{entry.envelope.provenance?.source ?? entry.envelope.execution?.transport_name ?? ""}</span>
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-ink p-3 font-mono text-xs text-paper">
{JSON.stringify({ request: entry.request, envelope: entry.envelope }, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </section>
  );
}
