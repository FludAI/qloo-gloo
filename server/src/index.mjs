import express from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { callQloo, readiness, OPERATIONS } from "./qloo.mjs";
import { findPersonalData } from "./guard.mjs";
import { cached, remember } from "./cache.mjs";
import { toItems } from "./normalize.mjs";
import { mockQloo } from "./mock.mjs";
import { take } from "./limits.mjs";
import { db, q, exportLearner, deleteLearner } from "./db.mjs";
import { assess } from "./assess.mjs";
import { deriveSkill, POLICY } from "./scheduler.mjs";
import { listTerms, getTerm, findPrompt, publicTerm, publicPrompt, addTerms } from "./content/index.mjs";
import { runCueAgent, runSyntheticAgent, agentMode, MODEL } from "./agent.mjs";
import { setVocabulary, resolveLocal, pickFromOcr, normalize } from "./resolve/index.mjs";
import { resolveWithLlm, draftLesson, syntheticLesson, compilePacket } from "./drafter.mjs";
import { sttMode, transcribe, splitWake } from "./speech.mjs";
import { readWord } from "./reader.mjs";
import { DOMAIN_TERMS } from "./resolve/domain-terms.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const MOCK = process.env.QLOO_MOCK === "1" || process.argv.includes("--mock");
const PORT = Number(process.env.PORT ?? 8787);
// Hosted demo gate: camera, voice, the agent and lesson drafting spend money; reviewed lessons stay open.
const PASSCODE = String(process.env.DEMO_PASSCODE ?? "").trim();

// Optional extra terms from a module outside this repo (GLOO_ENGINE_MODULE). Absent = bundled samples only.
let ENGINE = "gloo-open";
if (process.env.GLOO_ENGINE_MODULE) {
  const mod = await import(pathToFileURL(resolve(repoRoot, process.env.GLOO_ENGINE_MODULE)).href);
  addTerms(mod.terms ?? []);
  ENGINE = mod.ENGINE_NAME ?? "gloo-external";
}

setVocabulary(listTerms());
// Recognition hints for spoken capture: every lesson title and alias, the domain list, and the wake phrase.
const SPEECH_HINTS = [...new Set(["gloo it", ...listTerms().flatMap((t) => [t.title.replace(/\s*\(.*?\)\s*/g, " ").trim(), ...(t.aliases ?? [])]), ...DOMAIN_TERMS])];

// A term is either a reviewed packet or this learner's own provisional draft.
function termFor(sid, id) {
  const t = getTerm(id);
  if (t) return t;
  const row = typeof id === "string" && id.startsWith("p-") ? q.provisionalById.get(id, sid) : null;
  return row ? compilePacket(JSON.parse(row.packet)) : null;
}
function promptFor(sid, promptId) {
  const found = findPrompt(promptId);
  if (found) return found;
  const m = /^(p-[a-f0-9]{10})-q\d+$/.exec(String(promptId ?? ""));
  const term = m && termFor(sid, m[1]);
  const prompt = term?.prompts.find((p) => p.id === promptId);
  return prompt ? { term, prompt } : null;
}

const app = express();
app.disable("x-powered-by");
// Media routes carry a camera crop or a few seconds of PCM; everything else stays small.
const smallJson = express.json({ limit: "32kb" });
const mediaJson = express.json({ limit: "3mb" });
app.use((req, res, next) => (["/api/glue", "/api/transcribe"].includes(req.path) ? mediaJson : smallJson)(req, res, next));

