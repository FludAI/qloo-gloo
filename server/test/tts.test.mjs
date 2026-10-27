// The app's voice: SSML from IPA, clips paid for once, the verified pin, and the local media store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSsml, buildSpeech, pronunciations, createSpeaker, textKey, timeMarks } from "../src/tts.mjs";
import { createStore } from "../src/media.mjs";
import { cck } from "../src/content/cck.mjs";
import { brier } from "../src/content/brier.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "gloo-media-"));
const ph = (ipa, word) => `<phoneme alphabet="ipa" ph="${ipa}">${word}</phoneme>`;
// One <mark> and one <phoneme> per syllable; mark numbers run through the whole line.
const syl = (from, ...pairs) => pairs.map(([ipa, text], i) => `<mark name="m${from + i}"/>${ph(ipa, text)}`).join("");
const phonemes = (s) => [...s.matchAll(/ph="([^"]+)"/g)].map((m) => m[1]);

test("ssml: every piece and the whole word are spoken syllable by syllable from their IPA, a mark before each; the rest is plain, escaped text", () => {
  const { ssml: s, marks } = buildSpeech("Cholecystokinin (CCK). Chole means bile & cysto means sac.", cck);
  assert.ok(s.startsWith("<speak>") && s.endsWith("</speak>"));
  assert.ok(s.includes(syl(0, ["koʊ", "Cho"], ["lɪ", "le"], ["sɪs", "cys"], ["toʊ", "to"], ["ˈkaɪ", "kin"], ["nɪn", "in"])), s);
  assert.ok(s.includes(syl(6, ["ˈkoʊ", "Cho"], ["lə", "le"])));
  assert.ok(s.includes(syl(8, ["ˈsɪs", "cys"], ["toʊ", "to"])));
  assert.ok(s.includes("&amp;"));
  assert.ok(!s.includes('ph="ɪn">in<'), "the English word 'in' is not a piece");
  assert.equal(marks.length, 10);
  assert.deepEqual(marks[4], { name: "m4", index: 4, piece: "Cholecystokinin", syllable: "ˈkaɪ" });
  assert.deepEqual(marks.slice(6, 8).map((m) => [m.piece, m.index, m.syllable]), [["Chole", 0, "ˈkoʊ"], ["Chole", 1, "lə"]]);
  assert.equal(buildSsml("x", cck), s.replace(/.*/s, buildSsml("x", cck)), "buildSsml is the SSML of buildSpeech");
});

test("ssml: a piece spoken on its own is pinned, even a short ending like -in; one syllable is one phoneme", () => {
  assert.equal(buildSsml("-in", cck), `<speak>${syl(0, ["ɪn", "in"])}</speak>`);
  assert.equal(buildSsml("kin", cck), `<speak>${syl(0, ["kaɪ", "kin"])}</speak>`);
  assert.equal(buildSsml("Brier", brier), `<speak>${syl(0, ["ˈbraɪ", "Bri"], ["ər", "er"])}</speak>`);
  assert.deepEqual(phonemes(buildSsml("Brier score", brier)), ["ˈbraɪ", "ər", "skɔːr"]);
});

test("ssml: a term with IPA but no stored syllables is split by the fallback; marks still cover every syllable", () => {
  const bare = { ...cck, pronunciation: { ...cck.pronunciation, ipa_syllables: undefined }, roles: cck.roles.map(({ ipa_syllables, ...r }) => r) };
  const { ssml, marks } = buildSpeech("Cholecystokinin. chole.", bare);
  assert.deepEqual(phonemes(ssml), ["ˌkoʊ", "lɪ", "ˌsɪs", "toʊ", "ˈkaɪ", "nɪn", "ˈkoʊ", "lə"]);
  assert.equal(marks.length, 8);
});

