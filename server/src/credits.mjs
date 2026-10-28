// Gloo credits, phase 1 (docs/DECISIONS.md 33; spec: the owner's credits brief of 2026-10-27).
// An append-only ledger: every change of balance is one row with a reason and an idempotency key, and the
// balance is a sum, never a stored number. Welcome Gloo on first contact; one Gloo per word the agent drafts
// (refunded when the draft fails, never charged twice for the same word); Gloo for the referrer when a referred
// learner completes a first real word experience. Reviewed lessons, reviews, practice and retries cost nothing.
// Identity is the session id today; `account_id` is filled in when sign-in binds a session to an account, so the
// ledger carries across without rewriting history. Nothing personal: sids, ids and salted hashes only.
import { createHash, createHmac } from "node:crypto";
import { db } from "./db.mjs";

export const CONFIG = {
  welcome: int(process.env.CREDITS_WELCOME, 2),
  word: int(process.env.CREDITS_WORD_COST, 1),
  referral: int(process.env.CREDITS_REFERRAL, 3),
  referral_cap: int(process.env.CREDITS_REFERRAL_CAP, 10), // activated referrals one referrer can be paid for
  promo_budget: int(process.env.CREDITS_PROMO_BUDGET, 3000), // welcome + referral Gloo across all learners, ever
  same_ip_window_ms: int(process.env.CREDITS_SAME_IP_MINUTES, 60) * 60e3,
};
function int(v, d) { const n = Number(v); return Number.isFinite(n) && v !== undefined && v !== "" ? Math.trunc(n) : d; }
// Referral codes and ip hashes are keyed; without a secret they are still unguessable (the sid is 128 random bits).
const SECRET = String(process.env.CREDITS_SECRET ?? process.env.ADMIN_TOKEN ?? "gloo-credits").trim() || "gloo-credits";

export const RULES = "credits-phase1-v1"; // reason_code suffix: the rule set a row was written under

db.exec(`
CREATE TABLE IF NOT EXISTS credit_events (
  id INTEGER PRIMARY KEY, event_type TEXT NOT NULL, sid TEXT NOT NULL, account_id TEXT, word_experience_id TEXT, referral_id INTEGER,
  delta INTEGER NOT NULL, reason_code TEXT NOT NULL, note TEXT, idempotency_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS credit_events_sid ON credit_events (sid, id);
CREATE VIEW IF NOT EXISTS credit_balances AS SELECT sid, SUM(delta) AS balance, COUNT(*) AS events FROM credit_events GROUP BY sid;
CREATE TABLE IF NOT EXISTS referral_codes (code TEXT PRIMARY KEY, sid TEXT NOT NULL UNIQUE, ip_hash TEXT, seen_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL, referrer_sid TEXT NOT NULL, referred_sid TEXT NOT NULL UNIQUE, ip_hash TEXT, flags TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL, reason TEXT, word_experience_id TEXT, claimed_at INTEGER NOT NULL, settled_at INTEGER);
`);

