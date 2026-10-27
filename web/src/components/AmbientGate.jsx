import { useEffect, useRef } from "react";
import { CameraIcon, PictureIcon, ScreenIcon } from "./Icons.jsx";
import { canShareScreen, isPhone } from "../lib/device.js";
import { reducedMotion } from "../lib/sfx.js";

// The gate, alive: behind the copy, the lesson loop plays on its own (a word on paper, the frame,
// the sweep, a tick per piece, the pieces drifting apart, their hooks rising, the meaning), then
// fades and plays again. Lifted from the design tool's ambient landing study (web/public/design/landing).
const PIECES = [
  { part: "chole", sound: "≈ cola" },
  { part: "cysto", sound: "≈ sister" },
  { part: "kin", sound: "≈ kinetic" },
  { part: "-in", sound: null },
];
const MEANING = "the hormone that makes the bile sac move";
// The four corners of the frame, as the camera's reticle draws them.
const CORNERS = [
  ["tl", { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 }],
  ["tr", { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 }],
  ["bl", { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 }],
  ["br", { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 }],
];
const EASE = "cubic-bezier(.16,1,.3,1)", SNAP = "cubic-bezier(.3,1.5,.5,1)";

export default function AmbientGate({ state, source, onStart, onPick }) {
  const root = useRef(null);
  const blocked = state === "denied" || state === "unavailable";
  // A phone looks at paper through its camera. A desktop's webcam faces the wrong way, and the word is
  // usually on its own screen, so it shares that window; the webcam and a picture stay one tap away.
  const phone = isPhone(), screen = canShareScreen();
  const main = phone || !screen ? "camera" : "screen";
  const file = useRef(null);
  const pick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick?.(f); };

  useEffect(() => {
    const r = root.current;
    if (!r) return;
    const q = (n) => [...r.querySelectorAll(`[data-a="${n}"]`)];
    const anims = [];
    let timer = null;
    const reduce = reducedMotion();
    const A = (el, kf, d, delay = 0, easing = EASE) => {
      if (!el) return;
      const a = el.animate(kf, { duration: reduce ? 0 : d, delay: reduce ? 0 : delay, easing, fill: "forwards" });
      anims.push(a); return a;
    };
    const INK = "#1d1a16", PAPER = "#f6f1e7";

    const loop = () => {
      const [paper] = q("paper"), [ret] = q("ret"), [sweep] = q("sweep"), [word] = q("word"), [mean] = q("mean");
      const pieces = q("piece"), ticks = q("tick"), sounds = q("sound");
      if (!word) return;
      if (reduce) {
        // One still frame: the word read, its hooks and meaning shown.
        A(word, [{ opacity: 1, color: PAPER }], 0); sounds.forEach((s) => A(s, [{ opacity: 1 }], 0)); A(mean, [{ opacity: 1 }], 0);
        pieces.forEach((p, i) => A(p, [{ marginLeft: i ? "14px" : "0px" }], 0));
        return;
      }
      A(paper, [{ opacity: 0 }, { opacity: 1 }], 600, 0);
      A(word, [{ opacity: 0, color: INK, filter: "blur(6px)" }, { opacity: 1, color: INK, filter: "blur(0)" }], 700, 150);
      A(ret, [{ opacity: 0, transform: "scale(1.06)" }, { opacity: 1, transform: "scale(1)" }], 500, 700);
      A(sweep, [{ opacity: 0, left: "0%" }, { opacity: 1, left: "4%", offset: 0.08 }, { opacity: 1, left: "96%", offset: 0.92 }, { opacity: 0, left: "100%" }], 900, 1300, "cubic-bezier(.45,.05,.55,.95)");
      ticks.forEach((t, i) => A(t, [{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "none" }], 220, 1500 + i * 190, SNAP));
      pieces.forEach((p, i) => A(p, [{ marginLeft: "0px" }, { marginLeft: i ? "14px" : "0px" }], 520, 2500));
      A(ret, [{ opacity: 1 }, { opacity: 0.35 }], 500, 2600);
      A(paper, [{ opacity: 1 }, { opacity: 0 }], 600, 2600);
      A(word, [{ color: INK }, { color: PAPER }], 600, 2600);
      sounds.forEach((s, i) => A(s, [{ opacity: 0, transform: "translateY(-30px)" }, { opacity: 1, transform: "none" }], 520, 3200 + i * 420));
      pieces.forEach((p, i) => A(p, [{ textShadow: "0 0 0 rgba(223,170,55,0)" }, { textShadow: "0 0 22px rgba(223,170,55,.9)", offset: 0.35 }, { textShadow: "0 0 0 rgba(223,170,55,0)" }], 520, 3200 + i * 420, "ease-out"));
      A(mean, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], 700, 5200);
      const out = 8200;
      [word, mean, ret, ...sounds, ...ticks].forEach((el) => A(el, [{ opacity: 1 }, { opacity: 0 }], 700, out, "ease-in"));
      pieces.forEach((p, i) => A(p, [{ marginLeft: i ? "14px" : "0px" }, { marginLeft: "0px" }], 1, out + 720));
      timer = setTimeout(() => { anims.forEach((a) => a.cancel()); anims.length = 0; loop(); }, out + 1000);
    };
    // The copy rises once and stays; the loop's restart only cancels the stage's animations.
    const intro = q("copy").map((el, i) => el.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: reduce ? 0 : 700, delay: reduce ? 0 : 900 + i * 160, easing: EASE, fill: "forwards" }));
    loop();
    return () => { clearTimeout(timer); [...anims, ...intro].forEach((a) => a.cancel()); };
  }, []);

  return (
    <div ref={root} className="absolute inset-0 overflow-hidden" style={{ background: "radial-gradient(120% 90% at 50% 40%, #16140f 0%, #000 70%)" }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.45), rgba(0,0,0,.2) 40%, rgba(0,0,0,.65))" }} />
      <div className="relative flex h-full flex-wrap-reverse content-center items-center justify-center gap-x-10 gap-y-2 px-7 pb-8 pt-16 sm:pb-12 sm:pt-20">
        {/* The demo stage */}
        <div className="relative flex h-[330px] w-full max-w-[640px] flex-[1_1_520px] items-center justify-center sm:h-[380px]" aria-hidden>
          <div data-a="paper" className="absolute left-[8%] right-[8%] top-[90px] h-[170px] rounded-md opacity-0" style={{ background: "#e8e0cf", transform: "rotate(-1.2deg)" }} />
          <div data-a="ret" className="absolute left-[5%] right-[5%] top-[76px] h-[198px] opacity-0">
            {CORNERS.map(([k, st]) => <span key={k} className="absolute h-[30px] w-[30px] border-paper" style={st} />)}
            <span data-a="sweep" className="absolute -top-1 left-0 h-[206px] w-[3px] opacity-0" style={{ background: "var(--gloo)", boxShadow: "0 0 14px 2px var(--gloo)" }} />
          </div>
          <div data-a="word" className="absolute inset-x-0 top-[140px] flex justify-center font-display opacity-0" style={{ fontSize: "clamp(34px, 9.6vw, 64px)", lineHeight: 1, color: "#1d1a16" }}>
            {PIECES.map((p) => (
              <span key={p.part} data-a="piece" className="relative inline-block">
                {p.part.replace(/^-/, "")}
                <span data-a="tick" className="absolute -bottom-4 -right-0.5 h-3.5 w-[3px] rounded-sm opacity-0" style={{ background: "var(--gloo)" }} />
                {p.sound && <span data-a="sound" className="absolute left-0 whitespace-nowrap font-display italic opacity-0" style={{ top: "calc(100% + 70px)", fontSize: "clamp(19px, 5.4vw, 30px)", lineHeight: 1, color: "var(--gloo)" }}>{p.sound}</span>}
              </span>
            ))}
          </div>
          <div data-a="mean" className="absolute inset-x-0 top-[300px] text-center sm:top-[340px] text-[17px] font-medium leading-snug text-paper opacity-0">{MEANING}</div>
        </div>

        {/* The copy and the one button */}
        <div className="flex w-full max-w-[460px] flex-[1_1_380px] flex-col items-center gap-5 text-center">
          <img data-a="copy" src="/brand/gloo-paw-gold.svg" alt="" className="h-12 w-auto opacity-0 sm:h-16" draggable="false" />
          <h1 data-a="copy" className="font-display leading-[1.02] opacity-0" style={{ fontSize: "clamp(44px, 5.2vw, 60px)", letterSpacing: "-0.01em" }}>
            {blocked ? (state === "denied" ? (source === "screen" ? "Gloo needs to see the word." : "Gloo needs the camera.") : "No camera found.")
              : main === "screen" ? <>Gloo works<br />on your <em className="text-gloo">screen.</em></> : <>Gloo works<br />through your <em className="text-gloo">camera.</em></>}
          </h1>
          <p data-a="copy" className="max-w-[330px] text-[15px] leading-relaxed text-paper/80 opacity-0">
            {state === "denied" ? (source === "screen" ? "Pick the window with the hard word when the browser asks, and allow the microphone. Or use a picture of the word." : "Allow the camera and microphone for this site in your browser settings, then try again.")
              : state === "unavailable" ? "Open this on a phone, or on glasses with a camera. Or use a picture of the word."
              : main === "screen" ? "Share the window with the hard word and turn on your microphone. Drag the word into the frame and say “gloo it”."
              : "Turn on your phone's camera and microphone, or wear your smart glasses, to continue. Point at a hard word and say “gloo it”."}
          </p>
          <div data-a="copy" className="flex flex-col items-center gap-3 opacity-0">
            <button className="btn-light" disabled={state === "starting"} onClick={() => onStart(blocked && source ? source : main)}>
              {main === "screen" ? <ScreenIcon /> : <CameraIcon />} {state === "starting" ? "Waiting for permission…" : blocked ? "Try again" : main === "screen" ? "Share screen and mic" : "Turn on camera and mic"}
            </button>
            <div className="min-h-[18px] text-[13px] text-paper/70">{state === "starting" ? "Allow it in the prompt." : ""}</div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-paper/70">
              {main === "screen" && <button className="underline underline-offset-2" disabled={state === "starting"} onClick={() => onStart("camera")}>Use the webcam</button>}
              {!phone && screen && main !== "screen" && <button className="underline underline-offset-2" disabled={state === "starting"} onClick={() => onStart("screen")}>Share a window</button>}
              <button className="inline-flex items-center gap-1 underline underline-offset-2" disabled={state === "starting"} onClick={() => file.current?.click()}><PictureIcon size={16} /> {phone ? "Take a picture instead" : "Use a picture"}</button>
              {!phone && <span className="text-paper/50">or paste a screenshot</span>}
            </div>
            <input ref={file} type="file" accept="image/*" capture={phone ? "environment" : undefined} className="hidden" onChange={pick} />
          </div>
        </div>
      </div>
    </div>
  );
}
