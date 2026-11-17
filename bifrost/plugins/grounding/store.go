package main

import (
	"sync"
	"time"
)

// Evidence is sealed per caller-supplied ref and expires on a TTL. The
// store is in-memory — a gateway restart clears the transcripts, which is
// acceptable for a gate that is meant to run inside a single request's
// lifetime. Lazy expiry on read and on write keeps this goroutine-free.

type evidenceStore struct {
	mu   sync.Mutex
	docs map[string]*evidenceDoc
}

func newEvidenceStore() *evidenceStore {
	return &evidenceStore{docs: map[string]*evidenceDoc{}}
}

func (s *evidenceStore) put(doc *evidenceDoc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweepLocked(time.Now())
	s.docs[doc.Ref] = doc
}

func (s *evidenceStore) get(ref string) *evidenceDoc {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, ok := s.docs[ref]
	if !ok {
		return nil
	}
	if time.Now().After(doc.expires) {
		delete(s.docs, ref)
		return nil
	}
	return doc
}

func (s *evidenceStore) delete(ref string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.docs, ref)
}

func (s *evidenceStore) sweepLocked(now time.Time) {
	for ref, doc := range s.docs {
		if now.After(doc.expires) {
			delete(s.docs, ref)
		}
	}
}
