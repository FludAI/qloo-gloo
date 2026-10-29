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

What you love shapes how you learn. What you learn changes what you can love.

*Cholecystokinin* can feel like six syllables of nothing until its first piece, *chole*, connects to your cola. The familiar sound gives you a way in. Then you learn that *chole* means bile, and the word starts opening a system you could not understand before.

That is the idea of Gloo. Pull out the meaning a word already carries (*chole* = bile, *cysto* = sac, *kin* = movement), then connect each piece to the culture you love. Those connections help you learn. What you learn gives you more connections: something new to notice, understand, care about or explore.

A song can bring you into a word. The word can bring you into the science. Understanding the science can change what catches your attention next.

The gecko on my logo holds a wall through millions of tiny contacts. Gloo builds connections that help understanding stick, and each toe lights up as you learn a syllable.

The Qloo hackathon gave me a way to ground those connections in taste. An LLM can propose an analogy. Qloo helps me rank sound-matched cultural choices using the learner's picks. The learner chooses the connection, and practice tells me whether it helped.

I start with what you love, so you can learn something that may change what you love next.

As that understanding grows, it can become something you use to heal, build, power or inspire others. Your connections grow with what you can contribute: peers, teachers, colleagues, people you lead, patients or customers. Those people bring new questions and new things to care about.

The hard words that once kept you outside a subject become keys to understanding it, working within it and connecting with the people whose lives you can affect.

## What it does

Gloo is a camera overlay, like a lens for words. No typing, no reading, no forms.

