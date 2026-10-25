// Pictures for the favorite picks: the lead image of the matching Wikipedia article, fetched once.
// Durable copy in the media store (art/<sha256(title)>, bytes plus a JSON sidecar) so pictures
// survive a redeploy; SQLite on the instance is the hot cache in front of it, a Map in front of that.
// The browser never talks to Wikipedia, so the demo keeps working offline after the first load.
import { db } from "./db.mjs";
import { media, sha256 } from "./media.mjs";

const UA = "qloo-gloo/0.1 (hackathon demo; https://github.com/FludAI/qloo-gloo)";
const TTL_MS = 30 * 24 * 3600e3;
const MISS_TTL_MS = 3600e3; // a miss is retried after an hour
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
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length > 3_000_000) return null;
  return { mime, bytes };
}

export const artKey = (title) => `art/${sha256(String(title).trim().toLowerCase())}`;
const fresh = (at) => Date.now() - at < TTL_MS;
const stamp = (value) => (value ? Date.now() : Date.now() - TTL_MS + MISS_TTL_MS);

// Returns { mime, bytes } or null. Misses are remembered briefly so a bad title doesn't hammer Wikipedia.
export async function art(title, { store = media } = {}) {
  const key = String(title ?? "").trim().slice(0, 120);
  if (!key) return null;
  const h = hot.get(key);
  if (h && fresh(h.at)) return h.value;
  const row = getRow.get(key);
  if (row && fresh(row.at)) {
    const value = row.mime ? { mime: row.mime, bytes: row.bytes } : null;
    hot.set(key, { at: row.at, value });
    return value;
  }
  // The durable copy: a hit here costs nothing and survives redeploys.
  let value = null, at = null;
  try {
    const side = await store.getJson(`${artKey(key)}.json`);
    if (side && fresh(side.at)) {
      const bytes = side.mime ? await store.get(`${artKey(key)}.bin`) : null;
      if (!side.mime || bytes) { value = side.mime ? { mime: side.mime, bytes } : null; at = side.at; }
    }
  } catch { /* fall through to Wikipedia */ }
  if (at === null) {
    try { value = await fetchArt(key); } catch { value = null; }
    at = stamp(value);
    try {
      if (value) await store.put(`${artKey(key)}.bin`, value.bytes, value.mime);
      await store.putJson(`${artKey(key)}.json`, { title: key, mime: value?.mime ?? null, at });
    } catch (e) { console.warn("art store:", e.message); }
  }
  hot.set(key, { at, value });
  try { putRow.run(key, value?.mime ?? null, value?.bytes ?? null, at); } catch { /* cache only */ }
  return value;
}
