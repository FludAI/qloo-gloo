// The app's voice: SSML from IPA, clips paid for once, the verified pin, and the local media store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSsml, pronunciations, createSpeaker, textKey } from "../src/tts.mjs";
import { createStore } from "../src/media.mjs";
import { cck } from "../src/content/cck.mjs";
import { brier } from "../src/content/brier.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "gloo-media-"));
const ph = (ipa, word) => `<phoneme alphabet="ipa" ph="${ipa}">${word}</phoneme>`;

test("ssml: every piece and the whole word are wrapped in their IPA; the rest is plain, escaped text", () => {
  const s = buildSsml("Cholecystokinin (CCK). Chole means bile & cysto means sac.", cck);
  assert.ok(s.startsWith("<speak>") && s.endsWith("</speak>"));
  assert.ok(s.includes(ph("ˌkoʊlɪˌsɪstoʊˈkaɪnɪn", "Cholecystokinin")));
  assert.ok(s.includes(ph("ˈkoʊlə", "Chole")));
  assert.ok(s.includes(ph("ˈsɪstoʊ", "cysto")));
  assert.ok(s.includes("&amp;"));
  assert.ok(!s.includes("<phoneme alphabet=\"ipa\" ph=\"ɪn\">in<"), "the English word 'in' is not a piece");
});

test("ssml: a piece spoken on its own is pinned, even a short ending like -in", () => {
  assert.equal(buildSsml("-in", cck), `<speak>${ph("ɪn", "in")}</speak>`);
  assert.equal(buildSsml("kin", cck), `<speak>${ph("kɪn", "kin")}</speak>`);
  assert.equal(buildSsml("Brier", brier), `<speak>${ph("ˈbraɪər", "Brier")}</speak>`);
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
  assert.ok(a.bytes.toString().includes(ph("ˈkoʊlə", "chole")));
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
  const changed = { ...cck, roles: cck.roles.map((r) => (r.id === "chole" ? { ...r, ipa: "ˈkoʊleɪ" } : r)) };
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
  assert.ok(rebuilt.bytes.toString().includes("ˈkoʊleɪ"));
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
