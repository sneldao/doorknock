# Doorknock × Kane CLI — hackathon demo script (2:30 cut)

Structure: open on the failure, let the repair loop be the payoff, clean
pass as a coda. Every second earns its place — the sabotage fail IS the
demo; everything before it is setup.

## Shot list

| # | Beat | ~Time | What happens |
|---|---|---|---|
| 1 | **Cold open — the claim** | 0:00–0:10 | Black card, hard cut: *"Your agent ships. Who checks what the user actually sees?"* → Doorknock landing, form already filled. No logo animation. |
| 2 | **The crew works** | 0:10–0:45 | One real brief run (sabotage OFF). Fast-cut the live feed — SCOUT queries → "source transcript sealed" → CLERK → SCRIBE → AUDITOR PASS. No per-agent narration; the feed explains itself. Land on the rendered brief. |
| 3 | **Kane stamps it** | 0:45–1:15 | `done` fires → auto-verify streams KANE rows → `kane · passed · policy pass` stamp on the brief. Cut to the Test Manager share link — Kane's own browser recording plays ~3s. |
| 4 | **The Hydra head** | 1:15–1:45 | Hard cut, text card: *"Now break it."* Session B (`DOORKNOCK_SABOTAGE=strip-source-links`): brief renders with zero source links → Kane FAILS naming the defect — "development cards have no source links". Hold on the verdict. |
| 5 | **The loop closes** | 1:45–2:20 | FIXER stage streams → AUDITOR re-gate PASS 3/3 → new `/?run=` URL → Kane attempt 2 PASS · policy pass. The stamp flips green on camera — let it sit 2s. |
| 6 | **Proof travels + end card** | 2:20–2:30 | Print view: `Browser-verified by Kane CLI · policy pass · watch the run`. End card: repo URL + `tests/kane/` + `kane-verify / kane` required-check badge. |

## Recording sessions

- **Session A** — normal `bun dev` (port 3000), record beats 2–3.
- **Session B** — `DOORKNOCK_SABOTAGE=strip-source-links bun dev`, record beats 4–5.
- Keep `docs/kane/` open in a second window for Test Manager links.

## Recording notes

- Beat 4's Kane fail lands ~60–90s after Knock — don't cut away early;
  the wait IS the suspense.
- If a live re-run flakes: `docs/kane/hydra-loop.sse` + Test Manager links
  are the honest fallback — say so on camera rather than faking.
- All footage is real runs — no replay, no staged UI.

## VO (optional, ~140 words at calm pace)

> Your agent ships. Who checks what the user actually sees?
>
> Doorknock is a pre-meeting briefing agent — a crew researches the last
> thirty days, drafts the brief, and a deterministic auditor rejects any
> claim that can't trace to a fetched source.
>
> When the brief finishes, Kane CLI opens it in a real browser and audits
> that every section renders — then judges its own evidence pack against
> a policy contract. Pass.
>
> Now break it. We strip every source link — one real defect. Kane catches
> it in a real browser and fails the run, naming exactly what's wrong.
>
> The failure goes back to the crew. The fixer rewrites against the sealed
> transcript, the auditor re-gates, and Kane verifies the repaired brief.
> Fail. Repair. Re-verify.
>
> The proof travels with the artifact — and in this repo, the tests are
> Kane tests, and CI can't merge without a green run.
>
> Doorknock. Read the room before you walk in — and prove it renders.

## Assembly

See `docs/video/kane-harness.md` for the capture/edit pipeline.
