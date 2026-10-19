// Hold-to-talk capture that works on iOS Safari and Android Chrome alike:
// raw microphone samples via Web Audio, downsampled to 16 kHz mono 16-bit PCM.
// No container format, so nothing depends on which codecs the browser's recorder supports.
// Falls back to the browser's own speech recognition when the server has no speech service.

const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
let ctx = null;

export const micSupported = () => Boolean(navigator.mediaDevices?.getUserMedia && AC);
export const browserSpeechSupported = () => Boolean(SR);

// Ask once, in a user gesture, so the prompt appears in context. Returns true when granted.
export async function requestMic() {
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  s.getTracks().forEach((t) => t.stop());
  return true;
}

// Returns { stop(): { pcm16, seconds, peak } }. pcm16 is base64 of 16 kHz LE samples.
export async function startPcmRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  ctx ??= new AC();
  if (ctx.state === "suspended") await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0; // processing needs a destination; never play the mic back
  const chunks = [];
  let peak = 0;
  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(Float32Array.from(d));
    for (let i = 0; i < d.length; i += 16) peak = Math.max(peak, Math.abs(d[i]));
  };
  src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
  const started = performance.now();
  return {
    stop() {
      proc.onaudioprocess = null;
      proc.disconnect(); src.disconnect(); mute.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      return { pcm16: encodePcm16(chunks, ctx.sampleRate, 16000), seconds: (performance.now() - started) / 1000, peak };
    },
  };
}

function encodePcm16(chunks, inRate, outRate) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = inRate / outRate;
  const n = Math.floor(all.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    // Average the source window for each output sample (cheap anti-aliasing).
    const a = Math.floor(i * ratio), b = Math.min(all.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += all[j];
    const v = Math.max(-1, Math.min(1, b > a ? s / (b - a) : 0));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Browser speech recognition fallback: { stop(): Promise<{ transcript }> }. Rejects with code "not-allowed" etc.
export function startBrowserSpeech() {
  const rec = new SR();
  rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
  let settle;
  const done = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  let transcript = "";
  rec.onresult = (e) => { transcript = e.results[0]?.[0]?.transcript ?? ""; };
  rec.onerror = (e) => { const err = new Error(e.error === "not-allowed" ? "Microphone permission was denied." : "Didn't catch that."); err.code = e.error; settle.reject(err); };
  rec.onend = () => settle.resolve({ transcript });
  rec.start();
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } return done; } };
}
