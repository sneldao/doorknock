# Kane CLI tests

Committed, replayable Kane CLI tests — the verification layer's own test
suite. `doorknock-home_test.md` audits the production landing page; its
recordings live in `output-doorknock-home/` so replays need no LLM calls.

## Replay

```bash
npm install -g @testmuai/kane-cli
kane-cli login            # or --username/--access-key in CI

# The committed test pins chrome_profile: .kane/chrome-profile in its
# frontmatter — a dedicated profile, required because Chrome refuses CDP on
# a profile that's already running. The dir is gitignored; Kane creates it.
#
# Replay:
kane-cli testmd run tests/kane/doorknock-home_test.md --agent --headless
# retarget a different deployment:
kane-cli testmd run tests/kane/doorknock-home_test.md --agent --headless \
  --url https://your-deploy.example.com
```

Exit codes: `0` pass · `1` a step failed · `2` setup/parse error · `3` timeout.

CI: `.github/workflows/kane.yml` replays this test on demand (secrets
`KANE_USERNAME` / `KANE_ACCESS_KEY`).

## The live loop

The app's own verification (`POST /api/verify`) runs `kane-cli run` against
`/?run=<id>` — see `docs/kane/` for recorded pass/fail/repair evidence.
