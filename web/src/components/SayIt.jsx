import { api } from "../api.js";
import { micStatus, useHoldToTalk } from "../lib/talk.js";
import { MicIcon } from "./Icons.jsx";

// Hold-to-talk that yields text: server speech when available, else the browser's. Hidden when neither exists.
// onLevel / onListening feed the syllable paw while the learner speaks (see Paw.jsx).
// promptId: the practice prompt being answered, so the server can tell the recognizer what to expect.
export default function SayIt({ health, guard, onText, onLevel, onListening, big = false, label, promptId }) {
  const talk = useHoldToTalk({
    stt: health?.stt, where: promptId ? "practice" : "first_attempt",
    onPcm: ({ pcm16 }) => guard(async () => {
      const r = await api.transcribe(pcm16, promptId);
      if (!r.transcript) throw new Error("Didn't catch that. Try again.");
      onText(r.transcript);
    }),
    onText: ({ transcript }) => onText(transcript),
    onLevel, onListening,
  });
  if (talk.mode === "none") return <p className="text-center text-sm text-paper/60">This browser has no microphone access. Open Gloo on a phone.</p>;
  return (
    <div className={big ? "flex flex-col items-center" : "relative shrink-0"}>
      <button type="button" aria-label="Hold to speak" aria-pressed={talk.listening}
        className={big ? `shutter ${talk.listening ? "listening !bg-gloo" : ""}` : `round ${talk.listening ? "round-live listening" : ""}`}
        {...talk.holdProps}>
        <MicIcon size={big ? 30 : 22} />
      </button>
      {big && <span className="mt-2 text-sm text-paper/70">{talk.listening ? "Listening… release when done" : label ?? "Hold and say it"}</span>}
      {big && !talk.listening && !talk.error && micStatus() === "unknown" && talk.mode === "pcm" && <span className="mt-1 text-xs text-paper/50">The first time, allow the microphone so Gloo can hear you.</span>}
      {talk.error && <p className={`text-xs text-red-300 ${big ? "mt-1 text-center" : "absolute right-0 top-full mt-1 w-56 text-right"}`}>{talk.error}</p>}
    </div>
  );
}
