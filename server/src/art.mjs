// Pictures for the favorite picks: the lead image of the matching Wikipedia article,
// fetched once, cached in SQLite, and served from here so the browser never talks to
// Wikipedia and the demo keeps working offline after the first load.
import { db } from "./db.mjs";

const UA = "qloo-gloo/0.1 (hackathon demo; https://github.com/FludAI/qloo-gloo)";
const TTL_MS = 30 * 24 * 3600e3;
const WIDTH = 640;
const hot = new Map();

db.exec("CREATE TABLE IF NOT EXISTS art (title TEXT PRIMARY KEY, mime TEXT, bytes BLOB, at INTEGER NOT NULL)");
const getRow = db.prepare("SELECT mime, bytes, at FROM art WHERE title = ?");
const putRow = db.prepare("INSERT OR REPLACE INTO art (title, mime, bytes, at) VALUES (?, ?, ?, ?)");

async function fetchArt(title) {
  const slug = encodeURIComponent(title.replace(/ /g, "_"));
  const sum = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!sum.ok) return null;
  const j = await sum.json();
  let src = j.thumbnail?.source ?? j.originalimage?.source;
  if (!src) return null;
  src = src.replace(/\/(\d+)px-/, `/${WIDTH}px-`); // ask for a larger thumbnail of the same file
  let img = await fetch(src, { headers: { "user-agent": UA } });
  if (!img.ok) img = await fetch(j.thumbnail.source, { headers: { "user-agent": UA } });
  if (!img.ok) return null;
  const mime = img.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!mime.startsWith("image/")) return null;
  const bytes = new Uint8Array(await img.arrayBuffer());
  if (bytes.length > 3_000_000) return null;
  return { mime, bytes };
}

// Returns { mime, bytes } or null. Misses are remembered briefly so a bad title doesn't hammer Wikipedia.
export async function art(title) {
  const key = String(title ?? "").trim().slice(0, 120);
  if (!key) return null;
  const h = hot.get(key);
  if (h && Date.now() - h.at < TTL_MS) return h.value;
  const row = getRow.get(key);
  if (row && Date.now() - row.at < TTL_MS) {
    const value = row.mime ? { mime: row.mime, bytes: row.bytes } : null;
    hot.set(key, { at: row.at, value });
    return value;
  }
  let value = null;
  try { value = await fetchArt(key); } catch { value = null; }
  const at = Date.now();
  hot.set(key, { at: value ? at : at - TTL_MS + 3600e3, value }); // a miss is retried after an hour
  try { putRow.run(key, value?.mime ?? null, value?.bytes ?? null, value ? at : at - TTL_MS + 3600e3); } catch { /* cache only */ }
  return value;
}
