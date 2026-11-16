import type { Briefing, Development, GateFinding, GateVerdict, SearchRound, WebHit } from "./types";
import { EXCERPT_CHARS, transcriptUrls } from "./tavily";

// The Auditor — deterministic, no model calls.
//
// "Agents propose, code disposes." The Scribe's brief is only shippable if
// every development traces to a URL that actually appeared in the Scout's
// Tavily transcript — and if every figure it states appears in the excerpt
// the model actually saw (title + first EXCERPT_CHARS of the snippet +
// published date). A claim citing a real URL but stating an invented
// number is still fabrication: REJECT, hand the Scribe a rejection report,
// and retry. If a retry still fails, the brief is repaired — unsourced or
// figure-unsupported developments are moved to an "uncertain — treat with
// caution" section rather than deleted, because the spec asks for verified
// findings to be *distinguished*, not laundered into silence.
//
// This file and anna/bundle/gate.js share one contract; changes to either
// must be covered by cases in tests/gate-cases.json (consumed by both
// tests/gate.test.ts and anna/test/gate.mjs).

export const GATE_THRESHOLD = 0.8;

/** Every digit run in `text`, canonicalised so the same quantity compares
 *  equal however it was written: "$40M", "40 million" and "US$40m" all
 *  become "40m"; "12%" and "12 percent" become "12%"; "3,000" -> "3000". */
export function figures(text: string): string[] {
  const re =
    /(?:US\$|CA\$|AU\$|NZ\$|HK\$|[A-Z]{2}\$|[$€£¥₹])?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion|percent|%)(?![a-z])|(mn|bn|[kmbt])(?![a-z0-9]))?/gi;
  const units: Record<string, string> = {
    thousand: "k",
    k: "k",
    million: "m",
    mn: "m",
    m: "m",
    billion: "b",
    bn: "b",
    b: "b",
    trillion: "t",
    t: "t",
    percent: "%",
    "%": "%",
  };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const num = m[1].replace(/,/g, "");
    const fig = num + (m[2] ?? m[3] ? units[(m[2] ?? m[3]).toLowerCase()] : "");
    if (!seen.has(fig)) {
      seen.add(fig);
      out.push(fig);
    }
  }
  return out;
}

/** Words that are not themselves a name — sentence-initial function words,
 *  months, weekdays, and common business/region initialisms. Exported so
 *  the anna bundle keeps the identical set. */
export const NAME_STOPWORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "it", "its", "they",
  "their", "we", "our", "you", "your", "he", "she", "his", "her", "in", "on",
  "at", "for", "with", "from", "by", "as", "if", "but", "and", "or",
  "however", "meanwhile", "why", "what", "how", "when", "where", "who",
  "which",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct",
  "nov", "dec",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  "sunday",
  "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
  "q1", "q2", "q3", "q4", "fy", "h1", "h2", "yoy", "qoq",
  "ceo", "cfo", "cto", "coo", "cro", "cmo", "cio", "ciso", "cpo", "cco", "cdo",
  "ai", "api", "ipo", "uk", "us", "usa", "eu", "emea", "apac", "b2b", "b2c",
  "saas", "smb", "genai", "llm", "gpu", "cpu", "m&a", "r&d", "hq",
  "inc", "ltd", "llc", "corp", "co", "group", "team", "board",
  "north", "south", "east", "west",
  "vp", "svp", "evp", "md", "gm", "pm", "chief", "officer", "president",
  "director", "head", "founder", "product", "engineering", "marketing",
  "sales", "finance", "operations", "strategy", "partnerships",
]);

const NAME_JOINERS = new Set(["of", "de", "van", "von", "the", "&"]);