1. **Point your camera** at a word on a page or a screen and say "Gloo it."

   ![A shared window under the reticle, with the word dragged into the frame](https://gloo.news/devpost/02-frame-the-word-on-screen.jpg)

   *A shared window under the reticle. Drag the word into the frame, then tap or hold the mic and say it.*

2. **Say it first.** Your attempt is scored by sound, piece by piece, in the background. A guess is fine.

   ![The sweep while the server reads the word](https://gloo.news/devpost/03-reading-sweep.jpg)

   *The sweep while the server reads the word off the frame. Your first attempt is scored against the pieces it finds.*

3. **Meet the pieces.** Each sound piece is a card of four pictures from the culture you love, and all four carry the sound. "Which cola is yours?" is *chole*. Any pick is right, and your pick becomes the connection.

   ![The chole pick card: four colas, all carrying the sound](https://gloo.news/devpost/04-pick-your-cola.jpg)

   *The chole card: four colas, all carrying the sound. Any pick is right.*

4. **Hear it stick.** One voice says every piece from stored pronunciation, and the gecko paw lights a toe per syllable in time with the voice. Say it back and the toes light from your own voice, then turn gold for the pieces you got.

   ![The pieces assembled, with the gecko paw below](https://gloo.news/devpost/06-pieces-together-paw.jpg)

   *The pieces together, the gecko paw below. A toe lights per syllable as the voice says the word.*

5. **The culture learns you.** From your second pick on, Qloo ranks the next cards for your taste. The pictures stay the ones that carry the sound; the ones you are likeliest to love come first. Your progress card says "3 of your 4 hooks came from your taste."

   ![The review grid and the hooks that came from your taste](https://gloo.news/devpost/08-progress-taste.jpg)

   *The review grid, and how many of your hooks came from your taste.*

6. **Practice without the hooks.** One spoken question at a time, scored on the server, so an unfamiliar word becomes an unforgettable one on its own.

   ![One spoken question, hooks hidden](https://gloo.news/devpost/07-practice.jpg)

   *One spoken question at a time, hooks hidden, scored on the server.*

## How I built it

- **Qloo, the taste behind the connections.** `describe` resolves each pick's public entity once and keeps the ID in my store. `rank` reorders the next cards with the learner's picks as signals, one call per piece and entity type, cached a week. Nothing is written to Qloo and nothing personal reaches it; a signal is a public entity ID. A cue agent, Claude with Qloo tools behind MCP, proposes connections beyond the cards, keeping only IDs Qloo returned.

  ![The lesson loop: word, pieces, picks, Qloo rank, voice and paw, practice](https://gloo.news/devpost/lesson-loop.svg)

  *The loop. A pick becomes a signal, and from the second pick on, Qloo ranks the next cards for the learner.*

- **The voice.** Google Text-to-Speech with SSML phonemes from IPA stored per piece, so *chole* is said as its hook, cola, every time, and SSML marks give the per-syllable timing that lights the paw. Google Speech-to-Text hears answers with the prompt's expected words as context, so "bile" is heard as bile and not "Bayou."

  ![The syllable paw with four of five toes lit](https://gloo.news/devpost/syllable-paw.svg)

  *The syllable paw: SSML marks time the toes to the voice, and the learner’s own voice lights them back.*

- **Lessons as data.** Every lesson is versioned JSON in a bucket, with an owner console that works over the camera, a reviewer agent that proposes fixes, and an MCP server so other agents can edit and test lessons.

  ![A provisional lesson drafted on the fly for Gallbladder](https://gloo.news/devpost/09-agent-drafts-any-word.jpg)

  *A provisional lesson drafted on the fly for “Gallbladder”, labeled not reviewed until the owner publishes it.*

- **The stack.** React and Vite on the front, Express on Node 22 with SQLite as a hot cache, Cloud Run with one warm instance, and Cloud Storage for clips, pictures and lessons.

## Challenges I ran into

- **Culture is entities, not topics.** A word's domain tags predicted nothing useful: "hormones" returned random comedies with flat affinities. So the loop runs on the learner's picks, and a word alone only decides which kinds of culture to offer.
- **`recommend` versus `rank`.** Recommendations rarely carry a piece's sound. Ranking my own sound-checked pictures kept the sound and used the taste.
- **Names Qloo cannot see.** RC Cola and Inca Kola are not in the brand graph, and "Sisters" is ambiguous. The loop takes the exact-name candidate, remembers dead names, and keeps the editorial order when in doubt.
- **The voice said "chole" three ways.** I fixed it by pinning each piece to IPA and its hook's sound, and teaching the reviewer that a hook-pinned piece is deliberate.
- **Credits are finite.** I added a global daily cap, a reserve, a week-long cache, and no call before the second pick.
- **iPhone browser quirks followed the learner.** In my testing, the camera prompt could vanish inside an in-app browser, a per-site Deny could prevent it from appearing again, and the browser sometimes dropped the clip inside my logo's SVG, turning the teal paw all gold. The gate now identifies an in-app browser, times out a silent prompt with a next step, and shows the iPhone-specific fix on a refusal. I made the logo inline so its clip holds. A laptop's webcam faces the wrong way, so a desktop shares its screen instead.

  ![The gate, with the lesson loop playing behind the copy](https://gloo.news/devpost/01-gate-living-demo.jpg)

  *The gate: it names an in-app browser, times out a silent prompt, and offers a desktop its screen instead of a webcam.*

## What I learned

A word alone gave me little useful information about taste. A learner, a word and their picks gave me something I could use.

But learning your preferences is only half the loop. Understanding something new can change what you notice and appreciate. Your taste shapes the connections that help you learn; learning can expand the connections that shape your taste.

That understanding can also change what you contribute to other people. The language of a domain connects you to its work and its people. Those relationships expose you to new interests and problems, giving you reasons to learn again.

My current loop uses picks to personalize the cards. The next question is whether the understanding those cards support changes what learners choose to explore afterward. Recognition, preference and recall need their own evidence.

![Where 12 sessions stopped in 48 hours](https://gloo.news/devpost/testers-funnel.svg)

*Where 12 sessions stopped in the 48 hours to Oct 29, from the testers report. The live ledger had been reset by a deploy three hours earlier.*

Stickiness is a property of connections, and learning can change both ends of a connection.

## What's next

- Open the proposal path, so other people and agents improve lessons and are rewarded on what learners recall, not on acceptance.
- Add a stage label from each learner's path through words, from exploration to graduation to chief, with Qloo audiences naming the clusters.
- Randomize taste-matched versus editorial connections for a share of learners and measure delayed pronunciation, meaning and transfer separately.
- Test both directions: whether taste-matched connections improve learning, and whether that learning changes what people recognize, choose and explore next.
- Explore how learning connects people to others in their domain, and how those relationships bring them back to new words and ideas.
- Make smart glasses the first-class surface. The whole app is already light on black, square, and spoken.
```
