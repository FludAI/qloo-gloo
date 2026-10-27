// One voice for every phone. Google Cloud Text-to-Speech says each sound piece from its IPA
// (role.ipa) and the whole word from term.pronunciation.ipa, wrapped in SSML <phoneme> tags, so
// "chole" is never read as "hole with a c". Credentials: Application Default Credentials, the
// same pattern as speech.mjs. Clips are stored once in media.mjs; see createSpeaker below.
//
// Voice: a Neural2 voice, fixed. Chirp 3 HD voices do not accept SSML input (the API rejects it),
// and the phoneme tag is the only way to pin a pronunciation, so Neural2 it is. Override with TTS_VOICE.
//
// Syllables: a word or piece with syllables (syllables.mjs) is emitted as one <phoneme> per syllable with a
// <mark> before each; the v1beta1 endpoint returns the time of every mark, kept in the clip's sidecar, so
// the paw can light one toe per syllable in time with the voice (web/src/components/Paw.jsx).
import { GoogleAuth } from "google-auth-library";
import { media, sha256 } from "./media.mjs";
import { syllablesOf } from "./syllables.mjs";

export const VOICE = process.env.TTS_VOICE ?? "en-US-Neural2-F";
const LANGUAGE = "en-US";
const RATE = 0.95;
// v1beta1 is the endpoint that returns SSML mark time points (enableTimePointing); the voice is the same.
const ENDPOINT = process.env.TTS_ENDPOINT ?? "https://texttospeech.googleapis.com/v1beta1/text:synthesize";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const MIN_PIECE = 3; // "in" alone is an English word; pieces that short are wrapped only when spoken by themselves

let auth = null;
let projectId = null;
let probe = null;

async function token() {
  auth ??= new GoogleAuth({ scopes: [SCOPE] });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t?.token) throw new Error("no access token");
  if (projectId === null) { try { projectId = await auth.getProjectId(); } catch { projectId = ""; } }
  return t.token;
}

// "google" when credentials resolve (or a test endpoint is configured), else "unavailable" (the browser speaks).
export async function ttsMode() {
  if (process.env.TTS_DISABLE === "1") return "unavailable";
  if (!/googleapis\.com/.test(ENDPOINT)) return "google";
  probe ??= token().then(() => "google").catch(() => "unavailable");
  return probe;
}

