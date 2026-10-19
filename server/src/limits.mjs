// Bounded usage for a public demo that spends the event quota and model budget.
const WINDOW_MS = 60 * 60e3;
const LIMITS = {
  qloo: Number(process.env.LIMIT_QLOO_PER_SESSION_HOUR ?? 60),
  agent: Number(process.env.LIMIT_AGENT_PER_SESSION_HOUR ?? 8),
  agent_global: Number(process.env.LIMIT_AGENT_GLOBAL_DAY ?? 300),
  stt: Number(process.env.LIMIT_STT_PER_SESSION_HOUR ?? 40),
  camera: Number(process.env.LIMIT_CAMERA_PER_SESSION_HOUR ?? 40),
};
const buckets = new Map();
let globalAgent = { day: new Date().toDateString(), n: 0 };

export function take(kind, sid) {
  if (kind === "agent") {
    const today = new Date().toDateString();
    if (globalAgent.day !== today) globalAgent = { day: today, n: 0 };
    if (globalAgent.n >= LIMITS.agent_global) return { ok: false, reason: "The demo's daily agent budget is used up. The rest of the lesson still works." };
  }
  const key = `${kind}:${sid}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= LIMITS[kind]) return { ok: false, reason: `Hourly ${kind} limit reached for this session. Try again later; learning still works.` };
  hits.push(now);
  buckets.set(key, hits);
  if (kind === "agent") globalAgent.n++;
  return { ok: true };
}
