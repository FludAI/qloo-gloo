// The envelope's `results` items vary by workflow. Flatten them into a
// predictable {id, name, type, detail} list for the UI and keep the raw item.
const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => v !== undefined && v !== null && v !== "");

export function toItems(envelope) {
  const results = Array.isArray(envelope?.results) ? envelope.results : [];
  return results.map((r, i) => ({
    id: pick(r, ["urn", "tag_id", "entity_id", "id"]) ?? `item-${i}`,
    name: pick(r, ["name", "label", "title"]) ?? "(unnamed)",
    type: pick(r, ["subtype", "type", "tag_type", "entity_type"]) ?? null,
    detail: pick(r, ["explanation", "reason", "description", "summary"]) ?? null,
    score: pick(r, ["affinity", "score", "rank_score", "query_affinity"]) ?? null,
    raw: r,
  }));
}
