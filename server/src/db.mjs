// SQLite via Node's built-in node:sqlite (no native build step; works on Windows).
// Local: server/data/gloo.db. Cloud Run: set DB_PATH (see docs/DEPLOY.md for durability notes).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const path = process.env.DB_PATH ?? resolve(here, "../data/gloo.db");
if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS learners (sid TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS first_attempts (
  sid TEXT NOT NULL, term_id TEXT NOT NULL, response TEXT, skipped INTEGER NOT NULL, content_version TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (sid, term_id));
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY, sid TEXT NOT NULL, term_id TEXT NOT NULL, prompt_id TEXT NOT NULL, skill TEXT NOT NULL,
  response TEXT, outcome TEXT NOT NULL, hinted INTEGER NOT NULL, independent INTEGER NOT NULL,
  content_version TEXT, idem_key TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (sid, idem_key));
CREATE TABLE IF NOT EXISTS hint_exposures (sid TEXT NOT NULL, prompt_id TEXT NOT NULL, created_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS learner_cues (
  id INTEGER PRIMARY KEY, sid TEXT NOT NULL, term_id TEXT NOT NULL, role TEXT NOT NULL, label TEXT NOT NULL,
  connection TEXT NOT NULL, source TEXT NOT NULL, qloo_entity_id TEXT, qloo_type TEXT, recognized INTEGER NOT NULL,
  removed_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS provider_calls (
  id INTEGER PRIMARY KEY, sid TEXT, provider TEXT NOT NULL, op TEXT NOT NULL, status TEXT NOT NULL, cache TEXT, duration_ms REAL, created_at INTEGER NOT NULL);
`);

export const q = {
  ensureLearner: db.prepare("INSERT OR IGNORE INTO learners (sid, created_at) VALUES (?, ?)"),
  getFirst: db.prepare("SELECT * FROM first_attempts WHERE sid = ? AND term_id = ?"),
  putFirst: db.prepare("INSERT OR IGNORE INTO first_attempts VALUES (?, ?, ?, ?, ?, ?)"),
  attemptByKey: db.prepare("SELECT * FROM attempts WHERE sid = ? AND idem_key = ?"),
  insertAttempt: db.prepare(`INSERT INTO attempts (sid, term_id, prompt_id, skill, response, outcome, hinted, independent, content_version, idem_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  attemptsFor: db.prepare("SELECT * FROM attempts WHERE sid = ? AND term_id = ? ORDER BY created_at, id"),
  openHint: db.prepare("SELECT rowid FROM hint_exposures WHERE sid = ? AND prompt_id = ? AND consumed = 0 LIMIT 1"),
  addHint: db.prepare("INSERT INTO hint_exposures (sid, prompt_id, created_at) VALUES (?, ?, ?)"),
  consumeHints: db.prepare("UPDATE hint_exposures SET consumed = 1 WHERE sid = ? AND prompt_id = ?"),
  cuesFor: db.prepare("SELECT id, term_id, role, label, connection, source, qloo_entity_id, qloo_type, created_at FROM learner_cues WHERE sid = ? AND term_id = ? AND removed_at IS NULL ORDER BY created_at"),
  addCue: db.prepare(`INSERT INTO learner_cues (sid, term_id, role, label, connection, source, qloo_entity_id, qloo_type, recognized, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  editCue: db.prepare("UPDATE learner_cues SET connection = ? WHERE id = ? AND sid = ? AND removed_at IS NULL"),
  removeCue: db.prepare("UPDATE learner_cues SET removed_at = ? WHERE id = ? AND sid = ?"),
  logCall: db.prepare("INSERT INTO provider_calls (sid, provider, op, status, cache, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  callCounts: db.prepare("SELECT provider, status, COUNT(*) AS n FROM provider_calls WHERE sid = ? GROUP BY provider, status"),
};

export function exportLearner(sid) {
  const all = (t) => db.prepare(`SELECT * FROM ${t} WHERE sid = ?`).all(sid);
  return { first_attempts: all("first_attempts"), attempts: all("attempts"), learner_cues: all("learner_cues"), provider_calls: all("provider_calls") };
}

export function deleteLearner(sid) {
  db.exec("BEGIN");
  try {
    for (const t of ["first_attempts", "attempts", "hint_exposures", "learner_cues", "provider_calls", "learners"]) {
      db.prepare(`DELETE FROM ${t} WHERE sid = ?`).run(sid);
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}
