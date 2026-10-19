// LLM backup for word resolution, and provisional lessons for words without a reviewed packet.
// Both are labeled wherever they appear. Neither is ever presented as reviewed content.
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./agent.mjs";

const live = () => Boolean(process.env.ANTHROPIC_API_KEY);
// Current models reject forced tool choice, so the instruction asks for the tool and we check for it.
const forced = async (system, user, tool) => {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL, max_tokens: 2500, system: `${system}\n\nRespond only by calling the ${tool.name} tool.`,
    tools: [tool], tool_choice: { type: "auto" },
    messages: [{ role: "user", content: user }],
  });
  const call = res.content.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (!call) throw new Error("model returned no structured output");
  return call.input;
};

// ---- Resolution backup: only called for close calls and misses ----
export async function resolveWithLlm(local) {
  if (!live()) return null;
  const out = await forced(
    "You identify which word or term a learner meant. Input may be a phonetic attempt from speech recognition, a typo, or OCR noise. Return the standard spelling. If you cannot tell, set term to null.",
    `Captured (${local.mode}): "${local.input}"\nNormalized: "${local.normalized}"\nClosest library candidates: ${local.candidates.map((c) => `${c.word} (${c.method} ${c.score})`).join(", ") || "none"}`,
    { name: "resolve_term", description: "The intended term.", input_schema: { type: "object", properties: {
      term: { type: ["string", "null"], description: "Standard spelling, lowercase, or null" },
      reason: { type: "string" } }, required: ["term", "reason"] } },
  );
  const term = typeof out.term === "string" ? out.term.toLowerCase().replace(/[^\p{L}\p{N}' -]/gu, "").trim().slice(0, 60) : null;
  return term ? { word: term, term_id: null, score: null, method: "ai", reason: String(out.reason ?? "").slice(0, 200) } : null;
}

// ---- Provisional lesson drafting ----
const LESSON_TOOL = {
  name: "draft_lesson",
  description: "A provisional Gloo lesson. Accurate, concise, and honest about uncertainty.",
  input_schema: { type: "object", properties: {
    title: { type: "string" },
    pronunciation_approx: { type: "string", description: "Approximate learner respelling, e.g. koh-lih-sis-tuh-KY-nin" },
    summary: { type: "string", description: "One or two sentences. Use the meaning already inside the word if it has parts." },
    definition: { type: "string" },
    components: { type: "array", maxItems: 5, items: { type: "object", properties: {
      part: { type: "string" }, meaning: { type: "string" }, cue: { type: "string", description: "Optional approximate sound cue, marked as approximate" } },
      required: ["part", "meaning"] } },
    roles: { type: "array", minItems: 2, maxItems: 4, description: "Parts of the term a familiar cue could carry",
      items: { type: "object", properties: {
        id: { type: "string", description: "short slug" }, label: { type: "string" },
        target: { type: "string" }, look_for: { type: "string" },
        pick: { type: "object", description: "A favorite-pick: 3-4 well-known public names (brands, films, bands, books, teams) that ALL carry this part's sound or meaning, so any choice works as the cue",
          properties: { question: { type: "string", description: "e.g. Which cola is yours?" },
            options: { type: "array", minItems: 3, maxItems: 4, items: { type: "object", properties: {
              name: { type: "string" }, connection: { type: "string", description: "One sentence: how this name carries the part. Say 'approximate' for sound links." } },
              required: ["name", "connection"] } } }, required: ["question", "options"] } },
        required: ["id", "label", "target", "look_for", "pick"] } },
    distinctions: { type: "array", maxItems: 4, items: { type: "string" }, description: "Easy confusions to keep straight" },
    prompts: { type: "array", minItems: 3, maxItems: 5, items: { type: "object", properties: {
      skill: { type: "string", enum: ["meaning", "operation", "transfer"] },
      type: { type: "string", enum: ["text", "number"] },
      question: { type: "string" }, hint: { type: "string" },
      accept_all: { type: "array", items: { type: "array", items: { type: "string" } },
        description: "For text: every group must match; each group lists lowercase keyword alternatives" },
      accept_any: { type: "array", items: { type: "string" }, description: "For text: at least one must appear" },
      expected: { type: "number", description: "For number prompts" },
      answer: { type: "string" },
      misconceptions: { type: "array", items: { type: "object", properties: {
        keywords: { type: "array", items: { type: "string" } }, feedback: { type: "string" } }, required: ["keywords", "feedback"] } } },
      required: ["skill", "type", "question", "answer"] } },
    sources: { type: "array", maxItems: 3, items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } }, required: ["label", "url"] } },
  }, required: ["title", "summary", "definition", "roles", "prompts"] },
};

const esc = (s) => String(s).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyOf = (words) => new RegExp(words.filter(Boolean).map(esc).join("|"));
const clip = (s, n) => String(s ?? "").slice(0, n);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "role";

