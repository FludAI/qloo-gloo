// Small TTL cache so repeated UI clicks don't spend the event quota.
const TTL_MS = 30 * 60 * 1000;
const MAX = 500;
const store = new Map();

const keyOf = (op, args) => `${op}:${JSON.stringify(args, Object.keys(args).sort())}`;

export function cached(op, args) {
  const k = keyOf(op, args);
  const hit = store.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { store.delete(k); return null; }
  return hit.value;
}

export function remember(op, args, value) {
  // Only cache answers, never errors.
  if (!["ok", "empty", "partial"].includes(value?.status)) return;
  if (store.size >= MAX) store.delete(store.keys().next().value);
  store.set(keyOf(op, args), { at: Date.now(), value });
}
