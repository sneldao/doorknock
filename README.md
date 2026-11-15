# Doorknock

**Read the room before you walk in.**

A pre-meeting briefing agent built for the [Global AI Hackathon](https://hackculture.io/hackathons/ai-global-hackathon), **Problem Statement 05 — Tavily Research Agent**. Tell Doorknock who you're meeting (a company or a person) and when. A four-agent research crew sweeps the last 30 days of news through **Tavily**, drafts a one-page briefing, and a deterministic **auditor rejects any claim that can't be traced to a source the crew actually fetched**.

*Agents propose, code disposes.*

Built 15 November 2026, inside the hackathon build window (1–15 Nov).

**Deck:** [`docs/deck/Doorknock.pdf`](docs/deck/Doorknock.pdf) · **Demo video:** [`docs/video/doorknock-demo.mp4`](docs/video/doorknock-demo.mp4) (1:38, real run)

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

The whole run streams live over SSE: you watch each query fly, see Tavily hit counts, watch the auditor's verdicts — including the rejections.

## The gate

The interesting part of Doorknock is that its most important agent isn't a model. The Scribe is *allowed* to hallucinate; the auditor won't let it ship. `src/lib/gate.ts` is ~100 lines of deterministic code:

1. The Scout's transcript (every URL Tavily actually returned) is sealed before any drafting begins.
2. Each key development must cite ≥1 transcript URL (normalized: hash and trailing-slash insensitive).
3. **Grounding score** = traced developments ÷ total developments, threshold 0.8.
4. Fail → REJECT with a machine-readable report naming the offending claims → the Scribe redrafts once → still failing, the repair pass strips untraceable developments into the *uncertain — treat with caution* section. The user always sees what was kept, what was flagged, and why.

This is a small instance of a general pattern for making LLM agents safe to ship: **models draft, deterministic code verifies against ground truth the models can't touch.** The gate's unit tests (`tests/gate.test.ts`) run with no network, no keys, no models — the auditor's behavior is fully specified in code.

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
#   (or set a BIFROST_SETUP_TOKEN and use the API — see scripts/bootstrap-bifrost.sh)

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
bun test          # the auditor gate: 8 deterministic tests, no keys, no network
bun run typecheck
bun run lint
bun run build
```

## Routes

| Path | What |
|---|---|
| `/` | The desk — brief request form, live crew feed (Tavily queries as they fly, auditor verdicts as they land), the finished one-page brief (print-optimized) |
| `POST /api/brief` | Starts a run, streams `stage` / `search` / `sources` / `gate` / `done` / `error` events as SSE |

## Tech

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind CSS v4 · AI SDK (`generateText` over OpenAI-compatible) · zod v4 · Tavily search API · Bifrost AI Gateway v2 · fonts: Fraunces / Inter / JetBrains Mono.

The design is a deliberate *intelligence brief*: paper, ink, telex rules, an oxblood grounding stamp. A brief should read like a document, not a dashboard.

## Provenance & license

Doorknock was built 15 November 2026 during the Global AI Hackathon (build window 1–15 Nov), aimed at Problem Statement 05 from first principles. Small utility patterns (OpenAI-compatible client wiring, SSE route shape) were adapted from the authors' own MIT-licensed open-source work. No third-party proprietary code is used.

MIT.
