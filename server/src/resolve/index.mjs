// "Gloo it" word resolution. Deterministic libraries first; an LLM only for close calls and misses.
//   exact  -> lesson titles and aliases
//   spelling   -> Levenshtein similarity (fastest-levenshtein)
//   sound-alike -> Double Metaphone keys (double-metaphone), for voice and attempts at unfamiliar words
//   dictionary -> Hunspell en dictionary (nspell + dictionary-en) for ordinary English words
import { distance } from "fastest-levenshtein";
import { doubleMetaphone } from "double-metaphone";
import nspell from "nspell";
import dictionaryEn from "dictionary-en";
import { DOMAIN_TERMS, DOMAIN_PHRASES } from "./domain-terms.mjs";

export const THRESHOLDS = { clear: 0.86, gap: 0.08, floor: 0.6 };

const spell = nspell(dictionaryEn);
for (const w of DOMAIN_TERMS) spell.add(w);

export function normalize(raw) {
  return String(raw ?? "")
    .replace(/^\s*(?:hey\s+)?(?:gloo|glue|glu)\s*it\b[\s,:.!-]*/i, "")
    .replace(/[“”"`]/g, "")
    .replace(/[^\p{L}\p{N}'\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const squash = (s) => s.replace(/[\s'-]+/g, "");
const ratio = (a, b) => (a.length || b.length ? 1 - distance(a, b) / Math.max(a.length, b.length) : 0);
const keys = (s) => doubleMetaphone(squash(s)).filter(Boolean);

function soundScore(aKeys, bKeys) {
  let best = 0;
  for (const a of aKeys) for (const b of bKeys) if (a.length >= 2 && b.length >= 2) best = Math.max(best, ratio(a, b));
  return best;
}

let vocab = [];
export function setVocabulary(lessons) {
  const entries = [];
  for (const t of lessons) {
    for (const name of [t.title, ...(t.aliases ?? [])]) {
      entries.push({ word: normalize(name.replace(/\s*\(.*?\)\s*/g, " ")), term_id: t.id, source: "lesson" });
    }
  }
  for (const w of [...DOMAIN_TERMS, ...DOMAIN_PHRASES]) entries.push({ word: w, term_id: null, source: "domain" });
  vocab = entries.map((e) => ({ ...e, squashed: squash(e.word), keys: keys(e.word) }));
}

const isEnglish = (text) => text.split(" ").every((w) => w.length > 0 && spell.correct(w));

// Returns { input, normalized, decision: "resolved"|"ambiguous"|"miss", best, candidates[] }
export function resolveLocal(raw, mode = "typed") {
  const normalized = normalize(raw);
  const base = { input: String(raw ?? ""), normalized, mode, thresholds: THRESHOLDS };
  if (!normalized) return { ...base, decision: "miss", best: null, candidates: [] };

  const exact = vocab.find((v) => v.word === normalized || v.squashed === squash(normalized));
  if (exact) return { ...base, decision: "resolved", best: { word: exact.word, term_id: exact.term_id, score: 1, method: "exact" }, candidates: [] };

  const inKeys = keys(normalized);
  const soundWeight = mode === "voice" ? 1 : 0.92; // sound-alike matters most for speech
  const scored = new Map();
  const add = (word, term_id, raw, method) => {
    const score = Number(raw.toFixed(3));
    const prev = scored.get(word);
    if (!prev || score > prev.score) scored.set(word, { word, term_id: term_id ?? prev?.term_id ?? null, score, method });
    else if (!prev.term_id && term_id) prev.term_id = term_id; // same word: keep the lesson link
  };
  for (const v of vocab) {
    const spelled = ratio(squash(normalized), v.squashed);
    add(v.word, v.term_id, spelled, "spelling");
    // Sound-alike only counts when the letters are at least loosely related (stops short noise matching).
    if (spelled >= 0.3) add(v.word, v.term_id, soundScore(inKeys, v.keys) * soundWeight, "sound-alike");
  }
  // Ordinary English word, spelled right: take it as-is unless a domain term is a near-identical match.
  const top0 = [...scored.values()].sort((a, b) => b.score - a.score)[0];
  if (isEnglish(normalized) && !(top0 && top0.score >= 0.95)) {
    return { ...base, decision: "resolved", best: { word: normalized, term_id: null, score: 1, method: "dictionary" }, candidates: [] };
  }
  // Misspelled single English word: dictionary suggestions join the pool.
  if (!normalized.includes(" ")) {
    for (const s of spell.suggest(normalized).slice(0, 5)) add(s.toLowerCase(), null, ratio(normalized, s.toLowerCase()), "dictionary");
  }

  const candidates = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  const [best, second] = candidates;
  const gap = best.score - (second?.score ?? 0);
  const decision = best.score >= THRESHOLDS.clear && gap >= THRESHOLDS.gap ? "resolved"
    : best.score >= THRESHOLDS.floor ? "ambiguous" : "miss";
  return { ...base, decision, best, candidates };
}

// Pick the word worth learning from OCR text: unknown-to-dictionary or domain words, longest first.
export function pickFromOcr(words) {
  const seen = new Set();
  const clean = words.map(normalize).filter((w) => w.length >= 4 && /\p{L}/u.test(w) && !seen.has(w) && seen.add(w));
  const rank = (w) => (vocab.some((v) => v.word === w) ? 3 : !spell.correct(w) ? 2 : 0) * 100 + w.length;
  const ordered = clean.sort((a, b) => rank(b) - rank(a));
  return { pick: ordered[0] ?? null, alternatives: ordered.slice(1, 6) };
}
