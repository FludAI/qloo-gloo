# Deploy to Google Cloud Run

The app is one container: the Express API, the built React app, and the Qloo
harness, which the server starts as a `qloo mcp` child process. Cloud Run runs
containers, so this works. Serverless *functions* would not.

## One-time setup

```bash
PROJECT=your-gcp-project
REGION=us-central1
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com speech.googleapis.com texttospeech.googleapis.com

# Durable media: spoken clips and pictures, paid for once and kept across redeploys (private bucket, same region)
gcloud storage buckets create gs://gloo-media-bondswipe --location $REGION --uniform-bucket-level-access --public-access-prevention

# Secrets: paste each value when prompted (nothing lands in shell history)
printf "Qloo key: " && read -s K && printf %s "$K" | gcloud secrets create qloo-api-key --data-file=- && unset K; echo
printf "Anthropic key: " && read -s K && printf %s "$K" | gcloud secrets create anthropic-api-key --data-file=- && unset K; echo
printf "Demo passcode: " && read -s K && printf %s "$K" | gcloud secrets create gloo-demo-passcode --data-file=- && unset K; echo
printf "Admin token: " && read -s K && printf %s "$K" | gcloud secrets create gloo-admin-token --data-file=- && unset K; echo

# Let Cloud Run's runtime account read them
SA=$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com
for s in qloo-api-key anthropic-api-key gloo-demo-passcode gloo-admin-token; do
  gcloud secrets add-iam-policy-binding $s --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done
```

## Deploy (from the repo root)

```bash
gcloud run deploy qloo-gloo --source . --region $REGION \
  --allow-unauthenticated \
  --set-secrets QLOO_API_KEY=qloo-api-key:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,ADMIN_TOKEN=gloo-admin-token:latest \
  --update-env-vars CREDITS_WELCOME=5,PUBLIC_URL=https://gloo.news \
  --min-instances 1 --max-instances 1 --session-affinity \
  --memory 1Gi --cpu 1 --timeout 120
```

Then check it:

```bash
SMOKE_URL=$(gcloud run services describe qloo-gloo --region $REGION --format='value(status.url)') npm run smoke
```

