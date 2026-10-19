import { brier } from "./brier.mjs";
import { cck } from "./cck.mjs";

brier.aliases = ["Brier"];
cck.aliases = ["CCK"];
const terms = new Map([[brier.id, brier], [cck.id, cck]]);

export const addTerms = (extra = []) => extra.forEach((t) => terms.set(t.id, t));
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
