# Deploy to Google Cloud Run

The app is one container: the Express API, the built React app, and the Qloo
harness, which the server starts as a `qloo mcp` child process. Cloud Run runs
containers, so this works. Serverless *functions* would not.

## One-time setup

```bash
PROJECT=your-gcp-project
REGION=us-central1
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com speech.googleapis.com

# Secrets: paste each value when prompted (nothing lands in shell history)
printf "Qloo key: " && read -s K && printf %s "$K" | gcloud secrets create qloo-api-key --data-file=- && unset K; echo
printf "Anthropic key: " && read -s K && printf %s "$K" | gcloud secrets create anthropic-api-key --data-file=- && unset K; echo
printf "Demo passcode: " && read -s K && printf %s "$K" | gcloud secrets create gloo-demo-passcode --data-file=- && unset K; echo

# Let Cloud Run's runtime account read them
SA=$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com
for s in qloo-api-key anthropic-api-key gloo-demo-passcode; do
  gcloud secrets add-iam-policy-binding $s --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done
```

## Deploy (from the repo root)

```bash
gcloud run deploy qloo-gloo --source . --region $REGION \
  --allow-unauthenticated \
  --set-secrets QLOO_API_KEY=qloo-api-key:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,DEMO_PASSCODE=gloo-demo-passcode:latest \
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

## Why one warm instance

SQLite lives on the instance's `/tmp`, which Cloud Run keeps in memory and
drops when the instance stops. `--min-instances 1 --max-instances 1` keeps a
single warm instance so learner sessions persist for the judging window, and
keeps all sessions on one database. A new revision starts with an empty
database. For durable multi-instance hosting, move `server/src/db.mjs` to Cloud
SQL for Postgres; the queries are plain SQL.

## Cost and quota controls

Environment variables (defaults shown):

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model for the cue agent |
| `AGENT_MAX_STEPS` | `8` | Max model turns per agent run |
| `LIMIT_AGENT_PER_SESSION_HOUR` | `8` | Agent runs per browser session per hour |
| `LIMIT_AGENT_GLOBAL_DAY` | `300` | Agent runs per day across all visitors |
| `LIMIT_QLOO_PER_SESSION_HOUR` | `60` | Qloo calls per session per hour (cache hits are free) |
| `LIMIT_QLOO_GLOBAL_DAY` | `150` | Qloo calls per day across all visitors (cache hits are free; cached answers persist in SQLite for `QLOO_CACHE_TTL_HOURS`, default 168) |
| `LIMIT_STT_PER_SESSION_HOUR` | `40` | Transcriptions per session per hour |
| `LIMIT_CAMERA_PER_SESSION_HOUR` | `40` | Camera reads per session per hour |
| `DEMO_PASSCODE` | unset | When set, camera, voice, the agent and drafting need it once per session |

Set a budget alert on the Anthropic account too. Qloo hackathon keys expire
after the event; after that the demo shows "Qloo: key missing" and keeps the
offline lesson working.
