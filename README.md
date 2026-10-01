# qloo-gloo

**Gloo × Qloo: taste-anchored learning.** An open extension for
[Gloo](https://gloo.news) built for the Qloo Agentic Hackathon.

Gloo helps people learn complex concepts faster and retain them longer. This
extension uses Qloo's aggregate taste data to choose the *frames* a lesson is
taught through: a learner names a concept ("compound interest") and a taste
expressed as a concept ("jazz"), confirms which Qloo tag they mean, and Gloo
builds analogy hooks around entities that people with that taste tend to enjoy.

> Gloo's proprietary learning engine is not in this repository. `server/src/gloo.mjs`
> is the integration seam and ships an open default so the project runs end to end.

## How it works

```
Browser (React + Vite)          Backend (Express, Node 22)           Qloo
───────────────────────         ───────────────────────────          ─────────────────────
concept + interest word  ─────▶ PII guard ─▶ cache ─▶ qloo mcp ────▶ qloo_find_tags
learner confirms tag(s)  ─────▶                       qloo mcp ────▶ qloo_recommend
                         ─────▶ gloo.buildLesson(concept, tags, anchors)   (no Qloo call)
provenance panel        ◀────── {request, envelope, items}
```

- The browser never sees a Qloo key. It calls `/api/*` on our backend only.
- The backend keeps one long-lived `qloo mcp` process and forwards `process.env`.
- Inputs that look like emails, phone numbers, or device IDs are blocked before
  any Qloo call (`server/src/guard.mjs`).
- Successful results are cached for 30 minutes; retries happen at most once and
  only when Qloo marks an error `retryable`.
- All six envelope statuses (`ok`, `empty`, `needs_input`, `partial`,
  `degraded`, `error`) are shown to the user as they are.

## Setup from a clean environment

Requires Node.js 22.19+ and an event-issued Qloo key.

```sh
npm install --global @qloo/qloo-harness   # needs 0.1.26+
export QLOO_BASE_URL=https://hackathon.api.qloo.com
export QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com
qloo setup --qloo        # key stays in the harness's private config
qloo setup --status      # expect "Qloo data: ready"

git clone <this repo> qloo-gloo && cd qloo-gloo
cp .env.example .env
npm install
npm run dev              # server :8787, web :5173
npm run smoke            # in a second terminal: tags -> anchors -> lesson
```

No key yet? `npm run dev:mock` serves clearly labeled fixture data so you can
work on the UI. Mock results are never presented as Qloo data.

## API

| Route | Qloo workflow | Purpose |
| --- | --- | --- |
| `GET /api/health` | `qloo_capabilities` | Readiness, no Qloo call |
| `POST /api/tags` `{query}` | `find_tags` | Candidate tags for an interest word |
| `POST /api/anchors` `{tag_urns, target_type}` | `recommend` | Entities that taste cluster tends to like |
| `POST /api/lesson` `{concept, tags, anchors}` | none | Gloo lesson scaffold |
| `POST /api/qloo/:op` | any of the nine | Allow-listed passthrough for other workflows |

## Deploy

Run the server on a VM or container with Node 22.19+, the harness installed,
and `QLOO_API_KEY` set as a secret. Serverless functions are not supported by
`qloo mcp`. Serve `web/dist` statically (or from the same server) and point it
at the backend.

## Limitations

- Anchors reflect aggregate affinity for a tag, not an individual learner's
  preferences, identity, or future behavior.
- A semantic tag match is a candidate. The UI requires the learner to confirm it.
- The open lesson builder is a template; lesson quality in production comes from
  Gloo's engine.
- The PII guard catches common patterns only. The UI asks for concepts, not
  personal details.

## License

MIT. See [LICENSE](LICENSE).
