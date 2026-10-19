// Qloo answers are cached in SQLite so a repeated lookup never spends event credit again,
// across restarts and redeploys (the DB travels with the instance; see docs/DEPLOY.md).
// Hackathon data is static, so answers stay fresh for days. Errors are never cached.
import { db } from "./db.mjs";

const TTL_MS = Number(process.env.QLOO_CACHE_TTL_HOURS ?? 24 * 7) * 3600e3;
const MAX_HOT = 500;
const hot = new Map();

db.exec("CREATE TABLE IF NOT EXISTS qloo_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, at INTEGER NOT NULL)");
const getRow = db.prepare("SELECT value, at FROM qloo_cache WHERE key = ?");
const putRow = db.prepare("INSERT OR REPLACE INTO qloo_cache (key, value, at) VALUES (?, ?, ?)");
const dropRow = db.prepare("DELETE FROM qloo_cache WHERE key = ?");

const keyOf = (op, args) => `${op}:${JSON.stringify(args, Object.keys(args ?? {}).sort())}`;

export function cached(op, args) {
  const k = keyOf(op, args);
  const h = hot.get(k);
  if (h && Date.now() - h.at <= TTL_MS) return h.value;
  const row = getRow.get(k);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) { dropRow.run(k); hot.delete(k); return null; }
  const value = JSON.parse(row.value);
  hot.set(k, { at: row.at, value });
  return value;
}

export function remember(op, args, value) {
  if (!["ok", "empty", "partial"].includes(value?.status)) return;
  const k = keyOf(op, args);
  const at = Date.now();
  if (hot.size >= MAX_HOT) hot.delete(hot.keys().next().value);
  hot.set(k, { at, value });
  try { putRow.run(k, JSON.stringify(value), at); } catch { /* cache only */ }
}
