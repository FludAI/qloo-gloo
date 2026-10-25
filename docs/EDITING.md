# Editing lessons

Lessons are data, not code. Each lesson is one JSON packet in the media bucket
(`lessons/<id>.json`, indexed by `lessons/index.json`), with an integer `version`,
a `review_status` of `reviewed` or `provisional`, who edited it and when, and the
last 20 versions in `history`. The sample packets in `server/src/content/*.mjs`
seed the store on the first boot; after that the store wins and code never
overwrites a stored lesson. Edits reach learners on save, no deploy needed.

The rule throughout: the AI drafts and suggests, a person decides.

## The console: `/edit`

Open `https://gloo.news/edit` (or `http://localhost:8787/edit` locally), paste the
admin token once (it stays in that browser tab), pick a lesson. Every field is
plain text: title, respelling, IPA, summary, definition; for each piece its part,
say, IPA, sounds-like, meaning, the spoken pick question and the pick options'
names and Wikipedia titles; for each practice prompt the question, hint, answer,
accept lists (a keyword matches literally, `/…/` is a regex) and the expected
number or choice.

- **Ask the AI** beside a field fetches one proposal for that field, using the
  optional instruction box at the top ("shorter", "lead with the sound"). It shows
  under the field with **Accept** / **Discard**. Nothing is saved by asking.
- **Save** sends one merge patch with only what changed and bumps the version.
- **Publish as reviewed** marks a provisional lesson reviewed (confirm first); the
  draft label disappears for every learner.

## The API

All routes need the header `x-gloo-admin: <ADMIN_TOKEN>` (401 without it, 403 on a
mismatch, 503 when the server has no token). An optional `x-gloo-editor` header
names who made the edit (default `owner`).

| Route | Does |
| --- | --- |
| `GET /api/admin/lessons` | id, title, status, version, last editor and time |
| `GET /api/admin/lessons/:id` | the full packet, answers included; history without snapshots |
| `PATCH /api/admin/lessons/:id` | merge patch (below); validates; one new version; learners see it at once |
| `POST /api/admin/lessons/:id/publish` | `review_status` → `reviewed` |
| `POST /api/admin/lessons/:id/suggest` | `{ field, instruction? }` → `{ current, suggestion, reason, saved: false }` |
| `POST /api/admin/lessons/:id/promote` | copies a learner's provisional draft (`p-…`) into the shared store as `provisional`; body `{ id? }` names the new slug (default: the word) |

A patch merges top-level fields (`title`, `summary`, `definition`, `pronunciation`;
lists like `sources` or `distinctions` replace whole) and addresses roles, prompts
and pick options by `id` or `index`, merging the fields given; `null` removes an
optional field. Invalid edits are refused whole with a `problems` list.

```bash
curl -s -X PATCH https://gloo.news/api/admin/lessons/cholecystokinin -H "x-gloo-admin: $ADMIN_TOKEN" -H "content-type: application/json" -d '{"summary":"Chole (bile) + cysto (sac) + kin (movement): the hormone that makes the bile sac move.","roles":[{"id":"chole","meaning":"bile (gall)"}],"prompts":[{"id":"cck-chole","hint":"Cola ≈ chole, approximately.","accept_any":["bile","gall"]}]}'
```

`field` for suggest is a dotted path: `summary`, `pronunciation.ipa`,
`roles.chole.meaning`, `roles.0.pick.question`, `roles.chole.pick.options.1.wiki`,
`prompts.cck-chole.hint`.

## What edits change downstream

- The learner app's `/api/terms` and term payloads carry the new `version`; attempts
  record the version they were scored against.
- The resolver's vocabulary and the speech hints are rebuilt from the new titles
  and aliases.
- A changed `ipa` or `say` changes the SSML, so the clip is synthesized again on
  the next play (a clip marked "sounds right" is never regenerated).
- Pick pictures come from the Wikipedia title; change `wiki` to change the picture.

## Truthfulness

The drafting and suggestion prompts share one rule: claim that "the word already
contains its meaning" only when real morphemes were found (chole = bile); for an
eponym, a loanword or a word whose pieces are only sounds, the summary leads with
the sound hook and then states the meaning plainly. The sample lessons' opening
line is now editable like everything else.
