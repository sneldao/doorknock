# Architecture

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

## Components

- **Bifrost** — every model call in the app routes through the Bifrost
  gateway. Doorknock never talks to a model provider directly; the switch is
  one base URL. Bifrost's virtual-key governance scopes the app's access to
  the nebius provider, so the gateway does real work here (routing, auth,
  observability). Local dev runs the gateway with `npx @maximhq/bifrost`; the
  deploy runs it as a private Docker service.
- **Tavily** — the entire research layer. `topic: "news"` + `days: 30` enforce
  the recency window in the search API itself; every hit (title, URL, snippet,
  published date) lands in the sealed transcript the gate audits against.
- **Nemotron** — the crew runs on NVIDIA's open
  `nemotron-3-super-120b-a12b` via Nebius, behind Bifrost.
- **Kane CLI** — real-browser verification of the rendered brief; see
  [verification.md](verification.md).

## Routes

| Path | What |
|---|---|
| `/` | The desk — brief request form, live crew feed (Tavily queries as they fly, auditor verdicts as they land), the finished one-page brief (print-optimized). `/?run=<id>` re-opens a stored brief — the URL Kane audits |
| `POST /api/brief` | Starts a run, streams `stage` / `search` / `sources` / `gate` / `done` (with `runId`) / `error` events as SSE |
| `GET /api/runs/<id>` | The stored brief behind `/?run=<id>` (30-minute TTL) |
| `POST /api/verify` | `{runId, repair?}` → streams `kane` verdicts, optional FIXER repair + AUDITOR re-gate, ends `verifyDone` |

## Tech

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind CSS v4 ·
AI SDK (`generateText` over OpenAI-compatible) · zod v4 · Tavily search API ·
Bifrost AI Gateway v2 · Kane CLI · fonts: Fraunces / Inter / JetBrains Mono.

The design is a deliberate *intelligence brief*: paper, ink, telex rules, an
oxblood grounding stamp. A brief should read like a document, not a dashboard.
