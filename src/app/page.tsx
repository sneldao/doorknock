"use client";

import { useRef, useState } from "react";
import type { Briefing, Development, GateVerdict, RunEvent } from "@/lib/types";

type Phase = "form" | "running" | "brief";

const KINDS = [
  { value: "sales", label: "Sales call" },
  { value: "partnership", label: "Partnership discussion" },
  { value: "investor", label: "Investor meeting" },
  { value: "bizdev", label: "Business development" },
  { value: "general", label: "General meeting" },
];

export default function Page() {
  const [phase, setPhase] = useState<Phase>("form");
  const [subject, setSubject] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [kind, setKind] = useState("general");
  const [notes, setNotes] = useState("");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [uncertain, setUncertain] = useState<Development[]>([]);
  const [gate, setGate] = useState<GateVerdict | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  async function knock(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !meetingAt) return;
    const myRun = ++runId.current;
    setPhase("running");
    setEvents([]);
    setError(null);
    setBriefing(null);
    setUncertain([]);
    setGate(null);
    setSources([]);

    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          meetingAt,
          kind,
          notes: notes.trim(),
        }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `The desk refused the run (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (runId.current !== myRun) return;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const ev = JSON.parse(dataLine.slice(6)) as RunEvent;
          setEvents((prev) => [...prev, ev]);
          if (ev.type === "sources") setSources(ev.urls);
          if (ev.type === "done") {
            setBriefing(ev.briefing);
            setUncertain(ev.uncertain ?? []);
            setGate(ev.gate);
            setPhase("brief");
            return;
          }
          if (ev.type === "error") {
            setError(ev.message);
            setPhase("form");
            return;
          }
        }
      }
      if (runId.current === myRun) {
        setError("The stream ended before a brief was filed.");
        setPhase("form");
      }
    } catch (err) {
      if (runId.current === myRun) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setPhase("form");
      }
    }
  }

  const searchEvents = events.filter(
    (e): e is Extract<RunEvent, { type: "search" }> => e.type === "search",
  );

  return (
    <div className="mx-auto max-w-3xl px-5">
      {/* telex bar */}
      <div className="telex-bar sticky top-0 z-10 no-print">
        <div className="flex items-center justify-between py-2">
          <span className="mono-label">Doorknock · Pre-Meeting Briefing Agent</span>
          <span className="mono-label hidden sm:block">
            Global AI Hackathon · Problem Statement 05
          </span>
        </div>
      </div>

      {/* masthead */}
      <header className="pt-12 pb-8">
        <h1 className="font-masthead text-5xl sm:text-6xl leading-[0.95] font-semibold">
          Read the room
          <br />
          before you walk in.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--color-ink-soft)]">
          Tell Doorknock who you&apos;re meeting and when. A four-agent crew sweeps
          the last 30 days of news through Tavily, drafts a one-page brief, and an
          auditor rejects any claim that can&apos;t be traced to a fetched source —{" "}
          <em>agents propose, code disposes.</em>
        </p>
      </header>

      <hr className="doc-rule-double no-print" />

      {/* form */}
      {phase === "form" && (
        <form onSubmit={knock} className="no-print pt-9 pb-16">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mono-label">Who are you meeting? — company or person</span>
              <input
                className="field mt-2"
                placeholder="e.g. Meredith Whittaker · Signal Foundation"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                required
              />
            </label>
            <label>
              <span className="mono-label">Meeting time</span>
              <input
                className="field mt-2"
                type="datetime-local"
                value={meetingAt}
                onChange={(e) => setMeetingAt(e.target.value)}
                required
              />
            </label>
            <label>
              <span className="mono-label">Meeting type</span>
              <select
                className="field mt-2"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="mono-label">Anything the crew should know? (optional)</span>
              <textarea
                className="field mt-2"
                rows={2}
                placeholder="e.g. first meeting; we&apos;re pitching payments infrastructure"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={600}
              />
            </label>
          </div>
          {error && (
            <p className="mt-4 border-l-[3px] border-[var(--color-stamp)] pl-3 font-mono text-xs text-[var(--color-stamp)]">
              {error}
            </p>
          )}
          <button className="knock mt-6" type="submit">
            Knock
          </button>
        </form>
      )}

      {/* live run */}
      {phase === "running" && (
        <section className="no-print pt-9 pb-16">
          <p className="mono-label mb-1">
            Run in progress <span className="caret-blink">▌</span>
          </p>
          <div className="mt-4">
            {events.map((ev, i) => (
              <FeedRow key={i} ev={ev} />
            ))}
          </div>
        </section>
      )}

      {/* briefing */}
      {phase === "brief" && briefing && gate && (
        <>
          <section className="no-print pt-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`stamp ${gate.pass ? "stamp-pass" : ""}`}>
                {gate.pass ? "Verified" : "Repaired"} · grounding{" "}
                {(gate.score * 100).toFixed(0)}%
              </span>
              <span className="mono-label">
                {sources.length} sources · {searchEvents.length} Tavily queries · 30-day window
              </span>
              <div className="ml-auto flex gap-3">
                <button className="knock !py-2 !px-4 !text-[11px]" onClick={() => window.print()}>
                  Print brief
                </button>
                <button className="knock !py-2 !px-4 !text-[11px]" onClick={() => setPhase("form")}>
                  Another knock
                </button>
              </div>
            </div>
          </section>

          <BriefDoc briefing={briefing} uncertain={uncertain} sources={sources} />

          <section className="no-print pb-16">
            <details className="mt-6">
              <summary className="mono-label cursor-pointer">
                Research trail — {searchEvents.length} Tavily queries, {sources.length} sources
              </summary>
              <div className="mt-3">
                {searchEvents.map((ev, i) => (
                  <div key={i} className="tavily-chip mb-2">
                    [{ev.topic === "news" ? `news ≤${ev.days}d` : "background"}] {ev.query} · {ev.hits} hits
                  </div>
                ))}
                <ol className="mt-3 list-decimal pl-5 text-[13px]">
                  {sources.map((u) => (
                    <li key={u} className="mb-1">
                      <a className="underline decoration-dotted" href={u} target="_blank" rel="noreferrer">
                        {u}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          </section>
        </>
      )}

      <footer className="no-print border-t border-[var(--color-rule)] py-6">
        <p className="mono-label">
          Crew: Scout → Clerk → Scribe → Auditor · models via Bifrost · research via Tavily
        </p>
      </footer>
    </div>
  );
}

function FeedRow({ ev }: { ev: RunEvent }) {
  if (ev.type === "stage") {
    return (
      <div className="feed-row">
        <span className="agent-tag">{ev.agent}</span>
        <span className="font-mono text-xs">
          {ev.stage}
          {ev.note ? <span className="text-[var(--color-ink-soft)]"> — {ev.note}</span> : null}
        </span>
      </div>
    );
  }
  if (ev.type === "search") {
    return (
      <div className="feed-row">
        <span className="agent-tag">SCOUT</span>
        <span className="tavily-chip">
          [tavily · {ev.topic === "news" ? `news ≤${ev.days}d` : "background"}] {ev.query} → {ev.hits} hits
        </span>
      </div>
    );
  }
  if (ev.type === "gate") {
    return (
      <div className="feed-row">
        <span className="agent-tag">AUDITOR</span>
        <span className={`font-mono text-xs ${ev.verdict.pass ? "text-[var(--color-verified)]" : "text-[var(--color-stamp)]"}`}>
          {ev.verdict.verdictLine}
        </span>
      </div>
    );
  }
  if (ev.type === "sources") {
    return (
      <div className="feed-row">
        <span className="agent-tag">AUDITOR</span>
        <span className="font-mono text-xs text-[var(--color-ink-soft)]">
          source transcript sealed — {ev.urls.length} URLs recorded
        </span>
      </div>
    );
  }
  if (ev.type === "error") {
    return (
      <div className="feed-row">
        <span className="agent-tag">DESK</span>
        <span className="font-mono text-xs text-[var(--color-stamp)]">{ev.message}</span>
      </div>
    );
  }
  return null;
}

function BriefDoc({
  briefing,
  uncertain,
  sources,
}: {
  briefing: Briefing;
  uncertain: Development[];
  sources: string[];
}) {
  const now = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <article className="brief-doc mt-6 mb-6 px-7 sm:px-10 py-9">
      <div className="flex justify-between items-baseline">
        <span className="mono-label">{briefing.masthead}</span>
        <span className="mono-label">{now}</span>
      </div>
      <hr className="doc-rule-double mt-3 mb-5" />
      <h2>{briefing.headline}</h2>
      <p className="mt-3">{briefing.situation}</p>

      <hr className="doc-rule my-6" />
      <span className="mono-label">Key developments — last 30 days</span>
      <div className="mt-3 grid gap-3">
        {briefing.keyDevelopments.map((d, i) => (
          <div key={i} className="dev-card">
            <p className="!text-[14.5px] font-semibold">{d.headline}</p>
            <p className="!text-[13.5px] mt-1 text-[var(--color-ink-soft)]">{d.summary}</p>
            <p className="!text-[13px] mt-1 italic text-[var(--color-ink-soft)]">
              Why it matters: {d.whyItMatters}
            </p>
            <p className="mt-2 mb-1">
              {d.sourceUrls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="mr-3">
                  {hostOf(u)}
                </a>
              ))}
            </p>
          </div>
        ))}
      </div>

      {uncertain.length > 0 && (
        <>
          <hr className="doc-rule my-6" />
          <span className="mono-label" style={{ color: "var(--color-uncertain)" }}>
            Uncertain — treat with caution (could not be source-traced)
          </span>
          <div className="mt-3 grid gap-3">
            {uncertain.map((d, i) => (
              <div key={i} className="dev-card uncertain">
                <p className="!text-[14.5px] font-semibold">{d.headline}</p>
                <p className="!text-[13.5px] mt-1 text-[var(--color-ink-soft)]">{d.summary}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <hr className="doc-rule my-6" />
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <span className="mono-label">Discussion points</span>
          <ul className="mt-2 list-disc pl-4 text-[14px] leading-relaxed">
            {briefing.discussionPoints.map((p, i) => (
              <li key={i} className="mb-1.5">{p}</li>
            ))}
          </ul>
        </div>
        <div>
          <span className="mono-label">Open questions</span>
          <ul className="mt-2 list-disc pl-4 text-[14px] leading-relaxed">
            {briefing.openQuestions.map((q, i) => (
              <li key={i} className="mb-1.5">{q}</li>
            ))}
          </ul>
        </div>
      </div>

      <hr className="doc-rule-double my-6" />
      <span className="mono-label">Sources ({sources.length})</span>
      <ol className="mt-2 list-decimal pl-5 font-mono text-[10.5px] leading-relaxed text-[var(--color-ink-soft)]">
        {sources.map((u) => (
          <li key={u} className="mb-0.5">
            {hostOf(u)} — <a href={u} className="underline decoration-dotted" target="_blank" rel="noreferrer">{u}</a>
          </li>
        ))}
      </ol>
    </article>
  );
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}
