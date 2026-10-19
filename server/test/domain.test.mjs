import { test } from "node:test";
import assert from "node:assert/strict";
import { brierLoss, brierScore, brierMulticlass, assess, BrierInputError, normalizeSpokenNumber } from "../src/assess.mjs";
import { deriveSkill, POLICY } from "../src/scheduler.mjs";
import { findPersonalData } from "../src/guard.mjs";
import { brier } from "../src/content/brier.mjs";
import { cck } from "../src/content/cck.mjs";
import { publicTerm, publicPrompt } from "../src/content/index.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const prompt = (term, id) => term.prompts.find((p) => p.id === id);

test("19: Brier examples give 0.04, 0.64, 0.09 and mean 0.065", () => {
  close(brierLoss(0.8, 1), 0.04);
  close(brierLoss(0.8, 0), 0.64);
  close(brierLoss(0.3, 0), 0.09);
  close(brierScore([{ p: 0.8, y: 1 }, { p: 0.3, y: 0 }]), 0.065);
});

test("18: zero outcome and zero loss are distinct", () => {
  assert.equal(brierLoss(1, 1), 0); // outcome 1, loss 0
  assert.equal(brierLoss(0, 0), 0); // outcome 0, loss 0
  close(brierLoss(1, 0), 1);        // outcome 0, worst loss
});

test("20: invalid probabilities, unresolved events and empty averages are rejected", () => {
  for (const [p, y] of [[1.2, 1], [-0.1, 0], [NaN, 1], [Infinity, 0], [0.5, null], [0.5, 0.5]]) {
    assert.throws(() => brierLoss(p, y), BrierInputError);
  }
  assert.throws(() => brierScore([]), BrierInputError);
});

test("21: unscaled multiclass is twice binary when K = 2", () => {
  close(brierMulticlass([0.8, 0.2], 0), 2 * brierLoss(0.8, 1));
  close(brierMulticlass([0, 1], 0), 2); // range tops out at 2
});

test("spoken numbers are scored like typed ones", () => {
  assert.equal(normalizeSpokenNumber("zero point zero six five"), "0.065");
  assert.equal(normalizeSpokenNumber("point four"), ".4");
  assert.equal(normalizeSpokenNumber("0.04"), "0.04");
  assert.equal(normalizeSpokenNumber("it rained"), "it rained");
  const p = { type: "number", expected: 0.065, answer: "0.065" };
  assert.equal(assess(p, "zero point zero six five").outcome, "correct");
  assert.equal(assess(p, "zero point six five").outcome, "incorrect");
});

test("numeric assessment uses tolerance, not string equality", () => {
  const p = prompt(brier, "brier-mean");
  assert.equal(assess(p, "0.065").outcome, "correct");
  assert.equal(assess(p, ".0650").outcome, "correct");
  assert.equal(assess(p, "6.5%").outcome, "correct");
  assert.equal(assess(p, "0.07").outcome, "incorrect");
  assert.equal(assess(p, "abc").outcome, "uncertain");
});

test("5: cysto and cyto stay distinct; the cue is not the answer", () => {
  const p = prompt(cck, "cck-cysto");
  assert.equal(assess(p, "cysto").outcome, "correct");
  assert.equal(assess(p, "cyst").outcome, "correct");
  assert.equal(assess(p, "cyto").outcome, "incorrect");
  assert.match(assess(p, "cyto").feedback, /cell/);
  assert.equal(assess(p, "sister").outcome, "incorrect");
  assert.equal(assess(prompt(cck, "cck-chole"), "cola").outcome, "incorrect");
});

test("unmatched long paraphrase is uncertain, not wrong", () => {
  const r = assess(prompt(cck, "cck-function"), "it is a hormone involved in digestion somehow");
  assert.equal(r.outcome, "uncertain");
});

test("12: public term and prompt payloads carry no answers", () => {
  for (const t of [brier, cck]) {
    const json = JSON.stringify(publicTerm(t)) + JSON.stringify(t.prompts.map(publicPrompt));
    for (const p of t.prompts) {
      assert.ok(!json.includes(p.answer), `answer leaked for ${p.id}`);
    }
    assert.ok(!/"expected"|"rubric"|"hint":/.test(json));
  }
});

test("13 + 22: hinted success never counts as independent; no attempts = insufficient evidence", () => {
  const t0 = 1_700_000_000_000;
  assert.equal(deriveSkill([], t0).state, "insufficient evidence");
  const hinted = deriveSkill([{ outcome: "correct", independent: 0, created_at: t0 }], t0);
  assert.equal(hinted.independent, 0);
  assert.equal(hinted.state, "practicing");
  assert.equal(hinted.stage, 0);
  const indep = deriveSkill([{ outcome: "correct", independent: 1, created_at: t0 }], t0);
  assert.equal(indep.stage, 1);
  assert.equal(indep.due_at, t0 + POLICY.gaps_ms[1]);
});

test("uncertain evidence does not update a skill; errors reschedule after 30 min", () => {
  const t0 = 1_700_000_000_000;
  assert.equal(deriveSkill([{ outcome: "uncertain", independent: 0, created_at: t0 }], t0).state, "insufficient evidence");
  const miss = deriveSkill([{ outcome: "incorrect", independent: 0, created_at: t0 }], t0);
  assert.equal(miss.due_at, t0 + POLICY.retry_after_error_ms);
});

test("personal data guard", () => {
  assert.equal(findPersonalData(["Breyers", "Moneyball"]), null);
  assert.equal(findPersonalData(["me@example.com"]), "email address");
  assert.equal(findPersonalData(["call 415-555-1234"]), "phone number");
});
