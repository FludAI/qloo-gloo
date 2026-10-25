// The ambient editor's pure parts (web/src/edit/ambient/*.js): the grid of field keys, the proposal-path
// mapping both ways, the command grammar, the taste ranking, and the camera flights.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLayout, buildQueue, columnOf, flagLesson, getValue, keyForPath, patchFor, proposalPath, suggestField, withValue } from "../../web/src/edit/ambient/grid.js";
import { parseCommand, tagForInstruction } from "../../web/src/edit/ambient/grammar.js";
import { learn, loadTaste, rank, saveTaste, seedTaste, tagsForProposal } from "../../web/src/edit/ambient/taste.js";
import { camTransform, flightTo, DUR } from "../../web/src/edit/ambient/camera.js";
import { createLessonStore, fromCode, pathToPatch, readPath } from "../src/lessons.mjs";
import { createStore } from "../src/media.mjs";
import { cck } from "../src/content/cck.mjs";

const lesson = fromCode(cck);

test("grid: every field key reads the lesson, round-trips to a proposal path, and names the suggest field", () => {
  const keys = buildLayout(lesson).map((n) => n.key);
  assert.equal(keys.length, 3 + 4 * 8 + 6 * 3);
  assert.equal(getValue(lesson, "w:say"), "koh-lih-sis-tuh-KY-nin");
  assert.equal(getValue(lesson, "r:cysto:sounds"), "sister");
  assert.equal(getValue(lesson, "r:kin:sounds"), "", "a null sound_like reads as empty");
  assert.equal(getValue(lesson, "r:chole:opt3"), "Inca Kola");
  assert.equal(getValue(lesson, "p:cck-kin:hint"), "Kinetic.");
  for (const k of keys) {
    const path = proposalPath(k);
    assert.equal(keyForPath(lesson, path), k, `${k} -> ${path} -> back`);
    assert.equal(readPath(lesson, path) ?? "", getValue(lesson, k), `${path} reads the same value as ${k}`);
    assert.doesNotThrow(() => pathToPatch(path, "x"), `${path} is a path the server can patch`);
    assert.equal(typeof suggestField(k), "string");
  }
  assert.equal(suggestField("r:chole:opt1"), "roles.chole.pick.options.1.name");
  assert.equal(suggestField("w:say"), "pronunciation.approx");
});

test("grid: reviewer paths by id, index, name, dotted or bracketed all map to the same key; off-grid paths map to null", () => {
  assert.equal(keyForPath(lesson, "roles[chole].pick.options[2].name"), "r:chole:opt2");
  assert.equal(keyForPath(lesson, "roles[0].pick.options[RC Cola].name"), "r:chole:opt2");
  assert.equal(keyForPath(lesson, "roles.chole.pick.options.2.name"), "r:chole:opt2");
  assert.equal(keyForPath(lesson, "prompts[1].hint"), "p:cck-cysto:hint");
  assert.equal(keyForPath(lesson, "roles[cysto].sound_like"), "r:cysto:sounds");
  assert.equal(keyForPath(lesson, "pronunciation.approx"), "w:say");
  for (const off of ["pronunciation.ipa", "roles[chole].say", "roles[chole].pick.options[2].wiki", "definition", "distinctions", "roles[nope].part", "prompts[cck-chole].accept_any", ""]) {
    assert.equal(keyForPath(lesson, off), null, off);
  }
});

test("grid: patches are the server's merge shape; empty text clears an optional field and keeps a required one", () => {
  assert.deepEqual(patchFor("w:summary", "Short."), { summary: "Short." });
  assert.deepEqual(patchFor("w:say", ""), { pronunciation: { approx: null } });
  assert.deepEqual(patchFor("r:kin:sounds", "kinetic"), { roles: [{ id: "kin", sound_like: "kinetic" }] });
  assert.deepEqual(patchFor("r:kin:sounds", "  "), { roles: [{ id: "kin", sound_like: null }] });
  assert.deepEqual(patchFor("r:chole:question", "Name a cola."), { roles: [{ id: "chole", pick: { question: "Name a cola." } }] });
  assert.deepEqual(patchFor("r:chole:opt3", "Jolt Cola"), { roles: [{ id: "chole", pick: { options: [{ index: 3, name: "Jolt Cola" }] } }] });
  assert.deepEqual(patchFor("p:cck-chole:hint", ""), { prompts: [{ id: "cck-chole", hint: null }] });
  assert.deepEqual(patchFor("p:cck-chole:answer", ""), { prompts: [{ id: "cck-chole", answer: "" }] });
  const L = withValue(lesson, "r:chole:opt3", "Jolt Cola");
  assert.equal(L.roles[0].pick.options[3].name, "Jolt Cola");
  assert.equal(lesson.roles[0].pick.options[3].name, "Inca Kola", "the original is untouched");
});

