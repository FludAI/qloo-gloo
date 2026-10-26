// Syllables as data: the IPA splitter, the count check in validation, the paw's toe assignment and the
// energy-peak detector that lights toes while the learner speaks (the last two are the web app's pure modules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitIpa, syllablesOf, syllableCount, respellingCount, consistent, termSyllables } from "../src/syllables.mjs";
import { validatePacket, fromCode } from "../src/lessons.mjs";
import { hydrate } from "../src/content/index.mjs";
import { cck } from "../src/content/cck.mjs";
import { brier } from "../src/content/brier.mjs";
import { assignToes, pawFor, pawPlan, marksFor, estimateMarks, syllableCount as webCount } from "../../web/src/lib/paw.js";
import { createNucleusDetector, createFramer } from "../../web/src/lib/envelope.js";

test("ipa: the fallback splits on dots and stress marks, then on vowel nuclei; a cluster leaves one consonant behind", () => {
  assert.deepEqual(splitIpa("ˌkoʊlɪˌsɪstoʊˈkaɪnɪn"), ["ˌkoʊ", "lɪ", "ˌsɪs", "toʊ", "ˈkaɪ", "nɪn"]);
  assert.deepEqual(splitIpa("ˈkoʊlə"), ["ˈkoʊ", "lə"]);
  assert.deepEqual(splitIpa("ˈsɪstoʊ"), ["ˈsɪs", "toʊ"]);
  assert.deepEqual(splitIpa("kɪn"), ["kɪn"]);
  assert.deepEqual(splitIpa("ˈbraɪər skɔːr"), ["ˈbraɪ", "ər", "skɔːr"]);
  assert.deepEqual(splitIpa("pɛr.ɪˈstæl.sɪs"), ["pɛr", "ɪ", "ˈstæl", "sɪs"]);
  assert.equal(splitIpa("ˌæntiˌdɪsɪˌstæblɪʃmənˈtɛriənɪzəm").length, 12);
  assert.deepEqual(splitIpa(""), []);
  assert.deepEqual(splitIpa(null), []);
});

test("ipa: stored syllables win over the split; counts fall back to the respelling, then to one", () => {
  assert.deepEqual(syllablesOf(cck.pronunciation), ["koʊ", "lɪ", "sɪs", "toʊ", "ˈkaɪ", "nɪn"]);
  assert.deepEqual(syllablesOf({ ipa: "ˈkoʊlə" }), ["ˈkoʊ", "lə"]);
  assert.equal(syllableCount({ ipa: null, say: "zero to one" }), 3);
  assert.equal(syllableCount({ say: "lower" }), 1);
  assert.equal(syllableCount({}), 1);
  assert.equal(respellingCount("koh-lih-sis-tuh-KY-nin"), 6);
  assert.equal(respellingCount("BRY-er score"), 3);
  assert.equal(respellingCount("—"), 0);
  assert.ok(consistent("ˌkoʊlɪˌsɪstoʊˈkaɪnɪn", ["koʊ", "lɪ", "sɪs", "toʊ", "ˈkaɪ", "nɪn"]));
  assert.ok(!consistent("ˈkoʊleɪ", ["ˈkoʊ", "lə"]));
  assert.deepEqual(termSyllables(cck).map((t) => [t.spelling, t.count]), [["Cholecystokinin", 6], ["chole", 2], ["cysto", 2], ["kin", 1], ["in", 1]]);
});

