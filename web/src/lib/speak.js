// The app talks. Prompts and reveals are spoken through the browser's speech synthesis,
// so the screen can stay nearly empty. One English voice, no permission prompt.
const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let voice = null;

function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices();
  return voices.find((v) => /^en[-_]US/i.test(v.lang) && /natural|premium|enhanced|neural/i.test(v.name))
    ?? voices.find((v) => /^en[-_]US/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
}
if (synth) { voice = pickVoice(); synth.addEventListener?.("voiceschanged", () => { voice = pickVoice(); }); }

export const canSpeak = () => Boolean(synth);

// Speak text; a new call interrupts the previous one. Resolves when done (or at once if speech is unavailable).
export function speak(text, { rate = 0.95 } = {}) {
  if (!synth || !text) return Promise.resolve();
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(String(text));
    if (voice) u.voice = voice;
    u.lang = "en-US"; u.rate = rate;
    u.onend = resolve; u.onerror = resolve;
    synth.speak(u);
    setTimeout(resolve, Math.min(12000, 400 + text.length * 90)); // some engines never fire onend
  });
}

export function hush() { synth?.cancel(); }
