# Kane CLI verification — recorded evidence

Captured 17 November 2026 on localhost against the live crew, `kane-cli` 0.10.5,
account `thepapajams`. These are the raw SSE streams the app's
`POST /api/verify` endpoint emits — the same events the live feed renders.

## Runs

| File | What happened | Kane verdicts |
|---|---|---|
| `verify-pass.sse` | Clean Stripe partnership brief → single Kane audit | **passed** (88s, ~20 credits) — [watch the run](https://test-manager.lambdatest.com/projects/01M7NPNZQ7KW5WZGTJQR1EC99S/test-cases/01M7NT6K6GR9M5QCF5B1WVD9Q1/dashboard/share/US_D7MHH1S6ZNKCKIHH7FB9DLTX2YLA0H4KLG8NDOKW4F8P97RVPTM1RKC2BR4NEZX5?type=summary&agentView=true&fqdn=summary-page) |
| `sabotaged-brief.sse` | The crew's `done` event for the Anthropic run, after `DOORKNOCK_SABOTAGE=strip-source-links` removed every development's source links — the defect Kane was about to catch | n/a (brief stream) |
| `hydra-loop.sse` | The full closed loop on that sabotaged brief | attempt 1 **failed** — "development cards have no source links" ([run](https://test-manager.lambdatest.com/projects/01M7NPNZQ7KW5WZGTJQR1EC99S/test-cases/01M7NTFN2FPPWAWNCBDFTWWBH8/dashboard/share/US_W0CV0QHAA80KUZJEHH2JIMGANJA9USLM5PGRZ8W0WSRJIRE32B4ICCDEZR4G3DHT?type=summary&agentView=true&fqdn=summary-page)) → FIXER rewrote against the transcript → AUDITOR re-gated PASS 3/3 → attempt 2 **passed** ([run](https://test-manager.lambdatest.com/projects/01M7NPNZQ7KW5WZGTJQR1EC99S/test-cases/01M7NTK8TWRPZD5YJMHR68N7QQ/dashboard/share/US_2S4O95RFDG2XTIA0IJHYEJVNLTLJZS9VXIIZ23QGGZWUYFE9PHJSHIZ3PPMML5W2?type=summary&agentView=true&fqdn=summary-page)) |

## Reproduce

```bash
# 1. crew produces a brief (needs TAVILY_API_KEY + Bifrost/LLM creds)
curl -N -X POST localhost:3000/api/brief \
  -H 'Content-Type: application/json' \
  -d '{"subject":"Stripe","meetingAt":"2026-11-20T15:00","kind":"partnership"}'
# → note runId in the done event

# 2. Kane audits the rendered brief; repair:true closes the loop
curl -N -X POST localhost:3000/api/verify \
  -H 'Content-Type: application/json' \
  -d '{"runId":"<runId>","repair":true}'

# 3. to demo the Hydra loop: restart with DOORKNOCK_SABOTAGE=strip-source-links
#    and repeat — Kane fails, FIXER repairs, Kane re-verifies.
```

Kane needs `kane-cli` installed + logged in and Chrome on the app's host
(`KANE_VERIFY=off` disables `/api/verify`; `KANE_CLI_BIN`,
`KANE_CHROME_PROFILE`, `KANE_TARGET_ORIGIN`, `KANE_POLICY` tune it). The app
probes the binary once — hosts without it report verification unavailable.

Every verdict also seals a Kane evidence pack judged against
[`kane/policy.yaml`](../../kane/policy.yaml) (`doorknock-brief-gate`, also in
Test Manager): zero failed/broken steps, zero unexplained failures, every
test asserting — warnings on heal-drift and flaky tests. The policy result
shows on the brief stamp and print footer.

## Committed tests & CI

- `tests/kane/doorknock-home_test.md` — landing-page audit; replays in CI.
- `tests/kane/doorknock-brief-flow_test.md` — Kane drove the full
  form → crew → rendered-brief loop on prod (passed, 268s, ~45cr;
  [watch](https://test-manager.lambdatest.com/projects/01M7NPNZQ7KW5WZGTJQR1EC99S/test-cases/01M7NXCHD04K1J84A2XRK28V7P/dashboard/share/US_XIISG6LREKQBZ41N1CF12ZZ6PZCPG8FK4IO1XONPGUZZBRKVYL212V8KBZ4G93A9?type=summary&agentView=true&fqdn=summary-page)).
  Manual/dispatch only — it spends a real research run.
- `.github/workflows/kane.yml` — `pull_request` builds the app, serves :3000,
  replays the home test with `--policy`; the `kane-verify / kane` check is
  **required** on `main`. `workflow_dispatch` replays against the live deploy.
  Secrets: `KANE_USERNAME` / `KANE_ACCESS_KEY` (TestMu dashboard → Settings → Keys).
