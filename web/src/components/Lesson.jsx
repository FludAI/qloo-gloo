import ConceptMap from "./ConceptMap.jsx";

export default function Lesson({ term }) {
  return (
    <section className="card">
      {term.provisional && (
        <p className="mb-3 rounded-xl border border-gloo bg-gloo-soft/50 p-3 text-sm">
          <span className="font-medium">Provisional draft.</span> {term.origin === "synthetic" ? "Synthetic placeholder (mock mode)." : "Drafted by the agent; not reviewed."} Check it against a trusted source before relying on it.
        </p>
      )}
      <div className="step">02 · Lesson</div>
      <h2 className="mt-1 font-display text-3xl">{term.title}</h2>
      <p className="mt-1 font-mono text-sm text-muted">say it: {term.pronunciation.approx}</p>
      <p className="mt-3 text-lg leading-snug">{term.summary}</p>
      <p className="mt-3 text-sm"><span className="font-medium">Definition.</span> {term.definition}</p>
      {term.origin && <p className="mt-1 text-sm text-muted">{term.origin}</p>}

      {term.formula && (
        <div className="mt-4 rounded-xl bg-ink p-4 text-paper">
          <div className="font-mono text-lg">{term.formula}</div>
          <div className="mt-1 font-mono text-xs opacity-70">{term.rules.join(" · ")}</div>
        </div>
      )}
      {term.examples && (
        <table className="mt-4 w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="font-normal">Story</th><th className="px-2 text-right font-normal">p</th><th className="px-2 text-right font-normal">y</th><th className="pl-2 text-right font-normal">loss</th></tr></thead>
          <tbody>{term.examples.map((e) => (
            <tr key={e.story} className="border-t border-line"><td className="py-1.5 pr-2">{e.story}</td><td className="px-2 text-right font-mono">{e.p}</td><td className="px-2 text-right font-mono">{e.y}</td><td className="pl-2 text-right font-mono">{e.loss}</td></tr>
          ))}</tbody>
        </table>
      )}
      {term.components && (
        <table className="mt-4 w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="font-normal">Part</th><th className="font-normal">Means</th><th className="font-normal">Memory cue</th></tr></thead>
          <tbody>{term.components.map((c) => (
            <tr key={c.part} className="border-t border-line align-top"><td className="py-1.5 pr-2 font-mono">{c.part}</td><td className="pr-2 font-medium">{c.meaning}</td><td className="text-muted">{c.cue}</td></tr>
          ))}</tbody>
        </table>
      )}
      {term.scene && <p className="mt-3 rounded-xl bg-gloo-soft/50 p-3 text-sm"><span className="font-medium">Scene.</span> {term.scene}</p>}

      {term.distinctions?.length > 0 && (<>
        <h3 className="mt-6 font-display text-xl">Keep these straight</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{term.distinctions.map((d) => <li key={d}>{d}</li>)}</ul>
      </>)}

      {term.graph?.edges?.length > 0 && (<>
        <h3 className="mt-6 font-display text-xl">Map</h3>
        <div className="mt-2"><ConceptMap graph={term.graph} /></div>
      </>)}

      {term.transfer && (<>
        <h3 className="mt-6 font-display text-xl">Same operation, other worlds</h3>
        <ul className="mt-2 space-y-1 text-sm">{term.transfer.map(([d, x]) => <li key={d}><span className="font-medium">{d}.</span> <span className="text-muted">{x}</span></li>)}</ul>
      </>)}
      {term.family && (<>
        <h3 className="mt-6 font-display text-xl">The word family</h3>
        <ul className="mt-2 space-y-1 text-sm">{term.family.map(([w, why, scope]) => (
          <li key={w}><span className="font-medium">{w}</span> <span className="text-muted">— {why}</span>{scope === "extension" && <span className="ml-1 font-mono text-[11px] text-muted">(extension)</span>}</li>
        ))}</ul>
      </>)}

      <p className="mt-6 text-xs text-muted">
        {term.provisional ? "Not reviewed" : `Reviewed ${term.review.reviewed_at}`} · content v{term.version}
        {term.sources?.length > 0 && <> · {term.provisional ? "Sources suggested by the agent (unverified)" : "Sources"}:{" "}
          {term.sources.map((s, i) => <span key={s.url}>{i > 0 && " · "}<a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</>}
      </p>
    </section>
  );
}
