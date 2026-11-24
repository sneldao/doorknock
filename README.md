# Doorknock

**Read the room before you walk in.**

A pre-meeting briefing agent built for the [Global AI Hackathon](https://hackculture.io/hackathons/ai-global-hackathon), **Problem Statement 05 — Tavily Research Agent**. Tell Doorknock who you're meeting (a company or a person) and when. A four-agent research crew sweeps the last 30 days of news through **Tavily**, drafts a one-page briefing, and a deterministic **auditor rejects any claim that can't be traced to a source the crew actually fetched**.

*Agents propose, code disposes.*

Built 15 November 2026, inside the hackathon build window (1–15 Nov).

**Live:** https://doorknock-2azp.onrender.com · **Deck:** [`docs/deck/Doorknock.pdf`](docs/deck/Doorknock.pdf) · **Demo:** [youtu.be/Gi9SCwrX6nk](https://youtu.be/Gi9SCwrX6nk) (1:58 — Kane fail → repair → re-verify, [Kane CLI Online Hackathon](https://www.kaneclihack.sh/) entry) · earlier product cut: [`docs/video/doorknock-demo.mp4`](docs/video/doorknock-demo.mp4)

## Why

Preparing for an important meeting means researching the other party — recent launches, leadership changes, funding, announcements. That information is scattered, manual research takes an hour nobody has, and off-the-shelf AI summaries quietly invent things. The problem statement asks for exactly the fix: *recent, source-backed information, concisely presented, with verified findings distinguished from uncertain ones.*

Doorknock is that agent, end to end:

- **Meeting context in** — company or person, meeting time, meeting type (sales / partnership / investor / BD / general)
- **30-day research out** — Scout derives and runs a multi-query Tavily sweep restricted to the preceding 30 days (news, launches, hires, funding, partnerships)
- **One-page briefing** — headline, situation, key developments, discussion points, open questions
- **Every claim traced** — the gate keeps nothing that doesn't trace to a fetched source
- **Verified ≠ uncertain** — untraceable material is never deleted silently; it's moved to a clearly-flagged *uncertain* section, so verified findings stay distinguishable

## The crew

| Agent | Job |
|---|---|
| **SCOUT** · research | Derives 4–6 queries from the meeting context and runs the Tavily sweep (news, ≤30 days + one evergreen identity query) |
| **CLERK** · synthesis | Clusters the fetched hits into distinct developments, each citing exact transcript URLs |
| **SCRIBE** · drafting | Writes the one-page brief for the meeting at hand |
| **AUDITOR** · verification | **Deterministic code, no model.** Every development must cite a URL that exists in the Scout's transcript. Untraced claims → REJECT, the Scribe redrafts; if a redraft still fails, the repair pass moves untraceable items to the *uncertain* section. A grounding score ships on the finished brief |
| **KANE** · browser proof | **Kane CLI** (`kane-cli run --agent --headless`) opens the finished brief at its stable `/?run=<id>` URL in a real Chrome browser and audits that every section renders populated — developments with source links, discussion points, open questions, the sources list |
| **FIXER** · repair | On a Kane FAIL, the failure report goes back to the crew: the FIXER rewrites the brief strictly against the sealed transcript, the AUDITOR re-gates it, and Kane re-verifies. Fail → repair → re-verify, until green or out of repairs |

The whole run streams live over SSE: you watch each query fly, see Tavily hit counts, watch the auditor's verdicts — including the rejections.

## The gate

The interesting part of Doorknock is that its most important agent isn't a model. The Scribe is *allowed* to hallucinate; the auditor won't let it ship. `src/lib/gate.ts` is ~100 lines of deterministic code:

1. The Scout's transcript (every URL Tavily actually returned) is sealed before any drafting begins.
2. Each key development must cite ≥1 transcript URL (normalized: hash and trailing-slash insensitive on both sides).
3. Every figure a development or a top-level line states — any number, amount, percentage or date — must appear in the excerpt the model actually saw for the cited sources (title + first 320 chars of the snippet + published date). A real URL does not rescue an invented number: "$40M" citing a fetched page that never mentions 40 million is a fabrication, rejected like a fake URL. Figures the operator supplied (subject, meeting time, notes, today's date — and the 30-day window itself) are allowed.
4. Every capitalised name — person, company or product — must likewise appear in the cited excerpts (or the operator-supplied context). The extractor ignores ordinary sentence capitalisation and strips possessives; "Bank of England" counts as one name. A development that claims to be in-window but cites only sources older than 45 days is flagged `stale_source`.
5. **Grounding score** = traced developments ÷ total developments, threshold 0.8.
6. Fail → REJECT with a machine-readable report naming the offending claims → the Scribe redrafts once → still failing, the repair pass strips untraceable, name-unsupported, figure-unsupported or stale developments into the *uncertain — treat with caution* section and cuts offending sentences from the prose. The user always sees what was kept, what was flagged, and why.

This is a small instance of a general pattern for making LLM agents safe to ship: **models draft, deterministic code verifies against ground truth the models can't touch.** The gate's tests (`tests/gate.test.ts`, driven by the shared fixture `tests/gate-cases.json` — 44 cases plus targeted tests, shared verbatim with the Anna app) run with no network, no keys, no models — the auditor's behavior is fully specified in code.

## The Kane loop

The auditor proves claims trace to sources; **Kane CLI proves the brief actually renders**. Every finished run is stored and re-opened at a stable URL (`/?run=<id>`), then `POST /api/verify` shells out to `kane-cli run --agent --headless` — a real Chrome browser audits that the masthead, headline, key developments (each with source links), discussion points, open questions and sources list all render populated.

Kane answers in structured NDJSON (`run_end`), which the app parses into a verdict. On **FAIL**, the report doesn't stop at a red X — it goes back to the crew: the **FIXER** agent rewrites the brief strictly against the sealed transcript URL list, the deterministic AUDITOR re-gates the rewrite, and Kane opens a fresh `/?run=<id2>` and audits again. Fail → repair → re-verify, until green or out of repairs — the Hydra loop from the Kane CLI hackathon brief, running live in the feed.

Kane needs `kane-cli` installed and logged in plus Chrome on the host serving the app (`KANE_VERIFY=off` disables; `KANE_CLI_BIN`, `KANE_CHROME_PROFILE`, `KANE_TARGET_ORIGIN`, `KANE_POLICY` tune it). The app probes the binary once — hosts without it (e.g. the Render deploy) report verification unavailable instead of erroring, and the recorded Kane run in `docs/` is the fallback.

**Evidence policy.** Every verify run seals a Kane evidence pack, which is then judged against [`kane/policy.yaml`](kane/policy.yaml) — a contract requiring zero failed/broken steps, zero unexplained failures, every test asserting something, and warnings on heal-drift or flaky tests. The verdict rides on `KaneVerdict.policy` and shows up as `policy pass|fail` on the brief stamp and in print. The same policy is stored in Test Manager (`doorknock-brief-gate`) and enforced in CI: `.github/workflows/kane.yml` replays the committed `tests/kane/` suite on every PR against a locally-built app and on dispatch against the live deploy — `kane-cli testmd run --policy kane/policy.yaml` exits non-zero if the policy fails, so a PR can't merge on an uncertified build.

**Kane-native tests.** `tests/kane/` holds replayable `_test.md` suites with their recordings — `doorknock-home_test.md` audits the landing page (runs in CI); `doorknock-brief-flow_test.md` drives the full form → crew → rendered-brief flow end to end (manual/dispatch — it spends a real research run).

## Architecture

```
Browser ──POST /api/brief (SSE)──▶ Next.js route handler
                                      │
                        ┌─────────────┴──────────────┐
                        │   the crew (src/lib/crew)   │
                        │                            │
                        │  SCOUT ──▶ Tavily API      │  30-day news sweep,
                        │            (topic: news)   │  transcript sealed
                        │                            │
                        │  CLERK / SCRIBE ──▶ Bifrost gateway ──▶ Nebius
                        │                     (OpenAI-compatible)  Nemotron
                        │                            │
                        │  AUDITOR (pure code)       │  source-tracing gate,
                        │                            │  deterministic
                        │                            │
                        │  KANE · FIXER              │  real-browser audit via
                        │  (kane-cli → Chrome)       │  Kane CLI; failures go
                        │                            │  back to the crew
                        └────────────────────────────┘
```

- **Bifrost** (title partner) — every model call in the app routes through the Bifrost gateway. Doorknock never talks to a model provider directly; the switch is one base URL. Bifrost's virtual-key governance scopes the app's access to the nebius provider, so the gateway is doing real work here (routing, auth, observability), not decoration. Local dev runs the gateway with `npx @maximhq/bifrost`; the deploy runs it as a private Docker service.
- **Tavily** (track partner) — the entire research layer. `topic: "news"` + `days: 30` give the recency window the problem statement demands; every hit (title, URL, snippet, published date) lands in the sealed transcript the gate audits against.
- **Nemotron** — the crew runs on NVIDIA's open `nemotron-3-super-120b-a12b` via Nebius, behind Bifrost.

## Quickstart

Needs Node 22+ (or Bun) and keys: a [Tavily](https://app.tavily.com) key (free credits for hackathon participants) and one OpenAI-compatible model endpoint — either a Bifrost gateway or a direct provider.

```bash
bun install            # or npm install
cp .env.example .env.local   # add TAVILY_API_KEY + gateway/pro creds

# local Bifrost gateway (recommended — the way it's meant to run):
bun run bifrost       # npx -y @maximhq/bifrost  → http://localhost:8080
#   in the Bifrost web UI: add the nebius provider with your key,
#   create a virtual key, and put it in BIFROST_API_KEY below.
#   (or set a BIFROST_SETUP_TOKEN and use the API — see scripts/bootstrap-bifrost.mjs)

bun run dev           # http://localhost:3000
```

`.env.local`:

```ini
TAVILY_API_KEY=tvly-…
BIFROST_BASE_URL=http://localhost:8080/v1
BIFROST_API_KEY=<bifrost virtual key — x-bf-vk / Bearer>
BRIEF_MODEL=nebius/nvidia/nemotron-3-super-120b-a12b
# bare-dev alternative (no gateway): LLM_BASE_URL + LLM_API_KEY
```

Try it: subject **"Stripe"**, meeting tomorrow, type *partnership* → watch the crew work, then read the brief.

## Checks

```bash
bun test          # the auditor gate: 62 deterministic tests, no keys, no network
bun run typecheck
bun run lint
bun run build
```

## Routes

| Path | What |
|---|---|
| `/` | The desk — brief request form, live crew feed (Tavily queries as they fly, auditor verdicts as they land), the finished one-page brief (print-optimized). `/?run=<id>` re-opens a stored brief — the URL Kane audits |
| `POST /api/brief` | Starts a run, streams `stage` / `search` / `sources` / `gate` / `done` (with `runId`) / `error` events as SSE |
| `GET /api/runs/<id>` | The stored brief behind `/?run=<id>` (30-minute TTL) |
| `POST /api/verify` | `{runId, repair?}` → streams `kane` verdicts, optional FIXER repair + AUDITOR re-gate, ends `verifyDone` |

## Tech

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind CSS v4 · AI SDK (`generateText` over OpenAI-compatible) · zod v4 · Tavily search API · Bifrost AI Gateway v2 · Kane CLI (browser verification) · fonts: Fraunces / Inter / JetBrains Mono.

The design is a deliberate *intelligence brief*: paper, ink, telex rules, an oxblood grounding stamp. A brief should read like a document, not a dashboard.

## The Anna app

`anna/` is a bundle-only port of the same pipeline to the Anna AI OS marketplace — host `web.search` + `llm.complete` replace Tavily/Bifrost, `bundle/gate.js` is a 1:1 port of the auditor. The first submission (16 Nov 2026, app id 938) was rejected on three findings: the listing needed a logo and screenshots, the data sources needed clarifying, and the analysis flow could not complete. **v0.1.4** fixes all three, adds a saved-brief library, one-tap examples, support/privacy pages and a cover, an app-open rule so the assistant summons the window instead of interviewing the user, and honest reporting when Anna's managed search is unavailable. It is in review (`pending_review`, `version_id=2906`). See `anna/README.md` and `docs/plan/anna-app-builder.md`.

## Provenance & license

Doorknock was built 15 November 2026 during the Global AI Hackathon (build window 1–15 Nov), aimed at Problem Statement 05 from first principles. Small utility patterns (OpenAI-compatible client wiring, SSE route shape) were adapted from the authors' own MIT-licensed open-source work. No third-party proprietary code is used.

MIT.
