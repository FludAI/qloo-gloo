// Gloo adapter: the integration seam between Qloo taste evidence and Gloo's
// learning engine. Gloo's proprietary core is NOT in this repository; this
// open default builds a transparent lesson scaffold so the project runs and
// is reproducible from a clean environment.
//
// Contract: buildLesson({ concept, tags, anchors }) -> Lesson
//   concept: string the learner wants to understand
//   tags:    confirmed Qloo tags [{ id, name, type }]
//   anchors: Qloo recommendation items [{ id, name, type, score }]

const REVIEW_DAYS = [1, 3, 7, 21]; // expanding-interval review schedule

export function buildLesson({ concept, tags = [], anchors = [] }) {
  const hooks = anchors.slice(0, 3).map((a, i) => ({
    anchor: a.name,
    anchor_type: a.type,
    role: ["intuition", "mechanism", "transfer"][i],
    prompt:
      i === 0
        ? `Explain the core idea of "${concept}" using ${a.name} as the familiar frame.`
        : i === 1
          ? `Map each moving part of "${concept}" to something concrete in ${a.name}.`
          : `Where does the ${a.name} analogy break down for "${concept}"? Name the limit.`,
    // Provenance: the anchor came from Qloo aggregate affinity, not the learner's history.
    evidence: { source: "qloo_recommend", entity_id: a.id, affinity: a.score ?? null },
  }));

  return {
    concept,
    taste_profile: tags.map((t) => ({ id: t.id, name: t.name, type: t.type })),
    hooks,
    review_schedule_days: REVIEW_DAYS,
    engine: "gloo-open-default",
    caveat:
      "Anchors reflect what groups who like these tags tend to enjoy (Qloo aggregate affinity). " +
      "They are a starting frame, not a prediction about this learner.",
  };
}
