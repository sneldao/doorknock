# Zapier Build Week — trusted autonomous meeting prep

> Seriously reassessed 2026-11-25 22:40 UTC. Build Week runs **23–29 Nov 2026**.
> First proof completed and published 2026-11-25:
> [Morning meeting briefings Build Week post](https://community.zapier.com/build-week-143/morning-meeting-briefings-google-calendar-source-audited-ai-brief-gmail-54141).
> Direct Zapier MCP tool calls cost 0 tasks until **5 Jan 2027, noon ET**;
> Free/trial plans are capped at 250 MCP calls/account/day. Sources:
> [Build Week guide](https://community.zapier.com/build-week-143/build-week-challenge-guide-54120),
> [Challenge 1](https://community.zapier.com/build-week-143/challenge-1-one-job-across-two-apps-54130),
> [Challenge 2](https://community.zapier.com/build-week-143/challenge-2-turn-your-best-prompt-into-a-skill-54139),
> [usage docs](https://docs.zapier.com/mcp/overview/usage).

## Verdict

**Pursue this, but treat it as a timeboxed product-proof spike — not a hackathon
entry and not a distraction from the Kane deadline.**

The opportunity is unusually well matched to Doorknock for four reasons:

1. **It is a real recurring cross-app job.** “Look at upcoming external meetings,
   research the people/companies, and send myself prep” is exactly the kind of
   work Challenge 1 asks people to automate across apps.
2. **It proves the missing product behavior.** Doorknock currently demonstrates a
   strong verification loop but still starts manually. Calendar-triggered delivery
   shows the product working when nobody opened the app.
3. **The free-call window removes experimentation cost.** 250 direct MCP calls/day
   is enough for dozens of narrow prototype iterations, far more than the handful
   needed for a proof.
4. **The visibility window may be disproportionately large.** At review time,
   Zapier's public Build Week Showcase still said “Your build could appear here
   soon” and showed no community builds. That may change quickly, but an early,
   concrete, well-scoped build has a realistic chance of being among the first
   useful examples Zapier's community team sees.

The counterweight is equally important: Build Week is explicitly “just for fun,”
not judged, and there is no prize or guaranteed distribution. The value is a
credible artifact, a possible Zapier community touchpoint, and product evidence
we can reuse in Anna, future demos, and the next Doorknock landing-page narrative.

## The proposition

Doorknock's low-friction wedge stays intact: anyone can type a name and meeting
time without calendar OAuth. Zapier is the optional power-user layer for people
who want trusted preparation to arrive automatically.

The sharper proposition:

> **Trusted autonomous meeting preparation: the calendar detects the meeting,
> Doorknock produces the source-audited brief, and delivery carries proof — not
> just content.**

That is stronger than “a Zapier integration.” Zapier solves undifferentiated
trigger/delivery plumbing. Doorknock owns the trust layer. The grounding score,
source links, and uncertain section must travel with the digest. If the auditor
blocks a brief, the automation must not quietly deliver it as fact.

## Challenge fit

### Challenge 1 — one job across two apps

Official prompt:

```text
Using Zapier MCP, find every email from this week that asks me for something,
and list them in a Google Sheet with who asked, what they need, and when it's due.
```

Our adaptation should use **Google Calendar + Gmail** as the visible app pair:

> Every week I scan my calendar for external meetings, research the companies or
> people, and send myself prep notes. Automate that job end to end.

Doorknock is the intelligence layer between those two apps. It can be reached
through Webhooks by Zapier/API by Zapier even though it is not a native Zapier
app. That is still within the spirit of the challenge: the recurring job is
calendar-to-email preparation.

Avoid adding Google Sheets to the first proof unless dedupe absolutely requires
it. Calendar + Gmail is easier to explain as the two-app challenge fit. For a
first manual run, local state or simple event-id tracking is enough.

### Challenge 2 — turn the prompt into a skill

The same artifact can satisfy Challenge 2 if the working prompt is saved as a
reusable skill called **Morning meeting briefings**. One build can therefore
cover both challenges:

- Challenge 1 evidence: the calendar-to-Gmail job actually ran.
- Challenge 2 evidence: the prompt is saved and reusable with one line.

If posting both, avoid spamming the community: either one clear post tagged for
both, or two posts with distinct screenshots and lessons.

## Target loop

```text
Google Calendar events
  → filter meetings with external attendees
  → dedupe meetings already processed
  → call Doorknock for each meeting (capped)
  → deterministic AUDITOR gate
  → if PASS: Gmail digest with brief content + proof
  → if FAIL: no normal delivery; optionally send an “audit blocked” notice
```

Direct MCP calls happen only when an agent runs. A true morning digest still
needs an explicit runner: a scheduled Zap/hosted workflow, a cron-like operator
agent, or a human invoking the saved skill each morning. Build Week does not
require solving production scheduling; it requires proving the repeated job can
be handed to an AI tool.

## Why Zapier is the right prototype layer

- Google Calendar reading, Gmail delivery, Slack delivery, dedupe storage, and
  user-owned OAuth connections already exist.
- Building those natively would be weeks of non-differentiating work before we
  learn whether users value unattended briefs.
- Zapier MCP keeps third-party credentials in the user's Zapier account rather
  than handing app secrets to the model.
- Webhooks by Zapier / API by Zapier can call Doorknock even though Doorknock is
  not a native Zapier app.
- It lets us prove the product behavior with one operator, one calendar, and one
  delivery channel before committing to native integrations.

Zapier is not the moat and not durable distribution. The moat remains the sealed
transcript, deterministic claim auditing, and verification loop. The Zapier
artifact is evidence that trusted briefs can arrive without anyone opening the
app.

## Recommended first proof

Use a test calendar or carefully redacted real calendar. Do not start with a
full production morning digest.

```text
Using Zapier MCP, read my Google Calendar for the next 3 days. Identify events
with at least one attendee outside my organization/domain. Exclude events with
no external attendees, events already processed in this chat/session, and
obviously personal or internal recurring events. Process at most 2 meetings.

For each selected meeting, call Doorknock's briefing API through Webhooks by
Zapier with the company or person as the subject, the meeting start time,
meeting type, and any non-sensitive notes needed for context. Wait for the run
to finish and capture the runId. Fetch the finished brief as JSON.

If the deterministic gate does not pass, do not send that item as a brief. If it
does pass, email me one digest with one section per meeting: subject, meeting
time, headline, situation summary, key developments with source links,
discussion points, open questions, grounding verdict/score, uncertain items,
and the run link. Include a top-line count of meetings considered, briefs
delivered, and briefs blocked by the audit.
```

After it works once, save it as **Morning meeting briefings** and rerun it with
one line. The public post should show the delivered digest, not just terminal
output.


## Feasibility shortcut for the first artifact

The first proof does **not** need Doorknock to be called through Webhooks by
Zapier. Challenge 1 judges the job outcome, not architectural purity. Use Zapier
MCP for the two app interactions it is good at — Google Calendar read and Gmail
send — while the AI tool uses its native HTTP/curl capability to call Doorknock,
consume the SSE stream, parse `runId`, and fetch `/api/runs/<runId>`.

That avoids Zapier's 30-second action constraint entirely for the first demo.
The async API contract is still the right product hardening step, but it is not
a blocker for a Devin-driven Build Week artifact. This distinction matters:

- **Demo path:** Zapier MCP for Calendar/Gmail + direct agent HTTP to Doorknock.
- **Portable integration path:** Webhooks/API by Zapier + async `202` job API.
- **Production path:** durable storage, idempotency, scheduler, and native or
  per-user automation connections.

Because Devin can make the Doorknock HTTP call directly, a narrow Challenge 1/2
artifact is feasible without changing product code. The real setup blocker is
Zapier MCP authentication and scoped Google Calendar/Gmail actions.

## Current API reality and technical blockers

The product already has some machine-readable pieces, but not yet a robust
automation contract:

- `POST /api/brief` is SSE, not simple synchronous JSON. The caller must consume
  the stream and capture `runId` from the terminal `done` event.
- `GET /api/runs/<id>` already returns JSON containing `briefing`, `uncertain`,
  `gate`, and `sources` — enough for a digest once the run ID is known.
- **The 30-second action constraint is the critical feasibility issue.** Zapier
  action steps are designed around fast responses; long-running work should use
  an immediate `202 Accepted` + job ID + polling/callback pattern. Doorknock
  briefs often take minutes, so even a perfect JSON-instead-of-SSE response is
  not enough if the request stays open for the whole run.
- Zapier's Webhooks/API actions also may not conveniently consume an SSE response
  as structured data. The highest-leverage product fix is therefore a small
  additive async contract, not merely a sync JSON mode:
  - `POST /api/brief` with `mode=async` starts work and returns `202` with
    `{ runId, statusUrl }` immediately;
  - `GET /api/runs/<id>` exposes `status`, then `briefing`, `uncertain`, `gate`,
    and `sources` when complete.
  - Idempotency should use calendar event ID + meeting start + subject so Zapier
    retries cannot duplicate briefs.
- Runs are stored in memory for only 30 minutes and capped at 24 runs. That is
  fine for immediate generation, but email/Slack links can expire quickly. The
  digest must include substantive brief content, not only a link, or the product
  needs durable run storage.
- `/api/brief` is not idempotent. Dedupe has to live in the automation layer for
  the prototype, keyed by calendar event ID + meeting start + subject.
- The Render deployment can generate briefs but reports Kane verification
  unavailable because the container lacks Chrome/`kane-cli`. The deterministic
  AUDITOR still gates the content; Kane evidence remains the separately recorded
  localhost/prod verification story.

## Acceptance criteria

Use one operator's calendar, Gmail delivery, and a small controlled test set:

1. Three test events: internal-only, external attendee, and no-attendee/personal.
2. Only the external-attendee event creates a Doorknock run.
3. Re-running the skill does not duplicate a meeting already processed.
4. A real generated brief appears in the Gmail digest with substantive content,
   source links, grounding verdict/score, and uncertain items.
5. A deliberately failing audit is not delivered as a normal brief.
6. The digest names meetings skipped or blocked rather than failing silently.
7. The final artifact is a screenshot or short recording of the delivered Gmail
   message, with private data redacted.

## Privacy and safety boundaries

- Read only the calendar fields needed for the briefing: attendees, start time,
  title, organizer, event ID, and explicitly non-sensitive notes.
- Do not forward private meeting notes into email/Slack unless the operator
  explicitly chooses that.
- Keep calendar, Gmail, and Slack connections user-owned in Zapier.
- Do not email anyone other than the operator in the prototype.
- Redact attendee names and email addresses in public Build Week screenshots.
- Prefer a test calendar with synthetic events for the public artifact.

## Honest limits

- **Not a competition:** Build Week is explicitly for fun; there is no judging
  or prize. Treat community visibility as a bonus, not the business case.
- **Free-tier scale:** 250 direct MCP calls/day is adequate for one operator and
  a handful of meetings, not a multi-user production delivery layer.
- **Task accounting changes:** the free MCP promotion ends 5 Jan 2027 at noon
  ET. After that, direct successful MCP calls cost tasks. Hosted workflows/Zaps
  have separate behavior; verify before depending on them.
- **No acquisition channel by itself:** posting may create a useful Zapier
  community touchpoint, especially while the showcase is empty, but it is not a
  durable distribution channel.
- **Durability gap:** the in-memory 30-minute run store is the largest product
  mismatch. Full-content digests work around it for a demo; durable storage is
  the real fix.
- **Scheduling gap:** the saved skill is repeatable, but not self-running. True
  unattended operation requires an explicit scheduler.

## Progression plan

### Strategic recommendation

Do **not** build a full or certified Zapier app next. Treat Zapier as the
validation layer, not the product foundation.

The durable product asset is an automation-ready trusted-briefing API. Zapier
is one convenient way to validate whether people want unattended briefs before
investing in native calendar/email/Slack plumbing.

The progression is:

1. Freeze feature work until the Kane deadline.
2. Make Doorknock automation-ready with a small backend contract.
3. Use Zapier to validate whether people actually want unattended briefs.
4. Only then decide whether native calendar/email integrations deserve
   investment.

### Phase 0 — until the Kane deadline

Do not change the product or core Kane submission now. At most, perform a final
public judge-experience audit:

- showcase opens logged out;
- evidence links open;
- attachments open;
- X/Reddit/YouTube/Zapier links open;
- demo still plays.

The Zapier post has already been added to the Kane submission as an extra
public post. It is launch-buzz and product-direction evidence, not part of the
core Kane verification claims.

### Phase 1 — automation-ready Doorknock contract

This is the highest-value next technical step because it helps Zapier, native
integrations, future agents, and scheduled jobs alike.

#### Async briefing jobs

Add:

```http
POST /api/brief?mode=async
```

Immediate response:

```json
{
  "runId": "run_123",
  "status": "queued",
  "statusUrl": "/api/runs/run_123"
}
```

Then make:

```http
GET /api/runs/run_123
```

return a machine-readable lifecycle:

```json
{
  "status": "running | succeeded | failed",
  "briefing": {},
  "uncertain": [],
  "gate": {},
  "sources": []
}
```

#### Durable run storage

Move runs beyond the current in-memory 30-minute/24-run store. Automation
results need to survive long enough for delivery, review, and debugging.

#### Idempotency

Accept an automation-stable reference such as:

```json
{
  "externalRef": "google-calendar:event-id:start-time"
}
```

A repeated submission should return the existing run instead of generating a
duplicate brief.

#### Callback support

This is the key Zapier-friendly primitive. Allow the async request to include:

```json
{
  "callbackUrl": "https://hooks.zapier.com/..."
}
```

When the run finishes, Doorknock POSTs the completed result to the callback.
That avoids fragile long polling inside Zapier.

The callback payload should include substantive content, not just a link:

- brief content;
- source links;
- gate verdict;
- uncertain items;
- failure/audit-blocked state;
- externalRef.

Sign the callback or include a user-specific secret so completions cannot be
spoofed trivially.

### Phase 2 — reference Zapier recipe, not a full Zapier app

Once callbacks exist, document a copyable two-Zap pattern.

#### Zap A — start the brief

```text
Google Calendar event start / upcoming event
→ filter external attendees
→ Webhooks by Zapier POST to Doorknock async API
```

#### Zap B — deliver the result

```text
Webhooks by Zapier Catch Hook receives Doorknock completion
→ formatter/filter
→ Gmail or Slack sends the digest
```

That is enough for validation. Do not invest in a certified/native Zapier app
unless people actually use the recipe.

### Phase 3 — validate with a tiny user group

Recruit 3–5 technical users, ideally people already using Zapier, agents, or AI
productivity tooling. Give them:

- a setup guide;
- a test calendar event format;
- the Zapier recipe;
- one clear success outcome: receive a source-audited digest before a real
  external meeting.

Measure:

1. Can they connect it without help?
2. Does the first digest arrive correctly?
3. Do they use it again within a week?
4. Do they trust the audit/uncertain sections?
5. Which delivery channel do they prefer — Gmail, Slack, calendar description,
   or something else?
6. Are duplicates or false-positive meetings annoying?

If nobody uses it twice, stop. If people use it repeatedly, invest further.

### Phase 4 — decide the real product shape

After validation, choose one of three paths.

#### Path A — Zapier as the power-user layer

Best if users are already Zapier-heavy. Invest in setup docs, template Zaps,
delivery channels, error recovery, and Zapier-specific examples.

#### Path B — native Google Calendar/Gmail integration

Best if non-Zapier users want the feature. This is more product surface area,
but better UX: connect Google once, select calendars, choose delivery
preferences, and let Doorknock schedule and send everything itself.

#### Path C — agent-native automation

Best if the audience is primarily Devin/Claude/Cursor-style agent users. Invest
in the saved skill, MCP instructions, and reusable prompts rather than
classical SaaS integrations.

Current expectation: **Path B is the best mainstream product path, while Zapier
remains useful for power users and validation.** Validate before committing.

### Explicitly deferred

Do not build these yet:

- a certified Zapier app;
- full multi-user scheduling infrastructure;
- broad reading of every calendar event;
- Slack/Teams/Outlook support all at once;
- complex digest preferences;
- a paid automation tier.

Those are scale problems. First prove the repeated behavior.

## Immediate next milestone

The best next milestone is:

> **A user can trigger a Doorknock brief from a calendar event and receive the
> completed, audit-gated result through a Zapier callback without keeping a
> long-running request open.**

That is the minimum architecture that turns the Build Week demo into something
testable by others.

## Completed first proof — 2026-11-25

The Build Week proof has already validated the manual operator-level version of
the loop:

1. Created a synthetic external-attendee Google Calendar event for Anthropic.
2. Read the event through Zapier MCP.
3. Called the live Doorknock deployment directly from the agent.
4. Doorknock's deterministic auditor rejected the first draft: 1 of 6
   developments failed source tracing, with unsupported figure/name findings
   and 83% grounding.
5. The repair loop produced the delivered result: **REPAIRED — 6 source-traced
   developments retained; 0 moved to uncertain**.
6. Zapier MCP sent the finished digest through Gmail.
7. Redacted digest screenshots were attached to the public Build Week post.
8. The public post was added to the Kane submission under “posts anywhere
   else.”

Important security validation: Gmail reading through Zapier failed with
“Insufficient Permission” because the Gmail grant was scoped for sending rather
than mailbox reading. Sending worked.

Evidence lives in `artifacts/zapier-build-week/`; the reusable skill lives in
`.devin/skills/morning-meeting-briefings/`.

## Kane positioning

Do not make Zapier part of the core Kane verification narrative: it does not
score the verification loop. Its value is additional launch buzz plus
post-deadline product proof: the same trust gate operating when nobody manually
opened the app.
