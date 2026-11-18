import { z } from "zod";

// ── Input ──────────────────────────────────────────────────────────────────

export const MeetingKind = z.enum([
  "sales",
  "partnership",
  "investor",
  "bizdev",
  "general",
]);
export type MeetingKind = z.infer<typeof MeetingKind>;

export const BriefRequestSchema = z.object({
  subject: z.string().trim().min(2).max(120),
  meetingAt: z.string().trim().min(4), // ISO-ish, sent as-is to the model
  kind: MeetingKind.default("general"),
  notes: z.string().trim().max(600).optional().default(""),
});
export type BriefRequest = z.infer<typeof BriefRequestSchema>;

// ── Tavily layer ───────────────────────────────────────────────────────────

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
  published?: string; // raw published_date from Tavily, best-effort
  days: number | null; // recency window used for this query (null = evergreen)
}

export interface SearchRound {
  query: string;
  topic: "news" | "general";
  days: number | null;
  hits: WebHit[];
}

// ── Crew steps (LLM, schema'd) ─────────────────────────────────────────────

export const QueryPlanSchema = z.object({
  queries: z
    .array(z.string().trim().min(6).max(140))
    .min(3)
    .max(6),
  identityQuery: z.string().trim().min(6).max(140),
});
export type QueryPlan = z.infer<typeof QueryPlanSchema>;

export const DevelopmentSchema = z.object({
  headline: z.string().trim().min(8).max(200),
  summary: z.string().trim().min(20).max(900),
  whyItMatters: z.string().trim().min(10).max(400),
  sourceUrls: z.array(z.string().trim().min(8).max(400)).min(1).max(6),
  happenedWithinWindow: z.boolean(),
});
export type Development = z.infer<typeof DevelopmentSchema>;

export const SynthesisSchema = z.object({
  developments: z.array(DevelopmentSchema).min(1).max(8),
  context: z
    .string()
    .trim()
    .min(20)
    .max(700)
    .describe("Steady-state background on the subject, no claims of recent change"),
});
export type Synthesis = z.infer<typeof SynthesisSchema>;

export const BriefingSchema = z.object({
  masthead: z.string().trim().min(6).max(140),
  headline: z.string().trim().min(8).max(160),
  situation: z.string().trim().min(30).max(900),
  keyDevelopments: z.array(DevelopmentSchema).min(1).transform((a) => a.slice(0, 6)),
  discussionPoints: z.array(z.string().trim().min(10).max(280)).min(2).transform((a) => a.slice(0, 6)),
  openQuestions: z.array(z.string().trim().min(10).max(280)).min(2).transform((a) => a.slice(0, 6)),
});
export type Briefing = z.infer<typeof BriefingSchema>;

// ── Gate (deterministic) ────────────────────────────────────────────────────

export interface GateFinding {
  kind:
    | "unsourced"
    | "unknown_source"
    | "outside_window"
    | "no_developments"
    | "unsupported_figure"
    | "unsupported_name"
    | "misattributed_name"
    | "stale_source";
  /** Briefing field the finding applies to (set for per-field findings). */
  field?: string;
  detail: string;
  urls: string[];
}

export interface GateVerdict {
  pass: boolean;
  score: number; // sourced developments / total developments
  findings: GateFinding[];
  verdictLine: string;
}

// ── Gateway gate (Bifrost plugin, PS-04) ──────────────────────────────────

export interface GroundingVerdict {
  pass: boolean;
  verdict: string; // PASS | REJECT | NO_EVIDENCE | SKIP
  reason?: string;
  citedUrls?: number;
}

// ── Kane CLI verification ─────────────────────────────────────────────────

export interface KaneVerdict {
  status: "passed" | "failed" | "error";
  summary: string;
  oneLiner?: string;
  durationSec: number;
  credits?: number;
  testUrl?: string;
  sessionDir?: string;
  reason?: string;
  /** Result of judging the run's sealed evidence pack against
   *  kane/policy.yaml — Kane certifying its own evidence, not just
   *  pass/fail. Absent when no pack sealed or judging failed. */
  policy?: {
    id: string;
    result: "pass" | "fail" | "errored";
    failedGates: string[];
    warnings: string[];
  };
}

// ── Live run events (SSE) ─────────────────────────────────────────────────

export type RunEvent =
  | { type: "stage"; agent: string; stage: string; note?: string }
  | { type: "search"; query: string; topic: "news" | "general"; days: number | null; hits: number }
  | { type: "sources"; urls: string[] }
  | { type: "gate"; attempt: number; verdict: GateVerdict }
  | { type: "gatewayGate"; attempt: number; verdict: GroundingVerdict }
  | {
      type: "done";
      runId?: string;
      /** Server wants the client to auto-start Kane verification. */
      autoVerify?: boolean;
      briefing: Briefing;
      uncertain: Development[];
      gate: GateVerdict;
      sources: string[];
    }
  | { type: "kane"; attempt: number; verdict: KaneVerdict }
  | { type: "verifyDone"; runId: string; verdict: KaneVerdict; repairs: number }
  | { type: "error"; message: string };