test("validation: the syllable count must match a hyphenated respelling; a hook word is not a count", () => {
  assert.deepEqual(validatePacket(fromCode(cck)), []);
  assert.deepEqual(validatePacket(fromCode(brier)), []);
  const doc = fromCode(cck);
  doc.pronunciation.ipa_syllables = ["koʊ", "lɪ", "sɪs", "toʊ", "ˈkaɪnɪn"];
  doc.roles[1].ipa_syllables = ["ˈsɪstoʊ"]; // "sis-toh" says two
  doc.roles[0].ipa_syllables = ["ˈkoʊ", "lə"]; // "cola" is the hook, two syllables are fine
  doc.roles[2].ipa_syllables = ["kɪ", "n"];
  doc.roles[3].ipa_syllables = "ɪn";
  const problems = validatePacket(doc);
  assert.ok(problems.includes('pronunciation: 5 IPA syllables but the respelling "koh-lih-sis-tuh-KY-nin" has 6'), problems.join("\n"));
  assert.ok(problems.includes('roles[1]: 1 IPA syllable but the respelling "sis-toh" has 2'));
  assert.ok(problems.includes("roles[3].ipa_syllables: a list of IPA syllables (1 to 16), or null"));
  // "kin" and "cola" have no hyphen: a one-word respelling is a hook, not a syllable count, so neither is flagged.
  assert.ok(!problems.some((p) => p.startsWith("roles[2]")));
  assert.ok(!problems.some((p) => p.startsWith("roles[0]")));
  // Syllables that don't spell the IPA are refused, so a stale list can't outlive an IPA edit.
  const stale = fromCode(cck);
  stale.roles[0].ipa = "ˈkoʊleɪ";
  assert.ok(validatePacket(stale).includes("roles[0].ipa_syllables: joined, they must spell roles[0].ipa"));
  // A split IPA with no stored syllables is checked too.
  const split = fromCode(cck);
  delete split.pronunciation.ipa_syllables;
  split.pronunciation.approx = "koh-lih-sis-tuh-KY";
  assert.ok(validatePacket(split).some((p) => p.startsWith("pronunciation: 6 IPA syllables")));
});

test("packets: every word and piece with IPA reaches the learner with its syllables", () => {
  const t = hydrate(fromCode({ ...cck, pronunciation: { ...cck.pronunciation, ipa_syllables: undefined }, roles: cck.roles.map(({ ipa_syllables, ...r }) => r) }));
  assert.deepEqual(t.pronunciation.ipa_syllables, ["ˌkoʊ", "lɪ", "ˌsɪs", "toʊ", "ˈkaɪ", "nɪn"]);
  assert.deepEqual(t.roles.map((r) => r.ipa_syllables), [["ˈkoʊ", "lə"], ["ˈsɪs", "toʊ"], ["kɪn"], ["ɪn"]]);
  const b = hydrate(fromCode(brier));
  assert.equal(b.roles[1].ipa_syllables, undefined, "no IPA, no syllables");
});

test("paw: toes fall across paws of five, left to right, continuing onto the next paw", () => {
  assert.deepEqual(assignToes(1), [1]);
  assert.deepEqual(assignToes(5), [5]);
  assert.deepEqual(assignToes(6), [5, 1]);
  assert.deepEqual(assignToes(11), [5, 5, 1]);
  assert.deepEqual(assignToes(0), [0]);
  assert.deepEqual(pawFor(0), { paw: 0, index: 0 });
  assert.deepEqual(pawFor(5), { paw: 1, index: 0 });
  assert.deepEqual(pawFor(10), { paw: 2, index: 0 });
  assert.deepEqual(pawFor(7), { paw: 1, index: 2 });
});

test("paw: a term's plan is the word's syllables, segmented by piece when the pieces account for all of them", () => {
  const t = hydrate(fromCode(cck));
  const plan = pawPlan(t);
  assert.equal(plan.count, 6);
  assert.equal(plan.segmented, true);
  assert.deepEqual(plan.targets.map((x) => [x.spelling, x.offset, x.count]), [["Cholecystokinin", 0, 6], ["chole", 0, 2], ["cysto", 2, 2], ["kin", 4, 1], ["in", 5, 1]]);
  // The locked packet's pieces list works the same way.
  const locked = pawPlan({ title: t.title, pronunciation: t.pronunciation }, t.roles.map((r) => ({ part: r.part, say: r.say, ipa_syllables: r.ipa_syllables })));
  assert.equal(locked.segmented, true);
  // Brier: three pieces have no IPA, so the paw follows the whole word only.
  const b = pawPlan(hydrate(fromCode(brier)));
  assert.equal(b.count, 3);
  assert.equal(b.segmented, false);
  assert.deepEqual(b.targets.map((x) => x.spelling), ["Brier score"]);
  assert.equal(webCount({ say: "zero to one" }), 3);
});