// Turn model JSON into a packet with compiled rubrics (stored as JSON, compiled on load).
export function compilePacket(json) {
  const prompts = (json.prompts ?? []).map((p) => ({
    ...p,
    rubric: p.type === "text" ? {
      all: (p.accept_all ?? []).filter((g) => g?.length).map(anyOf),
      any: (p.accept_any ?? []).length ? [anyOf(p.accept_any)] : [],
    } : undefined,
    misconceptions: (p.misconceptions ?? []).map((m) => [anyOf(m.keywords ?? []), m.feedback]),
  }));
  return { ...json, prompts };
}

function shape(id, input, d, origin) {
  const components = (d.components ?? []).slice(0, 5).map((c) => ({ part: clip(c.part, 30), meaning: clip(c.meaning, 80), cue: c.cue ? clip(c.cue, 120) : "—" }));
  const roles = (d.roles ?? []).slice(0, 4).map((r) => ({
    id: slug(r.id), label: clip(r.label, 50), target: clip(r.target, 80), look_for: clip(r.look_for, 120),
    pick: r.pick?.options?.length ? { question: clip(r.pick.question, 80), options: r.pick.options.slice(0, 4).map((o) => ({ name: clip(o.name, 40), qloo: null, connection: clip(o.connection, 160) })) } : undefined,
  }));
  const title = clip(d.title, 80) || input;
  const nodes = [["term", title, "term"]];
  const edges = [];
  components.forEach((c, i) => {
    nodes.push([`p${i}`, c.part, "word part"], [`m${i}`, c.meaning, "concept"]);
    edges.push([`p${i}`, `m${i}`, "root meaning"], [`p${i}`, "term", "component of"]);
  });
  return {
    id, version: "draft-1", provisional: true, origin,
    review: { status: "provisional", reviewed_at: null },
    title, aliases: [input],
    pronunciation: { approx: clip(d.pronunciation_approx, 60) || "—", note: "Approximate. Not reviewed." },
    summary: clip(d.summary, 400), definition: clip(d.definition, 400),
    components: components.length ? components : undefined,
    distinctions: (d.distinctions ?? []).slice(0, 4).map((x) => clip(x, 240)),
    sources: (d.sources ?? []).slice(0, 3).filter((s) => /^https?:\/\//.test(s.url)).map((s) => ({ label: clip(s.label, 100), url: clip(s.url, 300) })),
    roles, editorial_cues: [], graph: { nodes, edges },
    first_attempt: { question: "How would you say it, or what do you think it means? A guess is fine." },
    prompts: (d.prompts ?? []).slice(0, 5).map((p, i) => ({
      id: `${id}-q${i + 1}`, skill: p.skill, type: p.type, question: clip(p.question, 300), hint: p.hint ? clip(p.hint, 200) : undefined,
      accept_all: p.accept_all, accept_any: p.accept_any, expected: p.expected, answer: clip(p.answer, 300), misconceptions: p.misconceptions,
    })),
  };
}

export async function draftLesson(id, word) {
  const d = await forced(
    `You draft provisional lessons for Gloo, which teaches hard terms by first using the meaning already inside them (roots, parts, origin), then linking parts to familiar cues.
Be accurate. If the term has meaningful parts, list them. Sound cues are approximate memory aids, never etymology.
Each role needs a favorite-pick: a question like "Which cola is yours?" and 3-4 well-known public names that all carry that part's sound or meaning, so whichever one the learner picks works as the cue.
Practice prompts: short, answerable, deterministic. Text prompts need keyword rubrics (lowercase stems that a correct answer must contain). Number prompts need an exact expected value.
Only cite sources you are confident exist (major dictionaries, NIH/NCBI, Wikipedia). It is fine to cite none.`,
    `Draft a provisional lesson for the term: "${word}"`,
    LESSON_TOOL,
  );
  return shape(id, word, d, "ai-draft");
}

export function syntheticLesson(id, word) {
  const title = word.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return shape(id, word, {
    title, pronunciation_approx: "—",
    summary: "SYNTHETIC placeholder. Set ANTHROPIC_API_KEY to have the agent draft a real provisional lesson.",
    definition: "Not drafted (mock mode).",
    roles: [{ id: "sound", label: "Sound of the word", target: title, look_for: "something that sounds like it",
        pick: { question: "Which one sounds closest?", options: [{ name: "Option A", connection: "SYNTHETIC option." }, { name: "Option B", connection: "SYNTHETIC option." }, { name: "Option C", connection: "SYNTHETIC option." }] } },
      { id: "meaning", label: "Core meaning", target: "its meaning", look_for: "something that carries its meaning",
        pick: { question: "Which one carries the meaning?", options: [{ name: "Option A", connection: "SYNTHETIC option." }, { name: "Option B", connection: "SYNTHETIC option." }, { name: "Option C", connection: "SYNTHETIC option." }] } }],
    prompts: [{ skill: "meaning", type: "text", question: `Spell the word you glued.`, accept_any: [word.toLowerCase()], answer: word }],
  }, "synthetic");
}
