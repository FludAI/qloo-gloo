// End-to-end check against a running server: health -> lesson -> practice -> agent.
// Usage: npm run smoke            (http://localhost:8787)
//        SMOKE_URL=https://your-demo.run.app npm run smoke
const BASE = process.env.SMOKE_URL ?? "http://localhost:8787";
// Cookie jar keyed by name: hosts like Cloud Run add their own cookies (e.g. session affinity) alongside gloo_sid.
const jar = new Map();
async function call(method, path, body) {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(BASE + path, {
    method, headers: { ...(cookie && { cookie }), ...(body && { "content-type": "application/json" }) },
    body: body && JSON.stringify(body),
  });
  for (const set of res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean)) {
    const [k, v] = set.split(";")[0].split("=");
    if (k) jar.set(k.trim(), v ?? "");
  }
  return { status: res.status, body: await res.json() };
}
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) process.exitCode = 1; };

const health = (await call("GET", "/api/health")).body;
console.log("health:", JSON.stringify({ qloo: health.qloo, agent: health.agent }));
ok((await call("GET", "/api/terms/brier-score")).body.locked === true, "lesson locked before first attempt");
await call("POST", "/api/terms/brier-score/first-attempt", { response: "how good a forecast was" });
ok((await call("GET", "/api/terms/brier-score")).body.locked === false, "lesson unlocks after first attempt");
const a = (await call("POST", "/api/attempts", { prompt_id: "brier-mean", response: "0.065", idempotency_key: `smoke-${Date.now()}` })).body;
ok(a.outcome === "correct" && a.independent, "Brier mean 0.065 scored correct and independent");

const g = (await call("POST", "/api/glue", { text: "Gloo it, cholecystokinen", mode: "typed" })).body;
ok(g.term_id === "cholecystokinin" && g.resolution.method === "spelling", "Gloo it resolves a typo to the reviewed lesson without AI");

const describe = (await call("POST", "/api/cues/resolve", { entity: "Breyers", type: "brand" })).body;
console.log(`qloo describe(Breyers) -> ${describe.envelope.status}:`, describe.envelope.error ? `${describe.envelope.error.code}: ${describe.envelope.summary}` : describe.items.slice(0, 3).map((i) => `${i.name} [${i.id}]`));
ok(describe.envelope.status !== "error", "Qloo describe reachable");

const agent = (await call("POST", "/api/cues/agent", { term_id: "brier-score", familiar: ["Breyers", "Moneyball"] })).body;
console.log(`agent -> ${agent.status}${agent.model ? ` (${agent.model})` : ""}`);
for (const s of agent.trace ?? []) console.log(`   ${s.tool} ${JSON.stringify(s.args)} -> ${s.status} · ${s.result_count}`);
for (const c of agent.cues ?? []) console.log(`   cue [${c.role}] ${c.label} · ${c.source}: ${c.connection}`);
ok(["ok", "unavailable"].includes(agent.status), "agent returned a usable state");
await call("DELETE", "/api/learner");
