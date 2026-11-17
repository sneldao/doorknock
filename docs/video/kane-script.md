# Doorknock × Kane CLI — hackathon demo script (3–5 min)

Footage: real runs only. Two sessions needed:

- **Session A (clean):** normal `bun dev` — brief run + auto-verify pass.
- **Session B (Hydra):** `DOORKNOCK_SABOTAGE=strip-source-links bun dev` —
  the defect is real (the app strips every development's source links
  server-side); Kane catches it, FIXER repairs it.

Keep `docs/kane/` open in a second window for the Test Manager links.

## Shot list

| # | On screen | ~Time | VO |
|---|---|---|---|
| 1 | Title card / landing | 0:00–0:15 | "Agents ship bugs. The Kane CLI hackathon asks: what if verification was a crew member, not a checklist? Doorknock — a pre-meeting briefing agent — now audits itself with Kane." |
| 2 | Session A: form → live feed (SCOUT queries → CLERK → SCRIBE → AUDITOR PASS) | 0:15–1:15 | "The crew sweeps thirty days of news through Tavily, seals the transcript, drafts the brief — and a deterministic auditor rejects any claim that can't trace to a fetched URL." |
| 3 | Brief renders → auto-verify fires → KANE rows stream → `kane · passed · policy pass` stamp | 1:15–1:50 | "When the brief finishes, Kane CLI opens it in a real browser — no mocks — and audits that every section renders populated. Then it judges its own sealed evidence pack against a policy contract: zero failed steps, every test asserting something. Policy pass." |
| 4 | Test Manager share link opens — Kane's own recording of the audit | 1:50–2:15 | "This is Kane's evidence — the actual browser session, recorded. It's not a screenshot of a test; it's the test." |
| 5 | Session B: same flow, sabotage on → brief renders WITHOUT source links → Kane FAILS: 'development cards have no source links' | 2:15–3:15 | "Now the Hydra moment. We inject one real defect — strip every source link. Kane catches it in a real browser and fails the run, naming exactly what's wrong." |
| 6 | FIXER stage → AUDITOR re-gate PASS → new /?run= URL → Kane PASS attempt 2 · policy pass | 3:15–4:15 | "The failure doesn't stop at a red X — it goes back to the crew. The fixer rewrites the brief strictly against the sealed transcript, the auditor re-gates it, and Kane opens the repaired brief and verifies again. Fail, repair, re-verify — the closed loop." |
| 7 | Print view — 'Browser-verified by Kane CLI — passed · evidence policy pass · watch the run' | 4:15–4:40 | "The proof travels with the artifact — the printed brief carries Kane's verdict and a link to watch the run." |
| 8 | Repo flash: tests/kane/*_test.md, kane/policy.yaml, .github/workflows/kane.yml + 'kane-verify / kane' required check | 4:40–5:00 | "The repo's own tests are Kane tests. CI can't merge without a green Kane run — verification is the merge gate. Doorknock: read the room before you walk in — and prove it renders." |

## Recording notes

- Session B's Kane fail lands ~60–90s after Knock; don't cut away early.
- The `verifyDone` SSE tail and the second `kane · passed` stamp are the
  payoff — let them sit on screen 3+ seconds.
- If a live re-run flakes, `docs/kane/hydra-loop.sse` + the Test Manager
  links are the honest fallback — say so on camera rather than faking.
