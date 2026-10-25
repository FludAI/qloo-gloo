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

## Ambient mode

`/edit` opens in its ambient mode once the token is in: the lesson as a grid of
fields under a camera (the design study in `web/public/design/ambient/`, built
in `web/src/edit/Ambient.jsx` with its pure parts in `web/src/edit/ambient/`).
The grid shows the word (title, say, summary), one column per piece (part,
sounds-like, meaning, pick question, four option names) and one per practice
prompt (question, hint, answer). The camera opens on the whole map, waits a
beat, then flies to the first field worth a look and shows one proposal in the
accent color with "was …" underneath. A far move pulls out and settles in two
stages; neighbours dim and blur. The dots under the stage are the queue; the
words across the top are the taste ribbon. **list** at the top right opens the
field list (`/edit?mode=list`), which has an **Ambient** link back; the list
stays the place for everything the grid does not show (IPA, Wikipedia titles,
connection lines, definition, accept lists, versions).

**The queue.** Pending reviewer proposals first (fixes, then improvements, in
grid order), then the fields the console flags on its own (an empty sounds-like,
hint or respelling; a spoken line that is long or carries symbols). Proposals
whose path is off the grid are counted in the whisper ("1 more in the list") and
left for list mode. With no pending list, **review** on the map runs
`POST …/review` and fills the queue; **review again** reruns it.

**In focus.** The candidates for a field are the pending proposals for its
path, ranked by the taste profile, plus whatever the owner asks for: an
instruction ("shorter", "lead with the sound", "make it funnier") calls
`POST …/suggest` for that field and puts the answer first. Any other short
phrase is the field's new text.

| Say, type, press or swipe | Does |
| --- | --- |
| keep · yes · that one · Enter · tap the field | applies the candidate: one `accept` of that proposal with `keep_rest` (the others stay pending), or one PATCH; the new version shows in a toast |
| next · skip · no · → · swipe left | lowers the candidate's tags and shows another; with nothing else to show, moves on |
| back · ← · swipe right | the previous field in the queue |
| undo | a PATCH restoring the previous text (another version), and flies back to it |
| map · Escape · swipe down | the whole lesson |
| review | runs the reviewer |
| a letter key, or the mic released with nothing heard | opens the draft box (typing is the owner's fallback) |

Hold the mic to talk: server speech when the server has it (`/api/transcribe`,
which the owner token opens without a passcode), the browser's recognition
otherwise. Nothing is spoken back; this is the owner working.

**Taste, live.** The profile is a list of `{ tag, weight, source }` seeded with
`short`, `sound`, `plain`; a keep raises the kept candidate's tags, a next lowers
them, an instruction adds its own tag ("funnier" → `fun`), a replacement adds
`own words`. Reviewer proposals carry tags read off them (`rule` for a fix,
`improve`, and `short` or `sound` when the reason or the length says so). It is
kept per browser in `localStorage` (`gloo_editor_taste`) and shown on the
**taste** panel. No Qloo call is made; these tags are the editor's signals and
become Qloo signals when the taste layer returns.

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
mismatch, 503 when the server has no token). The same header also opens the
passcode-gated routes (`/api/transcribe`, `/api/say`), so the console's voice
works for the owner without unlocking the demo. An optional `x-gloo-editor` header
names who made the edit (default `owner`).

| Route | Does |
| --- | --- |
| `POST /api/admin/lessons/:id/review` | `{ instruction? }` → the lesson with `pending { created_at, by, instruction, proposals, notes }`; no version change |
| `POST /api/admin/lessons/:id/proposals/accept` | `{ paths: [...], keep_rest? }` applies those proposals as one PATCH (new version, editor `reviewer via <x-gloo-editor>`) and clears the rest, or with `keep_rest: true` leaves the rest pending; 400 for an unknown path or one without a replacement |
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
| `POST /api/admin/lessons/:id/proposals/accept` | `{ paths, keep_rest? }` → one new version from the chosen proposals; the rest cleared, or kept pending with `keep_rest` |
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
