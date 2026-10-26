// The lesson reviewer: deterministic checks, the shaping of model output, pending proposals in the store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLesson, answerPasses, soundScore, sayIpaAgreement, shapeModelProposals, reviewLesson } from "../src/reviewer.mjs";
import { createLessonStore, compilePacket, fromCode, parsePath, formatPath, readPath, pathToPatch, mergePatches } from "../src/lessons.mjs";
import { createStore } from "../src/media.mjs";
import { cck } from "../src/content/cck.mjs";
import { brier } from "../src/content/brier.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "gloo-review-"));
const open = (dir) => createLessonStore({ media: createStore({ forceLocal: true, dir }), seeds: [cck, brier] });
const byPath = (list, path) => list.find((p) => p.path === path);

// A deliberately broken cholecystokinin: a pick that doesn't sound like the piece, a say/ipa mismatch, an answer its rubric rejects.
function broken() {
  const doc = fromCode(cck);
  doc.roles[0].pick.options[3] = { name: "Sprite", wiki: "Sprite (drink)", say: ["sprite"], qloo: null, connection: "Sprite is a soda." };
  doc.roles[1].say = "koh-lee"; // cysto said as chole
  doc.prompts[0].answer = "Gall."; // rubric wants \bbile\b
  doc.roles[2].pick.options[1] = { ...doc.roles[2].pick.options[1], wiki: null, connection: "A film." }; // meaning role, no picture, no link to movement
  return doc;
}

