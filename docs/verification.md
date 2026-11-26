# Verification — the gate and the browser loop

Doorknock's core idea: **models draft, deterministic code verifies against
ground truth the models can't touch.** Two independent layers:

1. **The gate** — a deterministic auditor that rejects any claim that can't be
   traced to a source the research crew actually fetched.
2. **The browser loop** — Kane CLI opens the finished brief in real Chrome and
   proves it actually renders; failures go back to the crew for repair.

## The gate

The Scribe is *allowed* to hallucinate; the auditor won't let it ship.
`src/lib/gate.ts` is ~100 lines of deterministic code, no model:

1. The Scout's transcript (every URL Tavily actually returned) is sealed before
   any drafting begins.
2. Each key development must cite ≥1 transcript URL (normalized: hash and
   trailing-slash insensitive on both sides).
3. Every figure a development or a top-level line states — any number, amount,
   percentage or date — must appear in the excerpt the model actually saw for
   the cited sources (title + first 320 chars of the snippet + published date).
   A real URL does not rescue an invented number: "$40M" citing a fetched page
   that never mentions 40 million is a fabrication, rejected like a fake URL.
   Figures the operator supplied (subject, meeting time, notes, today's date —
   and the 30-day window itself) are allowed.
4. Every capitalised name — person, company or product — must likewise appear
   in the cited excerpts (or the operator-supplied context). The extractor
   ignores ordinary sentence capitalisation and strips possessives; "Bank of
   England" counts as one name. A development that claims to be in-window but
   cites only sources older than 45 days is flagged `stale_source`.
5. **Grounding score** = traced developments ÷ total developments,
   threshold 0.8.
6. Fail → REJECT with a machine-readable report naming the offending claims →
   the Scribe redrafts once → still failing, the repair pass strips
   untraceable, name-unsupported, figure-unsupported or stale developments
   into the *uncertain — treat with caution* section and cuts offending
   sentences from the prose. The user always sees what was kept, what was
   flagged, and why. Untraceable material is never deleted silently.

The gate's tests (`tests/gate.test.ts`, driven by the shared fixture
`tests/gate-cases.json` — shared verbatim with the Anna app) run with no
network, no keys, no models — the auditor's behavior is fully specified in
code.

## The browser loop (Kane CLI)

The gate proves claims trace to sources; **Kane CLI proves the brief actually
renders**. Every finished run is stored and re-opened at a stable URL
(`/?run=<id>`), then `POST /api/verify` shells out to
`kane-cli run --agent --headless` — a real Chrome browser audits that the
masthead, headline, key developments (each with source links), discussion
points, open questions and sources list all render populated.

Kane answers in structured NDJSON (`run_end`), which the app parses into a
verdict. On **FAIL**, the report goes back to the crew: the **FIXER** agent
rewrites the brief strictly against the sealed transcript URL list, the
deterministic AUDITOR re-gates the rewrite, and Kane opens a fresh
`/?run=<id2>` and audits again. Fail → repair → re-verify, until green or out
of repairs — all streamed live in the feed.

Kane needs `kane-cli` installed and logged in plus Chrome on the host serving
the app (`KANE_VERIFY=off` disables; `KANE_CLI_BIN`, `KANE_CHROME_PROFILE`,
`KANE_TARGET_ORIGIN`, `KANE_POLICY` tune it). The app probes the binary once —
hosts without it report verification unavailable instead of erroring.

**Evidence policy.** Every verify run seals a Kane evidence pack, judged
against [`kane/policy.yaml`](../kane/policy.yaml) — a contract requiring zero
failed/broken steps, zero unexplained failures, every test asserting
something, and warnings on heal-drift or flaky tests. The verdict rides on
`KaneVerdict.policy` and shows up as `policy pass|fail` on the brief stamp and
in print. The same policy is enforced in CI: `.github/workflows/kane.yml`
replays the committed `tests/kane/` suite on every PR against a locally-built
app and on dispatch against the live deploy —
`kane-cli testmd run --policy kane/policy.yaml` exits non-zero if the policy
fails, so a PR can't merge on an uncertified build.

**Kane-native tests.** `tests/kane/` holds replayable `_test.md` suites with
their recordings — `doorknock-home_test.md` audits the landing page (runs in
CI); `doorknock-brief-flow_test.md` drives the full form → crew →
rendered-brief flow end to end (manual/dispatch — it spends a real research
run).

Recorded evidence of the loop catching a real defect: [`kane/`](kane/README.md).
