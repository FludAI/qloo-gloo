// One voice for every phone. Google Cloud Text-to-Speech says each sound piece from its IPA
// (role.ipa) and the whole word from term.pronunciation.ipa, wrapped in SSML <phoneme> tags, so
// "chole" is never read as "hole with a c". Credentials: Application Default Credentials, the
// same pattern as speech.mjs. Clips are stored once in media.mjs; see createSpeaker below.
//
// Voice: a Neural2 voice, fixed. Chirp 3 HD voices do not accept SSML input (the API rejects it),
// and the phoneme tag is the only way to pin a pronunciation, so Neural2 it is. Override with TTS_VOICE.
import { GoogleAuth } from "google-auth-library";
import { media, sha256 } from "./media.mjs";

export const VOICE = process.env.TTS_VOICE ?? "en-US-Neural2-F";
const LANGUAGE = "en-US";
const RATE = 0.95;
const ENDPOINT = process.env.TTS_ENDPOINT ?? "https://texttospeech.googleapis.com/v1/text:synthesize";
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
  const add = (spelling, ipa) => {
    const s = clean(spelling), p = String(ipa ?? "").trim();
    if (!s || !p || seen.has(s.toLowerCase())) return;
    seen.add(s.toLowerCase()); out.push({ spelling: s, ipa: p });
  };
  const title = bareTitle(term);
  if (title && term?.pronunciation?.ipa) add(title, term.pronunciation.ipa);
  for (const r of term?.roles ?? []) {
    if (!r?.part || !r?.ipa) continue;
    // Only the role's own spellings ("chole / chol"): IPA is exact, so "cyst" never borrows cysto's sound.
    for (const a of String(r.part).split("/").map(clean).filter(Boolean)) add(a, r.ipa);
  }
  return out.sort((a, b) => b.spelling.length - a.spelling.length);
}

// Plain text in, SSML out: each piece and the whole word wrapped in <phoneme alphabet="ipa">; everything else escaped.
export function buildSsml(text, term) {
  const t = String(text ?? "").trim();
  const prons = pronunciations(term);
  const wrap = (spelling, ipa) => `<phoneme alphabet="ipa" ph="${escAttr(ipa)}">${escText(spelling)}</phoneme>`;
  // A piece spoken on its own ("-in", "kin") is always pinned, however short.
  const alone = prons.find((p) => p.spelling.toLowerCase() === clean(t).toLowerCase());
  if (alone) return `<speak>${wrap(clean(t), alone.ipa)}</speak>`;
  const rules = prons.filter((p) => p.spelling.length >= MIN_PIECE);
  if (!rules.length) return `<speak>${escText(t)}</speak>`;
  const byKey = new Map(rules.map((p) => [p.spelling.toLowerCase(), p.ipa]));
  const re = new RegExp(`(?<![\\p{L}])(${rules.map((p) => escRe(p.spelling)).join("|")})(?![\\p{L}])`, "giu");
  let out = "", last = 0;
  for (const m of t.matchAll(re)) {
    out += escText(t.slice(last, m.index)) + wrap(m[0], byKey.get(m[0].toLowerCase()));
    last = m.index + m[0].length;
  }
  out += escText(t.slice(last));
  return `<speak>${out}</speak>`;
}

// ---- Synthesis (one REST call, MP3 back) ----
export async function synthesizeSsml(ssml, { voice = VOICE } = {}) {
  const headers = { "content-type": "application/json" };
  if (/googleapis\.com/.test(ENDPOINT)) {
    headers.authorization = `Bearer ${await token()}`;
    if (projectId) headers["x-goog-user-project"] = projectId;
  }
  const body = { input: { ssml }, voice: { languageCode: LANGUAGE, name: voice }, audioConfig: { audioEncoding: "MP3", speakingRate: RATE } };
  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`tts ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.audioContent) throw new Error("tts: empty audio");
  return Buffer.from(data.audioContent, "base64");
}

// synthesize(text, { term }) -> MP3 bytes, pieces pronounced from the term's IPA. Not cached; see createSpeaker.
export const synthesize = (text, { term, voice } = {}) => synthesizeSsml(buildSsml(text, term), { voice });

// ---- Clips: paid for once, kept forever ----
// audio/<sha256(voice + ssml)>.mp3 and .json sidecar { text, term_id, ssml, voice, verified, created_at }.
// verified/<sha256(term_id + text)>.json pins a text to one clip: once the owner marks a clip as sounding
// right it is served from that pin forever, whatever the voice or the SSML builder do later.
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const textKey = (text, term) => sha256(`${term?.id ?? ""}\n${norm(text).toLowerCase()}`);
export const clipKey = (ssml, voice = VOICE) => sha256(`${voice}\n${ssml}`);

export function createSpeaker({ store = media, synth = synthesizeSsml, voice = VOICE } = {}) {
  const inflight = new Map();
  return {
    voice,
    // Returns { bytes, clip, cached, verified } or { denied: true } when beforeSynth() (the rate limit) says no.
    async say(text, term, { beforeSynth } = {}) {
      const t = norm(text);
      if (!t) throw new Error("nothing to say");
      const tk = textKey(t, term);
      const pin = await store.getJson(`verified/${tk}.json`);
      if (pin?.clip) {
        const bytes = await store.get(`audio/${pin.clip}.mp3`);
        if (bytes) return { bytes, clip: pin.clip, cached: true, verified: true };
      }
      const ssml = buildSsml(t, term);
      const clip = clipKey(ssml, voice);
      const hit = await store.get(`audio/${clip}.mp3`);
      if (hit) return { bytes: hit, clip, cached: true, verified: false };
      if (beforeSynth && (await beforeSynth()) === false) return { denied: true };
      if (!inflight.has(clip)) {
        inflight.set(clip, (async () => {
          const bytes = await synth(ssml, { voice });
          await store.put(`audio/${clip}.mp3`, bytes, "audio/mpeg");
          await store.putJson(`audio/${clip}.json`, { text: t, term_id: term?.id ?? null, ssml, voice, verified: false, created_at: new Date().toISOString() });
          return bytes;
        })().finally(() => inflight.delete(clip)));
      }
      return { bytes: await inflight.get(clip), clip, cached: false, verified: false };
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
