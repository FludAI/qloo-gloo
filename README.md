# Gloo × Qloo

**An agent that teaches hard terms through things you already know.**
Built for the Qloo Agentic Hackathon as an open extension of [Gloo](https://gloo.news).

> Patent pending. See [PATENTS.md](PATENTS.md).

**Live demo:** https://qloo-gloo-667990366434.us-central1.run.app

## What it does

Gloo first pulls the memory value already inside a term (*chole* = bile,
*cyst* = sac, *kin* = movement), then gives each part a hook the learner
already knows. Two complete sample lessons ship here: **cholecystokinin** and its
word family, and the **Brier score**.

The app opens on the camera. The learner:

0. **Gloos a word**: frames it and taps **Gloo it**, or holds the mic and says it
   (or says "gloo it" over the framed word). Typing is the fallback. The server
   reads the framed crop, resolves the word with dictionary, spelling and
   sound-alike libraries, and asks Claude only for close calls. Words without a
   reviewed lesson get a clearly labeled provisional lesson drafted by the agent.
1. Makes a first attempt, by saying it or typing it. It's saved before the lesson
   opens. (A spoken capture counts as the first attempt.)
2. Reads the lesson: real meanings, sources, and a typed map that keeps
   *memory cues* visibly separate from *actual meanings*.
3. Names a few public things they know (brands, films, books, shows). **The cue
   agent** resolves them in Qloo, asks Qloo what people with that taste also tend
   to know, and proposes up to three cues. Each cue is tied to one part of the
   term: a sound, a meaning, or a step.
4. Confirms each cue ("I recognize this") or declines it. Qloo never decides
   what the learner knows.
5. Practices one prompt at a time, with cues hidden. Scoring is deterministic and
   happens on the server. Hinted answers never count as independent recall.
6. Sees progress per skill (meaning, operation, transfer, pronunciation), with a
   spaced-review schedule.

## Why it's Qloo-powered

An LLM alone can invent an analogy, but it guesses which references a learner
will recognize. Qloo's taste graph supplies **which cultural entities a
learner's taste cluster actually knows**, with real entity IDs. The agent then
does the part an LLM is good at: checking whether an entity's *name* or *core
idea* can carry a specific sound or meaning ("Breyers ≈ Brier", "Sister ≈
cyst"). Without Qloo, the agent can only offer generic hooks.

Guards on that reasoning:

- The agent may only keep Qloo IDs that Qloo actually returned in that run.
  Invented IDs are stripped, and the cue is labeled "no verified Qloo ID".
- Qloo affinity never sets familiarity, mastery or retention. The learner
  confirms every cue.
- The provenance panel shows every Qloo request and the full response behind
  the cues.

## Architecture

```
Browser (React 18 + Vite 5 + Tailwind 3.4)
   │  /api/* only — never sees a key
Express server (Node 22)
   ├─ content/        reviewed term packets (answers never leave the server)
   ├─ assess.mjs      deterministic scoring, Brier math with validation
   ├─ scheduler.mjs   per-skill spaced review, injected clock, versioned policy
   ├─ db.mjs          SQLite (node:sqlite), server-issued sessions
   ├─ resolve/        Gloo it word resolution (Levenshtein, Double Metaphone, Hunspell)
   ├─ reader.mjs      reads the framed camera crop (Claude vision)
   ├─ speech.mjs      hold-to-talk transcription (Google Speech-to-Text, vocabulary hints)
   ├─ drafter.mjs     LLM backup for close calls; provisional lesson drafts
   ├─ agent.mjs       Claude tool-use loop ──► Qloo tools
   └─ qloo.mjs        one long-lived `qloo mcp` process (@qloo/qloo-harness)
                         └─► hackathon.api.qloo.com
```

Qloo workflows used: `describe` (resolve what the learner names), `recommend`
(what that taste cluster also knows), plus `entity_tags` / `find_tags` when the
agent needs them.

## Run it

Needs Node.js 22.19+, the Qloo harness, a Qloo hackathon key, and optionally an
Anthropic API key for the agent.

**Git Bash / macOS / Linux**

```bash
npm install --global @qloo/qloo-harness
echo 'export QLOO_BASE_URL=https://hackathon.api.qloo.com' >> ~/.bashrc
echo 'export QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com' >> ~/.bashrc
source ~/.bashrc
qloo setup --qloo && qloo setup --status      # expect "Qloo data: ready"

git clone https://github.com/FludAI/qloo-gloo.git && cd qloo-gloo
cp .env.example .env                           # add ANTHROPIC_API_KEY for the agent
npm install
npm run dev                                    # http://localhost:5173
npm run smoke                                  # second terminal
npm test                                       # 30 domain, resolver and API tests
```

**PowerShell:** the same, but use `setx QLOO_BASE_URL ...` (then open a new
window) and `Copy-Item .env.example .env`.

**No keys yet?** `npm run dev:mock` serves labeled fixture data with a
synthetic agent, a fixture camera read and a fixture transcript.

**Speech locally:** server transcription uses Application Default Credentials
(`gcloud auth application-default login` with the Speech-to-Text API enabled).
Without them the browser's own speech recognition is used where it exists.

**Passcode:** set `DEMO_PASSCODE` to gate camera, voice, the agent and drafting
on a hosted demo. The reviewed lessons stay open.

**Deploy:** [docs/DEPLOY.md](docs/DEPLOY.md) (Google Cloud Run, one container).

## Status

| Feature | Status |
| --- | --- |
| Both sample lessons, first attempt, typed map, practice, per-skill progress | Implemented |
| Deterministic scoring, hint independence, idempotent attempts, session isolation, export/delete | Implemented, tested |
| Qloo path through `qloo mcp` | Implemented; reached the hackathon API (401 with a test key). Live results pending key |
| Cue agent (Claude + Qloo tools, ID verification) | Implemented; loop tested against a fake provider. Live run pending key |
| Spaced review schedule | Implemented (pilot policy; simulated time is not retention evidence) |
| Camera-first capture: framed crop read on the server, hold-to-talk voice (Google Speech-to-Text, browser fallback), typed | Implemented; API paths tested. Live camera and mic need a real phone browser |
| Passcode gate for metered features on the hosted demo | Implemented, tested |
| Word resolution (exact / spelling / sound-alike / dictionary, LLM backup) | Implemented, tested |
| Provisional lessons for new words | Implemented; drafting tested against a fake provider. Live drafting pending key |
| Pronunciation scoring, glasses input, encounter detection, rewards | Not in this build; shown as unavailable |

Design decisions, including where this build departs from the Gloo spec, are in
[docs/DECISIONS.md](docs/DECISIONS.md).

## Limitations

- Provisional lessons are AI drafts. They are labeled everywhere and should be
  checked against a trusted source.
- The camera crop and a few seconds of audio go to the server for reading and
  transcription. Neither is stored.

- Qloo results describe what groups tend to like, not what one person knows.
- Sound cues are approximate memory aids, not phonetics or etymology.
- The review schedule and mastery rule are pilot product choices, not a proven
  optimum.
- Text answers are scored by reviewed rules. Unmatched paraphrases are marked
  "uncertain" and don't count either way.
- The demo keeps one SQLite database on one Cloud Run instance. A redeploy
  starts fresh.

## License

MIT. See [LICENSE](LICENSE) and [PATENTS.md](PATENTS.md).
