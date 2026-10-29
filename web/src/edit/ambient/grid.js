// The lesson as a grid of fields, the way the ambient study lays it out: one column for the word
// (title, say, summary), one per piece (part, sounds-like, meaning, pick question, four options) and
// one per practice prompt (question, hint, answer). Pure functions: no React, no DOM, so the mapping
// between field keys, reviewer proposal paths, suggest fields and PATCH bodies can be unit-tested.
//
// Field keys: "w:title" | "w:say" | "w:summary"
//             "r:<roleId>:part|sounds|meaning|question|opt0..opt3"
//             "p:<promptId>:question|hint|answer"
// Layout numbers for the grid.

export const COLW = 420;
export const GRID = { cols: 3, rowH: 500 };

export const LABEL = { title: "title", say: "say", summary: "summary", part: "part", sounds: "sounds like", meaning: "means", question: "ask", hint: "hint", answer: "answer" };

const WORD = { title: "title", say: "pronunciation.approx", summary: "summary" };
const ROLE = { part: "part", sounds: "sound_like", meaning: "meaning" };
const PROMPT = ["question", "hint", "answer"];
// Fields the lesson shape requires: an empty string there is saved as "", an optional one as null.
const OPTIONAL = new Set(["w:say", "sounds", "hint"]);

export const parseKey = (key) => {
  const [kind, a, b] = String(key ?? "").split(":");
  if (kind === "w") return { kind, field: a };
  if (kind === "r" || kind === "p") return { kind, id: a, field: b };
  return null;
};
const optIndex = (field) => (/^opt\d$/.test(field ?? "") ? Number(field.slice(3)) : -1);

// ---- Reading and writing lesson values by key ----

export function getValue(lesson, key) {
  const k = parseKey(key);
  if (!k || !lesson) return "";
  if (k.kind === "w") return k.field === "say" ? lesson.pronunciation?.approx ?? "" : lesson[k.field] ?? "";
  if (k.kind === "r") {
    const r = (lesson.roles ?? []).find((x) => x.id === k.id);
    if (!r) return "";
    const oi = optIndex(k.field);
    if (oi >= 0) return r.pick?.options?.[oi]?.name ?? "";
    if (k.field === "question") return r.pick?.question ?? "";
    return r[ROLE[k.field]] ?? "";
  }
  const p = (lesson.prompts ?? []).find((x) => x.id === k.id);
  return p?.[k.field] ?? "";
}

// A new lesson object with one value changed (the optimistic local copy; the server's answer replaces it).
export function withValue(lesson, key, value) {
  const k = parseKey(key);
  const L = structuredClone(lesson);
  if (!k) return L;
  if (k.kind === "w") { if (k.field === "say") L.pronunciation = { ...(L.pronunciation ?? {}), approx: value }; else L[k.field] = value; return L; }
  if (k.kind === "r") {
    const r = L.roles.find((x) => x.id === k.id);
    if (!r) return L;
    const oi = optIndex(k.field);
    if (oi >= 0) r.pick.options[oi].name = value;
    else if (k.field === "question") r.pick.question = value;
    else r[ROLE[k.field]] = value;
    return L;
  }
  const p = L.prompts.find((x) => x.id === k.id);
  if (p) p[k.field] = value;
  return L;
}

// The merge patch the owner API takes for one field. Empty text clears an optional field (null).
export function patchFor(key, value) {
  const k = parseKey(key);
  if (!k) return null;
  const text = String(value ?? "");
  const v = text.trim() === "" && (OPTIONAL.has(key) || OPTIONAL.has(k.field)) ? null : text;
  if (k.kind === "w") return k.field === "say" ? { pronunciation: { approx: v } } : { [k.field]: v };
  if (k.kind === "r") {
    const oi = optIndex(k.field);
    if (oi >= 0) return { roles: [{ id: k.id, pick: { options: [{ index: oi, name: v }] } }] };
    if (k.field === "question") return { roles: [{ id: k.id, pick: { question: v } }] };
    return { roles: [{ id: k.id, [ROLE[k.field]]: v }] };
  }
  return { prompts: [{ id: k.id, [k.field]: v }] };
}

// The dotted field the suggest route takes.
export function suggestField(key) {
  const k = parseKey(key);
  if (!k) return null;
  if (k.kind === "w") return WORD[k.field];
  if (k.kind === "r") {
    const oi = optIndex(k.field);
    if (oi >= 0) return `roles.${k.id}.pick.options.${oi}.name`;
    if (k.field === "question") return `roles.${k.id}.pick.question`;
    return `roles.${k.id}.${ROLE[k.field]}`;
  }
  return `prompts.${k.id}.${k.field}`;
}

