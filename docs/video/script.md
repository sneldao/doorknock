# Doorknock — 2-minute demo video script

Raw screen footage: `docs/video/doorknock-run.mp4` (real run, recorded 15 Nov 2026 —
every frame is a live Stripe brief through Bifrost + Tavily, no replay, no cuts faked).
Suggested voiceover below — total ~2:00 at a calm pace.

## Shot list (matches footage, in order)

| # | On screen | Time | VO |
|---|---|---|---|
| 1 | Landing — "Read the room before you walk in." | 0:00–0:12 | "You've got a meeting this week with a company you should know better. Doorknock is a pre-meeting briefing agent: tell it who you're meeting and when, and a research crew reads up for you." |
| 2 | Form: Stripe · partnership · tomorrow | 0:12–0:25 | "Company or person, meeting time, the kind of meeting. One button." |
| 3 | Live feed: SCOUT planning, then Tavily queries flying with hit counts | 0:25–0:55 | "The crew plans its sweep: five queries covering launches, hires, funding, partnerships — the last thirty days only, because Tavily enforces the recency window on every news search. Everything is visible — every query, every hit count." |
| 4 | "source transcript sealed — 26 URLs recorded" + CLERK/SCRIBE stages | 0:55–1:10 | "The transcript is sealed — those URLs, and only those URLs, are now the only citable sources in the system." |
| 5 | AUDITOR gate verdict line — PASS, grounding 100% | 1:10–1:25 | "The Scribe drafts the brief. Then the auditor — which is not a model, it's a hundred lines of deterministic code — checks every claim against the sealed transcript. A claim citing a URL the crew never fetched is rejected and redrafted. Nothing untraceable ships." |
| 6 | The brief: headline, developments with sources, discussion points, open questions; grounding stamp; research trail | 1:25–1:50 | "The result: a one-page brief. Real developments — each with its sources. Discussion points tuned to the meeting. Open questions worth asking. A grounding score stamped on the document — and the full research trail underneath." |
| 7 | Bifrost dashboard clip (record separately — see below) | 1:50–1:58 | "Every model call runs through the Bifrost gateway — the app holds no provider key at all." |
| 8 | Close: repo card / brief print view | 1:58–2:05 | "Doorknock — read the room before you walk in. Open source, MIT." |

## The auditor-rejection beat (shot 5)

The live Stripe run passes the gate on the first draft — models behave when the
transcript is in their context. If you want the *rejection* moment on camera (it's
the strongest beat), record 15 seconds of terminal:

```bash
bun test tests/gate.test.ts
```

…showing `rejects a claim citing a fabricated URL` and `repair keeps traced
developments…` passing — the rejection path is deterministic and tested, so the
footage is honest. Splice it at 1:10 where shot 5 begins.

## Bifrost dashboard clip (shot 7)

`http://localhost:8080` (local gateway, `bun run bifrost`) — the dashboard shows
the nebius provider, the `doorknock-web` virtual key, and the request log from the
run you just recorded. 6–8 seconds of scrolling the requests table is enough.

## Recording notes

- Record voiceover in one pass, calm, ~2 min; the table above is the pacing guide.
- No editing needed on the run footage beyond trims — it's a real run, timestamps intact.
