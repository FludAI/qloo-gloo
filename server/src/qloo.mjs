// One long-lived `qloo mcp` child process, shared by every request.
// The API key never leaves this process: it comes from `qloo setup --qloo`
// (local) or the QLOO_API_KEY secret (server) and is forwarded via env.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const OPERATIONS = [
  "find_tags", "describe", "recommend", "rank", "where_popular",
  "compare_audiences", "entity_tags", "audience_demographics", "trends",
];

let clientPromise = null;

async function connect() {
  const client = new Client({ name: "qloo-gloo", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.env.QLOO_BIN ?? "qloo",
    args: ["mcp"],
    env: process.env, // without this, QLOO_API_KEY / QLOO_BASE_URL are not forwarded
  });
  transport.onclose = () => { clientPromise = null; };
  try {
    await client.connect(transport);
  } catch (error) {
    clientPromise = null;
    if (error.code === "ENOENT") {
      throw new Error("Cannot start `qloo`. Install it: npm install --global @qloo/qloo-harness");
    }
    throw error;
  }
  return client;
}

function getClient() {
  clientPromise ??= connect();
  return clientPromise;
}

// Normalize whatever comes back into the documented envelope shape.
function toEnvelope(result) {
  const env = result?.structuredContent ?? {};
  if (env.status === undefined) {
    return { ...env, status: "error", results: [], result_count: 0,
      error: { code: "UNKNOWN", retryable: false, recovery: "Unexpected MCP result.", ...env.error } };
  }
  return env;
}

export async function callQloo(operation, args) {
  if (!OPERATIONS.includes(operation)) throw new Error(`Unknown operation: ${operation}`);
  // Bounded retry: at most one retry, and only when Qloo says it is retryable.
  for (let attempt = 0; ; attempt++) {
    const client = await getClient();
    const envelope = toEnvelope(await client.callTool({ name: `qloo_${operation}`, arguments: args }));
    if (envelope.status === "error" && envelope.error?.retryable && attempt === 0) {
      await new Promise((r) => setTimeout(r, 750));
      continue;
    }
    return envelope;
  }
}

export async function readiness() {
  const client = await getClient();
  const cap = await client.callTool({ name: "qloo_capabilities", arguments: {} });
  return {
    ready: Boolean(cap.structuredContent?.adapter?.ready),
    contract_version: cap.structuredContent?.contract_version ?? null,
  };
}

// Readiness for health checks: the last known answer, at once, while it is fresh; otherwise a live check raced
// against a short timeout. On timeout the last known value (or false) comes back marked `pending` and the live
// check finishes in the background and fills the cache. Health never waits long on the harness; the first
// caller after a cold start sees `pending` and the next sees the answer.
let lastReadiness = null; // { ready, contract_version, at }
let readinessInFlight = null;
export function resetReadinessCache() { lastReadiness = null; readinessInFlight = null; }
export function readinessCached({ timeoutMs = 1500, maxAgeMs = 5 * 60e3, check = readiness, now = Date.now } = {}) {
  const t = now();
  if (lastReadiness && t - lastReadiness.at < maxAgeMs) return Promise.resolve({ ready: lastReadiness.ready, contract_version: lastReadiness.contract_version, pending: false });
  readinessInFlight ??= check().then((r) => { lastReadiness = { ready: Boolean(r.ready), contract_version: r.contract_version ?? null, at: now() }; return { ready: lastReadiness.ready, contract_version: lastReadiness.contract_version, pending: false }; })
    .catch((e) => ({ ready: false, contract_version: null, pending: false, error: e.message }))
    .finally(() => { readinessInFlight = null; });
  const stale = () => ({ ready: lastReadiness?.ready ?? false, contract_version: lastReadiness?.contract_version ?? null, pending: true });
  if (timeoutMs <= 0) return readinessInFlight;
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(stale()), timeoutMs); });
  return Promise.race([readinessInFlight, timeout]).finally(() => clearTimeout(timer));
}