Spoken capture calls Speech-to-Text with the service's runtime account; no key
is involved. The account needs the API enabled (above) and a role that includes
`speech.recognize` (the default compute account's Editor role does).

## The voice and the media bucket

The app speaks every line through Google Cloud Text-to-Speech (`server/src/tts.mjs`)
with one fixed voice, `en-US-Neural2-F`, so every phone hears the same thing. Each
sound piece carries IPA (`role.ipa`, next to the `say` respelling) and the server
wraps it, and the whole word, in SSML `<phoneme alphabet="ipa">` tags before
synthesis. Chirp 3 HD voices were the first choice but they do not accept SSML, and
the phoneme tag is the only way to pin a pronunciation, so the voice is Neural2.
`TTS_VOICE` overrides it; health shows the voice in use.

Clips live in the bucket `gs://gloo-media-bondswipe` (`MEDIA_BUCKET`), reached through
the runtime account (Editor is enough), as `audio/<sha256(voice + ssml)>.mp3` with a
JSON sidecar `{ text, term_id, ssml, voice, verified, created_at }`. Pictures for the
picks go to `art/<sha256(title)>` in the same bucket. SQLite on the instance stays the
hot cache and a small in-memory LRU sits in front, so a redeploy loses nothing that was
paid for. Health reports `tts: "google" | "unavailable"` and `media: "gcs" | "local"`;
without credentials (a laptop) the store is a folder under `server/data/media/` and the
browser's own voice speaks.

Rules:

- **Pay once per sentence, ever.** `POST /api/say { text, term_id }` returns the stored
  MP3 when the clip exists and synthesizes only on a miss. Hits never count against the
  per-session limit (`LIMIT_TTS_PER_SESSION_HOUR`, default 60).
- **A verified clip is never resynthesized.** `POST /api/say/verify { text, term_id,
  verified: true }` (the "sounds right" button in the info sheet's debug area, owner
  only) writes `verified/<sha256(term_id + text)>.json` pointing at the clip; that
  pin is served forever, even after the voice or the SSML builder changes. `verified:
  false` removes the pin, and the clip is rebuilt as soon as its IPA, voice or SSML
  changes (which gives it a new key).
- Both routes sit behind the passcode gate like the other metered routes. The web app
  falls back to the browser voice on 401, 503 or any failure.

Cost (checked 2026-10-24): Neural2 is $16 per 1M characters after 1M free per month,
SSML tags included; Chirp 3 HD would be $30. A lesson's spoken lines run to a few
thousand characters once, and never again. Bucket storage for a few hundred clips is
cents per month. The one real synthesis after a deploy, with an unlocked session cookie
in `jar.txt` (the smoke script keeps one):

```bash
curl -s -b jar.txt -X POST "$SMOKE_URL/api/say" -H 'content-type: application/json' -d '{"text":"chole","term_id":"cholecystokinin"}' -o chole.mp3 -D -
```

## Lessons live in the bucket too

Lesson content is a JSON packet per lesson in the same bucket, `lessons/<id>.json`
with `lessons/index.json` naming every id (`server/src/lessons.mjs`). On the first
boot the server seeds the store from `server/src/content/*.mjs`; after that the
store is the source of truth and code never overwrites a stored lesson, so the
owner's edits survive a redeploy. SQLite on the instance is only the hot cache.
The owner edits through `/api/admin/lessons` or the `/edit` console, both behind
`ADMIN_TOKEN` (header `x-gloo-admin`), a Secret Manager secret like the passcode.
See `docs/EDITING.md`.

## Custom domain

`gloo.news` is mapped to the service with a Cloud Run domain mapping (the domain is
verified in Search Console under the deploying account; DNS at Namecheap carries the
four A and four AAAA records the mapping hands out). To map another host:

```bash
gcloud beta run domain-mappings create --service qloo-gloo --domain app.gloo.news --region $REGION
gcloud beta run domain-mappings describe --domain app.gloo.news --region $REGION --format='value(status.resourceRecords)'
```

## Why one warm instance

SQLite lives on the instance's writable layer, which Cloud Run keeps in memory
and drops when the instance stops. Spoken clips and pictures are not affected:
they live in the media bucket (above). `--min-instances 1 --max-instances 1`
keeps a single warm instance so learner sessions persist, and keeps all
sessions on one database.

The database also survives a redeploy (`server/src/snapshot.mjs`): every five
minutes when it changed, and once more at SIGTERM, the file is copied with
SQLite's online backup to the media bucket as `db/gloo.sqlite`, with a sidecar
`db/gloo.sqlite.json` (time, sha256, size, revision, row counts) and a dated copy
once a day kept seven days. `server/src/boot.mjs` (the container's entry)
restores the copy before the database opens when it is newer than the local
file, after checking its sha256 and `PRAGMA integrity_check`; for 90 s after
boot it re-checks the sidecar, so a snapshot written by the revision being
replaced still lands as long as nothing was written here yet. Everything in
the file comes along: learners, attempts and the practice schedule, picks,
drafted lessons, the credits ledger, the Qloo cache, beacons and call rows.
`/api/health` shows `memory` (the last snapshot, what boot restored from), and
the testers report opens with the restore line. This assumes one instance:
raise `--max-instances` and two instances would restore the same file and
diverge, so set `SNAPSHOT=0` first. The loss window is one timer interval when
the instance dies without SIGTERM. The first deploy after this lands finds no
snapshot and starts empty; every one after it restores. For durable
multi-instance hosting, move `server/src/db.mjs` to Cloud SQL for Postgres; the
queries are plain SQL.

## Cost and quota controls

Environment variables (defaults shown):

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model for the cue agent |
| `AGENT_MAX_STEPS` | `8` | Max model turns per agent run |
| `LIMIT_AGENT_PER_SESSION_HOUR` | `8` | Agent runs per browser session per hour |
| `LIMIT_AGENT_GLOBAL_DAY` | `300` | Agent runs per day across all visitors |
| `LIMIT_QLOO_PER_SESSION_HOUR` | `60` | Qloo calls per session per hour (cache hits are free) |
| `SNAPSHOT` / `SNAPSHOT_EVERY_MS` | on when `DB_PATH` is a file / `300000` | Database snapshots to the media store (above); `SNAPSHOT=0` turns them off. `SNAPSHOT_SHUTDOWN_MS` (7000) bounds the SIGTERM snapshot, `SNAPSHOT_RECHECK_MS` (90000) the sidecar re-check after boot |
| `LIMIT_QLOO_GLOBAL_DAY` | `150` | Qloo calls per day across all visitors (cache hits are free; cached answers persist in SQLite for `QLOO_CACHE_TTL_HOURS`, default 168) |
| `LIMIT_STT_PER_SESSION_HOUR` | `40` | Transcriptions per session per hour |
| `LIMIT_CAMERA_PER_SESSION_HOUR` | `40` | Camera reads per session per hour |
| `LIMIT_TTS_PER_SESSION_HOUR` | `60` | New clips synthesized per session per hour (stored clips are free) |
| `TTS_VOICE` | `en-US-Neural2-F` | The one voice; changing it rebuilds unverified clips only |
| `TTS_DISABLE` | unset | `1` = never use the server voice |
| `MEDIA_BUCKET` | `gloo-media-bondswipe` | Cloud Storage bucket for clips and pictures |
| `MEDIA_LOCAL` / `MEDIA_DIR` | unset | `1` forces the local folder (tests); `MEDIA_DIR` moves it |
| `DEMO_PASSCODE` | unset | When set, camera, voice, the agent and drafting need it once per session. Off since Oct 27, 2026 (the daily caps are the traffic protection); to turn the gate back on, add `DEMO_PASSCODE=gloo-demo-passcode:latest` to `--set-secrets` and redeploy; the share link `?code=…` and the passcode sheet still work |
| `ADMIN_TOKEN` | unset | Owner token for `/api/admin/lessons` and `/edit` (header `x-gloo-admin`); unset = owner API off |
| `CREDITS_WELCOME` | `2` | Gloo on first contact (decision 33) |
| `CREDITS_WORD_COST` | `1` | Gloo per word the agent drafts (refunded if the draft fails) |
| `CREDITS_REFERRAL` | `3` | Gloo to the referrer when a referred friend completes a first word |
| `CREDITS_REFERRAL_CAP` | `10` | Paid referrals per referrer; past it rewards are held for the owner |
| `CREDITS_PROMO_BUDGET` | `3000` | Welcome plus referral Gloo across all learners, ever; past it welcomes stop and rewards are held |
| `CREDITS_SAME_IP_MINUTES` | `60` | A claim from the referrer's own address within this window is held, not paid |
| `CREDITS_SECRET` | `ADMIN_TOKEN` | Keys referral codes and the address hash; set it if the owner token ever rotates |
| `PUBLIC_URL` | request origin | Base of the referral link (`https://gloo.news`) |

Set a budget alert on the Anthropic account too. Qloo hackathon keys expire
after the event; after that the demo shows "Qloo: key missing" and keeps the
offline lesson working.
