# Kane CLI tests

Committed, replayable Kane CLI tests — the verification layer's own test
suite. Recordings live in each `output-*/` directory.

| Test | What it proves | Cost per replay |
|---|---|---|
| `doorknock-home_test.md` | Landing page renders: heading, form fields, Knock button | Kane credits only — runs in CI on every PR |
| `doorknock-brief-flow_test.md` | Full product loop: submits a real brief request, waits out the agent crew, verifies the rendered brief (developments + source links, discussion points, open questions, sources, verdict stamp) | One real research run (Tavily + LLM) + ~45 Kane credits — manual/dispatch only, never in PR CI |

Both pin `chrome_profile: .kane/chrome-profile` in frontmatter — a dedicated
profile, required because Chrome refuses CDP on a profile that's already
running. The dir is gitignored; Kane creates it.

## Replay

```bash
npm install -g @testmuai/kane-cli
kane-cli login            # or --username/--access-key in CI

kane-cli testmd run tests/kane/doorknock-home_test.md --agent --headless
# retarget a different deployment:
kane-cli testmd run tests/kane/doorknock-home_test.md --agent --headless \
  --url https://your-deploy.example.com
# judge the sealed evidence pack against the repo's policy contract:
kane-cli testmd run tests/kane/doorknock-home_test.md --agent --headless \
  --policy kane/policy.yaml
```

Exit codes: `0` pass · `1` a step failed or a blocking policy gate failed ·
`2` setup/parse error · `3` timeout or an errored verdict.

CI: `.github/workflows/kane.yml` builds the app, serves it on :3000, and
replays `doorknock-home_test.md` with `--policy kane/policy.yaml` on every
pull request; `workflow_dispatch` replays against the live deploy.

## The live loop

The app's own verification (`POST /api/verify`) runs `kane-cli run` against
`/?run=<id>` and then judges the sealed evidence pack against
`kane/policy.yaml` — see `docs/kane/` for recorded pass/fail/repair evidence
and `kane/` for the policy itself (also stored in Test Manager as
`doorknock-brief-gate`).
