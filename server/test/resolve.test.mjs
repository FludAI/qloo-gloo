import { test } from "node:test";
import { scorePieces } from "../src/resolve/pieces.mjs";
import assert from "node:assert/strict";
import { setVocabulary, resolveLocal, pickFromOcr, normalize } from "../src/resolve/index.mjs";
import { listTerms } from "../src/content/index.mjs";

setVocabulary(listTerms());

test("strips the spoken command", () => {
  assert.equal(normalize("Gloo it, Cholecystokinin!"), "cholecystokinin");
  assert.equal(normalize("glue it brier score"), "brier score");
});

test("exact titles and aliases open reviewed lessons", () => {
  assert.equal(resolveLocal("CCK").best.term_id, "cholecystokinin");
  assert.equal(resolveLocal("Brier score").best.method, "exact");
});

test("typos resolve by spelling, without an LLM", () => {
  const r = resolveLocal("cholecystokinen", "typed");
  assert.equal(r.decision, "resolved");
  assert.equal(r.best.term_id, "cholecystokinin");
  assert.equal(r.best.method, "spelling");
});

test("a phonetic attempt from speech resolves by sound", () => {
  for (const heard of ["colla sisto kinin", "koh lih sis tuh ky nin"]) {
    const r = resolveLocal(heard, "voice");
    assert.equal(r.decision, "resolved", heard);
    assert.equal(r.best.term_id, "cholecystokinin");
    assert.equal(r.best.method, "sound-alike");
  }
  assert.equal(resolveLocal("bryer score", "voice").best.term_id, "brier-score");
});

test("ordinary English words and their typos resolve by dictionary", () => {
  assert.deepEqual([resolveLocal("serendipity").best.word, resolveLocal("serendipity").best.method], ["serendipity", "dictionary"]);
  assert.equal(resolveLocal("serendipty").best.word, "serendipity");
});

test("domain terms beat general-dictionary gaps", () => {
  assert.equal(resolveLocal("heteroskedasticity").best.word, "heteroscedasticity");
  assert.equal(resolveLocal("cholecystitus").best.word, "cholecystitis");
});

test("noise is not force-matched", () => {
  assert.notEqual(resolveLocal("xqzt").decision, "resolved");
});

test("OCR picks the hard word, not the menu filler", () => {
  const { pick, alternatives } = pickFromOcr("Today: try our cholecystokinin smoothie".split(" "));
  assert.equal(pick, "cholecystokinin");
  assert.ok(alternatives.includes("smoothie"));
});

test("an attempt is scored piece by piece, by sound", () => {
  const parts = ["chole", "cysto", "kin", "-in"];
  const good = scorePieces(parts, "koh lee sis toe KY nin");
  assert.equal(good.pieces.length, 4);
  assert.ok(good.pieces[0].said, "chole heard in koh lee");
  assert.ok(good.pieces[2].said, "kin heard in KY nin");
  assert.ok(good.said_count >= 3, `said ${good.said_count}`);
  const exact = scorePieces(parts, "cholecystokinin");
  assert.equal(exact.said_count, 4);
  const miss = scorePieces(parts, "the hormone for digestion");
  assert.ok(miss.said_count <= 1, `miss said ${miss.said_count}`);
  assert.ok(miss.overall < good.overall);
});
