# Anna Founding Builder Program — Doorknock plan

Program: Anna (Anima AI OS) × DoraHacks — <https://dorahacks.io/hackathon/2349/detail> ·
rules: [forum topic 205](https://forum.anna.partners/t/turn-your-ai-agents-apps-into-recurring-monthly-grants-join-the-anna-ai-os-founding-builder-program-up-to-80k-month-pool/205)
(read 2026-11-16) · developer docs: <https://anna.partners/llms-full.txt>.
Lessons below come from Brume's six review rounds on the same builder
account (`brume/docs/ANNA.md` §12, `brume/anna/README.md`).

## What the program actually pays

The first version of this file had three facts wrong. Corrected from topic 205:

| | |
|---|---|
| Window | **1 Sep 2026 – 31 Mar 2027.** Any single calendar month inside it can qualify; each month is its own cycle. 30 November is not a cutoff |
| Grant | Tier E 200+ MAU **$50/mo** · D 500+ $100 · C 1,000+ $200 · B 4,000+ $1,000 · A 10,000+ $2,500 · S 20,000+ $5,000. Highest tier only. "$5,000" needs 20,000 users |
| Portfolio | Since 1 Oct: **one grant per builder per month**, users deduplicated across all the builder's apps. A second app adds its *distinct* users to the same total; it is not a second grant |
| Qualified run | Signed-in user, declared primary function, meaningful result, read from Anna's server logs. Opening or installing does not count; developer, team and QA accounts do not count. A `storage.set` alone does not count; a successful `llm.complete` that produces the result can (forum topic 351) |
| Review | Complete app with UI, **AI-native core**, no broken external dependencies. "3–5 business days" per round — Brume has been in review since 17 October |
| Upkeep | One meaningful improvement per month to keep a grant |

So the money at a realistic size is $50–$200 a month, plus the 70% revenue
share. The reasons to do this are the Anna team's featured promotion for
strong apps and a real user base for the product, not the grant.

## Why Doorknock is the lead app for the portfolio

- **AI-native without argument.** The result is research synthesis. Brume was
  rejected for a core that was a timer with an AI line; Doorknock has no
  non-AI version of its result.
- **The qualifying step is the product.** The draft is an `llm.complete` in
  the window, so the server log shows exactly the declared function.
- **The gate is what Anna's reviewers test for.** Brume's rounds 4–6 were all
  one finding: a reviewer quoting a fact the model invented. Doorknock already
  refuses unsourced developments.
- **Distinct users.** Brume's audience is people preparing a hard
  conversation; Doorknock's is people preparing a meeting with a company.
  Overlap is plausible (the portfolio dedups it) but the entry points differ.

## Design decisions (settled 2026-11-16)

1. **Bundle-only. No executa, no Render dependency.** Anna's host API has
   `anna.web.search` (Tavily behind the host, with `topic: "news"` and
   `time_range`) and `anna.llm.complete`, both available to any installed app
   and billed to the user's own quota. That removes the Tavily key, the
   Bifrost gateway and the Render service from the Anna path — and with them
   the "broken external dependency" review risk, the four-platform binary
   build that caused Brume's first rejection, and the chat-tool sampling that
   is off by default after install.
2. **Chat only opens the window.** Every tool argument is model-written and
   nothing can check it against the transcript, so there is no chat tool that
   returns a briefing. `#doorknock` prefills subject and kind through
   `open_app_view`; the person presses the button.
3. **Three model calls at most on the happy path, basic search depth.** A free
   Anna account has 1,000 CU; advanced search is ~28 CU a call. One query-plan
   call with a deterministic fallback, four searches (one identity, three
   30-day news), one merged Clerk+Scribe draft, one redraft only on rejection.
4. **The gate checks figures, not only URLs.** Before today a development
   citing a real URL with an invented "$40M" passed at "grounding 100%". The
   model sees title + 320 characters of snippet per hit, so any number,
   amount, percentage or date absent from the cited excerpts came from model
   memory. The gate now withholds it, in developments and in the headline,
   situation, discussion points and open questions. One contract, two
   implementations (`src/lib/gate.ts`, `anna/bundle/gate.js`), one fixture
   (`tests/gate-cases.json`).
5. **A closed window loses nothing.** Brume's second rejection was lost
   progress. The sealed transcript checkpoints to `doorknock/active-task`; a
   reopen resumes at the draft without searching again.
6. **Startup cannot hang.** Brume's third rejection was an endless "Checking
   for unfinished work…". Connect and checkpoint reads are time-boxed and the
   whole init ends in an error with Retry.
7. **The app cannot pin the model.** `llm.complete` runs on whatever the user
   chose. Strict hand-written parser, model-agnostic prompts, and
   `stopReason: maxTokens` treated as a failed draft.

## Known gaps in the gate (say them before a reviewer does)

- Names are not checked. A development can still name a person who is not in
  the excerpt. Brume needed three releases to get a name gate right
  (openers such as Will, May, Hope); do it as its own change with a fixture.
- `happenedWithinWindow` is the model's word. Hits carry `published_at` when
  the provider supplies it; a development whose every cited hit is dated
  outside the window should be demoted by code.
- A figure that is in the excerpt can still be attached to the wrong claim.
  The gate proves presence, not meaning. The brief should say "figures appear
  in the cited excerpts", never "verified".
- Person subjects: a briefing on a private individual is a review and privacy
  risk. Lead the listing with companies; the form copy asks for a company or
  a person in a public role.

## Sequence

- [x] Gate: cited URLs, figures, names (unsupported and misattributed) and
      stale dates; one fixture for the web gate (62 tests) and the bundle
      (68 tests + 33 smoke checks)
- [x] Browser QA suite, 23 checks (`npm run test:browser`)
- [x] Truncation: the draft runs at 8,192 tokens with thinking off; a
      truncated draft gets one retry at 24,000 over the streaming channel and
      no longer uses up the gate's redraft
- [x] Design pass: bundled Fraunces / Inter / JetBrains Mono, the stamp, the
      wire feed, numbered citations, cited sources listed apart from the
      rest of the sweep, print stylesheet, reduced-motion and contrast modes
- [x] Listing images in `anna/listing/`: real model output (Reflection Beam +
      live search, 16 Nov) replayed in a local host — Shopify (passed) and
      Monzo (repaired, one Uncertain item). Not captured inside Anna.
      Rule: no listing image shows a named private individual
- [x] Real-model checks, 16 Nov (`anna/scripts/prompt-check.mjs`):
  - **Reflection Beam**, a heavy reasoning model, after the name rules and
    the truncation retry: 5 of 5 subjects saved a brief — 1 passed first
    time, 2 after a redraft, 2 repaired; 3 of 5 needed the long retry. The
    last two gate fixes (dotted initialisms, tokens with digits) came after
    this run and are covered by fixtures only
  - **Gemini 3 Flash** (Anna's default): 5 of 5 early in the day, before the
    name and date rules; every later attempt was rate-limited. The current
    gate is untested on the default model
- [ ] Re-run all ten subjects on Gemini when its quota allows
- [x] Published and submitted for review (see Status)
- [ ] Fresh-install Cloud Agent pass (steps in `anna/README.md`)
- [ ] File the DoraHacks BUIDL (allowed while review is pending)

Known limits: the name rules work on capitalised words, so three-letter
acronyms that are not in the sweep ("SME") still raise a finding, and a name
written in lower case is never checked. The long retry relies on the Anna
SDK delivering `llm.complete` above 8,192 tokens over its streaming channel
(documented for app-runtime 0.17.0 and later) — untested on a real host.
`next build` printed a security-advisory notice for the installed Next.js
version once during these runs; the upgrade has not been done.

**Blocker shared with Brume:** the developer account's Anna quota is spent
(1,000/1,000, §12.8), and chat is gated on Anna quota even with BYOK enabled.
The Cloud Agent pass needs add-on quota or the weekly contribution rewards.
Brume submitted its last candidate without that pass; do not repeat it here —
it is the one check that finds what local tests cannot.

## Distribution

Target **December** as the first full measurement month, not the last days of
November. Store browsing will not deliver 200 users (leaders sit at 550–930
installs after months), and our own accounts do not count. Channels that are
allowed and that we have: the Global AI Hackathon submission and its
community, the live demo at doorknock-2azp.onrender.com with an "open in
Anna" link, the DoraHacks BUIDL page, and the forum's show-your-build thread.
Paying or trading for runs is prohibited and audited.

## Status, 2026-11-16 — superseded

**Submitted for review.** App id 938, slug `doorknock`, review candidate
**v0.1.1** (`version_id=2399`). v0.1.0 was cut first to obtain the app id;
v0.1.1 adds the id to the system prompt addendum and is otherwise identical.

> Superseded 2026-11-24: v0.1.1 came back **rejected** (next section), v0.1.2
> (`version_id=2902`) is the review candidate, and the app is `pending_review`.

Submitted without a fresh-install Cloud Agent pass (the developer account's
Anna quota is spent) and without listing images in the Developer Console —
the eight images in `anna/listing/` are ready to upload there. A version cut
after this point is not part of the review until `anna-app apps submit-review`
is run again.

## Rejection → v0.1.2 (2026-11-24)

Review returned three findings (dev@anna.partners): listing missing a logo and
screenshots, external data sources unexplained, analysis flow errored and
could not complete. Fixes, all local and green:

- **Analysis failure.** Storage calls dropped the non-spec `scope: "user"`
  arg (iframe Host API takes `{key}` / `{key, value}` on the own app bucket);
  the draft parser now clamps model over-runs — six developments max, strings
  truncated to cap, sourceless developments dropped, `"true"/"false"`
  coerced — instead of failing the run. The auditor gate is untouched.
- **Data sources.** Disclosed in `anna/app.json` and, visibly, on the form and
  brief screens: host-managed `web.search` + `llm.complete` only, no keys,
  no external DBs, fetch at run time only, own-storage privacy.
- **Listing.** Logo, cover, six screenshots, `SUPPORT.md`, `PRIVACY.md`, long
  description from `app.json`; `anna-app validate --strict` green.

## Differentiation & packaging

No pre-meeting briefing app exists in the Anna marketplace — the nearest
neighbours are calendar-scanning morning-brief agents and Meeting AI's generic
`summarize_meeting`. Outside Anna, every comparable (Similarweb Meeting Prep,
calendar-scanning brief agents) requires calendar OAuth. The wedge stays:
no calendar access, no credentials, a deterministic source auditor, and a
bundle-only app that spends the user's own quota.

Packaging built to make that legible in the first ten seconds: example
subjects that prefill a valid form, a **saved-brief library** on the form
screen (`storage.list` over `briefs/`, best-effort so it never blocks a run),
cover art in the product's paper/ink identity, and support/privacy pages that
answer the data-source question without a reviewer having to ask.

Listing assets, logo, cover, support/privacy URLs and the long description
were uploaded to the Console on 2026-11-24 (app 938, handle `papa`). CLI is on
`0.1.68` and the manifest is schema 4 against platform `1.1.0-beta.234`; the
`storage.list` call now follows the documented `{prefix, cursor}` contract.

The listing's short description is not independently editable: every metadata
PATCH (`push`, `publish`, `sync-meta`) rewrites it from the manifest `tagline`,
and the app schema has no field for it — so the tagline is written to double as
the listing line. The public store page (`/store/@papa/doorknock`) 404s until
the app is `PUBLISHED`, so the listing cannot be reviewed in the store before
approval.

v0.1.2 was cut (`version_id=2902`) and submitted on 2026-11-24. The Tier-3
attempt the same day found two things that mattered more than the listing:
Anna-hosted chat models are gated on a plan (`403`), so a BYOK provider is the
only way to exercise the chat path on this account; and the assistant obeys
the app addendum only when the app is `#`-mentioned through the composer
picker, while a bare mention auto-opens the default view with an empty form.

v0.1.3 (`version_id=2905`) answers both: the manifest opens with a FIRST
ACTION RULE (call `open_app_view` in the same turn, never interview the user)
plus a 254-char `user_message_prefix_template`, and the form reports a missing
subject instead of swallowing the submit. It is the pinned review candidate;
any cut after this point is not part of the round until `submit-review` runs
again.

The Tier-3 run log lives in `anna/README.md` (Tier 3). In short: with the tool
named explicitly, the call landed with the Shopify payload, the window
prefilled `subject=Shopify` / `kind=partnership`, and the reply was exactly the
fixed sentence; natural phrasing still failed on Haiku 5.5; and whether a
composer `#` mention attaches is not observable from the DOM, so a
natural-phrasing failure is not evidence that the addendum was ignored. Steps
3–4 (full Knock, stamp, resume) remain unrun.

Pressing Knock in the real window produced a finding of its own: 0 hits for
Shopify and Monzo alike. `web.search` bills the main CU pool and answers
`APP_QUOTA_EXCEEDED` once that pool is spent, and the pipeline was catching every
search error and then telling the person to check their spelling. v0.1.4
(`version_id=2906`) keeps each round's error and separates `search_failed`,
`search_partial` and `no_hits`. It is the pinned review candidate.

A live Knock on v0.1.4 confirmed the new copy in the real window:
"Anna's managed search failed for all 4 queries (APP_QUOTA_EXCEEDED) — that is
an account or host problem, not the subject spelling." The Source-traced stamp
and the Uncertain section stay unprovable until the CU pool is topped up, and
that is the only thing blocking steps 3–4.

Remaining human step: the fresh-install Cloud Agent Tier-3 pass (needs a real
chat and account quota).
