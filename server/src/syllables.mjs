// Syllables as data. Each piece and the whole word may carry `ipa_syllables` (one IPA string per syllable)
// next to `ipa`; when the field is absent this module splits the IPA deterministically, so every toe of the
// paw (web/src/components/Paw.jsx) knows which syllable it stands for. Shared by the lesson store
// (validation), the voice (one <phoneme> and <mark> per syllable in tts.mjs) and the learner packet.

// Vowel letters of the IPA as used in US English transcriptions. A vowel followed by an off-glide
// (ɪ, ʊ, ə, as in aɪ, oʊ, ɪə) or a length mark is one nucleus.
const VOWEL = /[aeiouyæɑɒɔəɚɛɜɝɪʊʌʏøœɐɨɵɤɯɶ]/u;
// Which off-glide may close which base vowel: aɪ aʊ eɪ oʊ ɔɪ ɑɪ, and the centering ɪə ʊə eə ɛə.
const GLIDES = { a: "ɪʊ", e: "ɪə", o: "ʊ", "ɔ": "ɪ", "ɑ": "ɪʊ", "ɪ": "ə", "ʊ": "ə", "ɛ": "ə" };
const STRESS = /[ˈˌ]/u;
const MARK = /[\p{M}ːˑ]/u; // combining marks, length

// Split one IPA chunk (no boundaries inside) by its vowel nuclei. Consonants before a nucleus go with it;
// a cluster between two nuclei leaves its first consonant behind (sɪs·toʊ, not sɪ·stoʊ); trailing
// consonants close the last syllable. Stress marks stay with the syllable they open.
function byNuclei(chunk) {
  const chars = [...chunk];
  const nuclei = []; // [start, end) of each nucleus
  for (let i = 0; i < chars.length; i++) {
    if (!VOWEL.test(chars[i])) continue;
    let j = i + 1;
    while (j < chars.length && MARK.test(chars[j])) j++;
    if (j < chars.length && (GLIDES[chars[i]] ?? "").includes(chars[j])) { j++; while (j < chars.length && MARK.test(chars[j])) j++; }
    nuclei.push([i, j]);
    i = j - 1;
  }
  if (nuclei.length < 2) return chunk ? [chunk] : [];
  const out = [];
  let start = 0;
  for (let n = 0; n < nuclei.length - 1; n++) {
    const end = nuclei[n][1], nextStart = nuclei[n + 1][0];
    const between = nextStart - end; // consonants between this nucleus and the next
    const cut = between <= 1 ? end : end + 1;
    out.push(chars.slice(start, cut).join(""));
    start = cut;
  }
  out.push(chars.slice(start).join(""));
  return out;
}

// IPA string -> syllables. Explicit boundaries first ("." and stress marks), then vowel nuclei within each chunk.
// Spaces separate words; each word is split on its own. Returns [] for empty input.
export function splitIpa(ipa) {
  const s = String(ipa ?? "").trim();
  if (!s) return [];
  const out = [];
  for (const word of s.split(/\s+/)) {
    const chunks = [];
    let cur = "";
    for (const ch of word) {
      if (ch === ".") { if (cur) chunks.push(cur); cur = ""; continue; }
      if (STRESS.test(ch)) { if (cur) chunks.push(cur); cur = ch; continue; }
      cur += ch;
    }
    if (cur) chunks.push(cur);
    for (const c of chunks) out.push(...byNuclei(c));
  }
  return out.filter((x) => [...x].some((ch) => VOWEL.test(ch)) || out.length === 1);
}

// Do these syllables spell this IPA? Same letters once boundaries (stress, dots, spaces) are dropped.
const letters = (s) => String(s ?? "").replace(/[ˈˌ.\s]/gu, "");
export const consistent = (ipa, syllables) => !ipa || !syllables?.length || letters(syllables.join("")) === letters(ipa);

// The syllables of something with `ipa_syllables` and/or `ipa` (a role, or term.pronunciation). Explicit data wins.
export function syllablesOf(x) {
  const given = Array.isArray(x?.ipa_syllables) ? x.ipa_syllables.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
  if (given.length) return given;
  return splitIpa(x?.ipa);
}

// How many syllables a respelling claims: tokens split on hyphens and spaces ("koh-lih-sis-tuh-KY-nin" -> 6,
// "BRY-er score" -> 3). Zero when there is no respelling.
export function respellingCount(say) {
  const s = String(say ?? "").trim();
  if (!s || s === "—") return 0;
  return s.split(/[-\s]+/).filter(Boolean).length;
}

// A respelling with a hyphen is syllabified by hand and its count is checked against the IPA syllables.
// A single word like "cola" is a hook word, not a syllable count (chole is two syllables said as its hook).
export const hyphenated = (say) => /-/.test(String(say ?? "").trim().replace(/^-+/, ""));

// Syllable count for a piece or word: explicit syllables, else split IPA, else the respelling's tokens, else 1.
export function syllableCount(x, say = x?.say ?? x?.approx) {
  const n = syllablesOf(x).length;
  if (n) return n;
  return respellingCount(say) || 1;
}

// A term -> the words the paw can follow: the whole word first, then each role's part, with their syllables.
// Mirrors tts.pronunciations(): only roles with IPA are pinned by the voice, but every part gets a toe count.
const bareTitle = (term) => String(term?.title ?? "").replace(/\s*\(.*?\)\s*/g, " ").trim();
export function termSyllables(term) {
  const out = [];
  const title = bareTitle(term);
  if (title) out.push({ spelling: title, syllables: syllablesOf(term?.pronunciation), count: syllableCount(term?.pronunciation ?? {}, term?.pronunciation?.approx), whole: true });
  for (const r of term?.roles ?? []) {
    if (!r?.part) continue;
    const spelling = String(r.part).split("/")[0].trim().replace(/^-+/, "");
    if (!spelling) continue;
    out.push({ spelling, id: r.id, syllables: syllablesOf(r), count: syllableCount(r, r.say), whole: false });
  }
  return out;
}
