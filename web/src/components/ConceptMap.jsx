// Typed relationships as an accessible list. Cue edges and meaning edges are visibly different.
const KIND = (rel) =>
  /sound|cue|context|association|reinforcement|tally/.test(rel) ? "cue"
  : /meaning|function|names|input|lower|resolved/.test(rel) ? "meaning" : "structure";
const TONE = { cue: "border-gloo text-gloo-deep", meaning: "border-sea text-sea", structure: "border-line text-muted" };

export default function ConceptMap({ graph }) {
  const label = Object.fromEntries(graph.nodes.map(([id, name]) => [id, name]));
  return (
    <div>
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="rounded-full border border-gloo px-2 py-0.5 text-gloo-deep">memory cue</span>
        <span className="rounded-full border border-sea px-2 py-0.5 text-sea">actual meaning / operation</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-muted">structure</span>
      </div>
      <ul className="mt-3 space-y-1.5" aria-label="Concept map relationships">
        {graph.edges.map(([s, t, rel], i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium">{label[s]}</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${TONE[KIND(rel)]}`}>{rel} →</span>
            <span className="font-medium">{label[t]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">A map of proposed learning routes, not a picture of the brain.</p>
    </div>
  );
}
