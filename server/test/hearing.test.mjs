import { test } from "node:test";
import assert from "node:assert/strict";
import { promptHints, bestHeard } from "../src/assess.mjs";
import { speechContexts } from "../src/speech.mjs";
import { cck } from "../src/content/cck.mjs";
import { brier } from "../src/content/brier.mjs";

const prompt = (term, id) => term.prompts.find((p) => p.id === id);

test("a meaning prompt tells the recognizer its answer, the word and the pieces", () => {
  const h = promptHints(prompt(cck, "cck-chole"), cck);
  assert.ok(h.includes("bile"), h.join("|"));
  assert.ok(h.includes("chole") && h.includes("cysto") && h.includes("kin"), h.join("|"));
  assert.ok(h.some((x) => x.startsWith("cholecystokinin")), h.join("|"));
  assert.ok(h.every((x) => x === x.toLowerCase() && x.length <= 60));
  assert.ok(!h.some((x) => x.includes("-toh")), "respellings are not spellings: " + h.join("|"));
  assert.ok(h.includes("sister") && h.includes("cola"), "hook words are real words the recognizer may hear: " + h.join("|"));
});

test("a parenthesis and an 'or' split into separate phrases", () => {
  assert.deepEqual(promptHints(prompt(cck, "cck-cysto"), null), ["cyst", "cysto"]);
  assert.deepEqual(promptHints(prompt(cck, "cck-cystitis"), null), ["bladder"]); // the parenthesis is explanation, not an answer
});

test("a choice prompt offers its options", () => {
  const p = brier.prompts.find((x) => x.type === "choice");
  const h = promptHints(p, null);
  assert.ok(h.length >= p.options.length, h.join("|"));
  assert.ok(h.includes("a") && h.includes("b"), h.join("|"));
});

test("no prompt, no hints", () => { assert.deepEqual(promptHints(null, cck), []); });

test("among the recognizer's readings, the first the prompt accepts wins", () => {
  const p = prompt(cck, "cck-chole");
  assert.equal(bestHeard(p, "Bayou", ["bile", "vile"]), "bile");
  assert.equal(bestHeard(p, "bile", ["Bayou"]), "bile");
  assert.equal(bestHeard(p, "Bayou", ["vile", "aisle"]), "Bayou");
  assert.equal(bestHeard(p, "Bayou", []), "Bayou");
  assert.equal(bestHeard(null, "Bayou", ["bile"]), "Bayou");
});

test("a reading that sounds like one piece answers for that piece", () => {
  const p = prompt(cck, "cck-cysto");
  assert.equal(bestHeard(p, "sis-toh", [], cck), "cysto");
  assert.equal(bestHeard(p, "sisto", ["Sis toe"], cck), "cysto");
  assert.equal(bestHeard(p, "cysto", [], cck), "cysto");
  assert.equal(bestHeard(p, "cyto", [], cck), "cyto", "a misconception stays itself");
  assert.equal(bestHeard(p, "sister", [], cck), "cysto", "the hook word is how the recognizer hears the piece");
  assert.equal(bestHeard(p, "Sister", ["sisters"], cck), "cysto");
  assert.equal(bestHeard(prompt(cck, "cck-chole"), "bile", ["file"], cck), "bile", "an accepted reading comes first");
  assert.equal(bestHeard(p, "the thing that holds the bile in the body", [], cck), "the thing that holds the bile in the body", "a long answer is left alone");
});

test("what the prompt expects is a second, stronger speech context", () => {
  const c = speechContexts(["gloo it", "cholecystokinin"], ["bile", "bile", ""]);
  assert.equal(c.length, 2);
  assert.deepEqual(c[1], { phrases: ["bile"], boost: 20 });
  assert.equal(c[0].boost, 12);
  assert.equal(speechContexts(["gloo it"], []).length, 1);
});