/** Token stripped of wrapping punctuation ("(Acme," -> "Acme"). */
function cleanTok(t: string): string {
  return t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
const isJoinerTok = (t: string) => t === "&" || NAME_JOINERS.has(cleanTok(t).toLowerCase());
const isStopTok = (t: string) => {
  const w = cleanTok(t).toLowerCase();
  // A trailing "s" doesn't rescue a stopword ("APIs", "CEOs", "GPUs").
  return NAME_STOPWORDS.has(w) || (w.endsWith("s") && NAME_STOPWORDS.has(w.slice(0, -1)));
};
/** Possessive tail ('s, ’s, a trailing ' or ’) — stripped before both
 *  comparison and reporting. */
const stripPoss = (w: string) => w.replace(/['’]s$/i, "").replace(/['’]+$/, "");
/** A token ends a sentence on ".", "!" or "?"; the lone-initial exception
 *  for "J. Smith" lives in names(). */
function endsSentence(t: string): boolean {
  return /[!?.]["'’”)\].,;:]*$/.test(t);
}

/** Every capitalised name run in `text`: person, company and product names
 *  the way prose writes them.
 *  - The FIRST word of a run at a sentence or field start is never checked
 *    (ordinary capitalisation): "Discuss Claude Code" checks "Claude Code",
 *    a lone sentence-initial word yields nothing.
 *  - Runs never cross punctuation; joiners between two capitalised words
 *    are only of/de/van/von/the/&.
 *  - Hyphenated tokens split on "-"; only uppercased parts are name words
 *    ("China-related" -> "China").
 *  - Possessives are stripped before reporting.
 *  - Runs made only of stopwords are dropped. */
export function names(text: string): string[] {
  const toks = String(text ?? "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  let run: string[] = [];
  let runInits: boolean[] = [];
  const flush = () => {
    if (runInits[0]) { run.shift(); runInits.shift(); }
    // Directions are stopwords when they stand alone but real name words
    // at the head of a run ("North Peak Capital") — never trim them off.
    const leading = (w: string) =>
      isJoinerTok(w) || (isStopTok(w) && !["north", "south", "east", "west"].includes(w.toLowerCase()));
    while (run.length && leading(run[0])) {
      run.shift();
      runInits.shift();
    }
    while (run.length && (isJoinerTok(run[run.length - 1]) || isStopTok(run[run.length - 1]))) {
      run.pop();
      runInits.pop();
    }
    if (run.length && !run.every(isStopTok)) {
      const s = run.join(" ");
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    run = [];
    runInits = [];
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const prev = i > 0 ? toks[i - 1] : "";
    // A lone-letter "." ("J.") ends a sentence only when it did not itself
    // begin the current run — that's an initial, and the next name joins it.
    const loneInitial =
      /\.["'’”)\]]*$/.test(prev) && cleanTok(prev).length === 1 && run.length === 1;
    const initial = i === 0 || (!loneInitial && endsSentence(prev));
    // A token may hold several words across a hyphen ("Mercedes-AMG") or a
    // lone "&"; punctuation at the edges ends the run.
    let partInit = initial;
    for (const part of t.split(/[-–—]/u)) {
      // Dotted initialisms (U.S., U.K., E.U.) lose their dots before
      // classifying; a token containing a digit is never a name word —
      // digits are the figure rule's job.
      const w = stripPoss(cleanTok(part)).replace(/\./g, "");
      if (part.trim() === "&") {
        if (run.length) { run.push("&"); runInits.push(false); }
        partInit = false;
        continue;
      }
      if (!w) { flush(); continue; }
      if (isJoinerTok(w)) {
        if (run.length) { run.push(w); runInits.push(false); }
        partInit = false;
        continue;
      }
      // Two-letter all-caps tokens (IP, EU, HR, PR, VC…) are never name
      // words; three or more letters still are.
      if (/^[A-ZÀ-Þ]/u.test(w) && !/\d/.test(w) && !/^\p{Lu}{2}$/u.test(w) && !/[$€£¥₹]/.test(part)) {
        if (run.length && partInit) flush();
        run.push(w);
        runInits.push(partInit);
        partInit = false;
      } else {
        flush();
      }
    }
    // Trailing break punctuation (, ; : " ) ] …) ends the run — but a
    // single-letter initial ("J.") is a name word, not a boundary.
    if (/[,;:!?.)\]}"'’”`]/.test(t.slice(-1)) && !/^[A-ZÀ-Þ]\.[)'’"’”]*$/.test(t)) flush();
  }
  flush();
  return out;
}

/** Derivational match: no exact whole-word hit needed when an evidence
 *  word shares a common prefix of >= max(4, ceil(0.75 × shorter length))
 *  and the lengths differ by at most 6 — "Congressional" is supported by
 *  "Congress", "Chinese" by "China"; "Striker" is not supported by
 *  "Stripe" and "Ruiz" is not supported by "Ruin". */
function derivational(w: string, hay: string): boolean {
  const needle = w.toLowerCase();
  const words = hay.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  return words.some((ew) => {
    if (Math.abs(ew.length - needle.length) > 6) return false;
    let i = 0;
    while (i < Math.min(ew.length, needle.length) && ew[i] === needle[i]) i += 1;
    return i >= Math.max(4, Math.ceil(0.75 * Math.min(ew.length, needle.length)));
  });
}

/** A name is supported when every content word in the run appears in
 *  `hay` — whole word (case-insensitive, punctuation-stripped) or
 *  derivationally. */
function nameSupported(run: string, hay: string): boolean {
  return contentWords(run).every(
    (w) =>
      new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay) ||
      derivational(w, hay),
  );
}

/** The words of a run that must be evidenced (joiners and stopwords out). */
function contentWords(run: string): string[] {
  return run
    .split(/\s+/)
    .map((w) => stripPoss(cleanTok(w)))
    .filter((w) => w && !NAME_STOPWORDS.has(w.toLowerCase()) && !NAME_JOINERS.has(w.toLowerCase()));
}

/** Names in `text` absent from `hay` (evidence + allowed context). */
function unsupportedNames(text: string, hay: string): string[] {
  return names(text).filter((n) => !nameSupported(n, hay));
}

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return u.trim();
  }
}

