# Before making the repo public

- [ ] Provisional patent application filed; number and date inserted in `PATENTS.md`.
- [ ] Patent attorney reviewed the license choice (MIT has no express patent
      grant but may carry an implied license; Apache-2.0 grants one expressly).
- [ ] No private material in the tree or history:
      `git log --all --stat | grep -iE "handoff|private|gloo-engine"` returns nothing.
- [ ] No secrets in history: `npx gitleaks detect` (or GitHub secret scanning) is clean.
- [ ] `npm test` passes and `npm run smoke` passes against the live demo URL.
- [ ] README has the live demo URL; Devpost has the repo URL and demo URL.
- [ ] GitHub repo About panel shows the license (GitHub detects `LICENSE` automatically).
- [ ] The hosted demo runs the code in this repo (no `GLOO_ENGINE_MODULE`).
