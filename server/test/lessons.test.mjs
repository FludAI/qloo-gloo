// The lesson store: seeding without overwrites, merge patches, validation, versions, publish, promote.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createLessonStore, compilePacket, fromCode, applyPatch, validatePacket, readField, HISTORY } from "../src/lessons.mjs";
import { createStore } from "../src/media.mjs";
import { assess } from "../src/assess.mjs";
import { cck } from "../src/content/cck.mjs";
import { brier } from "../src/content/brier.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "gloo-lessons-"));
const open = (dir, db = new DatabaseSync(":memory:")) => createLessonStore({ media: createStore({ forceLocal: true, dir }), db, seeds: [cck, brier] });

test("code packets round-trip through JSON: reviewed regex rubrics still score the same", () => {
  const doc = fromCode(cck);
  assert.equal(doc.version, 1);
  assert.equal(doc.review_status, "reviewed");
  assert.deepEqual(doc.prompts[0].accept_any, ["/\\bbile\\b/"]);
  assert.deepEqual(doc.prompts[0].misconceptions, [{ keywords: ["/cola|soda/"], feedback: "Cola is the sound cue. What does chole mean?" }]);
  assert.ok(!JSON.stringify(doc).includes("{}"), "no regex collapsed into an empty object");
  const t = compilePacket(JSON.parse(JSON.stringify(doc)));
  assert.equal(assess(t.prompts[0], "bile").outcome, "correct");
  assert.equal(assess(t.prompts[0], "it is bilek").outcome, "incorrect"); // \b kept
  assert.equal(assess(t.prompts[0], "cola").feedback, "Cola is the sound cue. What does chole mean?");
  assert.equal(assess(t.prompts[1], "  cysto ").outcome, "correct");
  assert.match(assess(t.prompts[3], "the gallbladder contracts, pancreatic enzymes too").feedback, /expanded answer/); // bonus kept
  // Plain keywords (the drafter's form) and regex entries mix in one list.
  const mixed = compilePacket({ prompts: [{ id: "x", type: "text", accept_any: ["around", "/\\bsurround(s|ed)?\\b/"] }] });
  assert.equal(assess(mixed.prompts[0], "goes around").outcome, "correct");
  assert.equal(assess(mixed.prompts[0], "surrounded").outcome, "correct");
  assert.equal(assess(mixed.prompts[0], "surroundings").outcome, "incorrect");
});

test("seed once, never overwrite: a second boot on the same folder keeps the owner's edit", async () => {
  const dir = tmp();
  const a = await open(dir).load();
  assert.deepEqual(a.summaries().map((s) => [s.id, s.version, s.review_status]).sort(), [["brier-score", 1, "reviewed"], ["cholecystokinin", 1, "reviewed"]]);
  assert.ok(existsSync(join(dir, "lessons", "cholecystokinin.json")));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "lessons", "index.json"), "utf8")).ids, ["brier-score", "cholecystokinin"]);
  const edited = await a.patch("cholecystokinin", { summary: "Chole (bile) + cysto (sac) + kin (movement): the hormone that moves the bile sac." }, { editor: "loren" });
  assert.equal(edited.version, 2);
  assert.equal(edited.edited_by, "loren");
  // "Redeploy": a fresh process, empty SQLite, same bucket folder, same seeds in code.
  const b = await open(dir).load();
  const doc = b.get("cholecystokinin");
  assert.equal(doc.version, 2);
  assert.match(doc.summary, /^Chole \(bile\)/);
  assert.equal(doc.history.length, 1);
  assert.equal(doc.history[0].version, 1);
  assert.equal(doc.history[0].packet.summary, cck.summary);
  assert.equal(b.get("brier-score").version, 1);
});

test("the bucket wins over the SQLite cache, and the cache fills in when the bucket is empty", async () => {
  const dir = tmp();
  const db = new DatabaseSync(":memory:");
  const a = await open(dir, db).load();
  await a.patch("brier-score", { title: "Brier score (edited)" });
  // Same instance restarts with its SQLite rows but a bucket that lost the index: rows still load.
  const c = await createLessonStore({ media: createStore({ forceLocal: true, dir: tmp() }), db, seeds: [cck, brier] }).load();
  assert.equal(c.get("brier-score").title, "Brier score (edited)");
  assert.equal(c.get("brier-score").version, 2);
});

