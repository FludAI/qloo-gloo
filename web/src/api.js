async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.envelope && !res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export const api = {
  health: () => fetch("/api/health").then((r) => r.json()),
  tags: (query) => post("/api/tags", { query, limit: 6 }),
  anchors: (tag_urns, target_type, operator) => post("/api/anchors", { tag_urns, target_type, operator, limit: 6 }),
  lesson: (concept, tags, anchors) => post("/api/lesson", { concept, tags, anchors }),
};
