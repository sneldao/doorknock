# Doorknock — Anna App

**Read the room before you walk in.** A bundle-only Anna App (no executas):
subject + meeting time → host `web.search` 30-day sweep → `llm.complete`
draft → the deterministic auditor gate → a saved, source-audited one-page
briefing.

**Status:** REJECTED on review (dev@anna.partners) — v0.1.1 (`version_id=2399`),
app id 938. Three findings: (1) listing missing logo + screenshots,
(2) external data sources need clarification, (3) analysis flow errored and
could not complete. Resubmission candidate is v0.1.2 with all three fixed
(see "Resubmission" below). Program context and checklist:
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
  session.js    unwrap/storage helpers, withTimeout (no `scope` arg — the
                iframe Host API takes `{key}` / `{key, value}`; the app bucket
                needs no declaration)
test/
  gate.mjs      runs ../tests/gate-cases.json — the SAME fixture as the web app
  brief.mjs     parser + query-plan fallback cases
  recovery.mjs  checkpoint validation/resume/stale-id cases
  fake-anna.js  in-memory fake host (storage, web.search, llm.complete)
  smoke.mjs     end-to-end: form → run → gate → saved brief, via the pipeline
listing/
  logo.png      512×512 marketplace logo (Console → Upload)
  cover.png     1200×630 cover for the forum / launch post (from cover.svg)
  home-*, run-*, result-*   1280 / 390 captures replayed from the fake host
SUPPORT.md      support page — Console Support field
PRIVACY.md      data-handling page — Console Privacy field
```

The auditor contract is shared: `../src/lib/gate.ts` and `bundle/gate.js`
must stay in sync, and changes are covered by cases in
`../tests/gate-cases.json`.

## Flow

1. **Form** — subject, when, meeting kind (sales / partnership / investor /
   bizdev / general), optional notes (≤600 chars). An `open_app_view`
   payload `{subject, kind, notes}` only prefills — the person presses
   Knock. Two example buttons (Shopify · partnership, Monzo · general)
   prefill a valid form — including the next full hour as the meeting time
   — so a first run needs one press and no typing.
2. **Run feed** — one query-planning `llm.complete` (falls back to
   deterministic templates on any failure), 1 identity + 3 news searches
   (`search_depth: "basic"`), one drafting `llm.complete`, auditor verdicts.
3. **Brief** — saved to `briefs/<ts>` + `briefs/last` in your own Anna app
   storage (private app bucket, no cross-app scopes); Uncertain section
   when the repair pass flagged anything; copy-as-text.
4. **Checkpoint** — `doorknock/active-task` seals the sweep; on reopen a
   `drafting` checkpoint offers Resume (no re-search) or Start over.
5. **Library** — the form lists saved briefs newest-first (subject,
   headline, date) via `storage.list` on `briefs/`, one click to reopen.
   The library is best-effort by design: a failed `list`, a missing key or
   an unreadable record hides that entry and never blocks the form.

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

## Platform versions (checked 2026-11-24)

| Surface | Current | This app |
|---|---|---|
| Anna platform | `1.1.0-beta.234` (20 Nov 2026) | — |
| `@anna-ai/cli` | `0.1.68` (npm latest) | `^0.1.68` |
| `@anna-ai/app-schema` / dispatcher | `0.36.0` | manifest `schema: 4` |
| `@anna-ai/app-runtime` (host SDK) | `0.29.0`, loaded via `/_sdk/latest/` | unpinned, always latest |

Nothing in beta.229–234 requires a change here: the app declares no Executas,
so the Deploy Gate is always open; it uses no `share.*`; `storage.quota` is
optional and not called. `storage.list` follows the documented `{prefix,
cursor}` → `{items, next_cursor}` contract (bounded at 5 pages) rather than
sending an undocumented `limit`.

## Before publish

- App id 938 (slug `doorknock`); identity cached in `.anna/app.json`.
- **Listing uploaded 2026-11-24** (Console → Listing, app 938): logo cropped
  by the platform to
  `https://cdn.anna.partners/production/app-logos/938-doorknock/20261124130244_b4949380.webp`;
  short description is the source-audited one-page promise; long description
  is `app.json` verbatim (2,396 chars); homepage = the GitHub repo; support
  and privacy = `anna/SUPPORT.md` / `anna/PRIVACY.md`; cover =
  `listing/cover.png`; six screenshots (`home-1280`, `run-1280`,
  `result-shopify-1280`, `result-monzo-1280`, `home-390`,
  `result-shopify-390`) as raw GitHub URLs
  (`https://raw.githubusercontent.com/sneldao/doorknock/main/anna/listing/<file>`).
  The source assets stay in `listing/` for re-uploads.
  `test/capture-listing.mjs` replays `test/recordings/{shopify,monzo}.json`
  through the fake host (light scheme pinned) and writes the screenshots.
  The images are real model output (Reflection Beam, recorded 16 Nov 2026)
  replayed in a local host — not captured inside Anna. Listing images must
  not show a named private individual (companies only: Shopify, Monzo).
  Cover art for the forum/launch post: `listing/cover.png` (1200×630, from
  `cover.svg`). Support / privacy URLs point at `SUPPORT.md` and
  `PRIVACY.md` in this folder (\n  `https://github.com/sneldao/doorknock/blob/main/anna/SUPPORT.md`, same for
  `PRIVACY.md`) — use those in the Console Support and Privacy fields.
- `app.json` description now carries the data-source disclosure the review
  asked for (host-managed `web.search` + `llm.complete` only, no keys, no
  external DBs, runtime-only fetching, own-storage privacy); mirror it into
  the Console long-description field on resubmit.
- One fresh-install Cloud Agent check: ask for "prepare for a meeting with
  <company>" and confirm the window opens prefilled and the run saves a
  brief (uses real quota — one chat only, per release checklist).

## Resubmission (v0.1.2 — answers the rejection)

1. **Listing complete — done 2026-11-24.** Logo uploaded and cropped by the
   platform; 6 screenshots (field max is 6, so `result-monzo-390` and
   `run-390` stay in-repo only); Support URL = `SUPPORT.md`, Privacy URL =
   `PRIVACY.md`, cover = `listing/cover.png`. Long description =
   `app.json` description (data sources, credentials: none, refresh:
   runtime-only per run, storage: own app bucket + brief library).
2. **Data sources clarified.** In-app too: the form carries a
   no-keys/no-background-refresh/own-storage note, the brief screen states
   the live sweep shape (1 identity + 3 last-30-day news searches, basic
   depth, via Anna managed search).
3. **Analysis failure fixed.** Two hardening changes since the reviewed
   build: (a) storage calls dropped the non-spec `scope: "user"` arg —
   iframe Host API is `{key}` / `{key, value}` on the own app bucket;
   (b) the draft parser clamps model over-runs (slice arrays to 6,
   truncate strings to cap, drop sourceless developments, coerce
   `"true"/"false"` flags) instead of failing the run — the auditor gate
   itself is untouched and still rejects untraceable claims.
4. **Fresh-install Cloud Agent pass** per the Tier-3 checklist above, then
   `anna-app apps submit-review` (or Console → Versions → Submit).
   `anna-app validate --strict` is green; `npm test` (gate + parser +
   recovery, 33 smoke) is green; `npm run test:browser` is green.
