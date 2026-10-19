async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.envelope && !data.status) throw new Error(data.error ?? data.reason ?? `HTTP ${res.status}`);
  return data;
}
const get = (p) => req("GET", p);
const post = (p, b) => req("POST", p, b);

export const api = {
  health: () => get("/api/health"),
  terms: () => get("/api/terms"),
  glue: (body) => post("/api/glue", body),
  term: (id) => get(`/api/terms/${id}`),
  firstAttempt: (id, body) => post(`/api/terms/${id}/first-attempt`, body),
  agent: (term_id, familiar) => post("/api/cues/agent", { term_id, familiar }),
  resolve: (entity, type) => post("/api/cues/resolve", { entity, type }),
  cues: (termId) => get(`/api/learner/cues/${termId}`),
  addCue: (body) => post("/api/learner/cues", body),
  editCue: (id, connection) => req("PATCH", `/api/learner/cues/${id}`, { connection }),
  removeCue: (id) => req("DELETE", `/api/learner/cues/${id}`),
  next: (termId, after) => get(`/api/practice/${termId}/next${after ? `?after=${after}` : ""}`),
  hint: (prompt_id) => post("/api/practice/hint", { prompt_id }),
  attempt: (body) => post("/api/attempts", body),
  progress: (termId) => get(`/api/progress/${termId}`),
  exportData: () => get("/api/export"),
  deleteData: () => req("DELETE", "/api/learner"),
};

export const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/[^A-Za-z0-9-]/g, "");
