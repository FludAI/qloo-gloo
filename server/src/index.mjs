import express from "express";
import { callQloo, readiness, OPERATIONS } from "./qloo.mjs";
import { findPersonalData } from "./guard.mjs";
import { cached, remember } from "./cache.mjs";
import { toItems } from "./normalize.mjs";
import { mockQloo } from "./mock.mjs";
import { buildLesson } from "./gloo.mjs";

const MOCK = process.env.QLOO_MOCK === "1" || process.argv.includes("--mock");
const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json({ limit: "32kb" }));

async function run(op, args) {
  const pii = findPersonalData(args);
  if (pii) {
    return { status: "error", summary: `Blocked: input looks like it contains a ${pii}.`, results: [], result_count: 0,
      error: { code: "PERSONAL_DATA_BLOCKED", retryable: false, recovery: "Use aggregate concepts and public cultural signals only." } };
  }
  if (MOCK) return mockQloo(op, args);
  const hit = cached(op, args);
  if (hit) return { ...hit, cache: "hit" };
  const envelope = await callQloo(op, args);
  remember(op, args, envelope);
  return envelope;
}

const reply = (res, request, envelope) =>
  res.status(envelope.status === "error" ? 502 : 200).json({ request, envelope, items: toItems(envelope) });

app.get("/api/health", async (_req, res) => {
  if (MOCK) return res.json({ mode: "mock", qloo_ready: false });
  try {
    res.json({ mode: "live", qloo_ready: (await readiness()).ready, base_url: process.env.QLOO_BASE_URL ?? null });
  } catch (e) {
    res.status(500).json({ mode: "live", qloo_ready: false, error: e.message });
  }
});

// Step 1: resolve a learner's interest word into candidate tags. The UI must
// show these and let the learner confirm one; we never auto-pick.
app.post("/api/tags", async (req, res, next) => {
  try {
    const query = String(req.body?.query ?? "").trim().slice(0, 80);
    if (!query) return res.status(400).json({ error: "query is required" });
    const request = { operation: "find_tags", args: { query, limit: Math.min(Number(req.body?.limit ?? 6), 20) } };
    reply(res, request, await run(request.operation, request.args));
  } catch (e) { next(e); }
});

// Step 2: confirmed tag URNs -> entities that taste cluster tends to like.
app.post("/api/anchors", async (req, res, next) => {
  try {
    const tags = (req.body?.tag_urns ?? []).filter((t) => typeof t === "string").slice(0, 10);
    if (!tags.length) return res.status(400).json({ error: "tag_urns is required" });
    const request = { operation: "recommend", args: {
      target_type: req.body?.target_type ?? "movie",
      signal_tags: tags,
      signal_tags_operator: req.body?.operator === "intersection" ? "intersection" : "union",
      explain: true,
      limit: Math.min(Number(req.body?.limit ?? 6), 20),
    } };
    reply(res, request, await run(request.operation, request.args));
  } catch (e) { next(e); }
});

// Step 3: hand the evidence to the Gloo adapter (no Qloo call).
app.post("/api/lesson", (req, res) => {
  const concept = String(req.body?.concept ?? "").trim().slice(0, 140);
  if (!concept) return res.status(400).json({ error: "concept is required" });
  res.json(buildLesson({ concept, tags: req.body?.tags ?? [], anchors: req.body?.anchors ?? [] }));
});

// Escape hatch for the other workflows (allow-listed; schemas validated by qloo mcp).
app.post("/api/qloo/:op", async (req, res, next) => {
  try {
    const op = req.params.op;
    if (!OPERATIONS.includes(op)) return res.status(404).json({ error: `unknown operation ${op}` });
    const request = { operation: op, args: req.body ?? {} };
    reply(res, request, await run(op, request.args));
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`qloo-gloo server on :${PORT} (${MOCK ? "MOCK" : "live"} mode)`));
