// The Gloo ledger (credits.mjs), without HTTP: welcome once, one Gloo per drafted word and never twice, refunds,
// referral attribution and activation, the soft same-IP hold, caps and budget, owner adjustments, idempotency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.DB_PATH = ":memory:";
process.env.CREDITS_PROMO_BUDGET = "40";
const { db } = await import("../src/db.mjs");
const c = await import("../src/credits.mjs");

const sid = () => randomBytes(16).toString("hex");
const firstAttempt = (s, term) => db.prepare("INSERT OR IGNORE INTO first_attempts (sid, term_id, response, skipped, content_version, created_at) VALUES (?, ?, NULL, 1, '1', ?)").run(s, term, Date.now());
const pick = (s, term) => db.prepare("INSERT INTO learner_cues (sid, term_id, role, label, connection, source, recognized, created_at) VALUES (?, ?, 'chole', 'Pepsi', 'c', 'pick', 1, ?)").run(s, term, Date.now());
const events = (s) => c.exportCredits(s).credit_events.map((e) => [e.event_type, e.delta]);

test("welcome: two Gloo on first contact, once for ever", () => {
  const a = sid();
  assert.equal(c.balance(a), 0);
  assert.equal(c.welcome(a).delta, 2);
  c.welcome(a); c.welcome(a);
  assert.equal(c.balance(a), 2);
  assert.deepEqual(events(a), [["welcome_grant", 2]]);
  assert.match(c.exportCredits(a).credit_events[0].reason_code, /^welcome@credits-phase1-v1$/);
});

test("spend: a drafted word costs one, the same word never twice, and an empty balance says so", () => {
  const a = sid(); c.welcome(a);
  const first = c.chargeWord(a, "Peristalsis");
  assert.deepEqual([first.ok, first.charged, first.balance], [true, true, 1]);
  const again = c.chargeWord(a, "peristalsis"); // a repeat scan of the same word
  assert.deepEqual([again.ok, again.charged, again.balance], [true, false, 1]);
  assert.equal(c.chargeWord(a, "glycolysis").balance, 0);
  const empty = c.chargeWord(a, "mitochondria");
  assert.equal(empty.ok, false); assert.equal(empty.balance, 0); assert.equal(empty.message, c.EMPTY_MESSAGE);
  assert.deepEqual(events(a), [["welcome_grant", 2], ["word_spend", -1], ["word_spend", -1]]);
});

test("refund: a failed draft gives the Gloo back once; a retry is charged again and then stands", () => {
  const a = sid(); c.welcome(a);
  c.chargeWord(a, "glycolysis");
  assert.equal(c.refundWord(a, "glycolysis").balance, 2);
  assert.equal(c.refundWord(a, "glycolysis").refunded, false, "nothing left to refund");
  assert.equal(c.refundWord(a, "never-charged").refunded, false);
  const retry = c.chargeWord(a, "glycolysis");
  assert.deepEqual([retry.charged, retry.balance], [true, 1]);
  assert.equal(c.chargeWord(a, "glycolysis").charged, false);
  assert.deepEqual(events(a), [["welcome_grant", 2], ["word_spend", -1], ["word_refund", 1], ["word_spend", -1]]);
  const keys = c.exportCredits(a).credit_events.map((e) => e.idempotency_key);
  assert.equal(new Set(keys).size, keys.length);
});

test("referral: the code is stable and unguessable; claims are recorded once, never for oneself or an old session", () => {
  const a = sid(), b = sid(), old = sid();
  const code = c.codeFor(a);
  assert.match(code, /^[a-zA-Z0-9]{10}$/);
  assert.equal(c.codeFor(a), code);
  assert.notEqual(c.codeFor(b), code);
  assert.deepEqual(c.claim({ code: "nope", sid: b }), { recorded: false, status: "rejected", reason: "unknown_code" });
  assert.deepEqual(c.claim({ code, sid: a }), { recorded: true, status: "rejected", reason: "self_referral" });
  firstAttempt(old, "cholecystokinin");
  assert.equal(c.claim({ code, sid: old }).reason, "not_new");
  assert.deepEqual(c.claim({ code, sid: b }), { recorded: true, status: "claimed", reason: null, flags: [] });
  assert.deepEqual(c.claim({ code: c.codeFor(old), sid: b }), { recorded: true, status: "claimed", reason: null }, "the first attribution stands");
  assert.equal(c.adminView(a).referrals.length, 3); // rejected tries are kept too: a itself, the old session, and b
});

test("activation: the referrer gets three only when the friend has saved a first attempt and picked a favorite on one lesson", () => {
  const a = sid(), b = sid(); c.welcome(a); c.welcome(b);
  c.claim({ code: c.codeFor(a), sid: b });
  assert.equal(c.activate(b), null, "nothing done yet");
  firstAttempt(b, "cholecystokinin");
  assert.equal(c.activate(b), null, "no pick yet");
  pick(b, "brier-score");
  assert.equal(c.activate(b), null, "the pick is on another lesson");
  pick(b, "cholecystokinin");
  const r = c.activate(b);
  assert.equal(r.status, "activated"); assert.equal(r.event.delta, 3); assert.equal(r.event.referral_id, r.referral_id);
  assert.equal(c.balance(a), 5);
  assert.equal(c.balance(b), 2, "the friend keeps the welcome, nothing more");
  assert.equal(c.activate(b).status, "activated", "settled once");
  pick(b, "cholecystokinin"); c.activate(b);
  assert.equal(c.balance(a), 5);
  assert.equal(c.activate(a), null, "a was not referred");
  assert.equal(c.activate(b).event, undefined, "a settled referral is reported, never paid again");
  assert.equal(c.summary(a).referral.activated, 1);
});

