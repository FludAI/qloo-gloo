// Deterministic assessment. The server is the only authority for a score.

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

export function parseNumber(raw) {
  const s = String(raw ?? "").trim().replace(/,/g, "");
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
