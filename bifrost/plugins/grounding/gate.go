package main

// The auditor — deterministic, no model calls. Ported from doorknock's
// src/lib/gate.ts (URL tracing + figure canonicalization subset). The
// generic contract here is weaker than the app's per-development audit:
// the plugin does not know which claim cites which URL, so it audits the
// whole response against the whole evidence set. Keep the two in sync at
// the level of the shared rules — figures() and normalizeURL() must not
// diverge from the TypeScript gate.
//
// "Agents propose, code disposes." Any caller can seal its evidence with
// the gateway and get a verdict on what the model produced against it.

import (
	"net/url"
	"regexp"
	"strings"
	"time"
)

// normalizeURL mirrors gate.ts: drop the fragment and a single trailing
// slash; a URL that fails to parse compares as its trimmed text.
func normalizeURL(u string) string {
	parsed, err := url.Parse(u)
	if err != nil || parsed.Scheme == "" {
		// JS new URL() requires an absolute URL; Go's parser is more
		// forgiving — keep the TS behavior of comparing the trimmed text.
		return strings.TrimSpace(u)
	}
	parsed.Fragment = ""
	return strings.TrimSuffix(parsed.String(), "/")
}

var urlRe = regexp.MustCompile(`https?://[^\s"'<>)\]}\\,;` + "`" + `]+`)

// extractURLs pulls every http(s) URL out of free text — including the
// "sourceUrls": [...] entries inside a JSON-shaped model reply — strips
// trailing sentence punctuation, and dedupes in first-seen order.
func extractURLs(text string) []string {
	var out []string
	seen := map[string]bool{}
	for _, m := range urlRe.FindAllString(text, -1) {
		u := strings.TrimRight(m, `.,;:!?'"”’)\]}»`)
		if u == "" || seen[u] {
			continue
		}
		seen[u] = true
		out = append(out, u)
	}
	return out
}

var numberRe = regexp.MustCompile(`\d[\d,]*(?:\.\d+)?`)
var suffixRe = regexp.MustCompile(`(?i)^\s*(thousand|million|billion|trillion|percent|%|mn|bn|[kmbt])`)

var figureUnits = map[string]string{
	"thousand": "k", "k": "k",
	"million": "m", "mn": "m", "m": "m",
	"billion": "b", "bn": "b", "b": "b",
	"trillion": "t", "t": "t",
	"percent": "%", "%": "%",
}

// figures canonicalises every quantity in text so that "$40M",
// "40 million" and "US$40m" compare equal as "40m", and "12%" and
// "12 percent" compare as "12%". A multiplier followed by a lowercase
// letter is part of a longer word, not a unit — "40kw" stays "40".
func figures(text string) []string {
	var out []string
	seen := map[string]bool{}
	for _, loc := range numberRe.FindAllStringIndex(text, -1) {
		num := strings.ReplaceAll(text[loc[0]:loc[1]], ",", "")
		unit := ""
		rest := text[loc[1]:]
		if m := suffixRe.FindStringSubmatchIndex(rest); m != nil {
			// Emulate the JS (?![a-z]) lookahead: the suffix only counts
			// when the byte after it is not a lowercase letter.
			if m[1] >= len(rest) || rest[m[1]] < 'a' || rest[m[1]] > 'z' {
				unit = figureUnits[strings.ToLower(rest[m[2]:m[3]])]
			}
		}
		fig := num + unit
		if !seen[fig] {
			seen[fig] = true
			out = append(out, fig)
		}
	}
	return out
}

type evidenceHit struct {
	URL       string `json:"url"`
	Title     string `json:"title"`
	Excerpt   string `json:"excerpt"`
	Published string `json:"published"`
}

// evidenceDoc is what callers PUT to the ingest endpoint: the sealed
// transcript the gate audits the response against.
type evidenceDoc struct {
	Ref            string        `json:"ref"`
	Context        string        `json:"context"`
	AllowedFigures []string      `json:"allowed_figures"`
	TTLSeconds     int           `json:"ttl_seconds"`
	Hits           []evidenceHit `json:"urls"`

	expires time.Time
}

// Verdict is the audit result. It is written into the response headers
// (compact form) and, in enforce mode, into the 422 body.
type Verdict struct {
	Pass               bool     `json:"pass"`
	Verdict            string   `json:"verdict"` // PASS | REJECT | NO_EVIDENCE
	CitedURLs          []string `json:"cited_urls"`
	UnknownURLs        []string `json:"unknown_urls,omitempty"`
	UnsupportedFigures []string `json:"unsupported_figures,omitempty"`
	Reason             string   `json:"reason,omitempty"`
}

func (v Verdict) label() string {
	if v.Pass {
		return "PASS"
	}
	return v.Verdict
}

func hitEvidence(h evidenceHit) string {
	return h.Title + " " + h.Excerpt + " " + h.Published
}

// audit checks model output text against a sealed evidence transcript.
//
// A reply passes when it cites at least minCitations URLs, every cited URL
// appears in the transcript (normalized), and every figure it states
// appears somewhere in the evidence (all hits' title+excerpt+published),
// the caller's context string, or its declared allowed_figures. Unlike
// the app's per-development gate, cited hits are not mapped per claim —
// the generic check is intentionally the coarse one.
func audit(text string, ev *evidenceDoc, minCitations int) Verdict {
	transcript := map[string]bool{}
	var evidenceParts []string
	for _, h := range ev.Hits {
		transcript[normalizeURL(h.URL)] = true
		evidenceParts = append(evidenceParts, hitEvidence(h))
	}
	evidenceFigs := map[string]bool{}
	for _, f := range figures(strings.Join(evidenceParts, " ") + " " + ev.Context) {
		evidenceFigs[f] = true
	}
	for _, f := range ev.AllowedFigures {
		evidenceFigs[f] = true
		for _, cf := range figures(f) {
			evidenceFigs[cf] = true
		}
	}

	// URLs are citations, not claims — digits inside a path or query
	// ("…/2026/11/…", tracking ids) are never audited as figures.
	claimText := urlRe.ReplaceAllString(text, " ")

	var cited, unknown []string
	for _, u := range extractURLs(text) {
		n := normalizeURL(u)
		if transcript[n] {
			cited = append(cited, n)
		} else {
			unknown = append(unknown, n)
		}
	}

	var unsupported []string
	for _, f := range figures(claimText) {
		if !evidenceFigs[f] {
			unsupported = append(unsupported, f)
		}
	}

	v := Verdict{Pass: true, Verdict: "PASS", CitedURLs: cited}
	switch {
	case len(unknown) > 0:
		// Fabricated citations are the more useful diagnosis than a bare
		// count — report them even when nothing valid was cited.
		v.Pass = false
		v.Verdict = "REJECT"
		v.UnknownURLs = unknown
		v.Reason = "unknown source — cites URL(s) absent from the evidence transcript"
	case len(cited) < minCitations:
		v.Pass = false
		v.Verdict = "REJECT"
		v.Reason = "insufficient citations — the reply cites no URL from the evidence transcript"
	case len(unsupported) > 0:
		v.Pass = false
		v.Verdict = "REJECT"
		v.UnsupportedFigures = unsupported
		v.Reason = "unsupported figure — states quantities absent from the evidence excerpts"
	}
	return v
}