test("grid: the queue puts pending fixes first, then improvements, then local flags, each in grid order; off-grid proposals are counted apart", () => {
  const pending = [
    { path: "prompts[cck-cysto].answer", before: "Cyst or cysto.", after: "Cysto", reason: "rubric", severity: "fix" },
    { path: "summary", before: lesson.summary, after: "Shorter.", reason: "spoken", severity: "improve" },
    { path: "roles[chole].pick.options[3].name", before: "Inca Kola", after: null, reason: "sound", severity: "fix" },
    { path: "pronunciation.ipa", before: "x", after: "y", reason: "ipa", severity: "fix" },
  ];
  const { queue, unmapped } = buildQueue(lesson, pending);
  assert.deepEqual(queue.slice(0, 3), ["r:chole:opt3", "p:cck-cysto:answer", "w:summary"]);
  assert.ok(queue.includes("r:kin:sounds"), "the empty sounds-like is a local flag");
  assert.ok(queue.indexOf("r:kin:sounds") > queue.indexOf("w:summary"));
  assert.deepEqual(unmapped.map((p) => p.path), ["pronunciation.ipa"]);
  assert.equal(new Set(queue).size, queue.length);
  const flags = flagLesson(lesson);
  assert.ok(flags.some((f) => f.key === "w:summary" && /symbols|sentences/.test(f.reason)), "the seed summary carries symbols");
  assert.ok(flags.every((f) => f.after === null && f.local));
  assert.equal(columnOf(lesson, "p:cck-chole:hint"), 5);
});

test("grammar: the five commands, review, an instruction, or the field's new words", () => {
  for (const [say, kind] of [["keep", "keep"], ["Yes.", "keep"], ["that one", "keep"], ["next", "next"], ["nope", "next"], ["skip", "next"], ["back", "back"], ["undo", "undo"], ["Map", "map"], ["zoom out", "map"], ["review", "review"]]) {
    assert.equal(parseCommand(say).kind, kind, say);
  }
  assert.deepEqual(parseCommand("make it shorter"), { kind: "instruct", text: "make it shorter" });
  assert.deepEqual(parseCommand("lead with the sound"), { kind: "instruct", text: "lead with the sound" });
  assert.equal(parseCommand("shorter").kind, "instruct");
  assert.equal(parseCommand("something funnier").kind, "instruct");
  assert.equal(parseCommand("a version with the sound first and nothing else").kind, "instruct", "a long phrase is a request");
  assert.deepEqual(parseCommand("Bile. Sac. Move."), { kind: "replace", text: "Bile. Sac. Move." });
  assert.deepEqual(parseCommand("  Jolt   Cola "), { kind: "replace", text: "Jolt Cola" });
  assert.equal(parseCommand("kinetic").kind, "replace");
  assert.equal(parseCommand(""), null);
  assert.equal(parseCommand("   "), null);
  assert.equal(tagForInstruction("make it shorter"), "short");
  assert.equal(tagForInstruction("lead with the sound"), "sound");
  assert.equal(tagForInstruction("plainer words"), "plain");
  assert.equal(tagForInstruction("something funnier"), "fun");
  assert.equal(tagForInstruction("make it about cars"), "about");
});

