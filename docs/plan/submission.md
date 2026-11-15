# Global AI Hackathon — Doorknock submission

Target: https://hackculture.io/hackathons/ai-global-hackathon · Problem Statement 05 (Tavily Research Agent)

## Form fields

- **Problem statement:** PS-05 — Tavily Research Agent (Build a Pre-Meeting Briefing Agent)
- **Project title:** Doorknock — the pre-meeting briefing agent that refuses to ship an unsourced claim
- **GitHub repo:** https://github.com/sneldao/doorknock
- **PPT:** `docs/deck/Doorknock.pdf`
- **Demo video (optional):** `docs/video/doorknock-demo.mp4` (1:38 captioned cut of a real run; raw footage + VO script in `docs/video/`) — upload unlisted to YouTube and paste the link
- **Live demo (optional):** Render deployment (web + private Bifrost gateway service) — URL after deploy

## If there is a free-text project description

Doorknock is a pre-meeting briefing agent built for Problem Statement 05. You give it a
company or person and a meeting time; a four-agent crew sweeps the last 30 days of news
through Tavily (topic: news, days: 30 — the recency window enforced by the search API
itself), and returns a one-page, source-backed briefing: headline, situation, key
developments with sources, discussion points, and open questions.

Its differentiator: the most important agent is not a model. The Scout's fetched-URL
transcript is sealed before drafting begins, and a deterministic auditor gates the
Scribe's brief — every key development must cite at least one URL from the sealed
transcript, or the brief is REJECTED and redrafted; claims that still fail move to a
clearly-flagged "uncertain — treat with caution" section. Verified findings stay
distinguishable from uncertain ones, exactly as the statement asks. The gate is ~100
lines of code with 8 deterministic unit tests.

All model calls route through the Bifrost gateway (title partner) — the app holds no
provider key; a gateway virtual key scopes it to the nebius provider and an explicit
model allowlist. The crew runs on NVIDIA's open Nemotron via Nebius, and the gateway's
dashboard observability shows the run's requests, tokens and cost.

Built 15 November 2026, inside the hackathon build window. MIT, open source, tests included.

## Pre-submit checklist

- [x] Repo public with README (setup, features, tech)
- [x] README explains Bifrost + Tavily contributions
- [x] PPT exports (problem / solution / architecture / implementation / demo / sponsor tech)
- [x] Demo video: real run, includes live Tavily queries + gate verdict
- [ ] Deploy live (needs Render login approval → apply render.yaml blueprint → set TAVILY_API_KEY, NEBIUS_API_KEY, BIFROST_SETUP_TOKEN env vars)
- [ ] Upload PPT + (optional) video link in the Submissions tab
- [ ] Confirm team members on the hackathon dashboard (up to 4)
