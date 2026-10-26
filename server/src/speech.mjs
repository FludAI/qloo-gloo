// Spoken capture: Google Cloud Speech-to-Text (short model) with the lesson vocabulary as
// recognition hints, so "cholecystokinin" and "gloo it" are expected words, not noise.
// Credentials come from Application Default Credentials: the Cloud Run service account in
// production, `gcloud auth application-default login` locally. No key is handled here.
import { GoogleAuth } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
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

// "google" when credentials resolve, else "unavailable" (the browser falls back to its own speech API).
export async function sttMode() {
  if (process.env.STT_DISABLE === "1") return "unavailable";
  probe ??= token().then(() => "google").catch(() => "unavailable");
  return probe;
}

// The vocabulary (every term and "gloo it") is one context; what the current prompt expects is a second,
// stronger one, so a one-word answer like "bile" is heard as bile and not Bayou.
export function speechContexts(hints = [], expected = []) {
  const phrases = (xs, n) => [...new Set(xs.map((h) => String(h).trim().slice(0, 100)).filter(Boolean))].slice(0, n);
  const out = [{ phrases: phrases(hints, 500), boost: 12 }];
  const ex = phrases(expected, 100);
  if (ex.length) out.push({ phrases: ex, boost: 20 });
  return out;
}

// pcm16: base64 of raw 16-bit little-endian mono PCM at 16 kHz. hints: words to boost; expected: this prompt's answers.
export async function transcribe({ pcm16, hints = [], expected = [] }) {
  const t = await token();
  const body = {
    config: {
      encoding: "LINEAR16", sampleRateHertz: 16000, languageCode: "en-US", model: "latest_short",
      maxAlternatives: 3, enableAutomaticPunctuation: false,
      speechContexts: speechContexts(hints, expected),
    },
    audio: { content: pcm16 },
  };
  const headers = { authorization: `Bearer ${t}`, "content-type": "application/json" };
  if (projectId) headers["x-goog-user-project"] = projectId;
  const res = await fetch("https://speech.googleapis.com/v1/speech:recognize", { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`speech ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const alts = data.results?.[0]?.alternatives ?? [];
  return {
    transcript: String(alts[0]?.transcript ?? "").trim(),
    confidence: alts[0]?.confidence ?? null,
    alternatives: alts.slice(1).map((a) => String(a.transcript ?? "").trim()).filter(Boolean),
  };
}

// "gloo it cholecystokinin" -> { wake: true, rest: "cholecystokinin" }; "gloo it" -> { wake: true, rest: "" }.
// Recognizers hear the wake phrase as glue/blue/clue it; all count.
const WAKE = /\b(?:hey\s+)?(?:gloo|glue|glu|blue|clue|glow)\s*it\b[\s,:.!?-]*/gi;
export function splitWake(transcript) {
  const raw = String(transcript ?? "");
  const wake = WAKE.test(raw);
  WAKE.lastIndex = 0;
  const rest = raw.replace(WAKE, " ").replace(/\s+/g, " ").trim();
  WAKE.lastIndex = 0;
  return { wake, rest };
}