test("marks: time points from the service are matched by name; a missing one voids the set", () => {
  const { marks } = buildSpeech("kin", cck);
  assert.deepEqual(timeMarks(marks, [{ markName: "m0", timeSeconds: 0.0421 }]), [{ index: 0, piece: "kin", syllable: "kaɪ", time: 0.042 }]);
  assert.equal(timeMarks(marks, []), null);
  assert.deepEqual(timeMarks([], []), []);
});

test("ssml: a pick option with IPA is said from it, in a line and on its own; kin is said ky", () => {
  const { ssml } = buildSpeech("KY-netic Sand. kin.", cck);
  assert.match(ssml, /<phoneme alphabet="ipa" ph="ˌkaɪˈnɛtɪk sænd">KY-netic Sand<\/phoneme>/);
  assert.match(ssml, /<phoneme alphabet="ipa" ph="kaɪ">kin<\/phoneme>/);
  assert.match(buildSpeech("Here, kin is said like the start of KY-netic Sand. Which do you say?", cck).ssml, /ph="ˌkaɪˈnɛtɪk sænd"/);
  assert.doesNotMatch(buildSpeech("kinetic", cck).ssml, /<phoneme/);
});

test("ssml: plain text, or a term without IPA, passes through untouched", () => {
  assert.equal(buildSsml("Say your favorite cola.", null), "<speak>Say your favorite cola.</speak>");
  assert.equal(buildSsml("How would you say it? <b>", { title: "X", roles: [{ part: "x", say: "ex" }] }), "<speak>How would you say it? &lt;b&gt;</speak>");
  assert.equal(pronunciations(cck)[0].spelling, "Cholecystokinin"); // longest first
});

test("clips: a sentence is synthesized once, then served from the store; the sidecar records it", async () => {
  let calls = 0;
  const synth = async (ssml) => { calls++; return Buffer.from(`MP3:${ssml}`); };
  const dir = tmp();
  const store = createStore({ dir, forceLocal: true });
  const sp = createSpeaker({ store, synth, voice: "en-US-Test" });
  const a = await sp.say("chole means bile.", cck);
  assert.equal(a.cached, false);
  assert.ok(a.bytes.toString().includes(ph("ˈkoʊ", "cho")));
  const b = await sp.say("chole  means bile.", cck); // whitespace differences don't buy a second clip
  assert.equal(b.cached, true);
  assert.equal(b.clip, a.clip);
  assert.equal(calls, 1);
  const side = await store.getJson(`audio/${a.clip}.json`);
  assert.equal(side.text, "chole means bile.");
  assert.equal(side.voice, "en-US-Test");
  assert.equal(side.verified, false);
  assert.ok(side.ssml.startsWith("<speak>"));
  // A cold store (new LRU, same folder) still finds it: nothing is paid for twice across restarts.
  const cold = createSpeaker({ store: createStore({ dir, forceLocal: true }), synth, voice: "en-US-Test" });
  assert.equal((await cold.say("chole means bile.", cck)).cached, true);
  assert.equal(calls, 1);
});