// The reviewer's path for a field ("roles[chole].pick.options[2].name"), as accept_proposals expects it.
export function proposalPath(key) {
  const k = parseKey(key);
  if (!k) return null;
  if (k.kind === "w") return WORD[k.field];
  if (k.kind === "r") {
    const oi = optIndex(k.field);
    if (oi >= 0) return `roles[${k.id}].pick.options[${oi}].name`;
    if (k.field === "question") return `roles[${k.id}].pick.question`;
    return `roles[${k.id}].${ROLE[k.field]}`;
  }
  return `prompts[${k.id}].${k.field}`;
}

// ---- Proposal path -> field key ----
// Paths may address roles, prompts and options by id, by index or (options) by name; dotted or bracketed.
// Returns null for a field the grid doesn't show (ipa, wiki, connection, definition, whole lists...).
export function parsePath(path) {
  const tokens = [];
  const re = /\[([^\]]*)\]|([^.[\]]+)/g;
  let m;
  for (const s = String(path ?? ""); (m = re.exec(s)); ) tokens.push(m[1] !== undefined ? m[1] : m[2]);
  return tokens.map((t) => t.trim()).filter(Boolean);
}
const find = (list, tok) => { const i = /^\d+$/.test(tok) ? Number(tok) : (list ?? []).findIndex((x) => x && (x.id === tok || x.name === tok)); return i >= 0 ? (list ?? [])[i] ?? null : null; };
const ROLE_BACK = { part: "part", sound_like: "sounds", meaning: "meaning" };

export function keyForPath(lesson, path) {
  const t = parsePath(path);
  if (!t.length) return null;
  const [head, id, ...rest] = t;
  if (head === "title" && t.length === 1) return "w:title";
  if (head === "summary" && t.length === 1) return "w:summary";
  if (head === "pronunciation" && id === "approx" && t.length === 2) return "w:say";
  if (head === "roles") {
    const r = find(lesson?.roles, id);
    if (!r) return null;
    if (rest.length === 1 && ROLE_BACK[rest[0]]) return `r:${r.id}:${ROLE_BACK[rest[0]]}`;
    if (rest.length === 2 && rest[0] === "pick" && rest[1] === "question") return `r:${r.id}:question`;
    if (rest.length === 4 && rest[0] === "pick" && rest[1] === "options" && rest[3] === "name") {
      const opts = r.pick?.options ?? [];
      const oi = /^\d+$/.test(rest[2]) ? Number(rest[2]) : opts.findIndex((o) => o && o.name === rest[2]);
      return oi >= 0 && oi < 4 ? `r:${r.id}:opt${oi}` : null;
    }
    return null;
  }
  if (head === "prompts") {
    const p = find(lesson?.prompts, id);
    return p && rest.length === 1 && PROMPT.includes(rest[0]) ? `p:${p.id}:${rest[0]}` : null;
  }
  return null;
}

// ---- Layout: every field with its box in lesson space, column by column ----
// Column 0 is the word; then one per role; then one per prompt. x is the column's own origin plus an offset;
// `columnOrigin` places columns in a row (flight) or in a 3-wide grid (map).

export function columnOf(lesson, key) {
  const k = parseKey(key);
  if (!k) return -1;
  if (k.kind === "w") return 0;
  const R = (lesson.roles ?? []).length;
  if (k.kind === "r") { const i = lesson.roles.findIndex((r) => r.id === k.id); return i < 0 ? -1 : 1 + i; }
  const i = (lesson.prompts ?? []).findIndex((p) => p.id === k.id);
  return i < 0 ? -1 : 1 + R + i;
}
export const columnCount = (lesson) => 1 + (lesson?.roles ?? []).length + (lesson?.prompts ?? []).length;
export const columnOrigin = (col, map) => (map ? { x: (col % GRID.cols) * COLW, y: Math.floor(col / GRID.cols) * GRID.rowH } : { x: col * COLW, y: 0 });
export const mapSize = (lesson) => { const rows = Math.ceil(columnCount(lesson) / GRID.cols); return { w: GRID.cols * COLW - 60, h: rows * GRID.rowH - 40 }; };