test("the soft signal: a claim from the referrer's own address within the hour is held, and the owner can release it", () => {
  const a = sid(), b = sid(); c.welcome(a);
  c.sawCode(a, "203.0.113.7");
  const claim = c.claim({ code: c.codeFor(a), sid: b, ip: "203.0.113.7" });
  assert.deepEqual(claim.flags, ["same_ip"]);
  firstAttempt(b, "x"); pick(b, "x");
  const r = c.activate(b);
  assert.deepEqual([r.status, r.reason], ["held", "flag:same_ip"]);
  assert.equal(c.balance(a), 2);
  const rel = c.adjust({ sid: a, delta: 3, reason: "looked at it, a real friend", referral_id: r.referral_id, by: "loren" });
  assert.equal(rel.balance, 5);
  assert.equal(c.adminView(a).referrals[0].status, "activated");
  const other = sid();
  assert.deepEqual(c.claim({ code: c.codeFor(a), sid: other, ip: "198.51.100.2" }).flags, [], "another address is clean");
});

test("rules: the cap and the promotional budget hold a reward; the pure decisions say why", () => {
  const cfg = { ...c.CONFIG, referral_cap: 2, promo_budget: 10 };
  const claimed = { status: "claimed", flags: "" };
  assert.equal(c.rewardDecision({ referral: claimed, rewardsSoFar: 0, promoSpent: 0 }, cfg).pay, true);
  assert.deepEqual(c.rewardDecision({ referral: claimed, rewardsSoFar: 2, promoSpent: 0 }, cfg), { pay: false, status: "held", reason: "referrer_cap" });
  assert.deepEqual(c.rewardDecision({ referral: claimed, rewardsSoFar: 0, promoSpent: 8 }, cfg), { pay: false, status: "held", reason: "promo_budget" });
  assert.equal(c.rewardDecision({ referral: { status: "activated" }, rewardsSoFar: 0, promoSpent: 0 }, cfg).pay, false);
  assert.equal(c.rewardDecision({ referral: null }, cfg).reason, "no_claim");
  assert.equal(c.claimDecision({ owner: "a", referred: "b", existing: null, history: 0, sameIp: true }).flags[0], "same_ip");
  assert.equal(c.claimDecision({ owner: null, referred: "b" }).reason, "unknown_code");
  assert.deepEqual(c.spendState([{ event_type: "word_spend" }, { event_type: "word_refund" }]), { charged: false, spends: 1 });
  assert.equal(c.canSpend(0), false); assert.equal(c.canSpend(1), true);
  assert.match(c.policyLine(), /first two words are on us/);
});

test("adjustment: a reason is required, the delta bounded, the key idempotent, and a reversal marks the referral", () => {
  const a = sid(); c.welcome(a);
  assert.equal(c.adjust({ sid: a, delta: 0, reason: "x" }).error, "delta must be a non-zero integer up to 1000");
  assert.equal(c.adjust({ sid: a, delta: 1, reason: " " }).error, "reason is required");
  assert.equal(c.adjust({ sid: a, delta: 1, reason: "x", referral_id: 999 }).error, "no such referral");
  const one = c.adjust({ sid: a, delta: -1, reason: "duplicate account", by: "loren", idempotency_key: "case-1" });
  assert.deepEqual([one.written, one.balance, one.event.reason_code, one.event.note], [true, 1, "adjustment:loren@credits-phase1-v1", "duplicate account"]);
  const twice = c.adjust({ sid: a, delta: -1, reason: "duplicate account", idempotency_key: "case-1" });
  assert.deepEqual([twice.written, twice.balance], [false, 1]);
  assert.equal(c.adjust({ sid: a, delta: 5, reason: "top-up" }).balance, 6);
  // A reversal after confirmed abuse: the referral is marked and the referrer's Gloo taken back.
  const b = sid(); c.claim({ code: c.codeFor(a), sid: b }); firstAttempt(b, "x"); pick(b, "x");
  const r = c.activate(b);
  assert.equal(c.balance(a), 9);
  c.adjust({ sid: a, delta: -3, reason: "same person, two phones", referral_id: r.referral_id });
  assert.equal(c.balance(a), 6);
  assert.equal(c.adminView(a).referrals.at(-1).status, "reversed");
});

test("identity: binding an account keeps every row's sid and adds the account beside it", () => {
  const a = sid(); c.welcome(a); c.chargeWord(a, "glycolysis");
  assert.equal(c.bindAccount(a, "acct-1"), 2);
  const rows = c.exportCredits(a).credit_events;
  assert.ok(rows.every((e) => e.sid === a && e.account_id === "acct-1"));
  assert.equal(c.balance(a), 1);
  const next = c.adjust({ sid: a, delta: 1, reason: "later row" });
  assert.equal(next.event.account_id, null, "new rows name the account when sign-in writes them; binding is per row, never a rewrite of history");
});

// Last, because it spends the process's whole promotional budget (40 Gloo here): welcomes stop, nothing goes negative.
test("the promotional budget ends welcome grants, and a referral reward is held past it", () => {
  for (let i = 0; i < 30; i++) c.welcome(sid());
  const late = sid();
  assert.equal(c.welcome(late), null); assert.equal(c.balance(late), 0);
  const a = sid(), b = sid();
  c.claim({ code: c.codeFor(a), sid: b }); firstAttempt(b, "x"); pick(b, "x");
  assert.deepEqual([c.activate(b).status, c.activate(b).reason], ["held", "promo_budget"]);
});