test("merge patch addresses roles, prompts and pick options by id or index; unknown fields are refused", () => {
  const doc = fromCode(cck);
  const { packet, changed, problems } = applyPatch(doc, {
    title: "Cholecystokinin",
    pronunciation: { approx: "koh-lee-sis-toh-KY-nin" },
    roles: [{ id: "chole", meaning: "bile (gall)", pick: { question: "Say your cola.", options: [{ index: 1, wiki: "Pepsi-Cola" }, { name: "RC Cola", wiki: "Royal Crown Cola" }] } }, { index: 2, say: "kinn" }],
    prompts: [{ id: "cck-chole", hint: null }, { index: 1, accept_any: ["cyst", "cysto"] }],
  });
  assert.deepEqual(problems, []);
  assert.equal(packet.title, "Cholecystokinin");
  assert.equal(packet.pronunciation.approx, "koh-lee-sis-toh-KY-nin");
  assert.equal(packet.pronunciation.ipa, cck.pronunciation.ipa, "untouched sibling keys survive a merge");
  assert.equal(packet.roles[0].meaning, "bile (gall)");
  assert.equal(packet.roles[0].part, "chole");
  assert.equal(packet.roles[0].pick.question, "Say your cola.");
  assert.equal(packet.roles[0].pick.options[1].wiki, "Pepsi-Cola");
  assert.equal(packet.roles[0].pick.options[1].name, "Pepsi-Cola");
  assert.equal(packet.roles[0].pick.options[2].name, "RC Cola");
  assert.equal(packet.roles[0].pick.options[2].wiki, "Royal Crown Cola");
  assert.equal(packet.roles[2].say, "kinn");
  assert.equal(packet.prompts[0].hint, undefined);
  assert.deepEqual(packet.prompts[1].accept_any, ["cyst", "cysto"]);
  assert.ok(!("history" in packet));
  assert.deepEqual(changed, ["title", "pronunciation", "roles.chole", "roles.kin", "prompts.cck-chole", "prompts.cck-cysto"]);
  assert.equal(doc.roles[0].meaning, "bile", "the input document is not mutated");

  const bad = applyPatch(doc, { version: 9, id: "x", colour: "red", roles: [{ id: "nope", meaning: "x" }, { id: "chole", nickname: "k" }], prompts: [{ index: 99, hint: "x" }] });
  assert.deepEqual(bad.problems, ["version: managed by the store", "id: managed by the store", "colour: not an editable field",
    'roles[0]: no item with id "nope"', "roles.chole.nickname: not an editable field", "prompts[0]: no item with index 99"]);
});

test("validation names every problem: empty title, bad IPA, duplicate ids, text prompts without rules, bad regex", () => {
  const doc = fromCode(brier);
  doc.title = " ";
  doc.pronunciation.ipa = "/ˈbraɪər/";
  doc.roles[1].id = "sound";
  doc.roles[0].ipa = "bry-er";
  doc.prompts[0].accept_all = []; doc.prompts[0].accept_any = [];
  doc.prompts[1].expected = "0.04";
  doc.prompts[4].expected = "C";
  doc.prompts[2].misconceptions = [{ keywords: ["/(/"], feedback: "x" }];
  const problems = validatePacket(doc);
  for (const p of ["title: a short non-empty string", "pronunciation.ipa: IPA letters and stress marks only, no slashes, or null", 'roles[1].id: duplicate "sound"',
    "roles[0].ipa: IPA letters and stress marks only, no slashes, or null", "prompts[0]: a text prompt needs at least one accept rule", "prompts[1].expected: a finite number",
    "prompts[4].expected: one of the options", "prompts[2].misconceptions[0]: bad regex /(/"]) {
    assert.ok(problems.includes(p), `missing: ${p}\nhave: ${problems.join("\n")}`);
  }
  assert.deepEqual(validatePacket(fromCode(cck)), []);
  assert.deepEqual(validatePacket(fromCode(brier)), []);
});

