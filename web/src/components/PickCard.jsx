import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import SayIt from "./SayIt.jsx";
import { speak, hush } from "../lib/speak.js";
import { confetti } from "../lib/confetti.js";

// One word part, one square of four pictures, one spoken line. The learner says their favorite
// (any answer counts, listed or not), gets confetti, then the reveal: picture → sound → meaning.
const squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const ratio = (a, b) => { const n = Math.max(a.length, b.length); if (!n) return 0; let d = 0; const m = Math.min(a.length, b.length); for (let i = 0; i < m; i++) if (a[i] !== b[i]) d++; return 1 - (d + n - m) / n; };

export function matchOption(transcript, options) {
  const t = squash(transcript);
  if (!t) return null;
  let best = null, score = 0;
  for (const o of options) {
    for (const alias of [o.name, ...(o.say ?? [])]) {
      const a = squash(alias);
      if (!a) continue;
      const s = t.includes(a) || a.includes(t) ? 1 : ratio(t, a);
      if (s > score) { score = s; best = o; }
    }
  }
  return score >= 0.72 ? best : null;
}

export default function PickCard({ term, role, mine, health, guard, onPicked, onNext, onBack }) {
  const [reveal, setReveal] = useState(mine ? { label: mine.label, option: role.pick.options.find((o) => o.name === mine.label) ?? null, custom: !role.pick.options.some((o) => o.name === mine.label) } : null);
  const spoken = useRef("");

  // The card speaks its line; the screen shows it once, small.
  useEffect(() => {
    if (reveal) return;
    if (spoken.current !== role.id) { spoken.current = role.id; speak(role.pick.question); }
    return hush;
  }, [role.id, reveal]);

  const choose = (label, option) => guard(async () => {
    const connection = option?.connection ?? (role.sound_like ? `${label} ≈ ${role.part} (your pick; approximate sound of “${role.sound_like}”).` : `${label}: your pick for ${role.part} = ${role.meaning}.`);
    await onPicked(role, { name: label, connection, qloo: option?.qloo ?? null });
    confetti({ y: 0.55 });
    setReveal({ label, option, custom: !option });
    const line = role.sound_like ? `${label}. ${role.part}, like ${role.sound_like}. ${role.part} means ${role.meaning}.` : `${label}. ${role.part} means ${role.meaning}.`;
    speak(line);
  });

  const onSaid = (transcript) => { const o = matchOption(transcript, role.pick.options); choose(o ? o.name : transcript.trim().replace(/^(my favorite( one)? is|it's|its|i like|i love)\s+/i, "").slice(0, 40), o); };

  if (reveal) {
    const art = reveal.option?.wiki ? `/api/art?t=${encodeURIComponent(reveal.option.wiki)}` : null;
    return (
      <section className="mt-3">
        <div className="stage">
          <div className="grid h-full grid-cols-2 gap-3">
            <Picture src={art} name={reveal.label} big />
            <div className="flex flex-col items-center justify-center text-center">
              <div className="font-display text-[2.6rem] leading-none text-gloo">{role.part}</div>
              {role.sound_like && <div className="mt-2 font-mono text-sm text-paper/70">≈ {role.sound_like}</div>}
              <div className="mt-4 text-xl font-medium">{role.meaning}</div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-paper/50">{reveal.label}{reveal.custom ? " · your own pick" : ""}</p>
        <div className="mt-3 flex items-center justify-between">
          <button className="btn-ghost" onClick={() => setReveal(null)}>Change</button>
          <button className="btn-light" onClick={onNext}>Next</button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-3">
      <div className="stage">
        <div className="grid h-full grid-cols-2 gap-3">
          {role.pick.options.slice(0, 4).map((o) => (
            <button key={o.name} className="tile-img" onClick={() => choose(o.name, o)} aria-label={o.name}>
              <Picture src={o.wiki ? `/api/art?t=${encodeURIComponent(o.wiki)}` : null} name={o.name} />
              <span className="tile-cap">{o.name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-base">{role.pick.question}</p>
      <div className="mt-3 flex items-center justify-between">
        <button className="btn-ghost" onClick={onBack}>Back</button>
        <SayIt health={health} guard={guard} onText={onSaid} />
        <button className="btn-ghost" onClick={onNext}>Skip</button>
      </div>
    </section>
  );
}

function Picture({ src, name, big = false }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`flex h-full w-full items-center justify-center rounded-2xl bg-paper/10 px-2 text-center ${big ? "font-display text-3xl" : "text-base font-medium"}`}>{name}</div>;
  }
  return <img src={src} alt={name} className="h-full w-full rounded-2xl object-cover" loading="lazy" onError={() => setFailed(true)} />;
}
