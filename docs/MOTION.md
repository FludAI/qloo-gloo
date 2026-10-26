# Motion spec: how Gloo should move

A brief for the design tool. Gloo is a camera, not a page. Everything the learner sees
happens on a square stage over the viewfinder (phone) or on a 600×600 additive display
(Meta Ray-Ban Display, where black is transparent and only bright things exist). Motion has
to carry meaning that text used to carry, and it has to work with the app's spoken line
and without it.

Status 2026-10-22: the flow below is live on the phone build. The stickiness rating
(`docs/STICKINESS.md`) is built but not yet on screen; this spec decides how it arrives.

## Hard constraints

- **Stage:** a square, 600×600 at design size, scaled to the phone or desktop viewport. Nothing
  outside the square matters; nothing inside it scrolls.
- **Light on black.** The glasses display is additive: pure black is transparent. No dark
  fills, no drop shadows, no dimming overlays. Every element is bright; depth comes from
  brightness and size, not from shade.
- **Targets 88 px tall**, four at most on screen, no hover states; input is tap, voice, or a
  D-pad (ArrowUp/Down/Left/Right, Enter, Escape) on glasses.
- **Timing:** any transition ≤ 1.2 s; feedback that answers a tap or a spoken word starts
  within 100 ms. Nothing loops forever except the listening pulse.
- **Sound-synced.** The app speaks each card (speech synthesis). Motion that represents the
  spoken sound piece pulses with it. Short game-style effects (a tick, a lock-in, a chime) are
  welcome and should be separate from the spoken line.
- **Respect reduced motion**: every animation has a cut (instant) version.
- **Deliver as Lottie or SVG + CSS**, 60 fps on a mid-range phone, no video, no web fonts on
  the glasses path.

## The moments

Six places where motion carries meaning. For each: what it must say, the game pattern to
copy, and the ask.

### 1. Scan: the camera reads the word

Says: *I see the word; I'm reading it; here are its pieces.*

Today: the reticle sits still; a toast says "Reading…". Nothing shows the pieces being found.

Copy from: Pokémon GO's capture ring and Google Lens's sweep (a line crossing the frame,
points lighting up where it finds things); Metal Gear's "!" lock-on for the moment of
recognition.

Ask, three options to try; pick one:
- **A. Sweep with ticks.** A bright line sweeps the reticle left to right in ~0.6 s. As it
  passes, a tick mark drops under each piece it finds (chole · cysto · kin · in), spaced along
  the word. Ticks stay and become the rail the pieces will later ride.
- **B. Lock and split.** The reticle corners snap in to the word (lock-on), then the word
  visibly splits at the piece boundaries, each piece nudging apart by a few pixels with a
  tick between them.
- **C. Pulse count.** The reticle pulses once per piece found, with a tick lighting up on a
  small rail below. Simplest; least information about where the pieces are.

Decided (owner, 2026-10-22): **A on the phone** (we have the frame and the word position),
**C on glasses** (no frame on the display, only the word as text). B is not pursued.

### 2. Stickiness: does this word stick on its own?

Says: *this word is a 1 to 5; 5 sticks by itself, 1 is slippery.*

Copy from: GTA's wanted stars filling one at a time (discrete, legible at a glance, each
star has weight); Roblox and Fortnite rarity glow (a tier reads as a color and a shimmer,
not a number).

Ask: a **five-tick meter** that fills left to right from the scan's rail, one tick per ~120 ms
with a small click each. Two outcomes:
- **4–5, sticks:** the ticks turn cool (sea), the word lifts off the stage and dissolves
  upward; spoken "this one sticks on its own." No lesson.
- **1–3, slippery:** the ticks stay hot (gloo orange), the word drops down into the first
  piece card like a coin into a slot; spoken "slippery; let's gloo it."
Give the meter a resting state we can also show on the progress card.

### 3. Pick: say your favorite cola

Says: *four pictures; say one; it's yours; here's the sound you just bonded.*

Today: four picture tiles; a spoken line; confetti on pick; then the reveal (picture, word
part, ≈ sound, meaning).

Copy from: loot lock-in (Fortnite, Apex: the item snaps into the slot with a flash and a
sound), Mario Kart's item roulette settling, rhythm-game hit rings for the moment the
spoken answer lands.

Ask: replace the generic confetti with a **lock-in**: the chosen picture snaps to the piece
slot on the rail (from moment 1), a ring flashes outward once, the piece label (chole) rises
out of the picture, and the sound token (≈ cola) pulses in time with the spoken line. The
meaning (bile) fades in last and smallest. Unpicked pictures fall back and dim (on glasses:
shrink, since there is no dimming). The learner's own spoken pick that isn't one of the
four gets a blank tile with a waveform instead of a picture.

### 4. All together: the word rebuilt from their pictures

Says: *these pieces, in this order, are the word; here is what it means.*

Copy from: Tetris line clears and combo chains (pieces slide into a row and lock), Zelda's
"item get" pose for the finished word.

Ask: the pieces slide along the rail into word order, each carrying its picture, then the
whole word lights up once as a unit and the one-line meaning appears under it. Spoken in
the same order. This is the only moment where the whole word is shown large.

### 5. Practice: say the answer

Says: *you got it / not quite / can't tell*, instantly.

Copy from: rhythm games (perfect / good / miss rings), Dead by Daylight's skill check.