test("clips: syllable marks are timed by the service, kept in the sidecar, served with hits, and read back by timing()", async () => {
  let calls = 0;
  // A fake service: audio is the SSML; every mark gets a time 0.3 s apart.
  const synth = async (ssml) => { calls++; const names = [...ssml.matchAll(/<mark name="([^"]+)"/g)].map((m) => m[1]); return { bytes: Buffer.from(ssml), timepoints: names.map((n, i) => ({ markName: n, timeSeconds: 0.3 * i + 0.1 })) }; };
  const dir = tmp();
  const store = createStore({ dir, forceLocal: true });
  const sp = createSpeaker({ store, synth, voice: "v" });
  const a = await sp.say("Cholecystokinin. The hormone.", cck);
  assert.equal(a.marks.length, 6);
  assert.deepEqual(a.marks[0], { index: 0, piece: "Cholecystokinin", syllable: "koʊ", time: 0.1 });
  assert.deepEqual(a.marks.map((m) => m.time), [0.1, 0.4, 0.7, 1, 1.3, 1.6]);
  assert.deepEqual((await store.getJson(`audio/${a.clip}.json`)).marks, a.marks, "the sidecar keeps the marks");
  const b = await sp.say("Cholecystokinin. The hormone.", cck);
  assert.equal(b.cached, true);
  assert.deepEqual(b.marks, a.marks, "a hit carries its marks");
  assert.deepEqual((await sp.timing("Cholecystokinin.  The hormone.", cck)), { clip: a.clip, verified: false, marks: a.marks });
  assert.equal(await sp.timing("never said", cck), null);
  // A line with no word or piece in it has no marks and asks the service for none.
  const plain = await sp.say("Say your favorite cola.", cck);
  assert.deepEqual(plain.marks, []);
  assert.equal(calls, 2);
  // A service that returns no time points: marks null, the clip still plays and is not rebuilt again.
  const mute = createSpeaker({ store: createStore({ dir: tmp(), forceLocal: true }), synth: async (ssml) => ({ bytes: Buffer.from(ssml), timepoints: [] }), voice: "v" });
  assert.equal((await mute.say("kin", cck)).marks, null);
  assert.equal((await mute.say("kin", cck)).cached, true);
});

test("clips: a clip from before syllable timing is rebuilt once for a line with a word in it; verified clips are left alone", async () => {
  let calls = 0;
  const synth = async (ssml) => { calls++; const names = [...ssml.matchAll(/<mark name="([^"]+)"/g)].map((m) => m[1]); return { bytes: Buffer.from(`new|${ssml}`), timepoints: names.map((n, i) => ({ markName: n, timeSeconds: i })) }; };
  const store = createStore({ dir: tmp(), forceLocal: true });
  const sp = createSpeaker({ store, synth, voice: "v" });
  // Plant an old clip under the key the current builder produces, with a sidecar that predates marks.
  const { ssml } = buildSpeech("kin", cck);
  const { clipKey } = await import("../src/tts.mjs");
  const clip = clipKey(ssml, "v");
  await store.put(`audio/${clip}.mp3`, Buffer.from("old"), "audio/mpeg");
  await store.putJson(`audio/${clip}.json`, { text: "kin", term_id: "cholecystokinin", ssml, voice: "v", verified: false, created_at: "2026-10-24T00:00:00Z" });
  const first = await sp.say("kin", cck);
  assert.equal(first.cached, false);
  assert.ok(first.bytes.toString().startsWith("new|"));
  assert.deepEqual(first.marks, [{ index: 0, piece: "kin", syllable: "kaɪ", time: 0 }]);
  assert.equal((await sp.say("kin", cck)).cached, true);
  assert.equal(calls, 1);
  // The same old clip, verified by the owner: served as it is, marks null, nothing paid for.
  const clip2 = clipKey(buildSsml("-in", cck), "v");
  await store.put(`audio/${clip2}.mp3`, Buffer.from("old"), "audio/mpeg");
  await store.putJson(`audio/${clip2}.json`, { text: "-in", ssml: buildSsml("-in", cck), voice: "v", verified: true });
  await store.putJson(`verified/${textKey("-in", cck)}.json`, { clip: clip2, text: "-in", term_id: "cholecystokinin" });
  const pinned = await sp.say("-in", cck);
  assert.equal(pinned.verified, true);
  assert.equal(pinned.marks, null);
  assert.equal(pinned.bytes.toString(), "old");
  assert.equal(calls, 1);
});

test("clips: the rate limit is asked only on a miss, and a refusal synthesizes nothing", async () => {
  let calls = 0, asked = 0;
  const synth = async () => { calls++; return Buffer.from("x"); };
  const sp = createSpeaker({ store: createStore({ dir: tmp(), forceLocal: true }), synth, voice: "v" });
  assert.deepEqual(await sp.say("hello", null, { beforeSynth: () => { asked++; return false; } }), { denied: true });
  assert.equal(calls, 0);
  await sp.say("hello", null, { beforeSynth: () => { asked++; return true; } });
  await sp.say("hello", null, { beforeSynth: () => { asked++; return false; } });
  assert.equal(calls, 1);
  assert.equal(asked, 2, "a hit never reaches the limit");
});

test("clips: a verified clip is never regenerated, even when the voice or the SSML changes", async () => {
  let calls = 0;
  const synth = async (ssml, { voice }) => { calls++; return Buffer.from(`${voice}|${ssml}`); };
  const dir = tmp();
  const sp = createSpeaker({ store: createStore({ dir, forceLocal: true }), synth, voice: "voice-1" });
  const first = await sp.say("chole", cck);
  assert.equal((await sp.verify("chole", cck, false)).verified, false); // unpinning an unpinned clip is fine
  const v = await sp.verify("chole", cck, true);
  assert.equal(v.clip, first.clip);
  assert.equal((await sp.say("chole", cck)).verified, true);
  // New voice and new IPA: an unverified line would be rebuilt; the verified one is served as it was.
  const changed = { ...cck, roles: cck.roles.map((r) => (r.id === "chole" ? { ...r, ipa: "ˈkoʊleɪ", ipa_syllables: null } : r)) };
  const sp2 = createSpeaker({ store: createStore({ dir, forceLocal: true }), synth, voice: "voice-2" });
  const again = await sp2.say("chole", changed);
  assert.equal(again.verified, true);
  assert.equal(again.clip, first.clip);
  assert.equal(again.bytes.toString(), first.bytes.toString());
  assert.equal(calls, 1);
  const other = await sp2.say("cysto", changed); // an unverified line does use the new voice
  assert.ok(other.bytes.toString().startsWith("voice-2|"));
  assert.equal(calls, 2);
  // Unpin: the next play rebuilds with the current voice and IPA.
  assert.equal((await sp2.verify("chole", changed, false)).verified, false);
  const rebuilt = await sp2.say("chole", changed);
  assert.equal(rebuilt.verified, false);
  assert.notEqual(rebuilt.clip, first.clip);
  assert.ok(rebuilt.bytes.toString().includes('ph="leɪ"'), "the new IPA, split by the fallback");
  assert.equal(calls, 3);
  assert.equal(await sp2.verify("never played", cck, true), null);
});

test("media: the local store writes files under its folder, round-trips bytes and JSON, and reports its mode", async () => {
  const dir = tmp();
  const store = createStore({ dir, forceLocal: true });
  assert.equal(await store.mode(), "local");
  assert.equal(await store.get("audio/none.mp3"), null);
  await store.put("audio/abc.mp3", Buffer.from([1, 2, 3]), "audio/mpeg");
  await store.putJson("audio/abc.json", { verified: true });
  assert.ok(existsSync(join(dir, "audio", "abc.mp3")));
  assert.deepEqual([...(await store.get("audio/abc.mp3"))], [1, 2, 3]);
  assert.deepEqual(await store.getJson("audio/abc.json"), { verified: true });
  await store.del("audio/abc.mp3");
  assert.equal(await store.get("audio/abc.mp3"), null);
  assert.deepEqual(readdirSync(join(dir, "audio")), ["abc.json"]);
  await assert.rejects(store.get("../etc/passwd"), /bad media key/);
  // No credentials and an unreachable bucket: falls back to the folder instead of failing.
  const fallback = createStore({ dir: tmp(), bucket: "gloo-bucket-that-does-not-exist-" + Date.now(), probeTimeoutMs: 1500 });
  assert.equal(await fallback.mode(), "local");
});

test("text keys ignore case and spacing but keep terms apart", () => {
  assert.equal(textKey("Chole means bile", cck), textKey("chole  means   bile ", cck));
  assert.notEqual(textKey("chole", cck), textKey("chole", brier));
});
