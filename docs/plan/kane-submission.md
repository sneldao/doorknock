# Kane CLI Online Hackathon — submission tracker

Event: https://www.kaneclihack.sh/ · Deadline **26 Nov 2026, 11:59 PM IST** (extended from 19 Nov)
Repo: https://github.com/sneldao/doorknock (public, MIT)
Live app: https://doorknock-2azp.onrender.com (Kane verify runs locally —
Render has no kane-cli/Chrome; recorded evidence is the fallback)

## Mandatory bars → where they're proven

| Bar | Evidence |
|---|---|
| Works end to end | Live deploy; `tests/kane/doorknock-brief-flow_test.md` — Kane drove form → crew → rendered brief on prod (passed, 268s) |
| Kane caught/proved something meaningful | `docs/kane/hydra-loop.sse` — Kane FAILED a sabotaged brief ("development cards have no source links"), FIXER repaired, AUDITOR re-gated PASS 3/3, Kane re-verified PASS. Test Manager runs linked in `docs/kane/README.md` |
| Kane's result feeds back to the agent | `POST /api/verify` → Kane verdict → FIXER rewrite → AUDITOR re-gate → new `/?run=` → Kane re-verify. Literal loop, in code and on camera |

## Judging dimensions → hooks

- **Ships (25%)** — live app, committed Kane-native test suite (`tests/kane/`),
  required CI check `kane-verify / kane` on `main` (branch protection set)
- **Verified (25%)** — three-layer stack: deterministic claim-auditor →
  real-browser Kane audit → `kane/policy.yaml` evidence contract
  (`doorknock-brief-gate`, stored in Test Manager `pol_01M7NX9M78JR00Y6KJ06895HDT`)
- **Closed loop (25%)** — fail → repair → re-verify, max 1 repair, all streamed
- **Craft (25%)** — printable brief carries the Kane stamp + watch link;
  `?run=` stable URLs; sabotage flag for honest demos

## Submission checklist

- [x] Public repo initialized inside window (first commit 15 Nov)
- [x] Kane CLI run many times (11k-credit account `thepapajams`)
- [x] Committed replayable tests + recordings (`tests/kane/`)
- [x] Evidence policy in repo + Test Manager
- [x] CI gate: PRs can't merge without `kane-verify / kane` green
- [x] Recorded evidence pack (`docs/kane/*.sse` + Test Manager share links)
- [ ] **3–5 min YouTube demo** — script: `docs/video/kane-script.md`
- [ ] **≥2 public posts** (HN Show + LinkedIn/X) — draft alongside video
- [ ] **Submission form** — repo, video link, posts, description, creds:
      - Tavily: `TAVILY_API_KEY` (user has it)
      - LLM: Bifrost gateway (`BIFROST_BASE_URL`/`BIFROST_API_KEY`) or
        `LLM_BASE_URL`/`LLM_API_KEY` — see `.env.example`
      - Kane: OAuth login (`kane-cli login`) or basic auth
        (username `thepapajams` + access key from Settings → Keys;
        CI secrets already set on the repo)
      - Fallback: recorded Kane runs in `docs/kane/` replay the whole story
- [ ] Submit before deadline

## Demo-video shot list (see kane-script.md for VO)

1. Cold open: the Hydra line — "cut one head off, two grow back — unless
   Kane is watching"
2. Real brief run → auto-verify → Kane PASS + `policy pass` stamp
3. Restart with `DOORKNOCK_SABOTAGE=strip-source-links` → new brief
4. Kane FAILS naming the missing source links (Test Manager link on screen)
5. FIXER rewrites → AUDITOR PASS 3/3 → Kane PASS on repaired `/?run=`
6. Print the brief — Kane stamp + watch-the-run link travels with it
7. Repo flash: `tests/kane/`, `kane/policy.yaml`, `kane.yml` required check
