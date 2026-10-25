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
- **Review this lesson** (the Review section near the bottom) runs the reviewer
  over the whole lesson and lists its proposals, each with the field path, before,
  after, a reason and a severity (`fix`: a rule is broken; `improve`: better, not
  required). Tick the ones you want and **Accept selected**: they land as one new
  version, edited by `reviewer via <you>`. **Discard** clears the rest. A finding
  marked `!` has no replacement (the model could not or did not supply one); fix
  it by hand. Proposals wait on the lesson until you decide, through any client,
  and never reach learners.

## The reviewer

`server/src/reviewer.mjs` reviews one lesson in two passes and ends in proposals,
never in a save. The deterministic pass runs first and is reported even when the
model is unavailable or fails:

| Check | Flags |
| --- | --- |
| Meaning claim | a summary that says the word "contains its meaning" while the lesson lists no components with meanings (`fix`); with components, the model is asked to confirm they are real morphemes |
| Pick options | for a sound role, an option whose name (or spoken forms) does not sound like the piece, scored as the first-attempt scorer scores pieces (`fix`); for a meaning role, a connection line that never mentions the part or its meaning (`improve`); any option without a Wikipedia title (`improve`) |
| say / IPA | a respelling and an IPA that describe different sounds, for each piece and the whole word (`fix`) |
| Answers | a stored answer that fails its own rubric: text through `assess()`, a number answer that never states `expected`, a choice answer that doesn't name the expected option (`fix`) |
| Speakable | a summary over two sentences or with symbols a voice reads badly (≈ → + = /), a pick question that isn't a short spoken sentence, a long practice question (`improve`) |

The model (one call, `review_lesson` tool, same truthfulness rule as the drafter)
is then given the lesson, the flagged findings and the owner's instruction, and
asked to supply a replacement for each flag and to add its own proposals under the
product rules. Its output is checked before it is shown: the path has to be one
the patch grammar can express, before and after must differ, the patched lesson
must validate, and a proposed answer must pass its rubric. Anything dropped is
named in the `notes`.

## Reviewing through the API

All routes need the header `x-gloo-admin: <ADMIN_TOKEN>` (401 without it, 403 on a
mismatch, 503 when the server has no token). An optional `x-gloo-editor` header
names who made the edit (default `owner`).

| Route | Does |
| --- | --- |
| `POST /api/admin/lessons/:id/review` | `{ instruction? }` → the lesson with `pending { created_at, by, instruction, proposals, notes }`; no version change |
| `POST /api/admin/lessons/:id/proposals/accept` | `{ paths: [...] }` applies those proposals as one PATCH (new version, editor `reviewer via <x-gloo-editor>`) and clears the rest; 400 for an unknown path or one without a replacement |
| `POST /api/admin/lessons/:id/proposals/discard` | clears `pending` |
| `POST /api/admin/lessons/draft` | `{ word, id? }` drafts a new shared lesson with the lesson agent and stores it `provisional` (201); 409 if the id exists |

Proposal paths: `summary`, `pronunciation.ipa`, `roles[chole].say`,
`roles[chole].pick.question`, `roles[chole].pick.options[2].wiki`,
`prompts[cck-chole].answer`, or a whole list such as `distinctions`.

## From a Claude session: the MCP server

`scripts/gloo-lessons-mcp.mjs` offers the owner API as MCP tools over stdio:
`list_lessons`, `get_lesson`, `patch_lesson`, `suggest_field`, `review_lesson`,
`accept_proposals`, `discard_proposals`, `publish_lesson`, `draft_lesson`. It
talks HTTP to `GLOO_URL` (default `https://gloo.news`) with the token from
`GLOO_ADMIN_TOKEN` (or `ADMIN_TOKEN`) in its environment; `GLOO_EDITOR` names
the editor (default `mcp`). The token is never written to a file: `.mcp.json` in
the repo root registers the server for Claude Code with only the URL, so the token
has to be in the shell that starts Claude Code:

```bash
export GLOO_ADMIN_TOKEN="$(grep '^ADMIN_TOKEN=' .env | cut -d= -f2-)"
```

Then, in Claude Code opened in this repo, the `gloo-lessons` tools are available
("review cholecystokinin and accept the fixes"). `node` on the PATH has to be Node
22; against a local server set `GLOO_URL=http://localhost:8787`. `npm run mcp`
starts the same server by hand.

## The owner API, in full

| Route | Does |
| --- | --- |
| `GET /api/admin/lessons` | id, title, status, version, last editor and time |
| `GET /api/admin/lessons/:id` | the full packet, answers included; history without snapshots |
| `PATCH /api/admin/lessons/:id` | merge patch (below); validates; one new version; learners see it at once |
| `POST /api/admin/lessons/:id/publish` | `review_status` → `reviewed` |
| `POST /api/admin/lessons/:id/suggest` | `{ field, instruction? }` → `{ current, suggestion, reason, saved: false }` |
| `POST /api/admin/lessons/:id/promote` | copies a learner's provisional draft (`p-…`) into the shared store as `provisional`; body `{ id? }` names the new slug (default: the word) |
| `POST /api/admin/lessons/:id/review` | reviews the lesson; stores `pending` proposals (above) |
| `POST /api/admin/lessons/:id/proposals/accept` | `{ paths }` → one new version from the chosen proposals |
| `POST /api/admin/lessons/:id/proposals/discard` | clears the proposals |
| `POST /api/admin/lessons/draft` | `{ word, id? }` → a new provisional lesson from the lesson agent |

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
