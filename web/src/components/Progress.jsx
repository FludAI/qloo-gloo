const fmt = (ms) => {
  const d = ms - Date.now();
  if (d <= 0) return "due now";
  const m = Math.round(d / 60e3);
  return m < 60 ? `due in ${m} min` : m < 1440 ? `due in ${Math.round(m / 60)} h` : `due in ${Math.round(m / 1440)} d`;
};

export default function Progress({ progress }) {
  if (!progress) return null;
  return (
    <section className="card">
      <div className="step">05 · Progress</div>
      <p className="mt-1 text-sm text-muted">Each skill is tracked on its own. No overall mastery percentage.</p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.entries(progress.skills).map(([skill, s]) => (
          <div key={skill} className="rounded-xl border border-line p-3">
            <dt className="step">{skill}</dt>
            <dd className="mt-1 font-medium">{s.state}</dd>
            {s.attempts > 0 && (
              <dd className="mt-1 text-xs text-muted">
                {s.independent} on your own · {s.hinted} with hint · {s.incorrect} missed · {fmt(s.due_at)}
              </dd>
            )}
            {s.note && <dd className="mt-1 text-xs text-muted">{s.note}</dd>}
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">Review gaps (pilot policy): now, 30 min, 4 h, 1 day, 3 days, 7 days. A hinted answer keeps the current gap.</p>
    </section>
  );
}
