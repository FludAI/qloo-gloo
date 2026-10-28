# Testing Gloo with people

## The brief to send a tester

Five lines, nothing to install, no account.

> Open **https://gloo.news** in **Safari** on your phone (not from inside another app's browser).
> Tap **Turn on the camera** and allow it. The first time you hold the mic button, allow the microphone too.
> Point the camera at any hard word on paper or a screen, frame it, and say **"gloo it"** or tap the button.
> Follow the cards: say the word, pick your favorites, then practice.
> If anything stops, screenshot it and send it to me, especially any small gray line under a button.

For a laptop: open the page in Chrome, choose **Share your screen**, pick the window with the word on it, and drag the word into the frame.

## What to look at afterwards

The owner report lists every session since a point in time, where each one stopped, and what went wrong:

```bash
curl -s -H "x-gloo-admin: $ADMIN_TOKEN" "https://gloo.news/api/admin/testers?hours=12&format=text"
```

Columns: when the session started, the gate's last state (live, denied, unavailable, slow) with the source (camera, screen, image) and any error name, the browser kind (in-app browsers are named), the microphone's own outcome at the first hold (granted or blocked), reads attempted and succeeded, lessons opened, picks made, voice lines played, practice answers and how many were correct on their own, words drafted by the agent, and provider errors. The funnel at the top counts sessions that reached each stage: visited, gate live, word read, lesson, pick, practice, correct.

JSON for a script: drop `format=text`. `hours` defaults to 48.

## What the report cannot tell you

- Who the session was: sessions are cookies, not people. Ask testers to tell you roughly when they tried.
- Whether the voice was heard: it records that a clip was played, not that the phone's volume was up.
- Anything that happened before the page loaded, such as a link that opened in the wrong browser and never reached the gate.
