// Versioned per-skill schedule, derived from immutable attempts with an injected clock.
// Policy: minimum gaps from the latest qualifying attempt at each stage (pilot defaults, configurable).
export const POLICY = {
  version: "pilot-1",
  gaps_ms: [0, 30 * 60e3, 4 * 3600e3, 24 * 3600e3, 3 * 24 * 3600e3, 7 * 24 * 3600e3],
  retry_after_error_ms: 30 * 60e3,
};

// attempts: [{ skill, outcome, independent, created_at (ms) }] for one term, oldest first
export function deriveSkill(attempts, now = Date.now(), policy = POLICY) {
  const valid = attempts.filter((a) => a.outcome === "correct" || a.outcome === "incorrect");
  if (valid.length === 0) return { state: "insufficient evidence", stage: 0, due_at: now, attempts: attempts.length, independent: 0, hinted: 0, incorrect: 0 };
  let stage = 0;
  let dueAt = now;
  let independent = 0, hinted = 0, incorrect = 0;
  for (const a of valid) {
    if (a.outcome === "correct" && a.independent) {
      independent++;
      stage = Math.min(stage + 1, policy.gaps_ms.length - 1);
      dueAt = a.created_at + policy.gaps_ms[stage];
    } else if (a.outcome === "correct") {
      hinted++; // hinted success keeps the current stage
      dueAt = a.created_at + policy.gaps_ms[stage];
    } else {
      incorrect++;
      dueAt = a.created_at + policy.retry_after_error_ms;
    }
  }
  const state = independent === 0 ? "practicing" : stage >= policy.gaps_ms.length - 1 ? "retained (pilot rule)" : "independently recalled";
  return { state, stage, due_at: dueAt, due_now: dueAt <= now, attempts: attempts.length, independent, hinted, incorrect, policy: policy.version };
}
