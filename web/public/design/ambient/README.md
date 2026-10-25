# Ambient editor design (v2), from the design tool, 2026-10-25

`../ambient-editor.html` is the standalone study (bundled React page; open it from the running
server at /design/ambient-editor.html). These are its unpacked sources, kept for reference:

- `editor-logic.js`: the study's logic. A lesson laid out as a grid of fields; a camera that
  opens on the whole map, then flies field to field down a queue; per-field proposals ranked by
  an editor taste profile (keep raises a proposal's tags, next lowers them, the editor's own
  words add a tag); keep / next / back / undo / map by voice, swipe, keys or taps; hold-to-talk
  with a typed fallback; an "ask" path that requests three short options for the field.
- `design-system.css`: the tool's design system (fonts, tokens) used by the study.
- `ios-frame.jsx`: the phone frame used to present it; not product code.

The decisions it embodies are in docs/DECISIONS.md and the implementation lives in
web/src/edit/.
