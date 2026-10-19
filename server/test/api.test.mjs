// End-to-end API checks against a real server process: mock Qloo, fake model provider.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../src/index.mjs", import.meta.url));
const PORT = 8799;
let fake, proc, calls = 0;

// Fake Anthropic Messages API: one Qloo describe call, then a proposal with one real and one invented ID.
const reply = (content) => ({ id: "msg", type: "message", role: "assistant", model: "fake", stop_reason: "tool_use", content, usage: { input_tokens: 10, output_tokens: 10 } });
before(async () => {
  fake = createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      const offered = (parsed.tools ?? []).map((t) => t.name);
      const forcedTool = ["resolve_term", "draft_lesson", "read_word"].find((n) => offered.includes(n));
      res.setHeader("content-type", "application/json");
      if (forcedTool === "read_word") {
        return res.end(JSON.stringify(reply([{ type: "tool_use", id: "v1", name: "read_word", input: { word: "Cholecystokinin", alternatives: ["gallbladder"], confidence: "high" } }])));
      }
      if (forcedTool === "resolve_term") {
        return res.end(JSON.stringify(reply([{ type: "tool_use", id: "r1", name: "resolve_term", input: { term: "Breyers", reason: "brand name" } }])));
      }
      if (forcedTool === "draft_lesson") {
        return res.end(JSON.stringify(reply([{ type: "tool_use", id: "d1", name: "draft_lesson", input: {
          title: "Peristalsis", pronunciation_approx: "pair-ih-STAL-sis", summary: "peri (around) + stalsis (contraction)",
          definition: "Wave-like muscle contractions that move food through the digestive tract.",
          components: [{ part: "peri", meaning: "around" }, { part: "stalsis", meaning: "contraction" }],
          roles: [{ id: "peri", label: "peri = around", target: "around", look_for: "something that goes around" },
            { id: "stalsis", label: "stalsis = contraction", target: "squeeze", look_for: "something that squeezes" }],
          prompts: [{ skill: "meaning", type: "text", question: "What does peri mean?", accept_any: ["around", "surround"], answer: "Around." },
            { skill: "meaning", type: "text", question: "What does peristalsis do?", accept_all: [["move", "push", "propel"], ["food", "digest"]], answer: "Moves food along." },
            { skill: "transfer", type: "text", question: "Perimeter: what does peri tell you?", accept_any: ["around"], answer: "Around." }],
          sources: [{ label: "bad", url: "javascript:alert(1)" }] } }])));
      }
      calls++;
      const msg = calls === 1
        ? reply([{ type: "tool_use", id: "t1", name: "qloo_describe", input: { entity: "Breyers", type: "brand" } }])
        : reply([{ type: "tool_use", id: "t2", name: "propose_cues", input: { cues: [
            { role: "sound", label: "Breyers", qloo_entity_id: "mock-breyers", qloo_entity_type: "brand", connection_type: "approximate sound", connection: "Breyers ≈ Brier", grounding: "resolved" },
            { role: "endpoints", label: "Invented", qloo_entity_id: "made-up-id", qloo_entity_type: "book", connection_type: "reinforcement", connection: "x", grounding: "y" },
            { role: "not-a-role", label: "Bad", qloo_entity_id: null, connection_type: "meaning", connection: "x", grounding: "y" } ] } }]);
      res.end(JSON.stringify(msg));
    });
  }).listen(8798);
  proc = spawn(process.execPath, [SERVER, "--mock"], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: ":memory:", ANTHROPIC_API_KEY: "test-not-a-key", ANTHROPIC_BASE_URL: "http://localhost:8798" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://localhost:${PORT}/api/terms`); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
});
after(() => { proc?.kill(); fake?.close(); });

