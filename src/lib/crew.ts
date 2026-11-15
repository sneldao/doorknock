import { askObject } from "./llm";
import { auditBriefing, rejectionReport, repairBriefing, GATE_THRESHOLD } from "./gate";
import { dedupedHits, runSearchRounds, transcriptUrls } from "./tavily";
import {
  BriefRequestSchema,
  BriefingSchema,
  QueryPlanSchema,
  SynthesisSchema,
  type BriefRequest,
  type Briefing,
  type Development,
  type GateVerdict,
  type RunEvent,
  type SearchRound,
} from "./types";

const KIND_LABEL: Record<string, string> = {
  sales: "a sales call",
  partnership: "a partnership discussion",
  investor: "an investor meeting",
  bizdev: "a business development conversation",
  general: "a general meeting",
};

const AGENTS = {
  scout: "SCOUT",
  clerk: "CLERK",
  scribe: "SCRIBE",
  auditor: "AUDITOR",
} as const;

function hitList(rounds: SearchRound[]): string {
  return rounds
    .flatMap((r) =>
      r.hits.map(
        (h) =>
          `- [${r.topic}${r.days ? ` · ≤${r.days}d` : ""}] ${h.title}\n  ${h.url}${h.published ? `\n  published: ${h.published}` : ""}\n  ${h.snippet.slice(0, 320)}`,
      ),
    )
    .join("\n");
}

export async function runBriefing(
  raw: unknown,
  emit: (event: RunEvent) => void,
): Promise<void> {
  const parsed = BriefRequestSchema.safeParse(raw);
  if (!parsed.success) {
    emit({ type: "error", message: "Invalid brief request" });
    return;
  }
  const req: BriefRequest = parsed.data;
  const meetingLabel = KIND_LABEL[req.kind] ?? "a meeting";

  // ── 1. SCOUT plans the sweep ───────────────────────────────────────────────
  emit({ type: "stage", agent: AGENTS.scout, stage: "planning", note: `Deriving queries for ${meetingLabel}` });

  const plan = await askObject(
    QueryPlanSchema,
    [
      `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
      `You are preparing research for ${meetingLabel} with "${req.subject}"${req.notes ? ` (context: ${req.notes})` : ""}, scheduled for ${req.meetingAt}.`,
      `Plan a web-search sweep covering the preceding 30 days: news, launches, hires, leadership changes, funding, partnerships, legal or regulatory developments — anything that would change what matters in this meeting.`,
      `Return 3-6 news queries, each a focused web-search phrase (not a question). Include the subject's name in each.`,
      `Also return exactly one evergreen "identityQuery" that establishes who or what the subject is (no recency intent).`,
    ].join("\n"),
  );

  const queries = [
    { query: plan.identityQuery, topic: "general" as const, days: null },
    ...plan.queries.map((q) => ({ query: q, topic: "news" as const, days: 30 })),
  ];

  // ── 2. SCOUT runs the Tavily sweep ─────────────────────────────────────────
  emit({ type: "stage", agent: AGENTS.scout, stage: "sweeping", note: `${queries.length} queries · Tavily · 30-day news window` });

  const rounds = await runSearchRounds(queries, (r) => {
    emit({ type: "search", query: r.query, topic: r.topic, days: r.days, hits: r.hits.length });
  });

  const hits = dedupedHits(rounds);
  const urls = transcriptUrls(rounds);
  emit({ type: "sources", urls: [...urls] });

  if (hits.length === 0) {
    emit({ type: "error", message: "The sweep returned nothing — check the subject spelling or Tavily key." });
    return;
  }

  // ── 3. CLERK clusters the transcript ───────────────────────────────────────
  emit({ type: "stage", agent: AGENTS.clerk, stage: "synthesising", note: `${hits.length} sources · clustering into developments` });

  const synthesis = await askObject(
    SynthesisSchema,
    [
      `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
      `Research transcript for "${req.subject}", gathered for ${meetingLabel}:`,
      ``,
      hitList(rounds),
      ``,
      `Cluster these hits into distinct developments from the LAST 30 DAYS (launches, hires, funding, partnerships, notable news).`,
      `Rules:`,
      `- Every development MUST cite 1-6 sourceUrls copied EXACTLY from the transcript above. Never invent or modify a URL.`,
      `- If a hit is relevant background but older than ~30 days, fold it into "context" instead — and never mark such an item happenedWithinWindow.`,
      `- Set happenedWithinWindow true only if the sources support that the development occurred in the last 30 days.`,
      `- "context" is one steady-state paragraph on the subject (who they are, what the company does) — no claims of recent change.`,
      `- Prefer fewer, well-supported developments over many weak ones.`,
    ].join("\n"),
  );

  // ── 4. SCRIBE drafts, AUDITOR gates ─────────────────────────────────────────
  const basePrompt = [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    `You are writing a one-page pre-meeting briefing for ${meetingLabel} with "${req.subject}", scheduled for ${req.meetingAt}.${req.notes ? ` Operator context: ${req.notes}.` : ""}`,
    ``,
    `The research crew established these developments (each with verified source URLs):`,
    JSON.stringify(synthesis.developments, null, 2),
    ``,
    `Background: ${synthesis.context}`,
    ``,
    `Write the briefing. Rules:`,
    `- keyDevelopments: re-craft the developments above for the meeting at hand; copy each sourceUrls array EXACTLY as given — do not add, remove, or edit any URL.`,
    `- Only developments with happenedWithinWindow=true belong in keyDevelopments.`,
    `- masthead: a short field-tag for the top of the brief (e.g. "Partnership briefing — <subject>").`,
    `- headline: the single most meeting-relevant line, one sentence.`,
    `- situation: two-to-four sentences situating the reader.`,
    `- discussionPoints: 2-6 concrete talking points for the meeting.`,
    `- openQuestions: 2-6 questions the reader should ask or resolve before walking in.`,
  ].join("\n");

  let briefing: Briefing | null = null;
  let verdict: GateVerdict | null = null;
  let uncertain: Development[] = [];

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    emit({ type: "stage", agent: AGENTS.scribe, stage: "drafting", note: attempt === 1 ? "First draft" : "Redraft after auditor rejection" });
    briefing = await askObject(BriefingSchema, attempt === 1 ? basePrompt : `${basePrompt}\n\n${rejectionReport(verdict!)}`);
    verdict = auditBriefing(briefing, rounds);
    emit({ type: "gate", attempt, verdict });
    if (verdict.pass) break;
  }

  if (verdict && briefing && !verdict.pass) {
    emit({ type: "stage", agent: AGENTS.auditor, stage: "repairing", note: "Stripping untraceable claims to the uncertain section" });
    const repaired = repairBriefing(briefing, rounds);
    briefing = repaired.briefing;
    uncertain = repaired.uncertain;
    verdict = { ...verdict, verdictLine: `REPAIRED — ${briefing.keyDevelopments.length} verified developments retained; ${uncertain.length} moved to uncertain` };
    if (briefing.keyDevelopments.length === 0) {
      emit({ type: "error", message: "No development could be source-traced — the sweep found nothing recent for this subject." });
      return;
    }
  }

  if (!briefing || !verdict) {
    emit({ type: "error", message: "The crew could not produce a brief." });
    return;
  }

  const briefingWithRepair: Briefing & { uncertain?: Development[]; gate?: GateVerdict } = {
    ...briefing,
    ...(uncertain.length ? { uncertain } : {}),
  };

  emit({
    type: "done",
    briefing: briefingWithRepair as Briefing,
    uncertain,
    gate: verdict,
    sources: [...transcriptUrls(rounds)],
  });
}

export { GATE_THRESHOLD };
