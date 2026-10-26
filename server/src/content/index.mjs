// Lesson content for the learner app. The sample packets in this folder are seeds: on the first boot they
// go into the lesson store (lessons.mjs: media bucket + SQLite), and from then on the store is the source
// of truth, so the owner's edits through /api/admin/lessons survive a redeploy and code never overwrites
// them. Until reload() has run, the map holds the seeds themselves, so imports stay side-effect free.
import { brier } from "./brier.mjs";
import { cck } from "./cck.mjs";
import { createLessonStore, compilePacket, fromCode } from "../lessons.mjs";
import { media } from "../media.mjs";
import { db } from "../db.mjs";
import { syllablesOf } from "../syllables.mjs";

brier.aliases = ["Brier"];
cck.aliases = ["CCK"];
export const SEEDS = [brier, cck];
export const store = createLessonStore({ media, db, seeds: SEEDS });

// A stored document -> the runtime packet the routes use (compiled rubrics, review block, draft label).
export function hydrate(doc) {
  const { history, pending, review_status, reviewed_at, edited_by, edited_at, ...packet } = doc; // proposals never reach learners
  const t = compilePacket(packet);
  // Every word and piece with IPA carries its syllables (stored or split), so the paw has one toe per syllable.
  if (t.pronunciation?.ipa && !t.pronunciation.ipa_syllables?.length) t.pronunciation = { ...t.pronunciation, ipa_syllables: syllablesOf(t.pronunciation) };
  t.roles = (t.roles ?? []).map((r) => (r.ipa && !r.ipa_syllables?.length ? { ...r, ipa_syllables: syllablesOf(r) } : r));
  t.review = { status: review_status, reviewed_at: reviewed_at ?? null };
  if (review_status === "provisional") t.provisional = true;
  return t;
}

const extras = new Map();
let terms = new Map(SEEDS.map((s) => { const t = hydrate(fromCode(s)); return [t.id, t]; }));

export const addTerms = (extra = []) => extra.forEach((t) => { extras.set(t.id, t); terms.set(t.id, t); });
// Rebuild the map from the store (loading it first if needed). Call after every store write.
export async function reload() {
  if (!store.loaded) await store.load();
  const next = new Map();
  for (const doc of store.list()) next.set(doc.id, hydrate(doc));
  for (const [id, t] of extras) if (!next.has(id)) next.set(id, t);
  terms = next;
  return terms;
}
export const getTerm = (id) => terms.get(id) ?? null;
export const listTerms = () => [...terms.values()];
export const findPrompt = (promptId) => {
  for (const t of terms.values()) {
    const p = t.prompts.find((x) => x.id === promptId);
    if (p) return { term: t, prompt: p };
  }
  return null;
};

// What the browser may see: no answers, no rubrics, no expected values.
export function publicTerm(t) {
  const { prompts, aliases, ...rest } = t;
  return { ...rest, prompt_count: prompts.length, skills: [...new Set(prompts.map((p) => p.skill))] };
}
export function publicPrompt(p) {
  return { id: p.id, skill: p.skill, type: p.type, question: p.question, options: p.options ?? null, has_hint: Boolean(p.hint) };
}
