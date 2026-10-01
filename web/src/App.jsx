import { useEffect, useState } from "react";
import { api } from "./api.js";
import StatusNote from "./components/StatusNote.jsx";
import Provenance from "./components/Provenance.jsx";

const TARGETS = ["movie", "book", "artist", "podcast", "tv_show", "videogame"];

export default function App() {
  const [health, setHealth] = useState(null);
  const [concept, setConcept] = useState("compound interest");
  const [interest, setInterest] = useState("jazz");
  const [candidates, setCandidates] = useState(null); // {envelope, items}
  const [confirmed, setConfirmed] = useState([]);    // confirmed tag items
  const [target, setTarget] = useState("movie");
  const [anchors, setAnchors] = useState(null);       // {envelope, items}
  const [lesson, setLesson] = useState(null);
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState([]);
  const [fatal, setFatal] = useState("");

  useEffect(() => { api.health().then(setHealth).catch(() => setHealth({ mode: "offline" })); }, []);

  const record = (data) => setLog((l) => [{ request: data.request, envelope: data.envelope }, ...l]);

  async function step(name, fn) {
    setBusy(name); setFatal("");
    try { await fn(); } catch (e) { setFatal(e.message); } finally { setBusy(""); }
  }

  const findTags = () => step("tags", async () => {
    const data = await api.tags(interest);
    record(data); setCandidates(data);
  });

  const toggle = (item) => setConfirmed((c) =>
    c.some((t) => t.id === item.id) ? c.filter((t) => t.id !== item.id) : [...c, item]);

  const findAnchors = () => step("anchors", async () => {
    const data = await api.anchors(confirmed.map((t) => t.id), target, "union");
    record(data); setAnchors(data); setLesson(null);
  });

  const makeLesson = () => step("lesson", async () => {
    setLesson(await api.lesson(concept, confirmed, anchors?.items ?? []));
  });

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6">
      <header>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
          <span>gloo.news</span><span>×</span><span>Qloo Taste AI</span>
          <ModeBadge health={health} />
        </div>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] sm:text-6xl">
          Learn the hard thing <em className="text-gloo-deep">through</em> what you already love.
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Gloo anchors a complex concept to cultural touchstones that people with your tastes tend to enjoy,
          using Qloo's aggregate affinity data. You confirm every match; nothing personal is sent.
        </p>
      </header>

      <section className="card mt-8">
        <div className="step">01 · Concept</div>
        <label className="mt-2 block text-sm text-muted" htmlFor="concept">What do you want to understand?</label>
        <input id="concept" className="field mt-1" value={concept} onChange={(e) => setConcept(e.target.value)} />
      </section>

      <section className="card mt-4">
        <div className="step">02 · Taste, as a concept</div>
        <label className="mt-2 block text-sm text-muted" htmlFor="interest">
          A genre, mood, or style you enjoy (not names, emails, or anything personal)
        </label>
        <div className="mt-1 flex gap-2">
          <input id="interest" className="field" value={interest} onChange={(e) => setInterest(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && interest.trim() && findTags()} />
          <button className="btn shrink-0" disabled={!interest.trim() || busy} onClick={findTags}>
            {busy === "tags" ? "Searching…" : "Find tags"}
          </button>
        </div>
        <StatusNote envelope={candidates?.envelope} />
        {candidates?.items?.length > 0 && (
          <>
            <p className="mt-4 text-sm text-muted">
              Several Qloo tags can share a name. Confirm the one(s) you mean:
            </p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {candidates.items.map((t) => {
                const on = confirmed.some((c) => c.id === t.id);
                return (
                  <li key={t.id}>
                    <button onClick={() => toggle(t)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${on ? "border-gloo bg-gloo-soft/60" : "border-line hover:border-ink"}`}>
                      <div className="font-medium">{t.name}</div>
                      <div className="truncate font-mono text-xs text-muted">{t.type ?? t.id}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {confirmed.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {confirmed.map((t) => (
              <button key={t.id} className="btn-ghost" onClick={() => toggle(t)} title="Remove">
                {t.name} <span className="font-mono text-xs">{t.type}</span> ×
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card mt-4">
        <div className="step">03 · Anchors from Qloo</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="field w-auto" value={target} onChange={(e) => setTarget(e.target.value)}>
            {TARGETS.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
          <button className="btn" disabled={!confirmed.length || busy} onClick={findAnchors}>
            {busy === "anchors" ? "Asking Qloo…" : "Find anchors"}
          </button>
        </div>
        <StatusNote envelope={anchors?.envelope} />
        {anchors?.items?.length > 0 && (
          <ol className="mt-4 divide-y divide-line">
            {anchors.items.map((a, i) => (
              <li key={a.id} className="flex items-baseline gap-3 py-2">
                <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1">
                  <div className="font-medium">{a.name}</div>
                  {a.detail && <div className="text-sm text-muted">{a.detail}</div>}
                </div>
                {a.score != null && <span className="font-mono text-xs text-sea">{Number(a.score).toFixed(2)}</span>}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">
          Qloo results describe what groups who like these tags tend to enjoy, not what any one person will do.
        </p>
      </section>

      <section className="card mt-4">
        <div className="step">04 · Gloo lesson scaffold</div>
        <button className="btn mt-2" disabled={!anchors?.items?.length || !concept.trim() || busy} onClick={makeLesson}>
          {busy === "lesson" ? "Building…" : "Build lesson"}
        </button>
        {lesson && (
          <div className="mt-4">
            <h3 className="font-display text-3xl">{lesson.concept}</h3>
            <ol className="mt-3 space-y-3">
              {lesson.hooks.map((h) => (
                <li key={h.anchor} className="rounded-xl border border-line bg-paper/60 p-3">
                  <div className="step">{h.role} · {h.anchor}</div>
                  <p className="mt-1">{h.prompt}</p>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-muted">
              Review on days {lesson.review_schedule_days.join(", ")}. Engine: <span className="font-mono">{lesson.engine}</span>
            </p>
            <p className="mt-1 text-xs text-muted">{lesson.caveat}</p>
          </div>
        )}
      </section>

      {fatal && <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{fatal}</p>}

      <Provenance log={log} />
    </div>
  );
}

function ModeBadge({ health }) {
  if (!health) return null;
  const label = health.mode === "mock" ? "MOCK DATA"
    : health.mode === "offline" ? "backend offline"
    : health.qloo_ready ? "Qloo live" : "Qloo key missing";
  const tone = health.mode === "live" && health.qloo_ready ? "bg-sea text-paper" : "bg-gloo-soft text-gloo-deep";
  return <span className={`ml-auto rounded-full px-2 py-0.5 ${tone}`}>{label}</span>;
}
