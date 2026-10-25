#!/usr/bin/env node
// Gloo lessons as MCP tools, so a Claude session can read, patch, review and publish lessons through the owner API.
// stdio transport. Talks HTTP to GLOO_URL (default https://gloo.news) with the token from GLOO_ADMIN_TOKEN (or
// ADMIN_TOKEN) in the environment; the token is never written anywhere. GLOO_EDITOR names the editor (default "mcp").
//
//   GLOO_ADMIN_TOKEN=... npm run mcp            (or let .mcp.json start it for Claude Code in this repo)
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const ID = { type: "string", description: "Lesson id, e.g. cholecystokinin" };
export const TOOLS = [
  { name: "list_lessons", description: "Every lesson in the store: id, title, review status, version, last editor and time.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_lesson", description: "One lesson in full, answers and rubrics included, with its version history (no snapshots) and any pending review proposals.",
    inputSchema: { type: "object", properties: { id: ID }, required: ["id"] } },
  { name: "patch_lesson", description: "Edit a lesson with a JSON merge patch: top-level fields (title, summary, definition, pronunciation {approx, ipa}, lists like distinctions or sources replace whole) and roles / prompts / pick options addressed by id or index, e.g. {\"roles\":[{\"id\":\"chole\",\"say\":\"koh-lee\",\"pick\":{\"options\":[{\"index\":1,\"wiki\":\"Pepsi\"}]}}],\"prompts\":[{\"id\":\"cck-chole\",\"hint\":\"Cola ≈ chole.\"}]}. null removes an optional field. Validated; one new version; learners see it at once.",
    inputSchema: { type: "object", properties: { id: ID, patch: { type: "object", description: "The merge patch" } }, required: ["id", "patch"] } },
  { name: "suggest_field", description: "Ask the lesson AI for a rewrite of one text field. Returns the suggestion; nothing is saved (use patch_lesson to apply it).",
    inputSchema: { type: "object", properties: { id: ID,
      field: { type: "string", description: "Dotted path: summary, pronunciation.ipa, roles.chole.meaning, roles.0.pick.question, roles.chole.pick.options.1.wiki, prompts.cck-chole.hint" },
      instruction: { type: "string", description: "Optional: what to change, e.g. shorter; lead with the sound" } }, required: ["id", "field"] } },
  { name: "review_lesson", description: "Review the whole lesson: deterministic checks (rubrics, pick sounds, say/IPA agreement, length) and then the model, under the product rules. Stores the proposals on the lesson as pending until accept_proposals or discard_proposals. Each proposal: path, before, after, reason, severity (fix | improve).",
    inputSchema: { type: "object", properties: { id: ID, instruction: { type: "string", description: "Optional focus for the review" } }, required: ["id"] } },
  { name: "accept_proposals", description: "Apply the chosen pending proposals (by path) as one new version and clear the rest.",
    inputSchema: { type: "object", properties: { id: ID, paths: { type: "array", items: { type: "string" }, minItems: 1, description: "Proposal paths to apply, e.g. [\"summary\", \"prompts[cck-cysto].answer\"]" } }, required: ["id", "paths"] } },
  { name: "discard_proposals", description: "Clear the pending proposals without applying any.",
    inputSchema: { type: "object", properties: { id: ID }, required: ["id"] } },
  { name: "publish_lesson", description: "Mark a provisional lesson reviewed; the draft label disappears for every learner.",
    inputSchema: { type: "object", properties: { id: ID }, required: ["id"] } },
  { name: "draft_lesson", description: "Draft a new shared lesson for a word with the lesson AI and store it as provisional (review and publish it afterwards).",
    inputSchema: { type: "object", properties: { word: { type: "string", description: "The term to teach" }, id: { type: "string", description: "Optional slug for the new lesson (default: the word)" } }, required: ["word"] } },
];

// HTTP client for the owner API. Throws an Error with .status, .problems on a non-2xx answer.
export function createGlooClient({ url = process.env.GLOO_URL || "https://gloo.news", token = process.env.GLOO_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "", editor = process.env.GLOO_EDITOR || "mcp" } = {}) {
  const base = String(url).replace(/\/+$/, "");
  async function api(method, path, body) {
    if (!token) throw new Error("GLOO_ADMIN_TOKEN is not set in the environment");
    const res = await fetch(`${base}${path}`, {
      method, headers: { "x-gloo-admin": token, "x-gloo-editor": editor, ...(body && { "content-type": "application/json" }) },
      body: body && JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(`${data.error ?? `HTTP ${res.status}`}${data.problems?.length ? `: ${data.problems.join("; ")}` : ""}`); e.status = res.status; e.problems = data.problems ?? []; throw e; }
    return data;
  }
  const lesson = (id) => `/api/admin/lessons/${encodeURIComponent(String(id ?? ""))}`;
  const handlers = {
    list_lessons: () => api("GET", "/api/admin/lessons"),
    get_lesson: ({ id }) => api("GET", lesson(id)),
    patch_lesson: ({ id, patch }) => api("PATCH", lesson(id), patch ?? {}),
    suggest_field: ({ id, field, instruction }) => api("POST", `${lesson(id)}/suggest`, { field, ...(instruction && { instruction }) }),
    review_lesson: ({ id, instruction }) => api("POST", `${lesson(id)}/review`, instruction ? { instruction } : {}),
    accept_proposals: ({ id, paths }) => api("POST", `${lesson(id)}/proposals/accept`, { paths }),
    discard_proposals: ({ id }) => api("POST", `${lesson(id)}/proposals/discard`),
    publish_lesson: ({ id }) => api("POST", `${lesson(id)}/publish`),
    draft_lesson: ({ word, id }) => api("POST", "/api/admin/lessons/draft", { word, ...(id && { id }) }),
  };
  return {
    base, tools: TOOLS,
    // The MCP call result for one tool: JSON text, or an error result the model can read.
    async call(name, args = {}) {
      const fn = handlers[name];
      if (!fn) return { isError: true, content: [{ type: "text", text: `unknown tool ${name}` }] };
      try { return { content: [{ type: "text", text: JSON.stringify(await fn(args ?? {}), null, 2) }] }; }
      catch (e) { return { isError: true, content: [{ type: "text", text: e.message }] }; }
    },
  };
}

export function createMcpServer(client = createGlooClient()) {
  const server = new Server({ name: "gloo-lessons", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: client.tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => client.call(req.params.name, req.params.arguments ?? {}));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = createGlooClient();
  if (!process.env.GLOO_ADMIN_TOKEN && !process.env.ADMIN_TOKEN) console.error("gloo-lessons: GLOO_ADMIN_TOKEN is not set; every tool will fail until it is.");
  console.error(`gloo-lessons: ${client.base}`); // stderr only: stdout is the MCP channel
  await createMcpServer(client).connect(new StdioServerTransport());
}
