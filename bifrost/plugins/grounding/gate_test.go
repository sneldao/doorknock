package main

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestFigures(t *testing.T) {
	cases := []struct{ in, want string }{
		{"$40M", "40m"},
		{"40 million", "40m"},
		{"US$40m", "40m"},
		{"12%", "12%"},
		{"12 percent", "12%"},
		{"3,000", "3000"},
		{"40kw", "40"}, // 'k' inside a word is not a suffix
		{"500 billion", "500b"},
		{"2.5 trillion", "2.5t"},
		{"raised $1,000,000 in", "1000000"},
	}
	for _, c := range cases {
		got := figures(c.in)
		if len(got) != 1 || got[0] != c.want {
			t.Errorf("figures(%q) = %v, want [%q]", c.in, got, c.want)
		}
	}
}

func TestExtractURLs(t *testing.T) {
	text := `{"keyDevelopments":[{"headline":"x","sourceUrls":["https://a.com/x","https://b.com/y."]}]}` +
		` see https://a.com/x) and http://c.org/z,`
	got := extractURLs(text)
	want := []string{"https://a.com/x", "https://b.com/y", "http://c.org/z"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("extractURLs = %v, want %v", got, want)
	}
}

func TestNormalizeURL(t *testing.T) {
	if got := normalizeURL("https://a.com/x#frag"); got != "https://a.com/x" {
		t.Errorf("fragment kept: %q", got)
	}
	if got := normalizeURL("https://a.com/x/"); got != "https://a.com/x" {
		t.Errorf("trailing slash kept: %q", got)
	}
	if got := normalizeURL("not a url  "); got != "not a url" {
		t.Errorf("unparseable not trimmed: %q", got)
	}
}

func testEvidence() *evidenceDoc {
	return &evidenceDoc{
		Ref:     "run-1",
		Context: "subject: Shopify; meeting: 2026-11-20",
		Hits: []evidenceHit{
			{URL: "https://news.com/shopify-q3", Title: "Shopify Q3 revenue up 25%", Excerpt: "Shopify reported revenue of $2B, up 25% year over year.", Published: "2026-11-10"},
			{URL: "https://blog.com/partner", Title: "Shopify partners with Acme", Excerpt: "The partnership covers 40 markets.", Published: "2026-11-12"},
		},
		AllowedFigures: []string{"30"},
		expires:        time.Now().Add(time.Hour),
	}
}

func TestAuditPass(t *testing.T) {
	text := `{"keyDevelopments":[{"headline":"Revenue up","summary":"Revenue rose 25% to $2B.",
		"sourceUrls":["https://news.com/shopify-q3"]}]}`
	v := audit(text, testEvidence(), 1)
	if !v.Pass {
		t.Errorf("expected PASS, got %+v", v)
	}
}

func TestAuditUnknownSource(t *testing.T) {
	text := `{"keyDevelopments":[{"summary":"Revenue rose 25%.","sourceUrls":["https://invented.com/x"]}]}`
	v := audit(text, testEvidence(), 1)
	if v.Pass || len(v.UnknownURLs) != 1 {
		t.Errorf("expected REJECT unknown_source, got %+v", v)
	}
}

func TestAuditUnsupportedFigure(t *testing.T) {
	text := `{"keyDevelopments":[{"summary":"Revenue rose 61%.","sourceUrls":["https://news.com/shopify-q3"]}]}`
	v := audit(text, testEvidence(), 1)
	if v.Pass || len(v.UnsupportedFigures) != 1 || v.UnsupportedFigures[0] != "61%" {
		t.Errorf("expected REJECT unsupported_figure 61%%, got %+v", v)
	}
}

func TestAuditNoCitations(t *testing.T) {
	v := audit("Revenue rose 25% with no sources cited.", testEvidence(), 1)
	if v.Pass || v.Reason == "" {
		t.Errorf("expected REJECT insufficient citations, got %+v", v)
	}
}

func TestAuditTracedURLWithFragment(t *testing.T) {
	text := `details https://news.com/shopify-q3#ref done`
	v := audit(text, testEvidence(), 1)
	if !v.Pass {
		t.Errorf("fragment-normalized URL should pass, got %+v", v)
	}
}

func TestExtractGrounding(t *testing.T) {
	body := []byte(`{"model":"x","messages":[],"grounding":{"ref":"run-9","ttl_seconds":60,` +
		`"urls":[{"url":"https://news.com/shopify-q3","excerpt":"Revenue $2B"}]}}`)
	doc, cleaned := extractGrounding(body, "grounding", 512*1024)
	if doc == nil || doc.Ref != "run-9" || len(doc.Hits) != 1 {
		t.Fatalf("expected sealed doc, got %+v", doc)
	}
	if string(cleaned) == "" || jsonContains(string(cleaned), `"grounding"`) {
		t.Errorf("field not stripped from body: %s", cleaned)
	}
	// No field, malformed doc, oversized field → nil doc.
	if doc, _ := extractGrounding([]byte(`{"model":"x"}`), "grounding", 512*1024); doc != nil {
		t.Error("absent field should not seal")
	}
	if doc, _ := extractGrounding([]byte(`{"grounding":{"urls":[]}}`), "grounding", 512*1024); doc != nil {
		t.Error("doc without ref/urls should not seal")
	}
	if doc, _ := extractGrounding(body, "grounding", 10); doc != nil {
		t.Error("oversized field should not seal")
	}
}

func jsonContains(s, sub string) bool {
	return len(s) > 0 && strings.Contains(s, sub)
}

func TestEvidenceStoreExpiry(t *testing.T) {
	s := newEvidenceStore()
	s.put(&evidenceDoc{Ref: "x", expires: time.Now().Add(-time.Second)})
	if s.get("x") != nil {
		t.Error("expired evidence should not be returned")
	}
	s.put(&evidenceDoc{Ref: "y", expires: time.Now().Add(time.Hour)})
	if s.get("y") == nil {
		t.Error("live evidence should be returned")
	}
}
