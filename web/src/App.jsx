import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import FirstAttempt from "./components/FirstAttempt.jsx";
import Lesson from "./components/Lesson.jsx";
import CueAgent from "./components/CueAgent.jsx";
import Practice from "./components/Practice.jsx";
import Progress from "./components/Progress.jsx";
import Provenance from "./components/Provenance.jsx";

export default function App() {
  const [health, setHealth] = useState(null);
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ offline: true }));
    api.terms().then((t) => { setTerms(t); setTermId((id) => id ?? t[0]?.id); });
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <header>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
          <span>gloo.news</span><span>×</span><span>Qloo</span>
          <span className="ml-auto flex flex-wrap gap-1.5"><Badges health={health} /></span>
        </div>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] sm:text-6xl">
          Learn the hard word <em className="text-gloo-deep">through</em> what you already know.
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Gloo pulls the memory value already inside a term, then an agent uses Qloo's taste graph to find cultural
          touchstones people like you tend to know, and ties each one to a specific sound, meaning or step.
        </p>
      </header>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Lessons">
        {terms.map((t) => (
          <button key={t.id} onClick={() => setTermId(t.id)} aria-current={t.id === termId}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${t.id === termId ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}>
            {t.title}
          </button>
        ))}
      </nav>

      {termId && <TermView key={termId} termId={termId} health={health} />}

      <footer className="mt-10 space-y-2 text-xs text-muted">
        <p>Qloo results describe what groups tend to like, not what one person knows or will do. You confirm every cue.</p>
        <DataControls />
      </footer>
    </div>
  );
}

function TermView({ termId, health }) {
  const [term, setTerm] = useState(null);
  const [progress, setProgress] = useState(null);
  const [log, setLog] = useState([]);
  const load = useCallback(() => api.term(termId).then(setTerm), [termId]);
  const refresh = useCallback(() => api.progress(termId).then(setProgress), [termId]);
  useEffect(() => { load(); refresh(); }, [load, refresh]);
  const onCalls = (calls) => setLog((l) => [...calls.slice().reverse(), ...l]);

  if (!term) return null;
  if (term.locked) return <div className="mt-6"><FirstAttempt term={term} onSaved={() => { load(); refresh(); }} /></div>;
  return (
    <div className="mt-6 space-y-4">
      <Lesson term={term} />
      <CueAgent term={term} agentMode={health?.agent?.mode} onCalls={onCalls} />
      <Practice term={term} onAttempt={refresh} />
      <Progress progress={progress} />
      <Provenance log={log} />
    </div>
  );
}

function Badges({ health }) {
  if (!health) return null;
  if (health.offline) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-900">server offline</span>;
  const q = health.qloo.mode === "mock" ? ["Qloo: mock data", false] : health.qloo.ready ? ["Qloo: live", true] : ["Qloo: key missing", false];
  const a = health.agent.mode === "live" ? [`Agent: ${health.agent.model}`, true] : health.agent.mode === "synthetic" ? ["Agent: synthetic", false] : ["Agent: unavailable", false];
  return [q, a].map(([label, ok]) => (
    <span key={label} className={`rounded-full px-2 py-0.5 ${ok ? "bg-sea text-paper" : "bg-gloo-soft text-gloo-deep"}`}>{label}</span>
  ));
}

function DataControls() {
  const [msg, setMsg] = useState("");
  const download = async () => {
    const blob = new Blob([JSON.stringify(await api.exportData(), null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "gloo-my-data.json" });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const wipe = async () => { await api.deleteData(); setMsg("Your data was deleted."); setTimeout(() => location.reload(), 800); };
  return (
    <p className="flex flex-wrap gap-3">
      <button className="underline" onClick={download}>Export my data</button>
      <button className="underline" onClick={wipe}>Delete my data and start over</button>
      {msg && <span>{msg}</span>}
    </p>
  );
}
