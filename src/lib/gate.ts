import type { Briefing, Development, GateFinding, GateVerdict, SearchRound } from "./types";
import { transcriptUrls } from "./tavily";

// The Auditor — deterministic, no model calls.
//
// "Agents propose, code disposes." The Scribe's brief is only shippable if
// every development traces to a URL that actually appeared in the Scout's
// Tavily transcript. A claim citing a URL the crew never fetched is treated
// as fabrication: REJECT, hand the Scribe a rejection report, and retry.
// If a retry still fails, the brief is repaired — unsourced developments are
// moved to an "uncertain — treat with caution" section rather than deleted,
// because the spec asks for verified findings to be *distinguished*, not
// laundered into silence.

export const GATE_THRESHOLD = 0.8;

export function auditBriefing(
  briefing: Briefing,
  rounds: SearchRound[],
): GateVerdict {
  const transcript = transcriptUrls(rounds);
  const findings: GateFinding[] = [];

  const dev = briefing.keyDevelopments ?? [];
  if (dev.length === 0) {
    return {
      pass: false,
      score: 0,
      findings: [{ kind: "no_developments", detail: "The brief carries no key developments.", urls: [] }],
      verdictLine: "REJECT — no developments",
    };
  }

  let sourced = 0;
  const problemUrls: string[] = [];

  for (const d of dev) {
    const known = d.sourceUrls.filter((u) => transcript.has(normalizeUrl(u)));
    const unknown = d.sourceUrls.filter((u) => !transcript.has(normalizeUrl(u)));
    if (known.length > 0) {
      sourced++;
      if (!d.happenedWithinWindow) {
        findings.push({
          kind: "outside_window",
          detail: `“${d.headline}” is background, not a 30-day development.`,
          urls: known,
        });
      }
    } else {
      problemUrls.push(...unknown);
      findings.push({
        kind: unknown.length === 0 ? "unsourced" : "unknown_source",
        detail:
          unknown.length === 0
            ? `“${d.headline}” cites no source.`
            : `“${d.headline}” cites source(s) the crew never fetched — likely fabricated: ${unknown.join(", ")}`,
        urls: unknown,
      });
    }
  }

  const score = sourced / dev.length;
  const pass = score >= GATE_THRESHOLD && findings.every((f) => f.kind !== "unsourced" && f.kind !== "unknown_source");

  const unsourcedCount = findings.filter(
    (f) => f.kind === "unsourced" || f.kind === "unknown_source",
  ).length;

  const verdictLine = pass
    ? `PASS — ${sourced}/${dev.length} developments source-traced (grounding ${(score * 100).toFixed(0)}%)`
    : `REJECT — ${unsourcedCount} of ${dev.length} developments fail source tracing (grounding ${(score * 100).toFixed(0)}%)`;

  return { pass, score, findings, verdictLine };
}

/** Build the rejection report the Scribe receives on a retry. */
export function rejectionReport(verdict: GateVerdict): string {
  const lines = verdict.findings
    .filter((f) => f.kind === "unsourced" || f.kind === "unknown_source")
    .map((f) => `- ${f.detail}`);
  return [
    "AUDITOR REJECTION REPORT",
    "Every development must cite at least one URL from the research transcript provided to you.",
    "The following developments fail verification and must be removed or re-written against actual transcript sources:",
    ...lines,
    "Do not invent URLs. Do not add claims without a transcript source. Keep only what you can trace.",
  ].join("\n");
}

/** Repair pass — last resort after retries fail. Verified developments stay
 *  in the main brief; untraceable ones move to `uncertain` (kept, flagged). */
export function repairBriefing(
  briefing: Briefing,
  rounds: SearchRound[],
): { briefing: Briefing; uncertain: Development[] } {
  const transcript = transcriptUrls(rounds);
  const keep: Development[] = [];
  const uncertain: Development[] = [];
  for (const d of briefing.keyDevelopments) {
    const traced = d.sourceUrls.some((u) => transcript.has(normalizeUrl(u)));
    if (traced) keep.push(d);
    else uncertain.push(d);
  }
  return {
    briefing: { ...briefing, keyDevelopments: keep },
    uncertain,
  };
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return u.trim();
  }
}
