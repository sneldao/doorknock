# Doorknock

**Read the room before you walk in.**

Doorknock is a pre-meeting briefing agent. Tell it who you're meeting (a company or a person) and when, and a research crew sweeps the last 30 days of news through Tavily, drafts a one-page briefing, and a deterministic auditor rejects any claim that can't be traced to a source the crew actually fetched.

*Agents propose, code disposes.*

**Live:** https://doorknock-2azp.onrender.com · **Demo:** [youtu.be/Gi9SCwrX6nk](https://youtu.be/Gi9SCwrX6nk) · **Deck:** [`docs/deck/Doorknock.pdf`](docs/deck/Doorknock.pdf)

## What you get

- **Meeting context in** — company or person, meeting time, meeting type (sales / partnership / investor / BD / general)
- **30-day research out** — a multi-query Tavily sweep restricted to the preceding 30 days (news, launches, hires, funding, partnerships)
- **One-page briefing** — headline, situation, key developments, discussion points, open questions
- **Every claim traced** — nothing ships that doesn't trace to a fetched source; untraceable material is moved to a clearly-flagged *uncertain* section, never silently deleted

## How it works

| Agent | Job |
|---|---|
| **SCOUT** | Derives queries from the meeting context and runs the Tavily sweep |
| **CLERK** | Clusters the hits into distinct developments, each citing exact transcript URLs |
| **SCRIBE** | Writes the one-page brief |
| **AUDITOR** | Deterministic code, no model — rejects claims that don't trace to the sealed transcript, including invented figures and names |
| **KANE / FIXER** | Kane CLI opens the finished brief in real Chrome and audits that it renders; on failure the FIXER rewrites against the transcript and the loop re-verifies |

The whole run streams live over SSE — you watch each query fly and the auditor's verdicts land, including the rejections.

Details: [docs/verification.md](docs/verification.md) · [docs/architecture.md](docs/architecture.md) · [docs index](docs/README.md)

## Quickstart

Needs Node 22+ (or Bun), a [Tavily](https://app.tavily.com) key, and one OpenAI-compatible model endpoint — either a Bifrost gateway or a direct provider.

```bash
bun install            # or npm install
cp .env.example .env.local   # add TAVILY_API_KEY + gateway/provider creds

# local Bifrost gateway (recommended):
bun run bifrost       # → http://localhost:8080 — add the nebius provider
                      # in the web UI, create a virtual key, use it below

bun run dev           # http://localhost:3000
```

`.env.local`:

```ini
TAVILY_API_KEY=tvly-…
BIFROST_BASE_URL=http://localhost:8080/v1
BIFROST_API_KEY=<bifrost virtual key>
BRIEF_MODEL=nebius/nvidia/nemotron-3-super-120b-a12b
# bare-dev alternative (no gateway): LLM_BASE_URL + LLM_API_KEY
```

Try it: subject **"Stripe"**, meeting tomorrow, type *partnership* → watch the crew work, then read the brief.

## Checks

```bash
bun test          # the auditor gate: deterministic tests, no keys, no network
bun run typecheck
bun run lint
bun run build
```

## License

MIT.
