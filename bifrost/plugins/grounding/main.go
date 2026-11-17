// grounding-gate — a Bifrost plugin that audits model output against a
// caller-sealed evidence transcript. "Agents propose, code disposes":
// the caller seals the sources it fetched, the gateway checks whether the
// model's reply is traceable to them, and ungrounded replies are either
// annotated (mode: annotate) or rejected at the transport (mode: enforce).
//
// Contract, for any app behind the gateway — transport hooks only run on
// registered inference routes, so the evidence rides the chat call itself:
//
//  1. POST /v1/chat/completions with a top-level "grounding" object:
//       {"ref": "...", "context": "...", "allowed_figures": [...],
//        "ttl_seconds": 600,
//        "urls": [{"url": "...", "title": "...", "excerpt": "...",
//                  "published": "..."}]}
//     The gateway's tolerant decode drops the field before the provider
//     ever sees it; this hook seals it and strips it from the body anyway
//     (raw-body callers exist).
//  2. Later calls may re-bind to the same sealed evidence with just
//     x-grounding-ref: <ref> — no need to resend the transcript.
//  3. Response → x-bifrost-grounding: PASS|REJECT|NO_EVIDENCE|SKIP
//     and x-bifrost-grounding-report: <json>
//
// Enforce mode turns a REJECT into HTTP 422 with the findings in the body.
//
// Built for the Global AI Hackathon (HackCulture), PS-04 "Open-Source
// Bifrost Gateway". The gate logic is a Go port of doorknock's
// deterministic auditor (src/lib/gate.ts) — URL tracing and figure
// canonicalization, the two rules a generic gateway plugin can run
// without knowing the app's claim structure.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/maximhq/bifrost/core/schemas"
)

type pluginConfig struct {
	Mode          string `json:"mode"`            // "annotate" (default) | "enforce"
	RefHeader     string `json:"ref_header"`      // header carrying the evidence ref
	EvidenceField string `json:"evidence_field"`  // request-body key carrying the sealed transcript
	TTLSeconds    int    `json:"ttl_seconds"`     // default evidence TTL
	MaxBodyBytes  int    `json:"max_body_bytes"`  // cap on the embedded evidence object
	MinCitations  int    `json:"min_citations"`   // cited transcript URLs required to pass
}

var cfg = pluginConfig{
	Mode:          "annotate",
	RefHeader:     "x-grounding-ref",
	EvidenceField: "grounding",
	TTLSeconds:    600,
	MaxBodyBytes:  512 * 1024,
	MinCitations:  1,
}

var store = newEvidenceStore()

const (
	ctxRefKey     = schemas.BifrostContextKey("grounding/ref")
	ctxVerdictKey = schemas.BifrostContextKey("grounding/verdict")
)

func Init(config any) error {
	if config != nil {
		raw, err := json.Marshal(config)
		if err != nil {
			return fmt.Errorf("grounding-gate: encode config: %w", err)
		}
		if err := json.Unmarshal(raw, &cfg); err != nil {
			return fmt.Errorf("grounding-gate: decode config: %w", err)
		}
	}
	if cfg.Mode != "enforce" {
		cfg.Mode = "annotate"
	}
	if cfg.TTLSeconds <= 0 {
		cfg.TTLSeconds = 600
	}
	if cfg.MinCitations <= 0 {
		cfg.MinCitations = 1
	}
	return nil
}

func GetName() string { return "grounding-gate" }

// HTTPTransportPreHook seals evidence embedded in the request body and tags
// every request that carries a grounding ref. Everything else passes through.
func HTTPTransportPreHook(ctx *schemas.BifrostContext, req *schemas.HTTPRequest) (*schemas.HTTPResponse, error) {
	// Cheap guard: only pay for a body decode when the field is plausibly
	// present — the common case (no grounding) adds a substring scan only.
	if bytes.Contains(req.Body, []byte(`"`+cfg.EvidenceField+`"`)) {
		if doc, cleaned := extractGrounding(req.Body, cfg.EvidenceField, cfg.MaxBodyBytes); doc != nil {
			ttl := doc.TTLSeconds
			if ttl <= 0 {
				ttl = cfg.TTLSeconds
			}
			doc.expires = time.Now().Add(time.Duration(ttl) * time.Second)
			store.put(doc)
			if len(cleaned) > 0 {
				req.Body = cleaned
			}
			ctx.SetValue(ctxRefKey, doc.Ref)
			ctx.Log(schemas.LogLevelInfo, fmt.Sprintf("grounding-gate: sealed ref=%s urls=%d ttl=%ds", doc.Ref, len(doc.Hits), ttl))
		}
	}
	if ref := req.CaseInsensitiveHeaderLookup(cfg.RefHeader); ref != "" {
		ctx.SetValue(ctxRefKey, ref)
	}
	return nil, nil
}

