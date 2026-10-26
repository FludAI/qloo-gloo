// Deterministic assessment. The server is the only authority for a score.
import { scorePieces, termPieces } from "./resolve/pieces.mjs";

export class BrierInputError extends Error {}

export function brierLoss(p, y) {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new BrierInputError("forecast p must be a finite number in [0, 1]");
  if (y !== 0 && y !== 1) throw new BrierInputError("outcome y must be 0 or 1 (resolved)");
  return (p - y) ** 2;
}

export function brierScore(cases) {
  if (!Array.isArray(cases) || cases.length === 0) throw new BrierInputError("need at least one resolved case");
  return cases.reduce((s, c) => s + brierLoss(c.p, c.y), 0) / cases.length;
}

// Unscaled multiclass convention: sum over K classes of (p_k - y_k)^2, range [0, 2].
export function brierMulticlass(probs, trueIndex) {
  const total = probs.reduce((a, b) => a + b, 0);
  if (probs.some((p) => !Number.isFinite(p) || p < 0 || p > 1) || Math.abs(total - 1) > 1e-9) {
    throw new BrierInputError("probabilities must be in [0,1] and sum to 1");
  }
  if (!Number.isInteger(trueIndex) || trueIndex < 0 || trueIndex >= probs.length) throw new BrierInputError("bad class index");
  return probs.reduce((s, p, k) => s + (p - (k === trueIndex ? 1 : 0)) ** 2, 0);
}

export const NUMERIC_TOLERANCE = 5e-4; // documented: answers within ±0.0005 count

const DIGIT_WORDS = { zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };
// "zero point zero six five" -> "0.065"; "point four" -> ".4"; "eighty percent" is left to the caller's rules.
export function normalizeSpokenNumber(raw) {
  const s = String(raw ?? "").toLowerCase().trim();
  if (/^[-+]?[\d.,]+%?$/.test(s)) return s;
  const tokens = s.replace(/[^a-z0-9.%\s-]/g, " ").split(/\s+/).filter(Boolean);
  if (!tokens.length || !tokens.every((t) => t in DIGIT_WORDS || ["point", "dot", "minus", "negative", "percent", "%", "-"].includes(t) || /^[\d.]+$/.test(t))) return s;
  let out = "";
  for (const t of tokens) {
    if (t in DIGIT_WORDS) out += DIGIT_WORDS[t];
    else if (t === "point" || t === "dot") out += ".";
    else if (t === "minus" || t === "negative" || t === "-") out = "-" + out;
    else if (t === "percent" || t === "%") out += "%";
    else out += t;
  }
  return out;
}

export function parseNumber(raw) {
  const s = normalizeSpokenNumber(raw).trim().replace(/,/g, "");
  if (!s) return null;
  const pct = s.endsWith("%");
  const n = Number(pct ? s.slice(0, -1) : s);
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
}

const norm = (s) => String(s ?? "").toLowerCase().trim();

