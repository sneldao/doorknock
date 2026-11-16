# Doorknock — Anna App

**Read the room before you walk in.** A bundle-only Anna App (no executas):
subject + meeting time → host `web.search` 30-day sweep → `llm.complete`
draft → the deterministic auditor gate → a saved, source-audited one-page
briefing.

**Status:** submitted for review 16 Nov 2026 — v0.1.1 (`version_id=2399`),
app id 938, `pending_review`. Program context and checklist:
`../docs/plan/anna-app-builder.md`.

## Layout

```
bundle/
  index.html    static shell — startup panel + all screens render before the host connects
  app.css       paper/ink visual language (system fonts only, no remote assets)
  app.js        screens, host wiring, entry payload, checkpoint resume — DOM only
  brief.js      prompt builders, strict parsers, the run pipeline (no DOM)
  gate.js       the auditor — 1:1 port of ../src/lib/gate.ts, one contract
  recovery.js   doorknock/active-task checkpoint envelope + brief storage keys
  session.js    unwrap/storage helpers, withTimeout
test/
  gate.mjs      runs ../tests/gate-cases.json — the SAME fixture as the web app
  brief.mjs     parser + query-plan fallback cases
  recovery.mjs  checkpoint validation/resume/stale-id cases
  fake-anna.js  in-memory fake host (storage, web.search, llm.complete)
  smoke.mjs     end-to-end: form → run → gate → saved brief, via the pipeline
```

The auditor contract is shared: `../src/lib/gate.ts` and `bundle/gate.js`
must stay in sync, and changes are covered by cases in
`../tests/gate-cases.json`.

## Flow

1. **Form** — subject, when, meeting kind (sales / partnership / investor /
   bizdev / general), optional notes (≤600 chars). An `open_app_view`
   payload `{subject, kind, notes}` only prefills — the person presses
   Knock.
2. **Run feed** — one query-planning `llm.complete` (falls back to
   deterministic templates on any failure), 1 identity + 3 news searches
   (`search_depth: "basic"`), one drafting `llm.complete`, auditor verdicts.
3. **Brief** — saved to `briefs/<ts>` + `briefs/last` in user-scope storage;
   Uncertain section when the repair pass flagged anything; copy-as-text.
4. **Checkpoint** — `doorknock/active-task` seals the sweep; on reopen a
   `drafting` checkpoint offers Resume (no re-search) or Start over.

## Tests

**Tier 1 — free, every change**

```bash
cd anna
npm install        # devDeps only (CLI for mountBundle, optional)
npm test           # node --test: gate fixture parity + parsers + recovery; smoke via fake host
npm run test:browser   # agent-browser QA on the fake host — no quota
anna-app validate --strict
(cd .. && bun test && bun run typecheck && bun run lint)   # shared gate contract
```

Browser QA without quota: `test/fake-host-server.mjs` serves the bundle
with a scripted fake host (`/__script`, `/__search-script`, `/__fault`,
`/__delay`, `/__dump`); `test/browser-qa.mjs` drives it with
agent-browser under the session name `doorknock-anna-qa`.

**Tier 2 — cheap, only when a prompt changes**

- UI/layout: `anna-app dev --mock-llm test/mock-llm.jsonl` (no quota;
  the plan call falls back to template queries — a real product path).
- Prompt quality without Anna quota: `node scripts/prompt-check.mjs` —
  runs the real prompt builders and parsers against an own-key model
  (see the script header for which key/env it needs).
- `anna-app dev` logged in uses real Anna models and **consumes account
  quota** — small batches only.

**Tier 3 — Anna Cloud Agent, once per release candidate**

Fixed checklist, each step in a NEW chat (context size drives cost):

1. Developer Console → Install the build; open a fresh chat and ask to
   prepare for a meeting with a real company.
2. Confirm the window opens via `open_app_view` with the subject
   prefilled and the visible reply is the fixed line only — no briefing
   content in chat.
3. Fill the remaining fields and Run; confirm the sweep feed, the
   "Source-traced" stamp and any Uncertain section.
4. Close the window mid-run, reopen it, Resume — confirm the saved brief
   reloads and no second sweep runs.

## Before publish

- App id 938 (slug `doorknock`); identity cached in `.anna/app.json`.
- Listing images / screenshots still needed for the store page.
  `test/capture-listing.mjs` replays `test/recordings/{shopify,monzo}.json`
  through the fake host (light scheme pinned) and writes to `listing/`.
  The images are real model output (Reflection Beam, recorded 16 Nov 2026)
  replayed in a local host — not captured inside Anna. Listing images must
  not show a named private individual.
- One fresh-install Cloud Agent check: ask for "prepare for a meeting with
  <company>" and confirm the window opens prefilled and the run saves a
  brief (uses real quota — one chat only, per release checklist).
