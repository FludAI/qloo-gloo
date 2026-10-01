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