// Returns { outcome: correct|incorrect|uncertain, feedback, answer }
export function assess(prompt, response) {
  const r = norm(response);
  if (!r) return { outcome: "uncertain", feedback: "No answer recorded.", answer: null };

  if (prompt.type === "number") {
    const n = parseNumber(response);
    if (n === null) return { outcome: "uncertain", feedback: "That doesn't read as a number. Try again, e.g. 0.25.", answer: null };
    const ok = Math.abs(n - prompt.expected) <= NUMERIC_TOLERANCE;
    return { outcome: ok ? "correct" : "incorrect", feedback: ok ? "Correct." : "Not quite.", answer: prompt.answer };
  }

  if (prompt.type === "choice") {
    const ok = norm(prompt.expected) === r;
    return { outcome: ok ? "correct" : "incorrect", feedback: ok ? "Correct." : "Not quite.", answer: prompt.answer };
  }

  // text: reviewed accept rules first, then known misconceptions, otherwise uncertain or incorrect
  const { all = [], any = [] } = prompt.rubric ?? {};
  const accepted = all.every((re) => re.test(r)) && (any.length === 0 || any.some((re) => re.test(r)));
  if (accepted) {
    const bonus = prompt.bonus && prompt.bonus[0].test(r) ? ` ${prompt.bonus[1]}` : "";
    return { outcome: "correct", feedback: `Correct.${bonus}`, answer: prompt.answer };
  }
  for (const [re, msg] of prompt.misconceptions ?? []) {
    if (re.test(r)) return { outcome: "incorrect", feedback: msg, answer: prompt.answer };
  }
  if (/^i don'?t know|^idk|^no idea/.test(r)) return { outcome: "incorrect", feedback: "That's fine — here's the answer.", answer: prompt.answer };
  // A longer answer we can't match may be a valid paraphrase: don't mark it wrong.
  if (r.length >= 20) {
    return { outcome: "uncertain", feedback: "I couldn't score that automatically. Compare with the reviewed answer; it won't count either way.", answer: prompt.answer };
  }
  return { outcome: "incorrect", feedback: "Not quite.", answer: prompt.answer };
}

// ---- Hearing a spoken answer ----
// A spoken answer is one or two words, and a recognizer with no context hears "bile" as "Bayou". So the
// recognizer is told what this prompt expects: the reviewed answer, the choices, the term's own words and
// pieces. The learner never sees these; they go to the speech service only.
const speakable = (s) => String(s ?? "").replace(/\([^)]*\)/g, " ").replace(/[“”"]/g, "").split(/[.;:—–,]|\bor\b|\band\b/)
  .map((x) => x.trim().replace(/^(the|a|an)\s+/i, "").toLowerCase()).filter((x) => x && x.length <= 60 && /[a-z]/.test(x));
export function promptHints(prompt, term) {
  if (!prompt) return [];
  const out = [];
  if (prompt.type === "choice") out.push(...(prompt.options ?? []).flatMap(speakable), ...speakable(prompt.expected));
  else out.push(...speakable(prompt.answer));
  if (term) {
    out.push(...speakable(term.title));
    for (const r of term.roles ?? []) { if (r.part) out.push(r.part.replace(/^-|-$/g, "").toLowerCase()); if (r.sound_like) out.push(...speakable(r.sound_like)); }
  }
  return [...new Set(out)];
}

// Among what the recognizer heard (its best guess first), the first reading the prompt accepts; else the best guess.
// "bayou" / "bile" / "vile": the learner said bile. A short reading that sounds like exactly one piece of the
// term also stands for that piece ("sisto", "sis-toh" -> cysto), since a piece is answered by its sound.
export function bestHeard(prompt, transcript, alternatives = [], term = null) {
  const heard = [transcript, ...alternatives].map((t) => String(t ?? "").trim()).filter(Boolean);
  if (!prompt) return heard[0] ?? "";
  const asPiece = (t) => {
    if (!term || prompt.type !== "text" || t.split(/\s+/).length > 2) return null;
    const { pieces } = scorePieces(termPieces(term), t);
    const said = pieces.filter((x) => x.said && !x.part.startsWith("-"));
    return said.length === 1 ? said[0].part : null;
  };
  // A reading that is a known misconception stays itself ("cyto" sounds like cysto but means cell), unless it is
  // a piece's own hook word: the recognizer hears cysto as "sister", and by ear the two cannot be told apart.
  const letters = (t) => String(t ?? "").toLowerCase().replace(/[^a-z]+/g, "");
  const hook = (t) => (term?.roles ?? []).some((r) => [r.sound_like, r.say].some((h) => h && letters(h) === letters(t)));
  const misheard = (t) => !hook(t) && (prompt.misconceptions ?? []).some(([re]) => re.test(norm(t)));
  const candidates = [...heard, ...heard.filter((t) => !misheard(t)).map(asPiece).filter(Boolean)];
  if (candidates.length < 2) return heard[0] ?? "";
  return candidates.find((t) => assess(prompt, t).outcome === "correct") ?? heard[0];
}
