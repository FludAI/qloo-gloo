// The speech engine reads "chole" as written and gets it wrong. Every piece has a respelling
// (role.say, e.g. koh-lee); this rewrites a sentence so each piece, and the whole word, is
// spoken by its respelling wherever it appears. Only whole words are replaced, so "chole"
// inside "cholecystokinin" is left to the whole-word rule.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function respeller(term) {
  const pairs = [];
  const title = String(term?.title ?? "").replace(/\s*\(.*?\)\s*/g, "").trim();
  const approx = term?.pronunciation?.approx;
  if (title && approx && approx !== "—") pairs.push([title, approx.replace(/-/g, " ")]);
  const roles = (term?.roles ?? []).filter((r) => r.part && r.say);
  for (const r of roles) {
    const say = String(r.say).replace(/^-/, "");
    const alts = new Set(String(r.part).split("/").map((s) => s.trim().replace(/^-/, "")).filter((s) => s.length >= 2));
    // A component written "cyst / cysto" shares an alternative with the role: all its spellings get the same respelling.
    for (const c of term?.components ?? []) {
      const cAlts = String(c.part ?? "").split("/").map((s) => s.trim().replace(/^-/, "")).filter(Boolean);
      if (cAlts.some((a) => alts.has(a))) cAlts.forEach((a) => a.length >= 2 && alts.add(a));
    }
    for (const a of alts) if (a.toLowerCase() !== say.toLowerCase()) pairs.push([a, say]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  const rules = pairs.map(([from, to]) => [new RegExp(`(?<![\\p{L}])${esc(from)}(?![\\p{L}])`, "giu"), to]);
  return (text) => rules.reduce((t, [re, to]) => t.replace(re, to), String(text ?? ""));
}