// ---- SSML ----
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escText(s).replace(/"/g, "&quot;");
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clean = (s) => String(s ?? "").trim().replace(/^-+/, "");
const bareTitle = (term) => String(term?.title ?? "").replace(/\s*\(.*?\)\s*/g, " ").trim();

// Every spelling of a piece and the IPA it should be said with, longest first; the whole word first of all.
export function pronunciations(term) {
  const out = [];
  const seen = new Set();
  const add = (spelling, ipa, syllables) => {
    const s = clean(spelling), p = String(ipa ?? "").trim();
    if (!s || !p || seen.has(s.toLowerCase())) return;
    seen.add(s.toLowerCase()); out.push({ spelling: s, ipa: p, syllables: syllables.length > 1 ? syllables : [p] });
  };
  const title = bareTitle(term);
  if (title && term?.pronunciation?.ipa) add(title, term.pronunciation.ipa, syllablesOf(term.pronunciation));
  for (const r of term?.roles ?? []) {
    if (!r?.part || !r?.ipa) continue;
    // Only the role's own spellings ("chole / chol"): IPA is exact, so "cyst" never borrows cysto's sound.
    for (const a of String(r.part).split("/").map(clean).filter(Boolean)) add(a, r.ipa, syllablesOf(r));
  }
  // A pick option with IPA is said from it: "KY-netic Sand" read as letters would teach nothing.
  for (const r of term?.roles ?? []) for (const o of r?.pick?.options ?? []) if (o?.name && o?.ipa) add(o.name, o.ipa, []);
  return out.sort((a, b) => b.spelling.length - a.spelling.length);
}

// The spelling shared out over its syllables, one non-empty slice each ("cholecystokinin" over 6 -> cho le cys tok in in).
function slices(spelling, n) {
  const chars = [...spelling];
  if (n <= 1 || chars.length < n) return [spelling, ...Array(Math.max(0, n - 1)).fill(spelling)].slice(0, Math.max(1, n));
  const out = [];
  for (let k = 0; k < n; k++) out.push(chars.slice(Math.round((chars.length * k) / n), Math.round((chars.length * (k + 1)) / n)).join(""));
  return out;
}

// Plain text in; out: { ssml, marks }. Each piece and the whole word become one <phoneme alphabet="ipa"> per
// syllable with a <mark name="mN"/> before each; everything else is escaped text. marks: [{ name, index, piece,
// syllable }] in order of speech, times unknown until synthesis.
export function buildSpeech(text, term) {
  const t = String(text ?? "").trim();
  const prons = pronunciations(term);
  const marks = [];
  const wrap = (spelling, p) => {
    const parts = slices(spelling, p.syllables.length);
    return p.syllables.map((syl, i) => {
      const name = `m${marks.length}`;
      marks.push({ name, index: i, piece: spelling, syllable: syl });
      return `<mark name="${name}"/><phoneme alphabet="ipa" ph="${escAttr(syl)}">${escText(parts[i])}</phoneme>`;
    }).join("");
  };
  // A piece spoken on its own ("-in", "kin") is always pinned, however short.
  const alone = prons.find((p) => p.spelling.toLowerCase() === clean(t).toLowerCase());
  if (alone) return { ssml: `<speak>${wrap(clean(t), alone)}</speak>`, marks };
  const rules = prons.filter((p) => p.spelling.length >= MIN_PIECE);
  if (!rules.length) return { ssml: `<speak>${escText(t)}</speak>`, marks };
  const byKey = new Map(rules.map((p) => [p.spelling.toLowerCase(), p]));
  const re = new RegExp(`(?<![\\p{L}])(${rules.map((p) => escRe(p.spelling)).join("|")})(?![\\p{L}])`, "giu");
  let out = "", last = 0;
  for (const m of t.matchAll(re)) {
    out += escText(t.slice(last, m.index)) + wrap(m[0], byKey.get(m[0].toLowerCase()));
    last = m.index + m[0].length;
  }
  out += escText(t.slice(last));
  return { ssml: `<speak>${out}</speak>`, marks };
}
export const buildSsml = (text, term) => buildSpeech(text, term).ssml;
const hasMarks = (ssml) => /<mark /.test(ssml);

// ---- Synthesis (one REST call, MP3 back) ----
// Returns { bytes, timepoints: [{ markName, timeSeconds }] }; time points are asked for only when the SSML has marks.
export async function synthesizeSsml(ssml, { voice = VOICE } = {}) {
  const headers = { "content-type": "application/json" };
  if (/googleapis\.com/.test(ENDPOINT)) {
    headers.authorization = `Bearer ${await token()}`;
    if (projectId) headers["x-goog-user-project"] = projectId;
  }
  const body = { input: { ssml }, voice: { languageCode: LANGUAGE, name: voice }, audioConfig: { audioEncoding: "MP3", speakingRate: RATE } };
  if (hasMarks(ssml)) body.enableTimePointing = ["SSML_MARK"];
  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`tts ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.audioContent) throw new Error("tts: empty audio");
  return { bytes: Buffer.from(data.audioContent, "base64"), timepoints: Array.isArray(data.timepoints) ? data.timepoints : [] };
}

// synthesize(text, { term }) -> MP3 bytes, pieces pronounced from the term's IPA. Not cached; see createSpeaker.
export const synthesize = async (text, { term, voice } = {}) => (await synthesizeSsml(buildSsml(text, term), { voice })).bytes;

// The marks of a line with the times the service returned: [{ index, piece, syllable, time }], in order of speech.
// null when the service returned no time points for a line that asked for them.
export function timeMarks(marks, timepoints) {
  if (!marks.length) return [];
  const at = new Map((timepoints ?? []).map((tp) => [tp.markName, Number(tp.timeSeconds)]));
  const timed = marks.map(({ name, ...m }) => ({ ...m, time: at.get(name) }));
  if (timed.some((m) => !Number.isFinite(m.time))) return null;
  return timed.map((m) => ({ ...m, time: Number(m.time.toFixed(3)) }));
}

// ---- Clips: paid for once, kept forever ----
// audio/<sha256(voice + ssml)>.mp3 and .json sidecar { text, term_id, ssml, voice, verified, created_at, marks }.
// marks: the syllable marks with their times ([] for a line with no word or piece in it; null when the service
// returned none). A sidecar written before marks existed has no `marks` key: that clip is rebuilt once when the
// line carries a word or piece, unless the owner has verified it.
// verified/<sha256(term_id + text)>.json pins a text to one clip: once the owner marks a clip as sounding
// right it is served from that pin forever, whatever the voice or the SSML builder do later.
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const textKey = (text, term) => sha256(`${term?.id ?? ""}\n${norm(text).toLowerCase()}`);
export const clipKey = (ssml, voice = VOICE) => sha256(`${voice}\n${ssml}`);

export function createSpeaker({ store = media, synth = synthesizeSsml, voice = VOICE } = {}) {
  const inflight = new Map();
  return {
    voice,
    // Returns { bytes, clip, cached, verified, marks } or { denied: true } when beforeSynth() (the rate limit) says no.
    // marks: [{ index, piece, syllable, time }] for the syllables of the word and pieces in the line, or null.
    async say(text, term, { beforeSynth } = {}) {
      const t = norm(text);
      if (!t) throw new Error("nothing to say");
      const tk = textKey(t, term);
      const pin = await store.getJson(`verified/${tk}.json`);
      if (pin?.clip) {
        const bytes = await store.get(`audio/${pin.clip}.mp3`);
        if (bytes) return { bytes, clip: pin.clip, cached: true, verified: true, marks: (await store.getJson(`audio/${pin.clip}.json`))?.marks ?? null };
      }
      const { ssml, marks } = buildSpeech(t, term);
      const clip = clipKey(ssml, voice);
      const hit = await store.get(`audio/${clip}.mp3`);
      if (hit) {
        const side = await store.getJson(`audio/${clip}.json`);
        // A clip from before syllable timing, for a line that now wants marks: rebuilt once.
        const stale = marks.length && side && !("marks" in side);
        if (!stale) return { bytes: hit, clip, cached: true, verified: false, marks: side?.marks ?? null };
      }
      if (beforeSynth && (await beforeSynth()) === false) return { denied: true };
      if (!inflight.has(clip)) {
        inflight.set(clip, (async () => {
          const r = await synth(ssml, { voice });
          const bytes = Buffer.isBuffer(r) ? r : r.bytes;
          const timed = timeMarks(marks, Buffer.isBuffer(r) ? [] : r.timepoints);
          await store.put(`audio/${clip}.mp3`, bytes, "audio/mpeg");
          await store.putJson(`audio/${clip}.json`, { text: t, term_id: term?.id ?? null, ssml, voice, verified: false, created_at: new Date().toISOString(), marks: timed });
          return { bytes, marks: timed };
        })().finally(() => inflight.delete(clip)));
      }
      const made = await inflight.get(clip);
      return { bytes: made.bytes, clip, cached: false, verified: false, marks: made.marks };
    },
    // The syllable marks of the clip this text plays (pinned or current), without the audio. Null when no clip exists.
    async timing(text, term) {
      const t = norm(text);
      const pin = await store.getJson(`verified/${textKey(t, term)}.json`);
      const clip = pin?.clip ?? clipKey(buildSsml(t, term), voice);
      const side = await store.getJson(`audio/${clip}.json`);
      if (!side) return null;
      return { clip, verified: Boolean(pin?.clip), marks: side.marks ?? null };
    },
    // Marks the clip this text currently plays as right (pinned forever) or wrong (pin removed; the clip is
    // replaced as soon as its IPA, voice or SSML changes, which gives it a new key). Null when no clip exists yet.
    async verify(text, term, verified) {
      const t = norm(text);
      const tk = textKey(t, term);
      const pin = await store.getJson(`verified/${tk}.json`);
      const clip = pin?.clip ?? clipKey(buildSsml(t, term), voice);
      const side = await store.getJson(`audio/${clip}.json`);
      if (!side && !(await store.get(`audio/${clip}.mp3`))) return null;
      if (verified) await store.putJson(`verified/${tk}.json`, { clip, text: t, term_id: term?.id ?? null, verified_at: new Date().toISOString() });
      else await store.del(`verified/${tk}.json`);
      if (side) await store.putJson(`audio/${clip}.json`, { ...side, verified: Boolean(verified) });
      return { clip, verified: Boolean(verified) };
    },
  };
}

export const speaker = createSpeaker();