test("paw: marks are filtered to one target's first run; without marks, syllables are spread over the word's span", () => {
  const marks = [
    { index: 0, piece: "Cholecystokinin", syllable: "koʊ", time: 0.1 }, { index: 1, piece: "Cholecystokinin", syllable: "lɪ", time: 0.3 },
    { index: 0, piece: "chole", syllable: "ˈkoʊ", time: 2.1 }, { index: 1, piece: "chole", syllable: "lə", time: 2.3 },
    { index: 0, piece: "chole", syllable: "ˈkoʊ", time: 3.1 }, { index: 1, piece: "chole", syllable: "lə", time: 3.3 },
  ];
  assert.deepEqual(marksFor(marks, "cholecystokinin").map((m) => m.time), [0.1, 0.3]);
  assert.deepEqual(marksFor(marks, "-chole").map((m) => m.time), [2.1, 2.3], "first run only");
  assert.deepEqual(marksFor(marks, "kin"), []);
  assert.deepEqual(marksFor(null, "kin"), []);
  const est = estimateMarks("Coca-Cola. chole.", [{ spelling: "chole", count: 2 }], 2);
  assert.equal(est.length, 2);
  assert.ok(est.every((m) => m.estimated && m.piece === "chole"));
  assert.ok(est[0].time > 1 && est[1].time > est[0].time && est[1].time < 2, JSON.stringify(est));
  assert.deepEqual(estimateMarks("Say your favorite cola.", [{ spelling: "chole", count: 2 }], 2), []);
  const word = estimateMarks("Cholecystokinin. The hormone.", [{ spelling: "Cholecystokinin", count: 6 }], 3);
  assert.deepEqual(word.map((m) => m.index), [0, 1, 2, 3, 4, 5]);
  assert.equal(word[0].time, 0);
});

test("envelope: syllable nuclei are peaks above an adaptive threshold, 120 ms apart, with a dip between", () => {
  // Frames of 50 ms. A bump is a rise and fall over four frames; silence sits at a little noise.
  const noise = 0.004;
  const bump = (peak) => [peak * 0.4, peak, peak * 0.6, noise];
  const run = (frames, opts) => { const d = createNucleusDetector(opts); const hits = []; frames.forEach((v, i) => { if (d.push(v, (i + 1) * 0.05)) hits.push(i); }); return { hits, count: d.count }; };
  const silence = Array(6).fill(noise);
  // Six syllables of a word, 300 ms apart: six nuclei.
  const six = [...silence, ...Array.from({ length: 6 }, () => [...bump(0.2), noise, noise]).flat(), ...silence];
  assert.equal(run(six).count, 6);
  // Louder and softer syllables still count; the threshold follows the ceiling.
  const uneven = [...silence, ...bump(0.4), noise, noise, ...bump(0.12), noise, noise, ...bump(0.25), ...silence];
  assert.equal(run(uneven).count, 3);
  // A held vowel: one nucleus, however long.
  const held = [...silence, 0.1, 0.2, 0.21, 0.2, 0.21, 0.2, 0.22, 0.2, 0.19, 0.2, 0.1, ...silence];
  assert.equal(run(held).count, 1);
  // Two peaks 50 ms apart are one syllable (refractory); 150 ms apart with a dip are two.
  assert.equal(run([...silence, 0.1, 0.2, 0.19, 0.21, 0.1, ...silence]).count, 1);
  assert.equal(run([...silence, 0.1, 0.2, 0.05, 0.05, 0.21, 0.1, ...silence]).count, 2);
  // Noise alone never counts.
  assert.equal(run(Array.from({ length: 40 }, (_, i) => noise + (i % 3) * 0.002)).count, 0);
  // The framer turns raw samples into 50 ms RMS frames.
  const frames = [];
  const f = createFramer(16000, (rms, t) => frames.push([Number(rms.toFixed(3)), t]));
  f.push(new Float32Array(800).fill(0.5)); f.push(new Float32Array(800).fill(0));
  assert.deepEqual(frames, [[0.5, 0.05], [0, 0.1]]);
});
