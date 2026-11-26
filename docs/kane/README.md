# Kane CLI verification — recorded evidence

> **Kane CLI hackathon reviewers — start here.**
> Doorknock uses Kane CLI as its proof layer: every generated brief is opened
> in real Chrome at a stable URL and audited, and failures feed back to the
> agent crew for repair. Where each judging dimension is proven:
>
> | Dimension | Evidence |
> |---|---|
> | **Ships** | Live app: https://doorknock-2azp.onrender.com · committed Kane-native suite [`tests/kane/`](../../tests/kane/) · `kane-verify / kane` is a **required** check on `main` — PRs cannot merge uncertified |
> | **Verified** | Three layers: deterministic claim-auditor ([`src/lib/gate.ts`](../../src/lib/gate.ts)) → real-browser Kane audit → evidence-policy contract [`kane/policy.yaml`](../../kane/policy.yaml) (zero failed/broken steps, every test asserting) |
> | **Closed loop** | `hydra-loop.sse` below — Kane **failed** a sabotaged brief ("development cards have no source links"), the FIXER agent repaired it, the auditor re-gated, Kane re-verified **pass**. Literal fail → repair → re-verify, in the committed stream |
> | **Craft** | The printable brief carries the Kane verdict stamp; `/?run=<id>` stable URLs; `DOORKNOCK_SABOTAGE` flag for honest reproduction |
>
> **Demo video (2 min):** https://youtu.be/Gi9SCwrX6nk — the loop above, on camera.
> How it all works: [`../verification.md`](../verification.md) · reproduce it yourself: [Reproduce](#reproduce) below.

Captured 17 November 2026 on localhost against the live crew, `kane-cli` 0.10.5,
account `thepapajams`. These are the raw SSE streams the app's
`POST /api/verify` endpoint emits — the same events the live feed renders.

Test Manager share links are no-login links with a 7-day expiry. The links below
were refreshed on 25 November 2026; if one stops loading, open the matching test
case in Test Manager and use **Share test case → Copy Link** to mint a fresh one.
The committed SSE streams and Kane recordings above remain the permanent evidence.

## Runs

| File | What happened | Kane verdicts |
|---|---|---|
| `verify-pass.sse` | Clean Stripe partnership brief → single Kane audit | **passed** (88s, ~20 credits) — [watch the run](https://test-manager.lambdatest.com/projects/01M7NPNZQ7KW5WZGTJQR1EC99S/test-cases/01M7NT6K6GR9M5QCF5B1WVD9Q1/dashboard/share/US_CFP3OE2080051O2I181RHZ2K0OEKO06QM6US6IK5N5WT4GQ3Z4UEJPUWG282GA9U) |
| `sabotaged-brief.sse` | The crew's `done` event for the Anthropic run, after `DOORKNOCK_SABOTAGE=strip-source-links` removed every development's source links — the defect Kane was about to catch | n/a (brief stream) |
| `hydra-loop.sse` | The full closed loop on that sabotaged brief | attempt 1 **failed** — "development cards have no source links" ([run](https://test-manager.lambdatest.com/projects/01M7NPNZQ7KW5WZGTJQR1EC99S/test-cases/01M7NTFN2FPPWAWNCBDFTWWBH8/dashboard/share/US_Y5SBPNNSMSQ4YFFPKQQ7CIYB4F93SK4DOUOLSH2JEW9TN0Y8UNGLA211N1LJX9MV)) → FIXER rewrote against the transcript → AUDITOR re-gated PASS 3/3 → attempt 2 **passed** ([run](https://test-manager.lambdatest.com/projects/01M7NPNZQ7KW5WZGTJQR1EC99S/test-cases/01M7NTK8TWRPZD5YJMHR68N7QQ/dashboard/share/US_OKN8HWTAR17CSDOJT64B5I9SB8BCK8TH9VBE4YRKUUZA9Q3V1ETL5HETKNJOXBH2)) |

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
  [watch](https://test-manager.lambdatest.com/projects/01M7NPNZQ7KW5WZGTJQR1EC99S/test-cases/01M7NXCHD04K1J84A2XRK28V7P/dashboard/share/US_ILH296WZSEHUJ3EUCFA0DZUKS9PD23MX37IIS05QJ23EATGSF9WSBV8N3CK5Y4OY)).
  Manual/dispatch only — it spends a real research run.
- `.github/workflows/kane.yml` — `pull_request` builds the app, serves :3000,
  replays the home test with `--policy`; the `kane-verify / kane` check is
  **required** on `main`. `workflow_dispatch` replays against the live deploy.
  Secrets: `KANE_USERNAME` / `KANE_ACCESS_KEY` (TestMu dashboard → Settings → Keys).