test("taste: seeded, persisted, moved by keep and next, and used to rank candidates with the owner's own first", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let taste = loadTaste(storage);
  assert.deepEqual(taste.map((t) => t.tag), ["short", "sound", "plain"]);
  taste = learn(taste, ["gaming", "short"], 0.12, "you");
  assert.equal(taste.find((t) => t.tag === "gaming").weight, 0.42);
  assert.equal(taste.find((t) => t.tag === "short").weight, 0.62);
  taste = learn(taste, ["short"], -0.04);
  assert.equal(Number(taste.find((t) => t.tag === "short").weight.toFixed(2)), 0.58);
  taste = learn(taste, ["short"], 5);
  assert.equal(taste.find((t) => t.tag === "short").weight, 1, "clamped");
  saveTaste(taste, storage);
  assert.deepEqual(loadTaste(storage), taste);
  assert.deepEqual(seedTaste([{ tag: "x", weight: 2 }]).map((t) => [t.tag, t.weight]), [["x", 1], ["short", 0.5], ["sound", 0.5], ["plain", 0.5]]);
  const ranked = rank(taste, [{ text: "a", tags: ["plain"] }, { text: "b", tags: ["short"] }, { text: "c", tags: ["gaming"], mine: true }, { text: "d", tags: [] }]);
  assert.deepEqual(ranked.map((c) => c.text), ["c", "b", "a", "d"]);
  assert.deepEqual(tagsForProposal({ severity: "fix", reason: "The answer fails its rubric.", before: "Cyst or cysto.", after: "Cysto" }), ["rule", "short"]);
  assert.deepEqual(tagsForProposal({ severity: "improve", reason: "Shorter and spoken.", before: "x", after: "xyz" }), ["improve", "sound", "short"]);
  assert.equal(loadTaste({ getItem: () => "{bad" }).length, 3, "a broken store falls back to the seed");
});

test("camera: the map fits the grid; a near move is one stage, a far one lifts then settles", () => {
  const map = camTransform({ mode: "map" }, { w: 402, h: 560 }, lesson);
  assert.match(map, /^translate\(.*\) scale\(0\.\d+\)$/);
  assert.equal(camTransform({ mode: "pt", fx: 100, fy: 50, s: 1 }, { w: 400, h: 400 }, lesson), "translate(100px,100px) scale(1)");
  const open = flightTo(null, { fx: 0, fy: 0 });
  assert.equal(open.length, 1); assert.equal(open[0].dur, DUR.open);
  const near = flightTo({ mode: "pt", fx: 0, fy: 0, s: 1 }, { fx: 100, fy: 300 });
  assert.equal(near.length, 1); assert.equal(near[0].dur, DUR.near);
  const far = flightTo({ mode: "pt", fx: 0, fy: 0, s: 1 }, { fx: 840, fy: 0 });
  assert.equal(far.length, 2);
  assert.deepEqual(far[0].cam, { mode: "pt", fx: 420, fy: 40, s: 0.38 });
  assert.equal(far[1].cam.s, 1);
  assert.equal(flightTo({ mode: "pt", fx: 0, fy: 0, s: 1 }, { fx: 840, fy: 0 }, { fromMap: true }).length, 1);
});

test("store: accept with keepRest applies one proposal and leaves the others pending", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gloo-ambient-"));
  const s = await createLessonStore({ media: createStore({ forceLocal: true, dir }), seeds: [cck] }).load();
  await s.setPending("cholecystokinin", { created_at: "now", by: "test", instruction: null, notes: [], proposals: [
    { path: "summary", before: lesson.summary, after: "Bile sac, moved.", reason: "short", severity: "improve" },
    { path: "prompts[cck-cysto].answer", before: "Cyst or cysto.", after: "Cysto", reason: "rubric", severity: "fix" },
  ] });
  const one = await s.acceptProposals("cholecystokinin", ["summary"], { editor: "reviewer via owner", keepRest: true });
  assert.equal(one.version, 2);
  assert.equal(one.summary, "Bile sac, moved.");
  assert.deepEqual(one.pending.proposals.map((p) => p.path), ["prompts[cck-cysto].answer"], "the other proposal is still pending");
  assert.equal(one.pending.by, "test");
  const two = await s.acceptProposals("cholecystokinin", ["prompts[cck-cysto].answer"], { keepRest: true });
  assert.equal(two.version, 3);
  assert.equal(two.pending, undefined, "nothing left: pending is cleared");
  await s.setPending("cholecystokinin", { created_at: "now", by: "test", instruction: null, notes: [], proposals: [
    { path: "summary", before: "Bile sac, moved.", after: "Moved.", reason: "short", severity: "improve" },
    { path: "prompts[cck-cysto].answer", before: "Cysto", after: "cysto", reason: "rubric", severity: "fix" },
  ] });
  const all = await s.acceptProposals("cholecystokinin", ["summary"]);
  assert.equal(all.pending, undefined, "the default still clears the rest");
});
