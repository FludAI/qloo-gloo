// Renders the six documented envelope statuses honestly.
const TONE = {
  ok: null,
  empty: ["No match.", "Try a different word for the interest."],
  needs_input: ["Ambiguous.", "Pick the candidate you actually mean."],
  partial: ["Partial results.", null],
  degraded: ["Reduced quality or fallback.", null],
  error: ["Request failed.", null],
};

export default function StatusNote({ envelope }) {
  if (!envelope || !TONE[envelope.status]) return null;
  const [title, hint] = TONE[envelope.status];
  const isError = envelope.status === "error";
  return (
    <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${isError ? "border-red-300 bg-red-50 text-red-900" : "border-gloo-soft bg-gloo-soft/40 text-ink"}`}>
      <span className="font-medium">{title}</span> {envelope.summary}
      {(envelope.error?.recovery || hint) && (
        <div className="mt-1 text-muted">{envelope.error?.recovery ?? hint}</div>
      )}
      {envelope.warnings?.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-muted">{envelope.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
    </div>
  );
}