Ask: on a correct spoken answer, a clean ring closes on the question with a chime; on a
miss, a short horizontal shake and the answer line appears; on "uncertain", a soft ring
that doesn't close. No red fills (black ground); use motion and brightness.

### 6. Progress: where you stand

Says: *per skill, how far; and the picks you own.*

Copy from: GTA's stat bars and Roblox XP bars (discrete, fill on level-up with a burst).

Ask: one bar per skill with ticks for the review stages (now, 30 min, 4 h, 1 day, 3 days,
7 days); a tick lights when a stage is passed; the picks sit as small pictures under the
bars. Reuse the stickiness meter style for consistency.

## Syllable paw

Decision 26: the gecko paw's toes are syllables. Built 2026-10-26 (`web/src/components/Paw.jsx`).

**Data.** Every whole word and piece carries `ipa_syllables` next to `ipa`: one IPA string per
syllable, in order (cholecystokinin: koʊ · lɪ · sɪs · toʊ · ˈkaɪ · nɪn; chole: ˈkoʊ · lə). The
drafter asks the model for it; when it is missing, `server/src/syllables.mjs` splits the IPA on
dots and stress marks, then on vowel nuclei (a cluster between two vowels leaves one consonant
behind: sɪs·toʊ). The store validates that the syllables spell the IPA and that their count
matches a hyphenated respelling (`koh-lih-sis-tuh-KY-nin` is six). A one-word respelling such
as `cola` is a hook, not a count: chole stays two syllables. Learner packets always carry the
syllables (stored or split), including the locked packet's `pieces` for the first attempt.

**Machine timing.** `tts.mjs` speaks a word or piece as one `<phoneme>` per syllable with a
`<mark>` before each, through the v1beta1 endpoint with `enableTimePointing: ["SSML_MARK"]`
(same Neural2 voice). The returned times are kept in the clip's sidecar as
`marks: [{ index, piece, syllable, time }]` and travel to the client in the `x-gloo-marks`
header of `POST /api/say` (base64 JSON); `GET /api/say/timing?text=…&term_id=…` returns the same
for an existing clip. The new SSML has a new key, so clips made before timing are simply
synthesized again on the next play; a verified clip keeps playing as pinned, without marks.
To check on the real voice after a deploy: play "Cholecystokinin" once, then read
`/api/say/timing` and listen for choppiness between syllables (each syllable is its own
phoneme element; if Neural2 breaks the word apart, the fallback is one phoneme per word with
the syllables spread over the word's span, which is what the client already does for clips
without marks).

**The paw.** `Paw` is the brand mark inline (outline in `paw-path.js`, C2PA metadata
stripped), toes addressable by index with a glow each. `PawRow` renders ceil(n / 5) paws, toes
assigned left to right and continuing onto the next paw (six syllables: a full paw and one
toe). States per toe: off (gold at 16%), heard (gold at 55%), lit (full gold with glow),
wrong (dim paper, no glow). Light on black only. An idle paw breathes: a slow gold pulse crosses
the glows every 3.6 s, off under reduced motion; state changes transition in 120 ms.

**With the voice.** `speak()` publishes the current line through `onSpeech()` (its marks, real
or estimated) and `speechClock()` (the audio element's `currentTime` for a server clip, wall
time for the browser voice). `useSpokenToes` lights toe k at mark k, reading the clock every
animation frame, never on a timer. Without marks (browser voice, verified old clips) the
syllables are spread evenly over the span the word's letters cover in the line, using the
clip's real length when known. Where: the Together card (the word's six toes; each piece
lights its own segment while it is spoken, then the whole word lights toe by toe) and the pick
reveal (the piece's syllables only; a one-syllable piece lights one toe).

**With the learner.** While the mic is held, `audio.js` reports the RMS of every 50 ms frame;
`envelope.js` finds syllable nuclei (a peak above an adaptive threshold between the noise floor
and a decaying ceiling, 120 ms refractory, a dip to 60% between peaks) and each one lights the
next toe "heard", up to the word's count. When the first attempt is scored, each piece's toes
turn lit or wrong (pieces in role order; a word whose pieces don't account for every syllable
lights toes in proportion), the paw holds for 1.5 s, then the lesson opens. In practice the
paw follows the voice the same way but judges only an answer that is the word itself; any
other answer leaves it idle.

**Fallback and checks.** Tests: `server/test/syllables.test.mjs` (splitting, validation, toe
assignment for 1, 5, 6 and 11, marks filtering and estimation, peak detection on a synthetic
envelope) and `tts.test.mjs` / `api.test.mjs` (marks built, timed, stored, served). The
app's browser pane has no camera or mic and throttles animation frames to about two a second,
so the paw was checked there with a stubbed camera and a pulsing tone as the voice; real
timing against the Google voice is checked on the deploy.

## What to send back

1. The six motion studies as Lottie or SVG+CSS at 600×600, light on black, with their cut
   (reduced-motion) versions.
2. The **tick rail** and **five-tick meter** as reusable components with states: empty,
   filling, filled-hot, filled-cool, resting.
3. A short sound kit: tick, lock-in, ring-close chime, miss, lift-off. Mono, under 400 ms
   each.
4. The scan as decided: A on the phone, C on glasses.

## Open questions for the owner

- Should the stickiness number itself ever be visible, or only the ticks and the color?
- On a 4–5 (sticks on its own), do we offer the lesson anyway with one tap, or close the
  loop and return to the camera?
- Sound effects on by default, or only when the learner has sound on for the spoken line?
