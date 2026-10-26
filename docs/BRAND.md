# Brand assets

Delivered 2026-10-25 as "Qloo-gloo motion documentation.zip". The mark is a gecko's paw: five
gold toes on a teal hand in the full-color logo, gold alone on dark. Kept in `web/public/brand/`;
the favicon set, app icons, OpenGraph image and web manifest sit at the web root.

| Role | Hex | Where |
| --- | --- | --- |
| Gold (accent) | `#dfaa37` mid, `#c98a12` deep, `#f6cb5c` light | Tailwind `gloo`, CSS `--gloo`, ticks, meter, reveal word, confetti |
| Teal | `#11917f` deep, `#2bb8a3` lit | Tailwind `sea`, CSS `--sea` / `--sea-lit`, "sticks" states, answer ring |
| Paper | `#f6f1e7` | text on dark, buttons |
| Ink | `#1d1a16` | text on light |
| Ground | `#0b0a09` | theme color, manifest background |

Files: `gloo-logo-on-dark.svg` (header), `gloo-paw-gold.svg` (gate screen), `gloo-token.svg`
and `gloo-token-256.png` (reserved for credits, see decision 23), `gloo-paw-mono-white.svg`
(for the glasses manifest icon, which needs a monochrome mark). PNG 2x versions are kept for
places SVG can't go.

Animated marks (`web/public/brand/animated/`): the logo, the paw and the token with each toe as its own clipped shape (`.i0`..`.i4`, left to right) and a glow circle per toe, so toes can light one at a time. The brand guide and the ambient landing study are kept under `web/public/design/`.
