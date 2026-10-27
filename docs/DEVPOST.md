# Devpost form, field by field

Copy each block into the matching field. The demo is ungated (no passcode) since Oct 27.

## Project name (60)

```
Gloo
```

## Elevator pitch (200)

```
Make hard words stick using the culture you love. Point your camera, say “Gloo it,” and turn unfamiliar words into unforgettable connections.
```

## Built with (tags)

```
javascript, node.js, react, vite, tailwind, express, sqlite, qloo, qloo-api, mcp, claude, anthropic, google-cloud-run, google-cloud-storage, google-speech-to-text, google-text-to-speech, ssml, ipa, web-audio, mediadevices, web-animations, docker
```

## "Try it out" links

```
https://gloo.news
https://github.com/FludAI/qloo-gloo
```

## Video demo link

_Record on a phone over a printed word: gate, frame, "gloo it", the pieces, two pick cards, the paw lighting per syllable, practice, progress. Under two minutes._

## Project story (Markdown)

```markdown
## Inspiration

Hard words do not fail to stick because they are long. They fail because nothing you love is attached to them. *Cholecystokinin* is six syllables of nothing until its first piece, *chole*, becomes your cola. Then it is bile, and it is yours.

That is the whole idea of Gloo. Pull out the meaning a word already carries (*chole* = bile, *cysto* = sac, *kin* = movement), then connect each piece to the culture you love. The gecko on our logo holds a wall with millions of tiny contacts, not one strong glue, and every toe of its paw is a syllable.

The Qloo hackathon asked for real cultural grounding. That was the half we were missing. An LLM can invent an analogy, but it guesses at what you love. Qloo knows what people with your taste actually recognize, so the connections are yours before you make them.

## What it does

Gloo is a camera overlay, like a lens for words. No typing, no reading, no forms.

1. **Point your camera** at a word on a page or a screen and say "Gloo it".
2. **Say it first.** Your attempt is scored by sound, piece by piece, in the background. A guess is fine.
3. **Meet the pieces.** Each sound piece is a card of four pictures from the culture you love, and all four carry the sound. "Which cola is yours?" is *chole*. Any pick is right, and your pick becomes the connection.
4. **Hear it stick.** One voice says every piece from stored pronunciation, and the gecko paw lights a toe per syllable in time with the voice. Say it back and the toes light from your own voice, then turn gold for the pieces you got.
5. **The culture learns you.** From your second pick on, Qloo ranks the next cards for your taste. The pictures stay the ones that carry the sound; the ones you are likeliest to love come first. Your progress card says "3 of your 4 hooks came from your taste."
6. **Practice without the hooks.** One spoken question at a time, scored on the server, so an unfamiliar word becomes an unforgettable one on its own.

## How we built it

- **Qloo, the taste behind the connections.** `describe` resolves each pick's public entity once and keeps the ID in our store. `rank` reorders the next cards with the learner's picks as signals, one call per piece and entity type, cached a week. Nothing is written to Qloo and nothing personal reaches it; a signal is a public entity ID. A cue agent (Claude with Qloo tools behind MCP) proposes connections beyond the cards, keeping only IDs Qloo returned.
- **The voice.** Google Text-to-Speech with SSML phonemes from IPA stored per piece, so *chole* is said as its hook, cola, every time, and SSML marks give the per-syllable timing that lights the paw. Google Speech-to-Text hears answers with the prompt's expected words as context, so "bile" is heard as bile and not "Bayou".
- **Lessons as data.** Every lesson is versioned JSON in a bucket, with an owner console that works over the camera, a reviewer agent that proposes fixes, and an MCP server so other agents can edit and test lessons.
- **The stack.** React and Vite on the front, Express on Node 22 with SQLite as a hot cache, Cloud Run with one warm instance, Cloud Storage for clips, pictures and lessons.

## Challenges we ran into

- **Culture is entities, not topics.** A word's domain tags predicted nothing: "hormones" returned random comedies with flat affinities. So the loop runs on the learner's picks, and a word alone only decides which kinds of culture to offer.
- **`recommend` versus `rank`.** Recommendations rarely carry a piece's sound. Ranking our own sound-checked pictures kept the sound and used the taste.
- **Names Qloo cannot see.** RC Cola and Inca Kola are not in the brand graph, and "Sisters" is ambiguous. The loop takes the exact-name candidate, remembers dead names, and keeps the editorial order when in doubt.
- **The voice said "chole" three ways.** Fixed by pinning each piece to IPA and its hook's sound, and teaching the reviewer that a hook-pinned piece is deliberate.
- **Credits are finite.** A global daily cap, a reserve, a week-long cache, and no call before the second pick.

## What we learned

A word by itself predicts nothing about taste. A learner, a word and two picks form a position in a graph that gets strong fast. Qloo seeds it; the learners' own picks and what they recall are what the Gloo Graph will run on. Stickiness is a property of connections, not of words.

## What's next

- Open the proposal path, so other people and agents improve lessons and are rewarded on what learners recall, not on acceptance.
- A stage label from each learner's path through words (exploration to graduation to chief), with Qloo audiences naming the clusters.
- Randomize taste against editorial connections for a share of learners and measure which stick, with the paw's syllable scores as the outcome.
- Smart glasses as the first-class surface. The whole app is already light on black, square, and spoken.
```
