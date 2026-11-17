# grounding-gate — a Bifrost plugin

Deterministic output auditing at the gateway: **agents propose, code
disposes.** Any app behind the gateway can seal the sources it fetched and
get a verdict on whether the model's reply is traceable to them — no
application code, no second model, no judge. A Go port of the URL-tracing
and figure-canonicalization checks from doorknock's auditor
(`src/lib/gate.ts`).

Built for the Global AI Hackathon (HackCulture), **PS-04 — Open-Source
Bifrost Gateway**. Doorknock itself is the reference app (PS-05).

## The contract

Bifrost transport hooks only run on **registered inference routes** — a
plugin cannot own a new endpoint. So the evidence rides the chat call
itself, as a top-level `grounding` field the gateway's tolerant decode
would otherwise drop:

```bash
# 1. Seal + audit in one call — the transcript goes inside the request
POST /v1/chat/completions
{ "model": "nebius/nvidia/nemotron-3-super-120b-a12b",
  "messages": [...],
  "grounding": {
    "ref": "run-abc123",
    "context": "subject: Shopify; meeting 2026-11-20",
    "allowed_figures": ["30"],
    "ttl_seconds": 600,
    "urls": [
      { "url": "https://news.com/shopify-q3",
        "title": "Shopify Q3 revenue up 25%",
        "excerpt": "Shopify reported revenue of $2B, up 25% …",
        "published": "2026-11-10" }
    ]
  } }

# The pre-hook seals it (TTL'd, in-memory), strips the field from the
# body, and audits the reply against it.

# 2. The verdict rides the response
x-bifrost-grounding: PASS            # or REJECT / NO_EVIDENCE / SKIP
x-bifrost-grounding-report: {"pass":true,"verdict":"PASS","cited_urls":[…]}

# Follow-up calls (retries, redrafts) may re-bind to the same sealed
# evidence with just the header — no need to resend the transcript:
POST /v1/chat/completions
x-grounding-ref: run-abc123
{ "model": "…", "messages": [...] }
```

## What the gate checks

A reply **passes** when:

- it cites at least `min_citations` URLs (any `https?://` in the output,
  including `"sourceUrls": [...]` inside JSON replies), and
- every cited URL appears in the sealed transcript (normalized —
  fragments and trailing slashes ignored), and
- every figure it states (`$40M`, `25%`, `3,000`, `2.5 trillion` —
  canonicalized so writing style doesn't matter) appears somewhere in the
  evidence excerpts, the caller's `context`, or its `allowed_figures`.

A reply **rejects** on the first failing rule: `insufficient citations`,
`unknown source` (a URL the caller never fetched — likely fabricated), or
`unsupported figure` (a number absent from the evidence — model memory).

Two honest limits vs the app-side gate:

- The plugin audits the **whole reply against the whole transcript** — it
  cannot map a specific claim to its cited excerpt, so a correct figure
  attached to the wrong story still passes. The app's per-development
  audit in `src/lib/gate.ts` is the stricter layer.
- URLs are stripped before figure extraction (digits inside a path are
  citations, not claims), but prose digits like a date the model writes
  (`November 15`) still need evidence support.

## Modes

| `mode` | behavior on REJECT |
|---|---|
| `annotate` (default) | response passes through; verdict in headers |
| `enforce` | response rewritten to HTTP 422 with the findings |

Annotate is for gradual rollout and dashboards; enforce is the point —
the provider bill is paid, but the ungrounded reply never reaches the
caller.

## Config

```jsonc
// registered via POST /api/plugins (see scripts/bootstrap-bifrost.mjs)
{
  "name": "grounding-gate",
  "enabled": true,
  "path": "/app/plugins/grounding-gate.so",
  "config": {
    "mode": "annotate",               // or "enforce"
    "ref_header": "x-grounding-ref",
    "evidence_field": "grounding",    // request-body key carrying evidence
    "ttl_seconds": 600,
    "max_body_bytes": 524288,         // cap on the embedded evidence object
    "min_citations": 1
  }
}
```

Requests without a `grounding` field or ref header pass through untouched —
the gate only applies to callers that opt in.

## Build

A Go `.so` plugin must share the gateway binary's exact module build list
— a version bump in any shared dependency makes `plugin.Open` refuse it.
`bifrost/Dockerfile` (repo root's `bifrost/` dir) therefore builds this
plugin **inside the transports module** of the upstream tag the runtime
image ships (`transports/v2.5.1`, core v1.15.2, Go 1.27.3-alpine), not
against this directory's own `go.mod` — that file exists for local
development and tests only.

```bash
go mod tidy
go test ./...
```

Render builds `bifrost/Dockerfile` for the `doorknock-bifrost` private
service (`runtime: docker` in `render.yaml`); `scripts/bootstrap-bifrost.mjs`
registers the plugin at boot via `POST /api/plugins` — idempotent, and
non-fatal so a gateway without the .so still boots.

## Doorknock wiring

`src/lib/crew.ts` builds the sealed transcript payload after the Tavily
sweep and attaches it to each Scribe call via `providerOptions` — the
openai-compatible provider spreads it into the request body's top level,
where the plugin's pre-hook collects it. The app-side gate stays — the
plugin is the generic layer underneath it.