const session = () => {
  let cookie = "";
  return async (method, path, body) => {
    const res = await fetch(`http://localhost:${PORT}${path}`, {
      method, headers: { ...(cookie && { cookie }), ...(body && { "content-type": "application/json" }) },
      body: body && JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: await res.json() };
  };
};

test("1: lesson stays locked until the first attempt is saved or skipped", async () => {
  const s = session();
  assert.equal((await s("GET", "/api/terms/brier-score")).body.locked, true);
  assert.equal((await s("POST", "/api/cues/agent", { term_id: "brier-score", familiar: ["Breyers"] })).status, 409);
  await s("POST", "/api/terms/brier-score/first-attempt", { skipped: true });
  assert.equal((await s("GET", "/api/terms/brier-score")).body.locked, false);
});

test("agent: Qloo-returned IDs are kept, invented IDs are stripped, unknown roles dropped", async () => {
  const s = session();
  await s("POST", "/api/terms/brier-score/first-attempt", { response: "forecast accuracy" });
  const { body } = await s("POST", "/api/cues/agent", { term_id: "brier-score", familiar: ["Breyers"] });
  assert.equal(body.status, "ok");
  assert.equal(body.cues.length, 2);
  assert.equal(body.cues[0].qloo_entity_id, "mock-breyers");
  assert.equal(body.cues[0].source, "qloo-grounded");
  assert.equal(body.cues[1].qloo_entity_id, null);
  assert.equal(body.cues[1].source, "agent (no verified Qloo ID)");
  assert.equal(body.calls[0].request.operation, "describe");
});

test("7: a cue needs explicit recognition; it can be edited and removed", async () => {
  const s = session();
  const base = { term_id: "brier-score", role: "sound", label: "Breyers", connection: "sounds like Brier", source: "editorial" };
  assert.equal((await s("POST", "/api/learner/cues", base)).status, 400);
  const list = (await s("POST", "/api/learner/cues", { ...base, recognized: true })).body;
  assert.equal(list.length, 1);
  assert.ok(!("sid" in list[0]));
  assert.equal((await s("PATCH", `/api/learner/cues/${list[0].id}`, { connection: "Brier ≈ Breyers" })).status, 200);
  assert.equal((await s("DELETE", `/api/learner/cues/${list[0].id}`)).status, 200);
  assert.equal((await s("GET", "/api/learner/cues/brier-score")).body.length, 0);
});

test("a favorite pick is saved as the learner's cue for that role", async () => {
  const s = session();
  await s("POST", "/api/terms/cholecystokinin/first-attempt", { skipped: true });
  const term = (await s("GET", "/api/terms/cholecystokinin")).body;
  const role = term.roles.find((r) => r.id === "chole");
  assert.equal(role.pick.options.length, 4);
  assert.ok(role.pick.options.every((o) => /cola|kola/i.test(o.name)));
  const o = role.pick.options[1];
  const list = (await s("POST", "/api/learner/cues", { term_id: "cholecystokinin", role: "chole", label: o.name, connection: o.connection, source: "pick", recognized: true, qloo_entity_type: o.qloo?.type })).body;
  assert.equal(list[0].source, "pick");
  assert.equal(list[0].label, o.name);
});

test("13 + 24: hints block independence; retried submissions settle once", async () => {
  const s = session();
  await s("POST", "/api/terms/brier-score/first-attempt", { skipped: true });
  await s("POST", "/api/practice/hint", { prompt_id: "brier-mean" });
  const a = { prompt_id: "brier-mean", response: "0.065", idempotency_key: "retry-key-0001" };
  const [r1, r2] = await Promise.all([s("POST", "/api/attempts", a), s("POST", "/api/attempts", a)]);
  const fresh = [r1.body, r2.body].filter((r) => !r.duplicate);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].independent, false);
  const prog = (await s("GET", "/api/progress/brier-score")).body.skills.operation;
  assert.equal(prog.attempts, 1);
  assert.equal(prog.independent, 0);
});

test("26: one learner cannot see another's records", async () => {
  const a = session(), b = session();
  await a("POST", "/api/terms/brier-score/first-attempt", { skipped: true });
  await a("POST", "/api/learner/cues", { term_id: "brier-score", role: "sound", label: "Breyers", connection: "c", recognized: true });
  await a("POST", "/api/attempts", { prompt_id: "brier-loss-rain", response: "0.04", idempotency_key: "learner-a-0001" });
  await b("GET", "/api/terms");
  assert.equal((await b("GET", "/api/learner/cues/brier-score")).body.length, 0);
  assert.equal((await b("GET", "/api/export")).body.attempts.length, 0);
  assert.equal((await a("GET", "/api/export")).body.attempts.length, 1);
});

test("27: export and deletion", async () => {
  const s = session();
  await s("POST", "/api/terms/cholecystokinin/first-attempt", { response: "koh-lee-sis-toe-kye-nin" });
  assert.equal((await s("GET", "/api/export")).body.first_attempts.length, 1);
  await s("DELETE", "/api/learner");
  assert.equal((await s("GET", "/api/export")).body.first_attempts.length, 0);
});