test("deterministic checks name the broken pieces, with paths the PATCH route understands", () => {
  const { proposals, notes, questions } = checkLesson(broken());
  const sprite = byPath(proposals, "roles[chole].pick.options[3].name");
  assert.equal(sprite.severity, "fix");
  assert.equal(sprite.before, "Sprite");
  assert.equal(sprite.after, null, "only the model can name a replacement");
  assert.match(sprite.reason, /doesn't carry the sound of "chole"/);
  const ipa = byPath(proposals, "roles[cysto].ipa");
  assert.equal(ipa.severity, "fix");
  assert.match(ipa.reason, /"koh-lee" and the IPA "ˈsɪstoʊ" describe different sounds/);
  const answer = byPath(proposals, "prompts[cck-chole].answer");
  assert.equal(answer.severity, "fix");
  assert.equal(answer.before, "Gall.");
  assert.match(answer.reason, /fails its own rubric/);
  assert.equal(byPath(proposals, "roles[kin].pick.options[1].wiki").severity, "improve");
  assert.match(byPath(proposals, "roles[kin].pick.options[1].connection").reason, /meaning cue for "kin"/);
  assert.equal(byPath(proposals, "summary").severity, "improve", "the + and — in the summary are not speakable");
  assert.ok(questions.some((q) => /contains its meaning/.test(q)), "the claim is put to the model when components exist");
  assert.match(notes[0], /deterministic findings/);
  // The sound-alike options that are right are not flagged.
  for (const p of ["roles[chole].pick.options[0].name", "roles[chole].pick.options[1].name", "roles[cysto].pick.options[0].name", "roles[in].pick.options[0].name", "roles[in].pick.options[3].name"]) assert.equal(byPath(proposals, p), undefined, p);
  for (const p of proposals) assert.doesNotThrow(() => pathToPatch(p.path, p.after ?? "x"), p.path);
});

test("the reviewed seeds: Brier is clean apart from the spoken summary; CCK's own cysto answer fails its strict rubric", () => {
  const b = checkLesson(fromCode(brier));
  assert.deepEqual(b.proposals.map((p) => [p.path, p.severity]), [["summary", "improve"]]);
  const c = checkLesson(fromCode(cck));
  assert.deepEqual(c.proposals.filter((p) => p.severity === "fix").map((p) => p.path), ["prompts[cck-cysto].answer"]);
  assert.equal(answerPasses(compilePacket(fromCode(cck)).prompts[1]).ok, false); // "Cyst or cysto." vs /^\s*cyst(o)?\s*$/
});

test("the meaning claim without real components is a fix; sounds and say/ipa agreement are scored as the app scores them", () => {
  const doc = fromCode(cck);
  delete doc.components;
  const { proposals, questions } = checkLesson(doc);
  assert.equal(byPath(proposals, "summary").severity, "fix");
  assert.match(byPath(proposals, "summary").reason, /lists no word parts with meanings/);
  assert.deepEqual(questions, []);
  const chole = { part: "chole", sound_like: "cola" };
  assert.equal(soundScore(chole, { name: "Inca Kola" }), 1);
  assert.ok(soundScore(chole, { name: "Dr Pepper", say: ["pepper"] }) < 0.75);
  assert.equal(soundScore({ part: "-in", sound_like: "-in" }, { name: "Penguin", say: ["penguin books"] }), 1);
  assert.equal(soundScore({ part: "0 to 1", sound_like: "one" }, { name: "Formula 1" }), 1);
  assert.equal(sayIpaAgreement("koh-lih-sis-tuh-KY-nin", "ˌkoʊlɪˌsɪstoʊˈkaɪnɪn"), 1);
  assert.ok(sayIpaAgreement("sis-toh", "ˈkoʊlə") < 0.6);
});

test("answers pass their own rubrics by type: text through assess, numbers by stating the value, choices by naming the option", () => {
  const b = compilePacket(fromCode(brier));
  for (const p of b.prompts) assert.equal(answerPasses(p).ok, true, p.id);
  assert.match(answerPasses({ ...b.prompts[1], answer: "Square the gap." }).why, /never states the expected value 0.04/);
  assert.equal(answerPasses({ ...b.prompts[4], answer: "B — higher is better." }).ok, false);
  assert.equal(answerPasses({ ...b.prompts[4], answer: "A (0.02): lower is better." }).ok, true);
});

test("model output is checked: bad paths, no-ops, invalid values and rubric-failing answers are dropped; a new option arrives whole", () => {
  const doc = fromCode(cck);
  const notes = [];
  const kept = shapeModelProposals(doc, { proposals: [
    { path: "summary", after: "Chole is bile, cysto is the sac, kin is movement.", reason: "Spoken.", severity: "improve" },
    { path: "roles[chole].nickname", after: "x", reason: "no such field", severity: "fix" },
    { path: "definition", after: doc.definition, reason: "unchanged", severity: "improve" },
    { path: "pronunciation.ipa", after: "/ˈkoʊlə/", reason: "slashes fail validation", severity: "fix" },
    { path: "prompts[cck-chole].answer", after: "Cola.", reason: "a misconception, not bile", severity: "fix" },
    { path: "prompts[cck-cysto].answer", after: "Cysto", reason: "passes the strict rule (a trailing period would not)", severity: "fix" },
    { path: "roles[chole].pick.options[4].name", after: "Royal Crown Cola", reason: "a fifth cola", severity: "improve" },
    { path: "roles[chole].pick.options[4].wiki", after: "RC Cola", reason: "its picture", severity: "improve" },
    { path: "roles[cysto].pick.options[4].wiki", after: "Nowhere", reason: "a wiki with no name", severity: "improve" },
    { path: "summary", after: "duplicate", reason: "second summary", severity: "improve" },
  ] }, notes);
  assert.deepEqual(kept.map((p) => p.path), ["summary", "prompts[cck-cysto].answer", "roles[chole].pick.options[4].name", "roles[chole].pick.options[4].wiki"]);
  assert.equal(kept[0].before, cck.summary);
  assert.equal(kept[2].before, null);
  assert.ok(notes.some((n) => /roles\[chole\]\.nickname/.test(n)));
  assert.ok(notes.some((n) => /pronunciation\.ipa.*IPA letters/.test(n)));
  assert.ok(notes.some((n) => /prompts\[cck-chole\]\.answer.*still fails its rubric/.test(n)));
  assert.ok(notes.some((n) => /roles\[cysto\]\.pick\.options\[4\]\.wiki/.test(n)));
});

test("reviewLesson: deterministic findings first, the model fills in replacements; a failed or absent model still reports them", async () => {
  const doc = broken();
  const hadKey = process.env.ANTHROPIC_API_KEY;
  try {
    delete process.env.ANTHROPIC_API_KEY;
    const off = await reviewLesson({ ...doc, history: [{ version: 0 }] });
    assert.ok(off.proposals.length >= 5);
    assert.ok(off.notes.some((n) => /wasn't asked/.test(n)));
    process.env.ANTHROPIC_API_KEY = "test";
    let seen;
    const on = await reviewLesson(doc, { instruction: "plainer words", ask: async ({ system, user }) => {
      seen = { system, user };
      return { notes: "Looks sound otherwise.", proposals: [
        { path: "roles[chole].pick.options[3].name", after: "RC Cola", reason: "RC Cola carries the sound.", severity: "fix" },
        { path: "roles[chole].pick.options[3].wiki", after: "RC Cola", reason: "Its picture.", severity: "fix" },
        { path: "prompts[cck-chole].answer", after: "Bile.", reason: "Matches the rule.", severity: "fix" },
        { path: "definition", after: "A hormone that makes the gallbladder contract and the pancreas release digestive enzymes.", reason: "Plainer.", severity: "improve" },
      ] };
    } });
    assert.match(seen.system, /Every pick option must carry/);
    assert.match(seen.user, /Owner's instruction for this review: plainer words/);
    assert.match(seen.user, /- roles\[chole\]\.pick\.options\[3\]\.name \(fix\)/, "flagged findings are put to the model");
    assert.ok(!seen.user.includes('"history"'));
    const sprite = byPath(on.proposals, "roles[chole].pick.options[3].name");
    assert.equal(sprite.after, "RC Cola");
    assert.equal(sprite.severity, "fix");
    assert.match(sprite.reason, /doesn't carry the sound.*RC Cola carries the sound/);
    assert.equal(byPath(on.proposals, "prompts[cck-chole].answer").after, "Bile.");
    assert.equal(byPath(on.proposals, "roles[cysto].ipa").after, null, "unanswered findings stay, without a replacement");
    assert.equal(byPath(on.proposals, "definition").severity, "improve");
    assert.ok(on.notes.includes("Looks sound otherwise."));
    assert.equal(on.proposals.indexOf(sprite), 0, "deterministic findings lead the list");

    const failed = await reviewLesson(doc, { ask: async () => { throw new Error("boom"); } });
    assert.equal(failed.proposals.length, off.proposals.length);
    assert.ok(failed.notes.some((n) => /model call failed \(boom\)/.test(n)));
  } finally {
    if (hadKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = hadKey;
  }
});

test("paths: parse, format, read, patch and merge", () => {
  assert.deepEqual(parsePath("roles[chole].pick.options[Tesla, Inc.].wiki"), ["roles", "chole", "pick", "options", "Tesla, Inc.", "wiki"]);
  assert.deepEqual(parsePath("roles.chole.say"), ["roles", "chole", "say"]);
  assert.equal(formatPath(parsePath("prompts.cck-chole.answer")), "prompts[cck-chole].answer");
  const doc = fromCode(cck);
  assert.equal(readPath(doc, "roles[chole].pick.options[1].wiki"), "Pepsi");
  assert.equal(readPath(doc, "roles[chole].pick.options[RC Cola].wiki"), "RC Cola");
  assert.equal(readPath(doc, "prompts[cck-chole].answer"), "Bile.");
  assert.equal(readPath(doc, "nope.x"), undefined);
  assert.deepEqual(pathToPatch("prompts[cck-chole].accept_any", ["bile", "gall"]), { prompts: [{ id: "cck-chole", accept_any: ["bile", "gall"] }] });
  assert.deepEqual(pathToPatch("roles[1].pick.question", "Say your Sister."), { roles: [{ index: 1, pick: { question: "Say your Sister." } }] });
  assert.throws(() => pathToPatch("roles[chole]", {}), /needs roles/);
  assert.throws(() => pathToPatch("version", 9), /not an editable field/);
  assert.throws(() => pathToPatch("components[0].meaning", "x"), /patched whole/);
  const merged = mergePatches([
    pathToPatch("roles[chole].say", "koh-lee"), pathToPatch("roles[chole].pick.options[3].name", "RC Cola"), pathToPatch("roles[chole].pick.options[3].wiki", "RC Cola"),
    pathToPatch("roles[chole].pick.question", "Say your cola."), pathToPatch("roles[kin].say", "kinn"), pathToPatch("pronunciation.ipa", "x"), pathToPatch("pronunciation.approx", "y"),
    pathToPatch("prompts[cck-chole].answer", "Bile."), pathToPatch("prompts[cck-chole].hint", "Cola."),
  ]);
  assert.deepEqual(merged, {
    roles: [{ id: "chole", say: "koh-lee", pick: { options: [{ index: 3, name: "RC Cola", wiki: "RC Cola" }], question: "Say your cola." } }, { id: "kin", say: "kinn" }],
    pronunciation: { ipa: "x", approx: "y" },
    prompts: [{ id: "cck-chole", answer: "Bile.", hint: "Cola." }],
  });
});

test("store: proposals wait on the lesson without a version; accept applies only the chosen paths; discard clears; both survive a reload", async () => {
  const dir = tmp();
  const s = await open(dir).load();
  const pending = { created_at: "2026-10-25T12:00:00.000Z", by: "loren", instruction: null, notes: ["n"], proposals: [
    { path: "summary", before: cck.summary, after: "Chole is bile, cysto is the sac, kin is movement.", reason: "Spoken.", severity: "improve" },
    { path: "prompts[cck-cysto].answer", before: "Cyst or cysto.", after: "Cysto.", reason: "Passes.", severity: "fix" },
    { path: "roles[cysto].ipa", before: "ˈsɪstoʊ", after: null, reason: "Fix by hand.", severity: "fix" },
  ] };
  await s.setPending("cholecystokinin", pending);
  assert.equal(s.get("cholecystokinin").version, 1, "storing proposals is not an edit");
  assert.deepEqual(s.get("cholecystokinin").pending, pending);
  const edited = await s.patch("cholecystokinin", { title: "CCK" }, { editor: "loren" });
  assert.equal(edited.version, 2);
  assert.deepEqual(edited.pending, pending, "an ordinary edit keeps the proposals waiting");
  assert.ok(!("pending" in edited.history[0].packet), "snapshots never carry proposals");
  await assert.rejects(s.acceptProposals("cholecystokinin", ["nope"]), (e) => e.code === "INVALID" && e.problems.includes("nope: no such proposal"));
  await assert.rejects(s.acceptProposals("cholecystokinin", ["roles[cysto].ipa"]), (e) => e.problems[0].includes("no replacement"));
  await assert.rejects(s.acceptProposals("cholecystokinin", []), (e) => e.problems[0].startsWith("paths:"));
  const accepted = await s.acceptProposals("cholecystokinin", ["summary"], { editor: "reviewer via loren" });
  assert.equal(accepted.version, 3);
  assert.equal(accepted.edited_by, "reviewer via loren");
  assert.equal(accepted.summary, "Chole is bile, cysto is the sac, kin is movement.");
  assert.equal(accepted.prompts[1].answer, "Cyst or cysto.", "the unchosen proposal is not applied");
  assert.equal(accepted.pending, undefined, "accepting clears every proposal");
  assert.deepEqual(accepted.history[0].changed, ["summary"]);
  await assert.rejects(s.acceptProposals("cholecystokinin", ["summary"]), (e) => e.problems.includes("pending: nothing to accept"));
  await s.setPending("brier-score", pending);
  const again = await open(dir).load(); // a fresh process on the same folder
  assert.deepEqual(again.get("brier-score").pending, pending);
  assert.equal(again.get("cholecystokinin").pending, undefined);
  const cleared = await again.discardProposals("brier-score");
  assert.equal(cleared.pending, undefined);
  assert.equal(cleared.version, 1);
  await assert.rejects(again.setPending("nope", pending), (e) => e.code === "NOT_FOUND");
});