export function buildLayout(lesson) {
  const N = [];
  const add = (key, col, x, y, w, fs, o = {}) => N.push({ key, col, x, y, w, fs, h: o.h || 0, tile: !!o.tile, hot: !!o.hot, cy: o.cy ?? fs * 0.7, pre: o.pre || "", label: o.label });
  add("w:title", 0, 0, 0, 360, 34);
  add("w:say", 0, 0, 74, 360, 20, { hot: true });
  add("w:summary", 0, 0, 138, 360, 20, { cy: 40 });
  (lesson?.roles ?? []).forEach((r, i) => {
    const col = 1 + i;
    add(`r:${r.id}:part`, col, 0, -4, 360, 54);
    add(`r:${r.id}:sounds`, col, 0, 106, 360, 28, { hot: true, pre: "≈ " });
    add(`r:${r.id}:meaning`, col, 0, 170, 360, 20);
    add(`r:${r.id}:question`, col, 0, 228, 360, 17);
    for (let k = 0; k < 4; k++) add(`r:${r.id}:opt${k}`, col, (k % 2) * 186, 280 + Math.floor(k / 2) * 92, 174, 16, { tile: true, h: 80, cy: 40, label: `pick ${k + 1}` });
  });
  const R = (lesson?.roles ?? []).length;
  (lesson?.prompts ?? []).forEach((p, i) => {
    const col = 1 + R + i;
    add(`p:${p.id}:question`, col, 0, 0, 360, 22, { cy: 26 });
    add(`p:${p.id}:hint`, col, 0, 112, 360, 19, { hot: true });
    add(`p:${p.id}:answer`, col, 0, 184, 360, 19);
  });
  return N;
}

// ---- Deterministic flags the console can see without the server ----
// They mirror the reviewer's cheap checks (spoken length and symbols) and add empty fields. Each flag is a
// proposal without a replacement: { path, before, after: null, reason, severity, key }.
const SYMBOLS = /[≈→+=/]/;
const sentences = (s) => String(s ?? "").split(/[.!?]+["”]?\s+/).filter((x) => x.trim()).length;
export function flagLesson(lesson) {
  const out = [];
  const flag = (key, reason, severity = "improve") => out.push({ path: proposalPath(key), key, before: getValue(lesson, key) || null, after: null, reason, severity, local: true });
  const sum = String(lesson?.summary ?? "");
  if (sum && (sentences(sum) > 2 || SYMBOLS.test(sum))) flag("w:summary", "The summary is spoken aloud: keep it to one or two short sentences with no symbols.");
  if (!String(lesson?.pronunciation?.approx ?? "").trim()) flag("w:say", "No respelling: the browser voice has nothing to go on.");
  for (const r of lesson?.roles ?? []) {
    if (!String(r.part ?? "").trim()) flag(`r:${r.id}:part`, "The piece has no spelling.", "fix");
    if (!String(r.meaning ?? "").trim()) flag(`r:${r.id}:meaning`, "The piece has no meaning.", "fix");
    if (!String(r.sound_like ?? "").trim()) flag(`r:${r.id}:sounds`, "No sound cue: the piece is taught by meaning only. Add one if a well-known word carries the sound.");
    const q = String(r.pick?.question ?? "");
    if (q && (q.length > 70 || SYMBOLS.test(q) || !/[.?!]["”]?$/.test(q.trim()))) flag(`r:${r.id}:question`, "The pick question is spoken: a short spoken sentence, no symbols.");
    (r.pick?.options ?? []).slice(0, 4).forEach((o, i) => { if (!String(o?.name ?? "").trim()) flag(`r:${r.id}:opt${i}`, "An empty pick option.", "fix"); });
  }
  for (const p of lesson?.prompts ?? []) {
    if (String(p.question ?? "").length > 160) flag(`p:${p.id}:question`, "The question is long for a spoken prompt.");
    if (!String(p.hint ?? "").trim()) flag(`p:${p.id}:hint`, "No hint: the learner gets nothing on a miss.");
  }
  return out;
}

// ---- The queue ----
// Pending reviewer proposals first (fixes, then improvements), then the local flags, each in grid order.
// Returns { queue: [key], unmapped: [proposal] } where unmapped are pending proposals the grid can't show.
export function buildQueue(lesson, pending) {
  const order = new Map(buildLayout(lesson).map((n, i) => [n.key, i]));
  const seen = new Set();
  const groups = { fix: [], improve: [], flag: [] };
  const unmapped = [];
  for (const p of pending ?? []) {
    const key = keyForPath(lesson, p.path);
    if (!key) { unmapped.push(p); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    groups[p.severity === "fix" ? "fix" : "improve"].push(key);
  }
  for (const f of flagLesson(lesson)) { if (!seen.has(f.key)) { seen.add(f.key); groups.flag.push(f.key); } }
  const byGrid = (a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9);
  return { queue: [...groups.fix.sort(byGrid), ...groups.improve.sort(byGrid), ...groups.flag.sort(byGrid)], unmapped };
}
