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
      calls++;
      const msg = calls === 1
        ? reply([{ type: "tool_use", id: "t1", name: "qloo_describe", input: { entity: "Breyers", type: "brand" } }])
        : reply([{ type: "tool_use", id: "t2", name: "propose_cues", input: { cues: [
            { role: "sound", label: "Breyers", qloo_entity_id: "mock-breyers", qloo_entity_type: "brand", connection_type: "approximate sound", connection: "Breyers ≈ Brier", grounding: "resolved" },
            { role: "endpoints", label: "Invented", qloo_entity_id: "made-up-id", qloo_entity_type: "book", connection_type: "reinforcement", connection: "x", grounding: "y" },
            { role: "not-a-role", label: "Bad", qloo_entity_id: null, connection_type: "meaning", connection: "x", grounding: "y" } ] } }]);
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify(msg));
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
