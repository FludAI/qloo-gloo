# Devpost submission (due Oct 30, 2026)

Required: live demo URL · public repo URL · text description · external hosting
· open-source license visible in the repo's About panel.

## Links
- Demo: https://gloo.news
- Repo: https://github.com/FludAI/qloo-gloo (private until the patent checklist clears; flip to public before submitting)
- Passcode for camera, voice and the agent: _[paste DEMO_PASSCODE here before submitting]_ (the two reviewed lessons work without it)

## Description (draft)

**Gloo × Qloo: make hard words stick using the culture you love.**

Gloo teaches complex terms by first using the meaning already inside them
(*chole* = bile, *cyst* = sac, *kin* = movement), then attaching each part to a
hook the learner recognizes. This extension adds a cue agent grounded in Qloo's
taste graph.

The learner names a few public things they know. The agent (Claude with Qloo
tools) resolves them with `describe`, asks `recommend` what people with that
taste also tend to know, and proposes up to three cues. Each cue is tied to a
specific sound, meaning or step: "Breyers ≈ Brier", "Sister ≈ cyst". The
learner confirms each one, then practices with the cues hidden. Scoring is
deterministic, and progress is tracked per skill.

**Why Qloo matters:** an LLM can invent analogies, but it guesses what a learner
will recognize. Qloo supplies which cultural entities a taste cluster actually
knows. The agent may keep only IDs that Qloo returned, and the learner, not an
affinity score, decides what's familiar. Every Qloo call is visible in a
provenance panel.

Two complete lessons: cholecystokinin and its word family, and the Brier score
(with the same scoring operation carried across weather, finance, games, ML and
Gloo's own recall forecasts).

## How Qloo is used: the taste loop

Every sound piece of a word is a pick card: four pictures that all carry the
piece's sound ("Say your favorite cola" for *chole*). The pick is the memory
hook, and it is also a taste signal.

1. **A pick becomes a signal.** The chosen option's public entity (Pepsi,
   Twisted Sister) is resolved once with Qloo `describe` and its ID kept in the
   media store. Picks are stored in Gloo only; nothing is written to Qloo.
2. **The next cards are ranked for that taste.** From two picks on, each pick
   card's options go to Qloo `rank` (one call per piece and entity type, two
   types at most) with the learner's pick entities as signals. The options are
   the reviewer's editorial ones; only their order changes, so every picture
   still carries the piece's sound. The likeliest favorites come first, and a
   card that holds one of the learner's own picks leads with it.
   Real run, Oct 27 (picks Pepsi and Twisted Sister): the *cysto* card ranked
   Sisters (0.78) over Sister Act (0.76); the *-in* card ranked Aspirin, that
   is Bayer (0.75), over Penguin Books (0.70); RC Cola and Inca Kola are not in
   Qloo's brand graph and stay in their editorial places.
3. **Evidence.** Each hook records whether its card was ranked for the learner
   (`hook_source`: taste, editorial, own) and where it sat on the card; the
   progress card says "3 of your 4 hooks came from your taste." Attempts
   already carry outcomes, so the Gloo Bond Network can later test whether
   taste hooks produce more independent-correct answers than editorial ones.

Credits are scarce, so there is no call under two picks, every answer is cached
for a week, ranking stops when fewer than 30 calls remain in the day's budget,
and any failure leaves the editorial order. `QLOO_MOCK=1` runs the same loop on
fixtures (the mock ranks options in reverse alphabetical order).

The cue agent below (Claude with Qloo tools) remains the opt-in, passcode-gated
path for cues beyond the pick cards.

## Request-to-result walkthrough
_TODO after the live key works: paste one `describe` + `recommend` pair from
the provenance panel, the agent's three proposals, and which one the learner
confirmed._

## Setup
See README "Run it" and docs/DEPLOY.md.

## Limitations
See README "Limitations".
