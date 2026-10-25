// The study's command grammar, as one pure function so it can be tested. The owner says or types a short
// phrase; it is one of five commands, an instruction for the suggest route, or the field's new text.
//   parseCommand("keep")                 -> { kind: "keep" }
//   parseCommand("make it shorter")      -> { kind: "instruct", text: "make it shorter" }
//   parseCommand("Bile. Sac. Move.")     -> { kind: "replace", text: "Bile. Sac. Move." }
//   parseCommand("")                     -> null

const KEEP = /^(keep|keep it|yes|yep|yeah|good|that one|ok|okay|accept)$/;
const NEXT = /^(next|another|no|nope|skip|other)$/;
const BACK = /^(back|previous|go back)$/;
const UNDO = /^(undo|undo that)$/;
const MAP = /^(map|zoom out|overview|show the map)$/;
const REVIEW = /^(review|review it|review the lesson)$/;
// A phrase that asks for a change rather than giving the words themselves.
const INSTRUCTION = /^(make|try|use|swap|change|replace|give|write|something|more|less|shorter|longer|plainer|simpler|funnier|add|remove|lead|again|rewrite|say it|keep it)\b/;
const INSTRUCTION_WORDS = /\b(shorter|longer|plainer|simpler|funnier|clearer|louder|softer|instead|version)\b/;

export function parseCommand(raw) {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const low = t.toLowerCase().replace(/[.!?,]+$/, "").trim();
  if (KEEP.test(low)) return { kind: "keep" };
  if (NEXT.test(low)) return { kind: "next" };
  if (BACK.test(low)) return { kind: "back" };
  if (UNDO.test(low)) return { kind: "undo" };
  if (MAP.test(low)) return { kind: "map" };
  if (REVIEW.test(low)) return { kind: "review" };
  const words = low.split(" ").length;
  if (INSTRUCTION.test(low) || INSTRUCTION_WORDS.test(low) || words > 5) return { kind: "instruct", text: t };
  return { kind: "replace", text: t };
}

// The taste tag an instruction stands for: "make it shorter" -> "short", "lead with the sound" -> "sound",
// anything else its first meaningful word, so the owner's own words become tags the ranking can learn.
const STOP = new Set(["make", "it", "the", "a", "an", "this", "that", "try", "use", "give", "me", "write", "something", "more", "less", "with", "and", "please", "again", "version", "one", "of", "in", "to", "be"]);
const TAG_OF = [[/short|brief|tight|fewer/, "short"], [/sound|spoken|say|said|voice|aloud|rhyme/, "sound"], [/plain|simpl|clear|easy/, "plain"], [/long|more detail|fuller/, "long"], [/fun|play|joke/, "fun"]];
export function tagForInstruction(text) {
  const low = String(text ?? "").toLowerCase();
  for (const [re, tag] of TAG_OF) if (re.test(low)) return tag;
  const w = low.replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((x) => x && !STOP.has(x));
  return w[0] ?? "asked";
}
