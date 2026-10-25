// The editor taste profile from the study: a list of { tag, weight, source }. Keep raises the kept candidate's
// tags, next lowers them, the owner's own words add a tag. Persisted per browser (the owner's) in localStorage.
// No Qloo call is made here; these tags become Qloo signals later (docs/EDITING.md, "Ambient mode").

export const TASTE_KEY = "gloo_editor_taste";
export const SEED = [{ tag: "short", weight: 0.5, source: "edits" }, { tag: "sound", weight: 0.5, source: "edits" }, { tag: "plain", weight: 0.5, source: "edits" }];
const DEFAULT_WEIGHT = 0.2;
export const KEEP_DELTA = 0.12;
export const NEXT_DELTA = -0.04;

const clamp = (w) => Math.max(0.05, Math.min(1, w));
const clean = (list) => (Array.isArray(list) ? list : []).filter((t) => t && typeof t.tag === "string" && t.tag.trim()).map((t) => ({ tag: t.tag.trim().toLowerCase(), weight: clamp(Number(t.weight) || DEFAULT_WEIGHT), source: String(t.source ?? "you") }));

export function loadTaste(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    const raw = storage?.getItem(TASTE_KEY);
    const list = raw ? clean(JSON.parse(raw)) : [];
    return seedTaste(list);
  } catch { return seedTaste([]); }
}
export function saveTaste(taste, storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try { storage?.setItem(TASTE_KEY, JSON.stringify(taste)); } catch { /* private mode */ }
}
// The seed tags are always present; stored weights win.
export function seedTaste(list) {
  const out = clean(list);
  for (const s of SEED) if (!out.some((t) => t.tag === s.tag)) out.push({ ...s });
  return out;
}

export const weightOf = (taste, tag) => taste.find((t) => t.tag === tag)?.weight ?? DEFAULT_WEIGHT;

// A new profile with each tag moved by delta; unknown tags are added at 0.3 with the given source.
export function learn(taste, tags, delta, source = "you") {
  const out = taste.map((t) => ({ ...t }));
  for (const raw of tags ?? []) {
    const tag = String(raw ?? "").trim().toLowerCase();
    if (!tag) continue;
    let t = out.find((x) => x.tag === tag);
    if (!t) { t = { tag, weight: 0.3, source }; out.push(t); }
    t.weight = clamp(t.weight + delta);
  }
  return out;
}

// Candidates ranked by taste: the owner's own request first, then the mean weight of a candidate's tags.
export function rank(taste, candidates) {
  return (candidates ?? []).map((c, n) => ({ ...c, n, score: (c.mine ? 5 : 0) + (c.tags?.length ? c.tags.reduce((a, t) => a + weightOf(taste, t), 0) / c.tags.length : DEFAULT_WEIGHT) }))
    .sort((a, b) => b.score - a.score || a.n - b.n);
}

// Tags a reviewer proposal carries. Proposals have no tags of their own, so they are read off the proposal:
// severity, what the reason says, and whether the replacement is shorter.
export function tagsForProposal(p) {
  const tags = new Set();
  tags.add(p.severity === "fix" ? "rule" : "improve");
  const reason = String(p.reason ?? "").toLowerCase();
  if (/sound|spoken|speak|aloud|voice|said|say\b/.test(reason)) tags.add("sound");
  if (/plain|simpl|clear/.test(reason)) tags.add("plain");
  if (typeof p.after === "string" && typeof p.before === "string" && p.after.length < p.before.length * 0.85) tags.add("short");
  if (/short|brief/.test(reason)) tags.add("short");
  return [...tags];
}

export const top = (taste, n = 5) => [...taste].sort((a, b) => b.weight - a.weight).slice(0, n);