// extractGrounding pulls the embedded evidence object out of a request body.
// It returns the sealed doc (nil when the field is absent or malformed) and
// the body with the field stripped so it can never reach a provider — Bifrost's
// own decode would drop it anyway, but callers using raw-body forwarding must
// not leak it upstream.
func extractGrounding(body []byte, field string, maxBytes int) (*evidenceDoc, []byte) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(body, &obj); err != nil {
		return nil, nil
	}
	raw, ok := obj[field]
	if !ok || len(raw) == 0 || len(raw) > maxBytes {
		return nil, nil
	}
	var doc evidenceDoc
	if err := json.Unmarshal(raw, &doc); err != nil || doc.Ref == "" || len(doc.Hits) == 0 {
		return nil, nil
	}
	delete(obj, field)
	cleaned, err := json.Marshal(obj)
	if err != nil {
		return nil, nil
	}
	return &doc, cleaned
}

// HTTPTransportPostHook audits the (non-streaming) chat completion body.
// In enforce mode a REJECT rewrites the response to HTTP 422; the verdict
// header is set either way by HTTPTransportResponseHeadersHook.
func HTTPTransportPostHook(ctx *schemas.BifrostContext, req *schemas.HTTPRequest, resp *schemas.HTTPResponse) error {
	ref, _ := ctx.Value(ctxRefKey).(string)
	if ref == "" {
		return nil
	}
	v := Verdict{Pass: false, Verdict: "NO_EVIDENCE", Reason: "no evidence sealed under ref " + ref}
	defer func() { ctx.SetValue(ctxVerdictKey, v) }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		v.Verdict, v.Reason = "SKIP", "upstream returned non-2xx — not audited"
		return nil
	}
	if len(resp.Body) == 0 {
		v.Verdict, v.Reason = "SKIP", "empty or streamed body — not audited"
		return nil
	}
	ev := store.get(ref)
	if ev == nil {
		return nil
	}
	text := extractAssistantText(resp.Body)
	if text == "" {
		v.Verdict, v.Reason = "SKIP", "no assistant text in response — not audited"
		return nil
	}
	v = audit(text, ev, cfg.MinCitations)
	ctx.Log(schemas.LogLevelInfo, fmt.Sprintf("grounding-gate: ref=%s verdict=%s cited=%d", ref, v.label(), len(v.CitedURLs)))

	if cfg.Mode == "enforce" && !v.Pass {
		body, _ := json.Marshal(map[string]any{
			"error": map[string]any{
				"type":    "grounding_reject",
				"message": v.Reason,
			},
			"grounding": v,
		})
		resp.StatusCode = 422
		resp.Headers["Content-Type"] = "application/json"
		delete(resp.Headers, "Content-Length")
		resp.Body = body
	}
	return nil
}

// HTTPTransportResponseHeadersHook writes the verdict headers at the last
// safe point before headers commit — the right place per the transport
// contract for both buffered and streamed responses.
func HTTPTransportResponseHeadersHook(ctx *schemas.BifrostContext, req *schemas.HTTPRequest, resp *schemas.HTTPResponseMetadata) error {
	v, ok := ctx.Value(ctxVerdictKey).(Verdict)
	if !ok {
		return nil
	}
	resp.SetHeader("x-bifrost-grounding", v.label())
	if report, err := json.Marshal(v); err == nil {
		resp.SetHeader("x-bifrost-grounding-report", string(report))
	}
	return nil
}

func Cleanup() error { return nil }

// extractAssistantText pulls the assistant's text out of an OpenAI chat
// completion body — the request shape doorknock and most OpenAI-compatible
// callers use. Content may be a string or an array of parts.
func extractAssistantText(body []byte) string {
	var cr struct {
		Choices []struct {
			Message struct {
				Content json.RawMessage `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.NewDecoder(bytes.NewReader(body)).Decode(&cr) != nil || len(cr.Choices) == 0 {
		return ""
	}
	var texts []string
	for _, choice := range cr.Choices {
		raw := bytes.TrimSpace(choice.Message.Content)
		if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
			continue
		}
		var s string
		if json.Unmarshal(raw, &s) == nil {
			texts = append(texts, s)
			continue
		}
		var parts []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if json.Unmarshal(raw, &parts) == nil {
			for _, p := range parts {
				texts = append(texts, p.Text)
			}
		}
	}
	return strings.Join(texts, "\n")
}