// Server-issued anonymous session. A browser-supplied learner ID is never authorization.
app.use((req, res, next) => {
  const m = /(?:^|;\s*)gloo_sid=([a-f0-9]{32})/.exec(req.headers.cookie ?? "");
  let sid = m?.[1];
  if (!sid) {
    sid = randomBytes(16).toString("hex");
    res.setHeader("Set-Cookie", `gloo_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  }
  q.ensureLearner.run(sid, Date.now());
  req.sid = sid;
  next();
});

const unlocked = (sid) => !PASSCODE || Boolean(q.isUnlocked.get(sid)?.unlocked);
const locked = (res) => res.status(401).json({ error: "This demo needs a passcode for camera, voice and the agent.", code: "PASSCODE_REQUIRED" });
const gate = (req, res, next) => (unlocked(req.sid) ? next() : locked(res));

const blocked = (summary, code, recovery) =>
  ({ status: "error", summary, results: [], result_count: 0, error: { code, retryable: false, recovery } });

async function runQloo(sid, op, args) {
  const pii = findPersonalData(args);
  if (pii) return blocked(`Blocked: input looks like it contains a ${pii}.`, "PERSONAL_DATA_BLOCKED", "Use public cultural names and concepts only.");
  const hit = !MOCK && cached(op, args);
  if (hit) { q.logCall.run(sid, "qloo", op, hit.status, "hit", 0, Date.now()); return { ...hit, cache: "hit" }; }
  const lim = take("qloo", sid);
  if (!lim.ok) return blocked(lim.reason, "DEMO_RATE_LIMIT", "Wait, or continue with editorial cues.");
  const t0 = performance.now();
  const envelope = MOCK ? mockQloo(op, args) : await callQloo(op, args);
  q.logCall.run(sid, MOCK ? "qloo-mock" : "qloo", op, envelope.status, "miss", performance.now() - t0, Date.now());
  if (!MOCK) remember(op, args, envelope);
  return envelope;
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

app.get("/api/health", wrap(async (req, res) => {
  let qloo = { mode: MOCK ? "mock" : "live", ready: false };
  if (!MOCK) {
    try { qloo.ready = (await readiness()).ready; } catch (e) { qloo = { mode: "live", ready: false, error: e.message }; }
  }
  const agent = agentMode() === "live" ? { mode: "live", model: MODEL } : MOCK ? { mode: "synthetic" } : { mode: "unavailable" };
  const stt = MOCK ? "mock" : await sttMode();
  res.json({ qloo, agent, stt, camera: agentMode() === "live" ? "live" : MOCK ? "mock" : "unavailable",
    gated: Boolean(PASSCODE), unlocked: unlocked(req.sid), engine: ENGINE, schedule_policy: POLICY.version,
    unavailable: ["pronunciation scoring", "glasses input", "rewards", "encounter detection"] });
}));

app.post("/api/unlock", (req, res) => {
  if (!PASSCODE) return res.json({ unlocked: true });
  const given = String(req.body?.code ?? "").trim();
  const h = (s) => createHash("sha256").update(s.toLowerCase()).digest();
  if (!given || !timingSafeEqual(h(given), h(PASSCODE))) return res.status(403).json({ error: "That passcode didn't match.", unlocked: false });
  q.unlock.run(req.sid);
  res.json({ unlocked: true });
});

// ---- Terms (no answers ever leave the server) ----
app.get("/api/terms", (req, res) => res.json([
  ...listTerms().map((t) => ({ id: t.id, title: t.title, summary: t.summary, provisional: false })),
  ...q.provisionalFor.all(req.sid).map((r) => { const p = JSON.parse(r.packet); return { id: r.id, title: p.title, summary: p.summary, provisional: true, origin: r.origin }; }),
]));

app.get("/api/terms/:id", (req, res) => {
  const t = termFor(req.sid, req.params.id);
  if (!t) return res.status(404).json({ error: "unknown term" });
  const first = q.getFirst.get(req.sid, t.id);
  // The lesson unlocks only after the first attempt is saved or explicitly skipped.
  if (!first) return res.json({ id: t.id, title: t.title, first_attempt: t.first_attempt, locked: true });
  res.json({ ...publicTerm(t), locked: false, first_attempt_record: first });
});

app.post("/api/terms/:id/first-attempt", (req, res) => {
  const t = termFor(req.sid, req.params.id);
  if (!t) return res.status(404).json({ error: "unknown term" });
  const skipped = req.body?.skipped === true;
  const response = skipped ? null : String(req.body?.response ?? "").slice(0, 400);
  if (!skipped && !response.trim()) return res.status(400).json({ error: "response or skipped is required" });
  q.putFirst.run(req.sid, t.id, response, skipped ? 1 : 0, t.version, Date.now());
  res.json({ saved: true });
});

// ---- Spoken input anywhere (first attempt, practice answers): PCM in, transcript out ----
app.post("/api/transcribe", gate, wrap(async (req, res) => {
  const pcm16 = String(req.body?.pcm16 ?? "");
  if (pcm16.length < 2000) return res.status(400).json({ error: "Too short. Hold the mic and say it." });
  if (MOCK) return res.json({ transcript: "gloo it", alternatives: [], provider: "mock" });
  if ((await sttMode()) !== "google") return res.status(503).json({ error: "Server speech isn't configured.", code: "STT_UNAVAILABLE" });
  const lim = take("stt", req.sid);
  if (!lim.ok) return res.status(429).json({ error: lim.reason });
  const t0 = performance.now();
  try {
    const out = await transcribe({ pcm16, hints: SPEECH_HINTS });
    q.logCall.run(req.sid, "google-stt", "recognize", out.transcript ? "ok" : "empty", null, performance.now() - t0, Date.now());
    res.json({ ...out, provider: "google" });
  } catch (e) {
    q.logCall.run(req.sid, "google-stt", "recognize", "error", null, performance.now() - t0, Date.now());
    console.error("stt:", e.message);
    res.status(502).json({ error: "Couldn't transcribe that. Try again or type it.", code: "STT_FAILED" });
  }
}));

// ---- Qloo cue discovery ----
app.post("/api/cues/resolve", wrap(async (req, res) => {
  const entity = String(req.body?.entity ?? "").trim().slice(0, 80);
  if (!entity) return res.status(400).json({ error: "entity is required" });
  const args = { entity, ...(req.body?.type ? { type: String(req.body.type) } : {}) };
  const envelope = await runQloo(req.sid, "describe", args);
  res.json({ request: { operation: "describe", args }, envelope, items: toItems(envelope) });
}));

app.post("/api/cues/agent", gate, wrap(async (req, res) => {
  const t = termFor(req.sid, req.body?.term_id);
  if (!t) return res.status(404).json({ error: "unknown term" });
  if (!q.getFirst.get(req.sid, t.id)) return res.status(409).json({ error: "save the first attempt first" });
  const familiar = (req.body?.familiar ?? []).map((f) => String(f).trim().slice(0, 60)).filter(Boolean).slice(0, 6);
  if (!familiar.length) return res.status(400).json({ error: "name at least one thing you know" });
  const pii = findPersonalData(familiar);
  if (pii) return res.status(400).json({ error: `That looks like a ${pii}. Name public things you know, like brands, films or books.` });
  const log = [];
  const run = async (op, args) => {
    const envelope = await runQloo(req.sid, op, args);
    log.push({ request: { operation: op, args }, envelope });
    return envelope;
  };
  let result;
  if (agentMode() === "live") {
    const lim = take("agent", req.sid);
    if (!lim.ok) return res.status(429).json({ status: "limited", reason: lim.reason, cues: [], trace: [], calls: [] });
    try {
      result = await runCueAgent({ term: t, familiar, run });
      q.logCall.run(req.sid, "anthropic", "cue_agent", result.status, null, null, Date.now());
    } catch (e) {
      q.logCall.run(req.sid, "anthropic", "cue_agent", "error", null, null, Date.now());
      result = { status: "error", reason: e.status ? `Model provider error (${e.status}).` : "Model provider error.", cues: [], trace: [] };
    }
  } else if (MOCK) {
    result = await runSyntheticAgent({ term: t, familiar, run });
  } else {
    result = { status: "unavailable", reason: "The agent isn't configured on this server. Use the reviewed cues below.", cues: [], trace: [] };
  }
  res.json({ ...result, calls: log });
}));

// ---- Learner cue choices (explicit recognition required) ----
app.get("/api/learner/cues/:termId", (req, res) => res.json(q.cuesFor.all(req.sid, req.params.termId)));

// ---- Gloo it: capture -> resolve (libraries first, LLM for close calls/misses) -> lesson ----
// Modes: typed {text} · voice {text} or {pcm16, image?} · camera {image} · ocr {words} (legacy on-device OCR).
// A held mic says either the word ("cholecystokinin") or the wake phrase ("gloo it") over a framed word.
app.post("/api/glue", wrap(async (req, res) => {
  const mode = ["typed", "voice", "ocr", "camera"].includes(req.body?.mode) ? req.body.mode : "typed";
  let text = String(req.body?.text ?? "").slice(0, 120);
  let alternatives = [];
  let transcript = null;
  let captured = mode;
  const image = typeof req.body?.image === "string" && req.body.image.length > 100 ? req.body.image.slice(0, 2_000_000) : null;
  const mime = ["image/jpeg", "image/png", "image/webp"].includes(req.body?.mime) ? req.body.mime : "image/jpeg";

  if (mode === "voice" && typeof req.body?.pcm16 === "string") {
    if (!unlocked(req.sid)) return locked(res);
    if (MOCK) transcript = "gloo it";
    else {
      if ((await sttMode()) !== "google") return res.status(503).json({ error: "Server speech isn't configured.", code: "STT_UNAVAILABLE" });
      const lim = take("stt", req.sid);
      if (!lim.ok) return res.status(429).json({ error: lim.reason });
      const t0 = performance.now();
      try {
        transcript = (await transcribe({ pcm16: req.body.pcm16, hints: SPEECH_HINTS })).transcript;
        q.logCall.run(req.sid, "google-stt", "recognize", transcript ? "ok" : "empty", null, performance.now() - t0, Date.now());
      } catch (e) {
        q.logCall.run(req.sid, "google-stt", "recognize", "error", null, performance.now() - t0, Date.now());
        console.error("stt:", e.message);
        return res.status(502).json({ error: "Couldn't hear that. Try again, or tap Gloo it to read the word.", code: "STT_FAILED" });
      }
    }
  }
  if (mode === "voice") {
    const { wake, rest } = splitWake(transcript ?? text);
    if (rest) text = rest;
    else if (image) captured = "camera"; // "gloo it" over a framed word: read the frame
    else return res.status(422).json({ error: wake ? "Heard “gloo it”, but no word. Say the word, or frame it and tap Gloo it." : "Didn't catch a word. Try again or type it.", transcript });
  }

  if (captured === "camera") {
    if (!image) return res.status(400).json({ error: "image is required" });
    if (!unlocked(req.sid)) return locked(res);
    let read;
    if (MOCK) read = { word: "cholecystokinin", alternatives: ["gallbladder"], confidence: "high" };
    else if (agentMode() !== "live") return res.status(503).json({ error: "Camera reading needs the lesson agent, which isn't configured here." });
    else {
      const lim = take("camera", req.sid);
      if (!lim.ok) return res.status(429).json({ error: lim.reason });
      const t0 = performance.now();
      try { read = await readWord({ image, mime }); q.logCall.run(req.sid, "anthropic", "read_word", read.word ? "ok" : "empty", null, performance.now() - t0, Date.now()); }
      catch (e) { q.logCall.run(req.sid, "anthropic", "read_word", "error", null, performance.now() - t0, Date.now()); console.error("read_word:", e.message);
        return res.status(502).json({ error: "Couldn't read the frame right now. Try again, say it, or type it." }); }
    }
    if (!read.word) return res.status(422).json({ error: "No word in the frame. Get closer and hold steady, or say it." });
    text = read.word;
    alternatives = read.alternatives;
  } else if (mode === "ocr") {
    const words = (Array.isArray(req.body?.words) ? req.body.words : String(text).split(/\s+/)).slice(0, 400).map((w) => String(w).slice(0, 60));
    const picked = pickFromOcr(words);
    if (!picked.pick) return res.status(422).json({ error: "No word found in the photo. Try again closer, or type it." });
    text = picked.pick;
    alternatives = picked.alternatives;
  }
  const pii = findPersonalData(text);
  if (pii) return res.status(400).json({ error: `That looks like a ${pii}. Gloo a word or term instead.` });

  const local = resolveLocal(text, captured === "camera" ? "typed" : mode);
  let best = local.decision === "resolved" ? local.best : null;
  if (!best && local.decision !== "resolved" && local.normalized) {
    if (agentMode() === "live" && unlocked(req.sid)) {
      const lim = take("agent", req.sid);
      if (lim.ok) {
        try { best = await resolveWithLlm(local); q.logCall.run(req.sid, "anthropic", "resolve_term", best ? "ok" : "empty", null, null, Date.now()); }
        catch { q.logCall.run(req.sid, "anthropic", "resolve_term", "error", null, null, Date.now()); }
      }
    }
    // Without the LLM, a reasonable best guess beats a dead end; it is labeled as such.
    if (!best && local.best && local.decision === "ambiguous") best = { ...local.best, method: `${local.best.method} (best guess)` };
    if (!best && local.normalized) best = { word: local.normalized, term_id: null, score: null, method: "as captured" };
  }
  if (!best) return res.status(422).json({ error: "Nothing to gloo. Try a word or short term." });
  const method = captured === "camera" ? `camera · ${best.method}` : best.method;
  q.logResolution.run(req.sid, captured, text, best.word, best.term_id, method, best.score, local.decision, Date.now());

  // Re-check: an LLM answer may name a reviewed lesson.
  const recheck = best.term_id ? null : resolveLocal(best.word).best;
  const reviewed = getTerm(best.term_id ?? (recheck?.method === "exact" ? recheck.term_id : null));
  let termId = reviewed?.id ?? q.provisionalByWord.get(req.sid, best.word)?.id ?? null;
  let created = false;
  if (!termId) {
    if (!unlocked(req.sid)) return locked(res);
    const id = `p-${randomBytes(5).toString("hex")}`;
    let packet;
    if (agentMode() === "live") {
      const lim = take("agent", req.sid);
      if (!lim.ok) return res.status(429).json({ error: lim.reason });
      try { packet = await draftLesson(id, best.word); q.logCall.run(req.sid, "anthropic", "draft_lesson", "ok", null, null, Date.now()); }
      catch (e) { q.logCall.run(req.sid, "anthropic", "draft_lesson", "error", null, null, Date.now()); console.error("draft_lesson:", e.message);
        return res.status(502).json({ error: "Couldn't draft a lesson for that word right now. Try a reviewed lesson." }); }
    } else if (MOCK) {
      packet = syntheticLesson(id, best.word);
    } else {
      return res.status(503).json({ error: "New words need the lesson agent, which isn't configured here. Try a reviewed lesson." });
    }
    q.addProvisional.run(id, req.sid, best.word, packet.origin, JSON.stringify(packet), Date.now());
    termId = id;
    created = true;
  }
  // Spoken capture of a word doubles as the first attempt, saved before anything is shown.
  if (mode === "voice" && captured === "voice" && !q.getFirst.get(req.sid, termId)) {
    const t = termFor(req.sid, termId);
    q.putFirst.run(req.sid, termId, `voice capture: "${text}" (speech-to-text transcript, not a pronunciation score)`, 0, t.version, Date.now());
  }
  res.json({ term_id: termId, created, transcript,
    resolution: { input: text, mode: captured, word: best.word, method, score: best.score, decision: local.decision }, alternatives });
}));

app.post("/api/learner/cues", (req, res) => {
  const t = termFor(req.sid, req.body?.term_id);
  if (!t) return res.status(404).json({ error: "unknown term" });
  const b = req.body;
  if (!t.roles.some((r) => r.id === b.role)) return res.status(400).json({ error: "unknown role" });
  if (b.recognized !== true) return res.status(400).json({ error: "A cue is used only after you confirm you recognize it." });
  const label = String(b.label ?? "").trim().slice(0, 80);
  const connection = String(b.connection ?? "").trim().slice(0, 240);
  if (!label || !connection) return res.status(400).json({ error: "label and connection are required" });
  const pii = findPersonalData([label, connection]);
  if (pii) return res.status(400).json({ error: `That looks like a ${pii}.` });
  const source = ["editorial", "qloo-grounded", "agent (no verified Qloo ID)", "learner", "synthetic"].includes(b.source) ? b.source : "learner";
  q.addCue.run(req.sid, t.id, b.role, label, connection, source, b.qloo_entity_id ?? null, b.qloo_entity_type ?? null, 1, Date.now());
  res.json(q.cuesFor.all(req.sid, t.id));
});

app.patch("/api/learner/cues/:id", (req, res) => {
  const connection = String(req.body?.connection ?? "").trim().slice(0, 240);
  if (!connection) return res.status(400).json({ error: "connection is required" });
  const r = q.editCue.run(connection, Number(req.params.id), req.sid);
  res.status(r.changes ? 200 : 404).json({ updated: r.changes });
});

app.delete("/api/learner/cues/:id", (req, res) => {
  const r = q.removeCue.run(Date.now(), Number(req.params.id), req.sid);
  res.status(r.changes ? 200 : 404).json({ removed: r.changes });
});

// ---- Practice: one prompt at a time, answers held server-side ----
app.get("/api/practice/:termId/next", (req, res) => {
  const t = termFor(req.sid, req.params.termId);
  if (!t) return res.status(404).json({ error: "unknown term" });
  const attempts = q.attemptsFor.all(req.sid, t.id);
  const doneIndependent = new Set(attempts.filter((a) => a.outcome === "correct" && a.independent).map((a) => a.prompt_id));
  const after = req.query.after ? t.prompts.findIndex((p) => p.id === req.query.after) : -1;
  const order = [...t.prompts.slice(after + 1), ...t.prompts.slice(0, after + 1)];
  const next = order.find((p) => !doneIndependent.has(p.id)) ?? order[0];
  res.json({ prompt: publicPrompt(next), remaining: t.prompts.filter((p) => !doneIndependent.has(p.id)).length, total: t.prompts.length });
});

app.post("/api/practice/hint", (req, res) => {
  const found = promptFor(req.sid, req.body?.prompt_id);
  if (!found?.prompt.hint) return res.status(404).json({ error: "no hint" });
  if (!q.openHint.get(req.sid, found.prompt.id)) q.addHint.run(req.sid, found.prompt.id, Date.now());
  res.json({ hint: found.prompt.hint });
});

app.post("/api/attempts", (req, res) => {
  const found = promptFor(req.sid, req.body?.prompt_id);
  if (!found) return res.status(404).json({ error: "unknown prompt" });
  const idem = String(req.body?.idempotency_key ?? "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(idem)) return res.status(400).json({ error: "idempotency_key is required" });
  const prior = q.attemptByKey.get(req.sid, idem);
  if (prior) return res.json({ duplicate: true, outcome: prior.outcome, hinted: Boolean(prior.hinted) });

  const { term, prompt } = found;
  const response = String(req.body?.response ?? "").slice(0, 400);
  const result = assess(prompt, response);
  const hinted = Boolean(q.openHint.get(req.sid, prompt.id));
  const independent = result.outcome === "correct" && !hinted;
  try {
    db.exec("BEGIN IMMEDIATE");
    q.insertAttempt.run(req.sid, term.id, prompt.id, prompt.skill, response, result.outcome, hinted ? 1 : 0, independent ? 1 : 0, term.version, term.review.status, idem, Date.now());
    q.consumeHints.run(req.sid, prompt.id);
    db.exec("COMMIT");
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    if (String(e.message).includes("UNIQUE")) {
      const p = q.attemptByKey.get(req.sid, idem);
      return res.json({ duplicate: true, outcome: p.outcome, hinted: Boolean(p.hinted) });
    }
    throw e;
  }
  res.json({ ...result, hinted, independent, skill: prompt.skill, provisional: Boolean(term.provisional),
    note: hinted && result.outcome === "correct" ? "Correct with a hint: practice, but not independent recall." : null });
});

app.get("/api/progress/:termId", (req, res) => {
  const t = termFor(req.sid, req.params.termId);
  if (!t) return res.status(404).json({ error: "unknown term" });
  const attempts = q.attemptsFor.all(req.sid, t.id);
  const skills = {};
  for (const skill of [...new Set(t.prompts.map((p) => p.skill))]) {
    skills[skill] = deriveSkill(attempts.filter((a) => a.skill === skill), Date.now());
  }
  skills.pronunciation = { state: "not assessed", note: "Speech scoring is not configured in this build." };
  res.json({ term_id: t.id, provisional: Boolean(t.provisional), skills, first_attempt: q.getFirst.get(req.sid, t.id) ?? null });
});

// ---- Learner data controls ----
app.get("/api/diagnostics", (req, res) => res.json({ calls: q.callCounts.all(req.sid) }));
app.get("/api/export", (req, res) => res.json(exportLearner(req.sid)));
app.delete("/api/learner", (req, res) => { deleteLearner(req.sid); res.json({ deleted: true }); });

// Allow-listed passthrough to any Qloo workflow (schemas validated by qloo mcp).
app.post("/api/qloo/:op", wrap(async (req, res) => {
  if (!OPERATIONS.includes(req.params.op)) return res.status(404).json({ error: "unknown operation" });
  const envelope = await runQloo(req.sid, req.params.op, req.body ?? {});
  res.json({ request: { operation: req.params.op, args: req.body ?? {} }, envelope, items: toItems(envelope) });
}));

// Production: serve the built web app from the same origin.
const dist = resolve(repoRoot, "web/dist");
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "That capture is too large. Try again." });
  console.error(err.message); // never log request bodies or headers
  res.status(500).json({ error: "Server error." });
});

app.listen(PORT, () => console.log(`qloo-gloo on :${PORT} · Qloo ${MOCK ? "MOCK" : "live"} · agent ${agentMode()} · engine ${ENGINE}${PASSCODE ? " · passcode gate on" : ""}`));