const s = {
  insert: db.prepare(`INSERT OR IGNORE INTO credit_events (event_type, sid, account_id, word_experience_id, referral_id, delta, reason_code, note, idempotency_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  byKey: db.prepare("SELECT * FROM credit_events WHERE idempotency_key = ?"),
  balance: db.prepare("SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_events WHERE sid = ? OR (account_id IS NOT NULL AND account_id = (SELECT account_id FROM credit_events WHERE sid = ? AND account_id IS NOT NULL LIMIT 1))"),
  recent: db.prepare("SELECT id, event_type, delta, reason_code, word_experience_id, referral_id, created_at FROM credit_events WHERE sid = ? ORDER BY id DESC LIMIT ?"),
  all: db.prepare("SELECT * FROM credit_events WHERE sid = ? ORDER BY id"),
  wordEvents: db.prepare("SELECT event_type FROM credit_events WHERE sid = ? AND word_experience_id = ? AND event_type IN ('word_spend', 'word_refund') ORDER BY id"),
  promoSpent: db.prepare("SELECT COALESCE(SUM(delta), 0) AS n FROM credit_events WHERE event_type IN ('welcome_grant', 'referral_reward')"),
  rewardsFor: db.prepare("SELECT COUNT(*) AS n FROM credit_events WHERE sid = ? AND event_type = 'referral_reward'"),
  bind: db.prepare("UPDATE credit_events SET account_id = ? WHERE sid = ? AND account_id IS NULL"),
  codeFor: db.prepare("SELECT code, ip_hash, seen_at FROM referral_codes WHERE sid = ?"),
  codeOwner: db.prepare("SELECT sid, ip_hash, seen_at FROM referral_codes WHERE code = ?"),
  putCode: db.prepare("INSERT OR IGNORE INTO referral_codes (code, sid, created_at) VALUES (?, ?, ?)"),
  touchCode: db.prepare("UPDATE referral_codes SET ip_hash = ?, seen_at = ? WHERE sid = ?"),
  claim: db.prepare("INSERT OR IGNORE INTO referrals (code, referrer_sid, referred_sid, ip_hash, flags, status, reason, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
  referralOf: db.prepare("SELECT * FROM referrals WHERE referred_sid = ?"),
  referralById: db.prepare("SELECT * FROM referrals WHERE id = ?"),
  referralsBy: db.prepare("SELECT id, status, reason, flags, claimed_at, settled_at FROM referrals WHERE referrer_sid = ? ORDER BY id"),
  settle: db.prepare("UPDATE referrals SET status = ?, reason = ?, word_experience_id = ?, settled_at = ? WHERE id = ?"),
  // Has this session done anything yet? (A referral is for a distinct new learner, not an existing one.)
  history: db.prepare(`SELECT (SELECT COUNT(*) FROM first_attempts WHERE sid = ?) + (SELECT COUNT(*) FROM learner_cues WHERE sid = ?) + (SELECT COUNT(*) FROM provisional_terms WHERE sid = ?) AS n`),
  // The first real word experience: a first attempt saved or skipped and a favorite picked, on the same lesson.
  completed: db.prepare(`SELECT f.term_id FROM first_attempts f WHERE f.sid = ?
    AND EXISTS (SELECT 1 FROM learner_cues c WHERE c.sid = f.sid AND c.term_id = f.term_id AND c.source = 'pick' AND c.removed_at IS NULL) ORDER BY f.created_at LIMIT 1`),
};

// ---- Pure rules (no database): what the ledger does and why, testable on their own ----

// A word is charged once per delivered experience: no charge while a spend stands unrefunded; a refunded spend may be charged again.
export function spendState(events) {
  let charged = 0, spends = 0;
  for (const e of events) { if (e.event_type === "word_spend") { charged++; spends++; } else if (e.event_type === "word_refund") charged--; }
  return { charged: charged > 0, spends };
}
export const canSpend = (balance, cost = CONFIG.word) => balance >= cost;

// Whether a visitor's claim of a referral code is recorded, and with which flags. Hard stops are rejections; the
// same-IP signal is soft: the claim stands, the reward is held for the owner to release or reverse.
export function claimDecision({ owner, referred, existing, history, sameIp }, cfg = CONFIG) {
  if (!owner) return { status: "rejected", reason: "unknown_code" };
  if (existing) return { status: existing.status, reason: existing.reason, flags: existing.flags, duplicate: true };
  if (owner === referred) return { status: "rejected", reason: "self_referral" };
  if (history > 0) return { status: "rejected", reason: "not_new" };
  const flags = sameIp ? ["same_ip"] : [];
  return { status: "claimed", reason: null, flags };
}

// Whether an activated referral pays the referrer now, is held (soft signal, cap, budget), or was already settled.
export function rewardDecision({ referral, rewardsSoFar, promoSpent }, cfg = CONFIG) {
  if (!referral || referral.status !== "claimed") return { pay: false, status: referral?.status ?? "none", reason: referral?.reason ?? "no_claim" };
  if (referral.flags) return { pay: false, status: "held", reason: `flag:${referral.flags}` };
  if (rewardsSoFar >= cfg.referral_cap) return { pay: false, status: "held", reason: "referrer_cap" };
  if (promoSpent + cfg.referral > cfg.promo_budget) return { pay: false, status: "held", reason: "promo_budget" };
  return { pay: true, status: "activated", reason: null };
}

export const policyLine = (cfg = CONFIG) =>
  `Your first ${cfg.welcome === 2 ? "two" : cfg.welcome} words are on us. Invite a friend to earn ${cfg.referral} more Gloo when they try their first word.`;
export const EMPTY_MESSAGE = "Ready for another word? Invite a friend to earn more Gloo.";

// ---- The ledger ----

function append(e) {
  const key = e.idempotency_key;
  const r = s.insert.run(e.event_type, e.sid, e.account_id ?? null, e.word_experience_id ?? null, e.referral_id ?? null, e.delta, `${e.reason_code}@${RULES}`, e.note ?? null, key, Date.now());
  return { event: s.byKey.get(key), written: r.changes === 1 };
}

export const balance = (sid) => s.balance.get(sid, sid).balance;
export const hashIp = (ip) => (ip ? createHmac("sha256", SECRET).update(String(ip)).digest("hex").slice(0, 16) : null);

// First contact: the welcome grant, once per session for ever (the key survives "delete my data").
export function welcome(sid) {
  if (CONFIG.welcome <= 0) return null;
  const spent = s.promoSpent.get().n;
  if (spent + CONFIG.welcome > CONFIG.promo_budget) return null; // the budget is gone; the owner raises it or tops up by adjustment
  return append({ event_type: "welcome_grant", sid, delta: CONFIG.welcome, reason_code: "welcome", idempotency_key: `welcome:${sid}` }).event;
}

// Spend one Gloo for a word the agent has to draft. Returns { ok, balance, charged } where charged is false when
// this word was already paid for; { ok: false } when the balance cannot cover it.
export function chargeWord(sid, word) {
  const id = String(word).toLowerCase();
  const state = spendState(s.wordEvents.all(sid, id));
  if (state.charged) return { ok: true, charged: false, balance: balance(sid) };
  const now = balance(sid);
  if (!canSpend(now)) return { ok: false, balance: now, message: EMPTY_MESSAGE };
  const key = `spend:${sid}:${id}:${state.spends}`;
  const { event } = append({ event_type: "word_spend", sid, word_experience_id: id, delta: -CONFIG.word, reason_code: "draft", idempotency_key: key });
  return { ok: true, charged: true, balance: balance(sid), event };
}

// The draft failed: give the Gloo back, once per spend.
export function refundWord(sid, word, note = "draft_failed") {
  const id = String(word).toLowerCase();
  const state = spendState(s.wordEvents.all(sid, id));
  if (!state.charged) return { refunded: false, balance: balance(sid) };
  const key = `refund:${sid}:${id}:${state.spends - 1}`;
  const { event } = append({ event_type: "word_refund", sid, word_experience_id: id, delta: CONFIG.word, reason_code: "refund", note, idempotency_key: key });
  return { refunded: true, balance: balance(sid), event };
}

// ---- Referrals ----

// The code is keyed from the sid: the same learner always gets the same code, and nobody can derive a code they were not shown.
export function codeFor(sid) {
  const existing = s.codeFor.get(sid);
  if (existing) return existing.code;
  const code = createHmac("sha256", SECRET).update(`ref:${sid}`).digest("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  s.putCode.run(code, sid, Date.now());
  return s.codeFor.get(sid).code;
}
// The referrer looked at their link from this address (the soft same-IP signal for claims that follow).
export function sawCode(sid, ip) { codeFor(sid); s.touchCode.run(hashIp(ip), Date.now(), sid); }

// A visitor arrived with ?ref=<code>. Records the attribution (or why not) and returns it; the reward waits for activation.
export function claim({ code, sid, ip }) {
  const c = String(code ?? "").trim();
  const owner = /^[a-zA-Z0-9]{6,16}$/.test(c) ? s.codeOwner.get(c) : null;
  const existing = s.referralOf.get(sid);
  const ipHash = hashIp(ip);
  const sameIp = Boolean(owner && ipHash && owner.ip_hash === ipHash && owner.seen_at && Date.now() - owner.seen_at < CONFIG.same_ip_window_ms);
  const d = claimDecision({ owner: owner?.sid, referred: sid, existing, history: owner ? s.history.get(sid, sid, sid).n : 0, sameIp });
  if (d.duplicate || !owner || d.status === "rejected") {
    // Rejections are kept too, so a second try with another code cannot slip through and the owner can see attempts.
    if (owner && !existing) s.claim.run(c, owner.sid, sid, ipHash, "", d.status, d.reason, Date.now());
    return { recorded: Boolean(owner), status: d.status, reason: d.reason ?? null };
  }
  s.claim.run(c, owner.sid, sid, ipHash, d.flags.join(","), "claimed", null, Date.now());
  return { recorded: true, status: "claimed", reason: null, flags: d.flags };
}

// Called after a first attempt or a pick: if this learner was referred and has now completed a first word experience,
// settle the referral. Pays the referrer once; holds with a reason when a signal, the cap or the budget says so.
export function activate(sid) {
  const r = s.referralOf.get(sid);
  if (!r) return null;
  if (r.status !== "claimed") return { referral_id: r.id, status: r.status, reason: r.reason }; // settled or rejected already
  const done = s.completed.get(sid);
  if (!done) return null;
  const d = rewardDecision({ referral: r, rewardsSoFar: s.rewardsFor.get(r.referrer_sid).n, promoSpent: s.promoSpent.get().n });
  s.settle.run(d.status, d.reason, done.term_id, Date.now(), r.id);
  if (!d.pay) return { referral_id: r.id, status: d.status, reason: d.reason };
  const { event } = append({ event_type: "referral_reward", sid: r.referrer_sid, referral_id: r.id, word_experience_id: done.term_id, delta: CONFIG.referral, reason_code: "referral_activated", idempotency_key: `referral:${r.id}` });
  return { referral_id: r.id, status: "activated", reason: null, event };
}

// ---- Views ----

export function summary(sid, { origin } = {}) {
  const code = codeFor(sid);
  return {
    balance: balance(sid), word_cost: CONFIG.word, welcome: CONFIG.welcome, referral_reward: CONFIG.referral,
    policy: policyLine(), empty_message: EMPTY_MESSAGE,
    referral: { code, link: origin ? `${origin}/?ref=${code}` : null, activated: s.referralsBy.all(sid).filter((r) => r.status === "activated").length, cap: CONFIG.referral_cap },
    recent: s.recent.all(sid, 10),
  };
}
export const exportCredits = (sid) => ({ credit_events: s.all.all(sid), referrals: s.referralsBy.all(sid) });

// Owner's view of one session: the whole ledger, both sides of its referrals.
export function adminView(sid) {
  return { sid, balance: balance(sid), events: s.all.all(sid), code: s.codeFor.get(sid)?.code ?? null,
    referred_by: s.referralOf.get(sid) ?? null, referrals: db.prepare("SELECT * FROM referrals WHERE referrer_sid = ? ORDER BY id").all(sid) };
}
// Owner's adjustment: a refund, a reversal after confirmed abuse, a top-up. The reason is required and logged.
export function adjust({ sid, delta, reason, by = "owner", referral_id = null, idempotency_key = null }) {
  const d = Math.trunc(Number(delta));
  if (!Number.isFinite(d) || d === 0 || Math.abs(d) > 1000) return { error: "delta must be a non-zero integer up to 1000" };
  const why = String(reason ?? "").trim().slice(0, 200);
  if (!why) return { error: "reason is required" };
  const ref = referral_id ? s.referralById.get(Number(referral_id)) : null;
  if (referral_id && !ref) return { error: "no such referral" };
  const key = idempotency_key ? `adjust:${String(idempotency_key).slice(0, 80)}` : `adjust:${sid}:${createHash("sha256").update(`${d}|${why}|${Date.now()}`).digest("hex").slice(0, 12)}`;
  const { event, written } = append({ event_type: "adjustment", sid, delta: d, referral_id: ref?.id ?? null, reason_code: `adjustment:${by}`, note: why, idempotency_key: key });
  if (ref && written && d < 0 && ref.status === "activated") s.settle.run("reversed", why, ref.word_experience_id, Date.now(), ref.id);
  if (ref && written && d > 0 && ref.status === "held") s.settle.run("activated", `released: ${why}`, ref.word_experience_id, Date.now(), ref.id);
  return { event, written, balance: balance(sid) };
}

// Sign-in, later: bind a session's history to an account. Existing rows keep their sid; the account id is added beside it.
export function bindAccount(sid, accountId) { return s.bind.run(String(accountId), sid).changes; }
