# Devpost submission (due Oct 30, 2026)

Required: live demo URL · public repo URL · text description · external hosting
· open-source license visible in the repo's About panel.

## Links
- Demo: _[Cloud Run URL]_
- Repo: _[GitHub URL]_

## Description (draft)

**Gloo × Qloo: learn hard terms through things you already know.**

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

## Request-to-result walkthrough
_TODO after the live key works: paste one `describe` + `recommend` pair from
the provenance panel, the agent's three proposals, and which one the learner
confirmed._

## Setup
See README "Run it" and docs/DEPLOY.md.

## Limitations
See README "Limitations".
