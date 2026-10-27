# Security audit of the git history

**Date:** 2026-10-27
**Why:** Devpost needs a public code link, so the repo will be public for a few hours around the 2026-10-30 deadline. Nothing in any reachable commit may be a credential or personal data.
**Result: clean.** No secret value, credential file, cookie dump, signed URL or personal data was found in any commit on any branch. No history rewrite is needed.

## What was scanned

| Item | Value |
|---|---|
| Repository | `FludAI/qloo-gloo`, local checkout `C:\Users\loren\GLOO` |
| Git | 2.26.2.windows.1 |
| Branches | `camera-first` (HEAD `4394d7e`), `main`, and the local-only `claude/ambient-editor-eb9e29`, `claude/eloquent-pasteur-9fd455`, `claude/glasses-892549`, `claude/lesson-agent-61bf94`, `claude/optimistic-ritchie-0b9869`, `claude/sad-einstein-3cbb9a`, `claude/syllable-paw-1f3745` |
| Remote refs | `origin/main`, `origin/camera-first` only. The seven `claude/*` branches exist only locally (6 commits not on the remote) and would not become public unless pushed; they were scanned anyway. |
| Commits | 54 reachable from any ref (`git rev-list --all --count`); no tags, no stashes |
| Dangling objects | 3 unreferenced blobs (`git fsck --lost-found`), all drafts of `docs/DECISIONS.md`; scanned, clean; unreachable objects are never pushed |
| Files ever added | 170 distinct paths (`git log --all --diff-filter=A --name-only`) |
| Scanner | Grep over every commit's tree (`git rev-list --all \| xargs git grep -nE ...`), which covers every line ever committed including ones later deleted. `gitleaks` and `trufflehog` could not be installed: the session's permission classifier refused the binary download and a `pip` venv install. See the one command below to run gitleaks yourself before flipping public. |

Every grep below ran across all 54 commits, not just HEAD.

### 1. Known secret names, checked as names
`DEMO_PASSCODE`, `ADMIN_TOKEN`, `QLOO_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `CLIENT_SECRET`.
Every hit is `process.env.X`, a commented `# X=` line in `.env.example`, prose in README and docs, or a Cloud Run `--set-secrets X=<secret-manager-name>:latest` reference in `docs/DEPLOY.md`. No literal value follows any of them in any version of any file.

### 2. The real secret values, checked as values
Each non-trivial value in the local `.env` (Qloo key, Anthropic key, demo passcode, admin token) was searched as a fixed string across all commits. Zero hits for all four. The only `.env` value that appears in history is the model name (`claude-...`), which is not a secret.

### 3. Key-format patterns
`sk-ant-`, `AIza`, `-----BEGIN ... PRIVATE KEY`, `"private_key"`, `"client_secret"`, `ya29.`, `ghp_`, `github_pat_`, `xox[baprs]-`, `X-Goog-Signature`, `GoogleAccessId`, `Bearer <20+ chars>`: zero hits.
32+ character hex runs (outside `package-lock.json`, SVG, PNG): zero hits.
40+ character base64-like runs: only code identifiers, API paths and comment rules; none is a token.
Generic `password|secret|api_key|auth_token|access_token = "..."` assignments with a literal value: zero hits.

### 4. Files and directories
- `.env`, `.env.test`, `*.pem`, `*.key`, `*.p12`, service-account JSON, OAuth client JSON: never added in any commit. Only `.env.example` is tracked; all six historic versions of it have every secret line commented and empty, with only `PORT`, `QLOO_MOCK` and the two public Qloo base URLs set.
- `server/data/`, `scratch-audio/`, `web/dist/`, `private/`, `gloo-engine/`, `*handoff*.md`, `.claude/`: never added in any commit. All exist locally only as ignored paths (`git status --ignored`).
- `.mcp.json`: one version ever; it sets only `GLOO_URL` and starts `scripts/gloo-lessons-mcp.mjs`, which reads the admin token from the `GLOO_ADMIN_TOKEN` env var. No literal token.
- `Dockerfile` bakes no secrets (public base URLs and paths only); `.dockerignore` excludes `.env`, `.env.*`, `server/data`, `private`, `gloo-engine`, handoff files and `.git`.
- `web/public/design/*.html` contain gzip+base64 bundles. All 27 blobs across 4 historic versions were decoded and grepped: only a `you@example.com` placeholder, no keys.
- Commit messages: the only "token" mentions are the two Impact site-verification commits (`5a8b747`, `1a608e6`); no values in any message body.