/** The exact text the model saw for a hit — the gate audits against this
 *  and nothing else. A figure beyond EXCERPT_CHARS of the snippet was never
 *  shown to the model, so a claim stating it is treated as memory, i.e.
 *  fabrication. */
function hitEvidence(h: WebHit): string {
  return `${h.title} ${h.snippet.slice(0, EXCERPT_CHARS)} ${h.published ?? ""}`;
}

/** Registrable hostname labels as extra NAME evidence (names only, never
 *  figures): https://www.cnbc.com/… contributes "cnbc"; a co.uk host its
 *  registrable label. The outlet a story comes from is legitimately
 *  nameable in the brief. */
const HOST_SUFFIXES = new Set([
  "com", "org", "net", "co", "uk", "io", "ai", "gov", "edu", "info", "news",
  "press", "app", "dev", "me", "tv", "eu", "biz", "de", "fr", "jp", "au",
  "us", "ca", "in", "br", "za", "sg", "hk", "kr", "cn", "tw", "it", "es",
  "nl", "se", "no", "ch", "ie", "nz",
]);
function hostNameWords(url: string): string {
  try {
    const labels = new URL(url).hostname.toLowerCase().split(".").filter(Boolean);
    while (labels.length && labels[0] === "www") labels.shift();
    while (labels.length > 1 && HOST_SUFFIXES.has(labels[labels.length - 1])) labels.pop();
    return labels.join(" ").replace(/-/g, " ");
  } catch {
    return "";
  }
}
function nameEvidence(hits: WebHit[]): string {
  return hits.map((h) => `${hitEvidence(h)} ${hostNameWords(h.url)}`).join(" ");
}

