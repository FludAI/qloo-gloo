# Devpost form, field by field

Copy each block into the matching field. The passcode is never written here: add it to the
"Try it out" link yourself as `?code=…` right before submitting.

## Project name (60)

```
Gloo
```

## Elevator pitch (200)

```
Point your camera at a hard word, say "gloo it", and hear it in pieces, each hooked to something you already love. Qloo's taste graph picks the hooks; the word sticks.
```

Alternative, shorter:

```
Hard words, glued to your taste. Frame a word, say "gloo it", pick your cola. Qloo chooses the hooks that stick to you.
```

## Built with (tags)

```
javascript, node.js, react, vite, tailwind, express, sqlite, qloo, qloo-api, mcp, claude, anthropic, google-cloud-run, google-cloud-storage, google-speech-to-text, google-text-to-speech, ssml, ipa, web-audio, mediadevices, web-animations, docker
```

## "Try it out" links

```
https://gloo.news/?code=<passcode>
https://github.com/FludAI/qloo-gloo
```

## Video demo link

_Record on a phone over a printed word: gate, frame, "gloo it", the pieces, two pick cards, the paw lighting per syllable, practice, progress. Under two minutes._

## Project story (Markdown)

```markdown
## Inspiration

Hard words do not stick because they are long. They slip because nothing in your life is attached to them. *Cholecystokinin* is six syllables of nothing until the first piece, *chole*, is your cola. Then it is bile, and you never lose it again.

Gloo started from that: pull the meaning that is already inside a word (*chole* = bile, *cysto* = sac, *kin* = movement), then attach every piece to something the learner already loves. A gecko holds a wall with millions of tiny contacts, not one strong glue. Our logo is a gecko paw, and every toe is a syllable.

The Qloo hackathon asked for cultural grounding. That was the missing half. An LLM can invent an analogy, but it guesses what you know. Qloo knows what people with your taste actually recognize.

## What it does

Gloo is a camera overlay, like a lens for words. No typing anywhere.

1. **Frame a hard word** on a page or a screen, tap, or say "gloo it". The server reads the crop and resolves the word.
2. **Say it first.** A first attempt is captured by voice and scored by sound, piece by piece, in the background.
3. **Pieces before definitions.** Each sound piece is a pick card: four pictures that all carry the sound. "Which cola is yours?" for *chole*. Any pick is right. The pick is the memory hook.
4. **Hear it.** One server voice says every piece from stored IPA, and the gecko paw lights a toe per syllable from Google's per-syllable time points. When you say it back, the toes light from your own voice and settle to gold for the pieces you got.
5. **The hooks learn your taste.** From your second pick on, Qloo ranks the next cards for you: the options stay the reviewer's sound-carrying pictures, but the likeliest favorites come first. Your progress card says "3 of your 4 hooks came from your taste."
6. **Practice without the hooks.** One spoken question at a time. Scoring is deterministic and server-side, and a hinted answer never counts as independent recall.

## How we built it

- **Qloo**: `describe` resolves each pick's public entity once and the ID is kept in our store. `rank` reorders the next pick cards with the learner's picks as signals, one call per piece and entity type, cached a week. Nothing is ever written to Qloo, and nothing personal goes to it; a signal is a public entity ID. A cue agent (Claude with Qloo tools behind MCP) proposes cues beyond the cards, keeping only IDs Qloo returned.
- **Voice**: Google Text-to-Speech with SSML phonemes from IPA stored per piece, so *chole* is said as its hook, cola, every time, and SSML marks give the per-syllable timing for the paw. Google Speech-to-Text hears answers with the prompt's expected words as context, so "bile" is bile and not "Bayou".
- **Lessons as data**: every lesson is versioned JSON in a bucket, with an owner console, a reviewer agent that proposes fixes, and an MCP server so other agents can edit and test lessons.
- **Stack**: React and Vite on the front, Express on Node 22 with SQLite as a hot cache, Cloud Run with one warm instance, Cloud Storage for clips, pictures and lessons.

## Challenges we ran into

- **Qloo's graph is sparse where learning lives.** A word's domain tags predicted nothing: "hormones" returned random comedies with flat affinities. Tastes are entities, not topics. So the loop is built on the learner's picks, and a word alone only decides which kinds of hooks to offer.
- **`recommend` versus `rank`.** Recommendations rarely carry a piece's sound. Ranking our own sound-checked options kept the sound and used the taste.
- **Names Qloo cannot see.** RC Cola and Inca Kola are not in the brand graph, and "Sisters" is ambiguous. The loop takes the exact-name candidate, remembers dead names, and leaves editorial order when in doubt.
- **The voice said "chole" three ways.** Fixed by pinning each piece to IPA and the hook's sound, then making the reviewer accept a hook-pinned piece as deliberate.
- **Credits are finite.** A global daily cap, a reserve, a week-long cache, and no call before the second pick.

## What we learned

The word is a node, not a label. A word by itself predicts nothing about taste, but a learner, a word and two picks form a position in a graph that gets strong fast. Qloo seeds it; the learners' own picks and practice outcomes are what the Gloo Graph will run on.

## What's next

- Open the proposal path, so other people and agents improve lessons and are rewarded on learner outcomes, not acceptance.
- A stage label from the learner's path through words (exploration to graduation to chief), and Qloo audiences to name the clusters.
- Randomize taste against editorial hooks for a share of learners and measure which stick, with the paw's syllable scores as the outcome.
- Smart glasses as the first-class surface: the whole UI is already light on black, square, and spoken.
```