test("personal data is blocked before any Qloo call", async () => {
  const s = session();
  await s("POST", "/api/terms/brier-score/first-attempt", { skipped: true });
  assert.equal((await s("POST", "/api/cues/agent", { term_id: "brier-score", familiar: ["me@example.com"] })).status, 400);
  assert.equal((await s("POST", "/api/cues/resolve", { entity: "415-555-1234" })).body.envelope.error.code, "PERSONAL_DATA_BLOCKED");
});

test("gloo it: a misspelled known term opens the reviewed lesson", async () => {
  const s = session();
  const { body } = await s("POST", "/api/glue", { text: "Gloo it cholecystokinen", mode: "typed" });
  assert.equal(body.term_id, "cholecystokinin");
  assert.equal(body.created, false);
  assert.equal(body.resolution.method, "spelling");
});

test("gloo it: a new word gets a provisional lesson owned by this learner", async () => {
  const s = session(), other = session();
  const { body } = await s("POST", "/api/glue", { text: "peristalsis", mode: "typed" });
  assert.match(body.term_id, /^p-[a-f0-9]{10}$/);
  assert.equal(body.created, true);
  assert.equal((await s("GET", `/api/terms/${body.term_id}`)).body.locked, true); // first attempt still first
  await s("POST", `/api/terms/${body.term_id}/first-attempt`, { skipped: true });
  const term = (await s("GET", `/api/terms/${body.term_id}`)).body;
  assert.equal(term.provisional, true);
  assert.equal(term.review.status, "provisional");
  assert.equal(term.sources.length, 0); // non-http source dropped
  assert.ok(!JSON.stringify(term).includes("Moves food along"));
  const r = (await s("POST", "/api/attempts", { prompt_id: `${body.term_id}-q2`, response: "it pushes food through the gut", idempotency_key: "prov-attempt-1" })).body;
  assert.equal(r.outcome, "correct");
  assert.equal(r.provisional, true);
  assert.equal((await other("GET", `/api/terms/${body.term_id}`)).status, 404);
  assert.equal((await s("POST", "/api/glue", { text: "peristalsis", mode: "typed" })).body.created, false);
});

test("gloo it: a spoken capture is saved as the first attempt", async () => {
  const s = session();
  const { body } = await s("POST", "/api/glue", { text: "colla sisto kinin", mode: "voice" });
  assert.equal(body.term_id, "cholecystokinin");
  assert.equal(body.resolution.method, "sound-alike");
  const t = (await s("GET", "/api/terms/cholecystokinin")).body;
  assert.equal(t.locked, false);
  assert.match(t.first_attempt_record.response, /colla sisto kinin/);
});

test("gloo it: a camera crop is read and resolved to the reviewed lesson", async () => {
  const s = session();
  const { status, body } = await s("POST", "/api/glue", { mode: "camera", image: "x".repeat(200), mime: "image/jpeg" });
  assert.equal(status, 200);
  assert.equal(body.term_id, "cholecystokinin");
  assert.equal(body.resolution.mode, "camera");
  assert.match(body.resolution.method, /^camera/);
  assert.equal((await s("GET", "/api/terms/cholecystokinin")).body.locked, true); // a photo is not a first attempt
});

test("gloo it: the wake phrase alone over a framed word reads the frame; with a word it uses the word", async () => {
  const s = session();
  const a = (await s("POST", "/api/glue", { mode: "voice", text: "gloo it", image: "x".repeat(200) })).body;
  assert.equal(a.term_id, "cholecystokinin");
  assert.equal(a.resolution.mode, "camera");
  const b = (await s("POST", "/api/glue", { mode: "voice", text: "Gloo it, brier score", image: "x".repeat(200) })).body;
  assert.equal(b.term_id, "brier-score");
  assert.equal(b.resolution.mode, "voice");
  assert.equal((await s("POST", "/api/glue", { mode: "voice", text: "glue it" })).status, 422);
});

test("health reports capture capabilities and the gate state", async () => {
  const s = session();
  const h = (await s("GET", "/api/health")).body;
  assert.equal(h.gated, false);
  assert.equal(h.unlocked, true);
  assert.equal(h.stt, "mock");
  assert.equal((await s("POST", "/api/unlock", { code: "anything" })).body.unlocked, true);
});

test("gloo it: close calls go to the LLM backup", async () => {
  const s = session();
  const { body } = await s("POST", "/api/glue", { text: "breyer", mode: "voice" });
  assert.equal(body.resolution.decision, "ambiguous");
  assert.equal(body.resolution.method, "ai");
  assert.equal(body.resolution.word, "breyers");
});