/** Normalized URL -> hit, for every URL in the transcript. */
function transcriptIndex(rounds: SearchRound[]): Map<string, WebHit> {
  const idx = new Map<string, WebHit>();
  for (const h of rounds.flatMap((r) => r.hits)) {
    const key = normalizeUrl(h.url);
    if (!idx.has(key)) idx.set(key, h);
  }
  return idx;
}

function allowedFigures(context?: string): Set<string> {
  // "30" is the sweep window itself — "in the last 30 days" is always true.
  return new Set([...figures(context ?? ""), "30"]);
}

/** Figures in `text` that appear neither in `evidence` nor in the allowed
 *  (context-provided) set. */
function unsupported(text: string, evidence: Set<string>, allowed: Set<string>): string[] {
  return figures(text).filter((f) => !evidence.has(f) && !allowed.has(f));
}

const STALE_DAYS = 45;

function parseDay(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

export function auditBriefing(
  briefing: Briefing,
  rounds: SearchRound[],
  context?: string,
  today?: string,
): GateVerdict {
  const transcript = new Set([...transcriptUrls(rounds)].map(normalizeUrl));
  const index = transcriptIndex(rounds);
  const allowed = allowedFigures(context);
  const now = parseDay(today) ?? Date.now();
  const findings: GateFinding[] = [];
  const allNameEvidence = `${nameEvidence(rounds.flatMap((r) => r.hits))} ${context ?? ""}`;

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
    if (known.length === 0) {
      problemUrls.push(...unknown);
      findings.push({
        kind: unknown.length === 0 ? "unsourced" : "unknown_source",
        detail:
          unknown.length === 0
            ? `“${d.headline}” cites no source.`
            : `“${d.headline}” cites source(s) the crew never fetched — likely fabricated: ${unknown.join(", ")}`,
        urls: unknown,
      });
      continue;
    }

    const evidence = new Set(
      figures(known.map((u) => hitEvidence(index.get(normalizeUrl(u))!)).join(" ")),
    );
    const bad = unsupported(`${d.headline}. ${d.summary} ${d.whyItMatters}`, evidence, allowed);
    if (bad.length > 0) {
      findings.push({
        kind: "unsupported_figure",
        field: "keyDevelopments",
        detail: `“${d.headline}” states ${bad.join(", ")} — not in the cited excerpts.`,
        urls: known,
      });
      continue; // a real citation does not rescue invented numbers
    }

    // Names audit the whole transcript: a name from model memory appears
    // nowhere in it, while ordinary capitalised words usually do.
    // Development headlines are skipped: they are routinely Title Case.
    const nameText = `${d.summary} ${d.whyItMatters}`;
    const badNames = unsupportedNames(nameText, allNameEvidence);
    // A multi-word name that IS in the transcript must be evidenced by the
    // hits this development actually cites — otherwise the name is being
    // borrowed from another story (misattributed_name). Single-word names
    // keep the whole-transcript rule only; a name in no hit at all stays
    // unsupported_name, never both.
    const citedEvidence = `${nameEvidence(known.map((u) => index.get(normalizeUrl(u))!))} ${context ?? ""}`;
    const misplaced = names(nameText).filter(
      (n) => contentWords(n).length >= 2 && nameSupported(n, allNameEvidence) && !nameSupported(n, citedEvidence),
    );
    if (badNames.length > 0) {
      findings.push({
        kind: "unsupported_name",
        field: "keyDevelopments",
        detail: `“${d.headline}” names ${badNames.join(", ")} — not in the cited excerpts.`,
        urls: known,
      });
      continue; // a real citation does not rescue invented names either
    }
    if (misplaced.length > 0) {
      findings.push({
        kind: "misattributed_name",
        field: "keyDevelopments",
        detail: `“${d.headline}” names ${misplaced.join(", ")} — in the transcript, but not in the sources this development cites.`,
        urls: known,
      });
      continue;
    }

    if (d.happenedWithinWindow) {
      const days = known.map((u) => parseDay(index.get(normalizeUrl(u))!.published));
      if (days.every((t) => t !== null) && days.every((t) => now - t! > STALE_DAYS * 86_400_000)) {
        findings.push({
          kind: "stale_source",
          field: "keyDevelopments",
          detail: `“${d.headline}” cites only sources older than ${STALE_DAYS} days.`,
          urls: known,
        });
        continue;
      }
    }

    sourced++;
    if (!d.happenedWithinWindow) {
      findings.push({
        kind: "outside_window",
        detail: `“${d.headline}” is background, not a 30-day development.`,
        urls: known,
      });
    }
  }

  // Top-level prose is audited against everything the model saw.
  const allEvidence = new Set(
    figures(rounds.flatMap((r) => r.hits.map(hitEvidence)).join(" ")),
  );
  const allEvidenceText = allNameEvidence;
  const prose: [string, string][] = [
    ["headline", briefing.headline ?? ""],
    ["situation", briefing.situation ?? ""],
    ...(briefing.discussionPoints ?? []).map((p): [string, string] => ["discussionPoints", p]),
    ...(briefing.openQuestions ?? []).map((q): [string, string] => ["openQuestions", q]),
  ];
  for (const [field, text] of prose) {
    const bad = unsupported(text, allEvidence, allowed);
    if (bad.length > 0) {
      findings.push({
        kind: "unsupported_figure",
        field,
        detail: `“${text.length > 80 ? text.slice(0, 77) + "…" : text}” states ${bad.join(", ")} — not in the cited excerpts.`,
        urls: [],
      });
    }
    const badNames = unsupportedNames(text, allEvidenceText);
    if (badNames.length > 0) {
      findings.push({
        kind: "unsupported_name",
        field,
        detail: `“${text.length > 80 ? text.slice(0, 77) + "…" : text}” names ${badNames.join(", ")} — not in the cited excerpts.`,
        urls: [],
      });
    }
  }

  const score = sourced / dev.length;
  const blocking = (f: GateFinding) =>
    f.kind === "unsourced" || f.kind === "unknown_source" || f.kind === "unsupported_figure"
    || f.kind === "unsupported_name" || f.kind === "misattributed_name" || f.kind === "stale_source";
  const pass = score >= GATE_THRESHOLD && findings.every((f) => !blocking(f));

  const figCount = findings.filter((f) => f.kind === "unsupported_figure").length;
  const nameCount = findings.filter((f) => f.kind === "unsupported_name").length;
  const staleCount = findings.filter((f) => f.kind === "stale_source").length;
  const misattrCount = findings.filter((f) => f.kind === "misattributed_name").length;
  const bits = [
    figCount ? `${figCount} unsupported figure finding${figCount === 1 ? "" : "s"}` : "",
    nameCount ? `${nameCount} unsupported name finding${nameCount === 1 ? "" : "s"}` : "",
    staleCount ? `${staleCount} stale source${staleCount === 1 ? "" : "s"}` : "",
    misattrCount ? `${misattrCount} misattributed name${misattrCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join("; ");
  const verdictLine = pass
    ? `PASS — ${sourced}/${dev.length} developments source-traced (grounding ${(score * 100).toFixed(0)}%)`
    : `REJECT — ${dev.length - sourced} of ${dev.length} developments fail source tracing${bits ? `; ${bits}` : ""} (grounding ${(score * 100).toFixed(0)}%)`;

  return { pass, score, findings, verdictLine };
}

/** Build the rejection report the Scribe receives on a retry. */
export function rejectionReport(verdict: GateVerdict): string {
  const lines = verdict.findings
    .filter(
      (f) =>
        f.kind === "unsourced" || f.kind === "unknown_source" || f.kind === "unsupported_figure"
        || f.kind === "unsupported_name" || f.kind === "misattributed_name" || f.kind === "stale_source",
    )
    .map((f) => `- ${f.detail}`);
  return [
    "AUDITOR REJECTION REPORT",
    "Every development must cite at least one URL from the research transcript provided to you.",
    "The following developments fail verification and must be removed or re-written against actual transcript sources:",
    ...lines,
    "Remove any number, amount, percentage or date that is not present in the transcript excerpts.",
    "Remove any person, company or product name that is not present in the transcript excerpts.",
    "Cite the source that names them, or remove the name.",
    "Do not invent URLs. Do not add claims without a transcript source. Keep only what you can trace.",
  ].join("\n");
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

/** Repair pass — last resort after retries fail. Verified developments stay
 *  in the main brief; untraceable ones and ones carrying figures the excerpts
 *  don't support move to `uncertain` (kept, flagged). Prose items carrying an
 *  unsupported figure are dropped; offending sentences are cut from the
 *  headline and situation. */
export function repairBriefing(
  briefing: Briefing,
  rounds: SearchRound[],
  context?: string,
  today?: string,
): { briefing: Briefing; uncertain: Development[] } {
  const transcript = new Set([...transcriptUrls(rounds)].map(normalizeUrl));
  const index = transcriptIndex(rounds);
  const allowed = allowedFigures(context);
  const now = parseDay(today) ?? Date.now();
  const allEvidence = new Set(
    figures(rounds.flatMap((r) => r.hits.map(hitEvidence)).join(" ")),
  );
  const allEvidenceText = `${nameEvidence(rounds.flatMap((r) => r.hits))} ${context ?? ""}`;

  const keep: Development[] = [];
  const uncertain: Development[] = [];
  for (const d of briefing.keyDevelopments) {
    const known = d.sourceUrls.filter((u) => transcript.has(normalizeUrl(u)));
    const traced = known.length > 0;
    const evidence = traced
      ? known.map((u) => hitEvidence(index.get(normalizeUrl(u))!)).join(" ")
      : "";
    const bad = traced
      ? unsupported(`${d.headline}. ${d.summary} ${d.whyItMatters}`, new Set(figures(evidence)), allowed)
      : [];
    // Same name contract as auditBriefing: whole transcript, no headline,
    // plus misattribution — a multi-word name must come from the hits this
    // development cites.
    const nameText = `${d.summary} ${d.whyItMatters}`;
    const badNames = traced
      ? unsupportedNames(nameText, allEvidenceText)
      : [];
    const misplaced = traced
      ? names(nameText).filter(
          (n) =>
            contentWords(n).length >= 2 &&
            nameSupported(n, allEvidenceText) &&
            !nameSupported(n, `${nameEvidence(known.map((u) => index.get(normalizeUrl(u))!))} ${context ?? ""}`),
        )
      : [];
    const stale =
      traced && d.happenedWithinWindow
        ? (() => {
            const days = known.map((u) => parseDay(index.get(normalizeUrl(u))!.published));
            return days.every((t) => t !== null) && days.every((t) => now - t! > STALE_DAYS * 86_400_000);
          })()
        : false;
    if (traced && bad.length === 0 && badNames.length === 0 && misplaced.length === 0 && !stale) keep.push(d);
    else uncertain.push(d);
  }

  const clean = (items: string[]) =>
    items.filter(
      (p) =>
        unsupported(p, allEvidence, allowed).length === 0 &&
        unsupportedNames(p, allEvidenceText).length === 0,
    );
  const cleanSentences = (text: string) =>
    sentences(text)
      .filter(
        (s) =>
          unsupported(s, allEvidence, allowed).length === 0 &&
          unsupportedNames(s, allEvidenceText).length === 0,
      )
      .join(" ");

  const headline =
    cleanSentences(briefing.headline) || keep[0]?.headline || briefing.headline;
  const situation = cleanSentences(briefing.situation) || "See the developments below.";

  return {
    briefing: {
      ...briefing,
      headline,
      situation,
      keyDevelopments: keep,
      discussionPoints: clean(briefing.discussionPoints ?? []),
      openQuestions: clean(briefing.openQuestions ?? []),
    },
    uncertain,
  };
}
