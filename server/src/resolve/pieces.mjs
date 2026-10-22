// Did the learner's attempt carry the pieces of the word? Scored by sound, piece by piece,
// so "koh lee sis toe kinin" credits chole, cysto, kin and -in even with no letters in common.
// This is a background signal for now (stored, not shown): a rating of the sounds, not of accent.
import { doubleMetaphone } from "double-metaphone";
import { distance } from "fastest-levenshtein";

const letters = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]+/g, "");
const ratio = (a, b) => (a.length || b.length ? 1 - distance(a, b) / Math.max(a.length, b.length) : 0);
const keys = (s) => doubleMetaphone(s).filter(Boolean);
const SAID = 0.75;

// Spellings a piece may be heard as: the piece, a hard-k reading of "ch" (chole → kole), "y" as "i".
function spellings(piece) {
  const p = letters(piece);
  const out = new Set([p]);
  if (p.startsWith("ch")) out.add("k" + p.slice(2));
  if (p.includes("y")) out.add(p.replace(/y/g, "i"));
  return [...out].filter(Boolean);
}

function soundMatch(piece, text) {
  const t = letters(text);
  if (!t) return 0;
  let best = 0;
  for (const p of spellings(piece)) {
    if (p.length >= 3 && t.includes(p)) return 1;
    const pk = keys(p);
    if (ratio(p, t) >= 0.9) best = Math.max(best, 0.9);
    // Slide a window of the piece's length (give or take) across the attempt and compare sounds.
    for (const len of [p.length - 1, p.length, p.length + 1, p.length + 2]) {
      if (len < 2) continue;
      for (let i = 0; i + len <= t.length; i++) {
        const w = t.slice(i, i + len);
        let s = ratio(p, w);
        for (const a of pk) for (const b of keys(w)) if (a.length >= 2 && b.length >= 2) s = Math.max(s, ratio(a, b));
        if (s > best) best = s;
      }
    }
  }
  return Number(best.toFixed(2));
}

// An ending piece ("-in") has to close the attempt's last word.
function endingMatch(piece, text) {
  const words = String(text ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const last = words[words.length - 1] ?? "";
  if (!last) return 0;
  const p = letters(piece);
  if (last.endsWith(p)) return 1;
  // Letters, with vowels folded into two classes: "-in" and "-en" sound alike, "-on" / "-ion" don't.
  const fold = (s) => s.replace(/[aei]/g, "V").replace(/[ou]/g, "W");
  return Number(ratio(fold(p), fold(last.slice(-p.length))).toFixed(2));
}

// pieces: [{ part, aliases }] or strings like "chole / chol". Returns { pieces: [{ part, score, said }], overall, said_count }.
export function scorePieces(parts, transcript) {
  const pieces = parts.map((raw) => {
    const part = typeof raw === "string" ? raw : raw.part;
    const alternatives = [...String(part).split("/"), ...(typeof raw === "string" ? [] : raw.aliases ?? [])].map((s) => s.trim()).filter(Boolean);
    const ending = String(part).trim().startsWith("-");
    const score = Math.max(0, ...alternatives.map((a) => (ending ? endingMatch(a, transcript) : soundMatch(a, transcript))));
    return { part: alternatives[0] ?? String(part), score, said: score >= SAID };
  });
  const overall = pieces.length ? Number((pieces.reduce((s, p) => s + p.score, 0) / pieces.length).toFixed(2)) : 0;
  return { pieces, overall, said_count: pieces.filter((p) => p.said).length };
}

// The pieces of a term with what each one sounds like: roles' parts (plus sound_like), else components' parts.
export function termPieces(term) {
  const fromRoles = (term.roles ?? []).filter((r) => r.part).map((r) => ({ part: r.part, aliases: r.sound_like && !r.part.startsWith("-") ? [r.sound_like] : [] }));
  if (fromRoles.length) return fromRoles;
  return (term.components ?? []).map((c) => ({ part: c.part, aliases: [] })).filter((p) => p.part);
}