test("patch: invalid edits are rejected whole, versions climb one per saved change, history keeps 20", async () => {
  const s = await open(tmp()).load();
  await assert.rejects(s.patch("cholecystokinin", { summary: "" }), (e) => e.code === "INVALID" && e.problems.includes("summary: a non-empty string (≤ 600)"));
  assert.equal(s.get("cholecystokinin").version, 1, "nothing saved");
  await assert.rejects(s.patch("no-such", { summary: "x" }), (e) => e.code === "NOT_FOUND");
  const same = await s.patch("cholecystokinin", {});
  assert.equal(same.version, 1, "an empty patch is not a version");
  for (let i = 1; i <= HISTORY + 3; i++) await s.patch("cholecystokinin", { summary: `Edit ${i}` }, { editor: `e${i}` });
  const doc = s.get("cholecystokinin");
  assert.equal(doc.version, HISTORY + 4);
  assert.equal(doc.history.length, HISTORY);
  assert.equal(doc.history[0].version, HISTORY + 3);
  assert.equal(doc.history[0].packet.summary, `Edit ${HISTORY + 2}`);
  assert.deepEqual(doc.history[0].changed, ["summary"]);
});

test("publish marks a provisional lesson reviewed; promote copies a learner draft into the shared store", async () => {
  const s = await open(tmp()).load();
  const draft = { id: "p-0123456789", version: "draft-1", provisional: true, origin: "ai-draft", review: { status: "provisional", reviewed_at: null },
    title: "Peristalsis", aliases: ["peristalsis"], pronunciation: { approx: "pair-ih-STAL-sis", ipa: null, note: "Approximate. Not reviewed." },
    summary: "peri (around) + stalsis (contraction)", definition: "Wave-like muscle contractions that move food along.",
    roles: [{ id: "peri", label: "peri = around", part: "peri", meaning: "around", sound_like: "perry", say: "pair-ee", ipa: null, target: "around", look_for: "x",
      pick: { question: "Say your favorite Perry.", options: [{ name: "Katy Perry", wiki: "Katy Perry", say: [], qloo: null, connection: "Perry ≈ peri (approximate)." }] } }],
    prompts: [{ id: "p-0123456789-q1", skill: "meaning", type: "text", question: "What does peri mean?", accept_any: ["around"], answer: "Around." }] };
  await assert.rejects(s.promote(draft, { id: "Bad Id" }), (e) => e.code === "INVALID");
  const doc = await s.promote(draft, { id: "peristalsis", editor: "loren", origin: "ai-draft", from: draft.id });
  assert.equal(doc.review_status, "provisional");
  assert.equal(doc.version, 1);
  assert.equal(doc.prompts[0].id, "peristalsis-q1");
  assert.ok(!("provisional" in doc) && !("origin" in doc));
  assert.deepEqual(doc.promoted_from, { provisional_id: "p-0123456789", origin: "ai-draft" });
  await assert.rejects(s.promote(draft, { id: "peristalsis" }), (e) => e.code === "EXISTS");
  assert.equal(s.summaries().length, 3);
  const pub = await s.publish("peristalsis", { editor: "loren" });
  assert.equal(pub.review_status, "reviewed");
  assert.equal(pub.version, 2);
  assert.match(pub.reviewed_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(pub.history[0].changed, ["review_status"]);
  assert.equal((await s.publish("peristalsis")).version, 2, "publishing twice is a no-op");
});

test("readField walks ids, names and indexes", () => {
  const doc = fromCode(cck);
  assert.equal(readField(doc, "summary"), cck.summary);
  assert.equal(readField(doc, "pronunciation.ipa"), cck.pronunciation.ipa);
  assert.equal(readField(doc, "roles.chole.meaning"), "bile");
  assert.equal(readField(doc, "roles.1.part"), "cysto");
  assert.equal(readField(doc, "roles.chole.pick.options.1.wiki"), "Pepsi");
  assert.equal(readField(doc, "roles.chole.pick.options.RC Cola.wiki"), "RC Cola");
  assert.equal(readField(doc, "prompts.cck-chole.hint"), "Cola ≈ chole.");
  assert.equal(readField(doc, "prompts.nope.hint"), undefined);
  assert.equal(readField(doc, "__proto__.x"), undefined);
});
