import { api } from "../api.js";
import { useHoldToTalk } from "../lib/talk.js";
import { MicIcon } from "./Icons.jsx";

// Hold-to-talk that yields text: server speech when available, else the browser's. Hidden when neither exists.
export default function SayIt({ health, guard, onText, big = false, label }) {
  const talk = useHoldToTalk({
    stt: health?.stt,
    onPcm: ({ pcm16 }) => guard(async () => {
      const r = await api.transcribe(pcm16);
      if (!r.transcript) throw new Error("Didn't catch that. Try again or type it.");
      onText(r.transcript);
    }),
    onText: ({ transcript }) => onText(transcript),
  });
  if (talk.mode === "none") return null;
  return (
    <div className={big ? "flex flex-col items-center" : "relative shrink-0"}>
      <button type="button" aria-label="Hold to speak" aria-pressed={talk.listening}
        className={big ? `shutter ${talk.listening ? "listening bg-gloo" : ""}` : `round !h-11 !w-11 !bg-ink !text-paper ${talk.listening ? "listening !bg-gloo !text-ink" : ""}`}
        {...talk.holdProps}>
        <MicIcon size={big ? 30 : 20} />
      </button>
      {big && <span className="mt-2 text-sm text-muted">{talk.listening ? "Listening… release when done" : label ?? "Hold and say it"}</span>}
      {talk.error && <p className={`text-xs text-red-700 ${big ? "mt-1 text-center" : "absolute right-0 top-full mt-1 w-56 text-right"}`}>{talk.error}</p>}
    </div>
  );
}
