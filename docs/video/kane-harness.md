# Kane demo video — production harness

Target: 2:30, 1080p30, screen capture + text cards + optional VO.
Everything on screen is a REAL run — no replay, no staged UI.

## Capture

Two dev-server sessions, screen-recorded in Chrome at 1080p:

```bash
# Session A — clean pass (beats 2–3)
bun dev   # port 3000, no sabotage

# Session B — Hydra loop (beats 4–5)
DOORKNOCK_SABOTAGE=strip-source-links bun dev
```

Recording options, pick one:

- **OBS Studio** — simplest reliable: window/display capture, 1080p30,
  macOS Screen Recording permission already granted.
- **ffmpeg avfoundation** — scriptable, no GUI:
  `ffmpeg -f avfoundation -capture_cursor 1 -framerate 30 -i "1:none" outA.mp4`
  (device index varies — `ffmpeg -f avfoundation -list_devices true -i ""`).
- **agent-browser** session recording if we drive the UI programmatically —
  but the crew run takes minutes and Kane spawns its own Chrome; a plain
  screen recording of the real browser is more honest footage.

Also capture: the Test Manager share-link playback (Kane's own browser
recording — the "proof" insert), and the print view (`Cmd+P` → PDF or
screenshot) for the end card.

## Assembly

- **Text cards** (cold open, "Now break it.", end card): HyperFrames
  (preferred per WinFactory workflow) or plain HTML → headless Chrome
  screenshot/record. `docs/video/endcard.html` already exists as a base.
- **Timeline**: ffmpeg concat + cuts, or a HyperFrames composition if we
  want animated text/cards. Keep it boring — hard cuts, no transitions
  except the deliberate smash-cut into the sabotage run.
- **Captions**: `.srt` from the VO script (manual or whisper.cpp on the
  VO track); burn in — hackathon judges skim with sound off.

## Audio

- **VO**: optional but recommended — ~140 words, calm pace. ElevenLabs
  (usual pipeline) or a single hot-mic pass; room tone under screen
  footage otherwise.
- **Music**: none, or a single low drone under the sabotage beat only.
  The product's own UI sounds (none) carry it — restraint is the brand.

## Deliverable

`doorknock-kane-demo.mp4` — H.264, 1920×1080, ≤5 min (target 2:30),
upload **unlisted** to YouTube, paste link in the submission form.

## Fallback honesty clause

If a live re-run flakes on camera, cut to `docs/kane/hydra-loop.sse` +
the Test Manager share links and narrate "this is the recorded run" —
never fake footage. The evidence files exist precisely for this.

## Checklist before recording

- [ ] `bun dev` clean (no `DOORKNOCK_SABOTAGE`) — Session A
- [ ] Chrome window sized to 1080p-ish, notifications off, bookmarks bar off
- [ ] `docs/kane/` folder open in a second window (Test Manager links)
- [ ] Kane credits healthy (`kane-cli whoami`)
- [ ] Recording permissions granted (OBS/ffmpeg screen capture)
- [ ] Session B dev server stopped before Session A recording, restarted with flag for B

## Build the 2:30 cut

1. Text cards first (cold open + "Now break it." + end card) — HyperFrames
   or HTML→Chrome; keep them typographic, no stock motion.
2. Conform Session A footage to beats 2–3: trim to the feed stream → brief
   render → `kane · passed · policy pass` stamp; insert the Test Manager
   playback for ~3s.
3. Smash-cut to Session B at the "Now break it." card; hold the Kane FAIL
   verdict ≥3s.
4. Let the FIXER → AUDITOR → Kane PASS sequence play near-real-time —
   this is the payoff, don't rush it.
5. End on the print view + repo/CI end card.
6. VO pass (if used) + burned captions; loudness-normalize (`ffmpeg -af loudnorm`).
7. Export `doorknock-kane-demo.mp4`, upload unlisted, paste into
   `docs/plan/kane-submission.md` checklist.
