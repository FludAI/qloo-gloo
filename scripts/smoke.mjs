// End-to-end check of the backend flow: tags -> anchors -> lesson.
// Usage: start the server (npm run dev or dev:mock), then `npm run smoke [interest]`.
const BASE = process.env.SMOKE_URL ?? "http://localhost:8787";
const interest = process.argv[2] ?? "jazz";
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
console.log("health:", health);

const tags = await post("/api/tags", { query: interest });
console.log(`find_tags(${interest}) -> ${tags.envelope.status}:`, tags.items.map((t) => `${t.name} [${t.type}]`));
if (!tags.items.length) process.exit(1);

// A real UI makes the learner confirm; the smoke test takes the first candidate.
const chosen = tags.items.slice(0, 1);
const anchors = await post("/api/anchors", { tag_urns: chosen.map((t) => t.id), target_type: "movie" });
console.log(`recommend -> ${anchors.envelope.status}:`, anchors.items.map((a) => a.name));

const lesson = await post("/api/lesson", { concept: "compound interest", tags: chosen, anchors: anchors.items });
console.log("lesson hooks:", lesson.hooks?.map((h) => `${h.role}: ${h.anchor}`));

const blocked = await post("/api/tags", { query: "someone@example.com" });
console.log("PII guard:", blocked.envelope.error?.code);
process.exit(blocked.envelope.error?.code === "PERSONAL_DATA_BLOCKED" ? 0 : 1);
