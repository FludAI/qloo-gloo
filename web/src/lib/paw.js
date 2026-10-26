// The paw's toes are syllables (decision 26). Pure helpers, shared with the server tests:
// how many syllables a word or piece has, how n toes fall across paws of five, and where the
// syllables of a line sit in time when the voice gave no marks.

export const TOES = 5;

// Syllable count of something with ipa_syllables (from the server), else a respelling's hyphenated parts, else 1.
export function syllableCount(x, say = x?.say ?? x?.approx) {
  const n = Array.isArray(x?.ipa_syllables) ? x.ipa_syllables.filter(Boolean).length : 0;
  if (n) return n;
  const s = String(say ?? "").trim();
  if (!s || s === "—") return 1;
  return s.split(/[-\s]+/).filter(Boolean).length || 1;
}

const clean = (s) => String(s ?? "").split("/")[0].trim().replace(/^-+/, "");
export const bareTitle = (term) => String(term?.title ?? "").replace(/\s*\(.*?\)\s*/g, " ").trim();

// The toes of a term: the whole word's syllables, and each piece's segment of them when the pieces account
// for every syllable (chole 2 + cysto 2 + kin 1 + in 1 = 6). Otherwise the word alone.
// Returns { count, targets: [{ spelling, offset, count, id? }] }; the first target is the word.
// `pieces` defaults to term.roles; the locked packet passes its `pieces` list instead.
export function pawPlan(term, pieces = term?.roles ?? term?.pieces ?? []) {
  const word = { spelling: bareTitle(term), offset: 0, count: syllableCount(term?.pronunciation ?? {}, term?.pronunciation?.approx), whole: true };
  const parts = (pieces ?? []).filter((r) => r?.part).map((r) => ({ spelling: clean(r.part), id: r.id, count: syllableCount(r, r.say), known: Array.isArray(r.ipa_syllables) && r.ipa_syllables.length > 0 }));
  const sum = parts.reduce((s, p) => s + p.count, 0);
  const segmented = parts.length > 0 && parts.every((p) => p.known) && sum === word.count;
  let offset = 0;
  const segments = segmented ? parts.map((p) => { const seg = { ...p, offset }; offset += p.count; return seg; }) : [];
  return { count: word.count, segmented, targets: [word, ...segments] };
}

// n toes across paws of five, left to right, continuing onto the next paw: 6 -> [5, 1], 11 -> [5, 5, 1].
export function assignToes(n) {
  const out = [];
  for (let left = Math.max(0, Math.floor(n)); left > 0; left -= TOES) out.push(Math.min(TOES, left));
  return out.length ? out : [0];
}
export const pawFor = (toe) => ({ paw: Math.floor(toe / TOES), index: toe % TOES });

// The marks of one target in a line: the server's marks filtered to the piece's spelling, first run only,
// so "chole" in the summary after the whole word does not light the word's toes twice.
export function marksFor(marks, spelling) {
  if (!Array.isArray(marks)) return [];
  const want = clean(spelling).toLowerCase();
  const out = [];
  for (const m of marks) {
    if (clean(m.piece).toLowerCase() !== want) { if (out.length) break; continue; }
    if (out.length && m.index === 0) break;
    out.push(m);
  }
  return out;
}

// When no marks exist: the voice is assumed to move through the line at an even pace, so a target's syllables
// are spread over the span its letters cover. duration in seconds (the clip's, or an estimate).
// targets: [{ spelling, count }]. Returns marks shaped like the server's, with estimated: true.
export function estimateMarks(line, targets, duration) {
  const text = String(line ?? "");
  const L = Math.max(1, text.length);
  const out = [];
  for (const t of targets ?? []) {
    const spelling = clean(t.spelling);
    if (!spelling) continue;
    const re = new RegExp(`(?<![\\p{L}])${spelling.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "iu");
    const m = re.exec(text);
    if (!m) continue;
    const start = (m.index / L) * duration, span = (spelling.length / L) * duration;
    for (let k = 0; k < t.count; k++) out.push({ index: k, piece: m[0], syllable: null, time: Number((start + (span * k) / t.count).toFixed(3)), estimated: true });
  }
  return out.sort((a, b) => a.time - b.time);
}

// How long the browser voice takes to say a line, roughly: a moment to start, then eleven characters a second
// (measured on a desktop engine at rate 0.95: "chole means bile." took 1.9 s).
export const estimateDuration = (line) => Math.min(12, 0.3 + String(line ?? "").length * 0.09);