### 5. Personal data
- Emails in history: `me@example.com` and `someone@example.com` (placeholders), `i@izs.me` (an npm package author in `package-lock.json`), and the GCP default compute service account spelled as `$(gcloud ... projectNumber)-compute@developer.gserviceaccount.com` in `docs/DEPLOY.md`, so the project number itself is not in the repo. Commit authors are the owner's two identities only.
- Phone numbers: only `415-555-1234`, a fixture in the tests.
- UUIDs / device IDs: `web/index.html` carries an `impact-site-verification` meta tag (an affiliate-network token designed to be served publicly on the homepage; an earlier value was replaced in `1a608e6`), and `web/public/design/` has artifact-export asset ids. No device or session identifiers.
- Cookies / session dumps / signed URLs: only `set-cookie` header handling in tests and `scripts/smoke.mjs`; no captured values.

### 6. `.gitignore` coverage
Covers `.env`, `.env.*` (with `!.env.example`), `server/data/`, `scratch-audio/`, `dist/` (so `web/dist`), `.claude/launch.json`, `*.log`, `.qloo/`, `private/`, `gloo-engine/`, `*[Hh]andoff*.md`. The whole `.claude/` directory is untracked (not just `launch.json`); nothing from it has ever been committed, but adding `.claude/` to `.gitignore` would make that deliberate.

### 7. Public-facing docs at HEAD
`README.md`, `docs/DEPLOY.md`, `docs/EDITING.md`, `docs/DEVPOST.md`, `docs/DECISIONS.md` name the variables and the Secret Manager secret names (`qloo-api-key`, `anthropic-api-key`, `gloo-demo-passcode`, `gloo-admin-token`) but never a value. `docs/SUBMISSION.md` line 9 keeps its `_[paste DEMO_PASSCODE here before submitting]_` placeholder by design; fill it on Devpost, not in the repo. The Cloud Run URL (`https://gloo.news`) and the media bucket name are fine to show.

## Before flipping public (owner checklist)
1. Run an independent scanner once; it needs only a download into a temp folder:
   ```bash
   gitleaks git --redact -v C:/Users/loren/GLOO
   ```
   (binary from https://github.com/gitleaks/gitleaks/releases, Windows x64 zip). Expect "no leaks found".
2. Do not `git add -A` or push the local `claude/*` branches before flipping; only `main` and `camera-first` are on the remote and were the subject of this audit.
3. Leave the SUBMISSION.md placeholder as is.
4. Optional: add `.claude/` to `.gitignore`.

## Commands used
```bash
git branch -a; git tag; git stash list; git rev-list --all --count; git fsck --lost-found
git log --all --diff-filter=A --name-only --format= | sort -u
git rev-list --all | xargs git grep -nE 'DEMO_PASSCODE|ADMIN_TOKEN|QLOO_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|CLIENT_SECRET'
git rev-list --all | xargs git grep -nE 'sk-ant-[A-Za-z0-9_\-]{10,}|AIza[0-9A-Za-z_\-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY|"private_key"|"client_secret"|ya29\.|ghp_|github_pat_|xox[baprs]-|X-Goog-Signature|GoogleAccessId|Bearer [A-Za-z0-9_\-\.]{20,}'
git rev-list --all | xargs git grep -nE '\b[0-9a-fA-F]{32,}\b'
git rev-list --all | xargs git grep -nE '[A-Za-z0-9+/=_\-]{40,}'
git rev-list --all | xargs git grep -ohE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | sort | uniq -c
git rev-list --all | xargs git grep -nF -- "<each value from .env>"      # printed only hit counts and 3-char prefixes
git log --all --format='%an <%ae>' | sort | uniq -c
git log --all --format='%H%n%B' | grep -nE 'sk-ant-|AIza|[0-9a-f]{32,}'
git status --ignored --short
```
