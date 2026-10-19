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

// pcm16: base64 of raw 16-bit little-endian mono PCM at 16 kHz. hints: words to boost.
export async function transcribe({ pcm16, hints = [] }) {
  const t = await token();
  const body = {
    config: {
      encoding: "LINEAR16", sampleRateHertz: 16000, languageCode: "en-US", model: "latest_short",
      maxAlternatives: 3, enableAutomaticPunctuation: false,
      speechContexts: [{ phrases: hints.slice(0, 500).map((h) => String(h).slice(0, 100)), boost: 12 }],
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
