import { askObject } from "@/lib/llm";
import { llmEnabled } from "@/lib/llm";
import { auditBriefing, repairBriefing } from "@/lib/gate";
import { briefVerificationObjective, kaneAvailable, kaneEnabled, kaneVerify } from "@/lib/kane";
import { getRun, newRunId, saveRun, type StoredRun } from "@/lib/runs";
import { transcriptUrls } from "@/lib/tavily";
import {
  BriefingSchema,
  type Briefing,
  type KaneVerdict,
  type RunEvent,
} from "@/lib/types";

// POST /api/verify — PROOF + FIXER. Kane CLI opens the finished brief in a
// real browser and returns pass/fail. On a fail, the FIXER agent rewrites
// the brief against the transcript (every sourceUrl copied verbatim), the
// deterministic AUDITOR re-gates it, and Kane re-verifies — the Hydra loop.
// Body: { runId, repair? }

export const runtime = "nodejs";
export const maxDuration = 800;

const MAX_CONCURRENT = 2;
const MAX_REPAIRS = 1;
let inFlight = 0;

function originOf(req: Request): string {
  const override = process.env.KANE_TARGET_ORIGIN?.trim();
  if (override) return override.replace(/\/+$/, "");
  return new URL(req.url).origin;
}

async function verifyOnce(
  origin: string,
  runId: string,
  emit: (e: RunEvent) => void,
): Promise<KaneVerdict> {
  emit({
    type: "stage",
    agent: "KANE",
    stage: "watching",
    note: `real-browser audit of /?run=${runId}`,
  });
  const url = `${origin}/?run=${runId}`;
  return kaneVerify(url, briefVerificationObjective(url), {
    name: "doorknock-brief",
    onProgress: (remark) =>
      emit({ type: "stage", agent: "KANE", stage: "step", note: remark }),
  });
}

async function repairBrief(
  run: StoredRun,
  kane: KaneVerdict,
): Promise<{ briefing: Briefing; uncertain: StoredRun["uncertain"] } | null> {
  const urls = [...transcriptUrls(run.rounds)];
  try {
    const drafted = await askObject(
      BriefingSchema,
      [
        `A pre-meeting briefing for "${run.request.subject}" was audited by a real browser agent (Kane CLI) and FAILED verification.`,
        ``,
        `Kane's report:`,
        kane.summary,
        ``,
        `The current brief JSON:`,
        JSON.stringify(run.briefing, null, 2),
        ``,
        `Rewrite the brief so it passes. Hard rules:`,
        `- Every keyDevelopments[].sourceUrls entry must be copied EXACTLY from this transcript URL list — never invent or modify a URL:`,
        urls.map((u) => `  ${u}`).join("\n"),
        `- Every development must keep at least one sourceUrl.`,
        `- masthead, headline, situation, discussionPoints and openQuestions must all be populated and non-empty.`,
        `- Use no number, amount, percentage or date that is not supported by the cited sources or the meeting details.`,
        `- Name no person, company or product absent from the sources or meeting details.`,
      ].join("\n"),
      { maxRetries: 1 },
    );
    // Same deterministic pass the crew's repair stage uses: untraceable
    // developments move to the uncertain section rather than disappearing.
    return repairBriefing(drafted, run.rounds, run.context, run.today);
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: { runId?: string; repair?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const run = body.runId ? getRun(body.runId) : null;
  if (!run) {
    return Response.json({ error: "run not found or expired" }, { status: 404 });
  }
  if (!kaneEnabled() || !(await kaneAvailable())) {
    return Response.json(
      { error: "Kane verification is unavailable on this host (kane-cli missing or KANE_VERIFY=off)." },
      { status: 503 },
    );
  }
  if (inFlight >= MAX_CONCURRENT) {
    return Response.json({ error: "Kane is busy — try again in a moment." }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const origin = originOf(req);
  inFlight++;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      const emit = (e: RunEvent) => send(e.type, e);
      try {
        let currentRunId = run.id;
        let repairs = 0;
        let verdict = await verifyOnce(origin, currentRunId, emit);
        emit({ type: "kane", attempt: 1, verdict });

        while (
          verdict.status === "failed" &&
          body.repair &&
          repairs < MAX_REPAIRS &&
          llmEnabled()
        ) {
          repairs++;
          emit({
            type: "stage",
            agent: "FIXER",
            stage: "repairing",
            note: `Kane failed — rewriting the brief against the transcript (repair ${repairs}/${MAX_REPAIRS})`,
          });

          const fixed = await repairBrief(run, verdict);
          if (!fixed || fixed.briefing.keyDevelopments.length === 0) break;

          const gate = auditBriefing(fixed.briefing, run.rounds, run.context, run.today);
          emit({ type: "gate", attempt: repairs, verdict: gate });

          const repairedRunId = newRunId();
          saveRun({
            id: repairedRunId,
            request: run.request,
            briefing: fixed.briefing,
            uncertain: fixed.uncertain,
            gate,
            sources: run.sources,
            rounds: run.rounds,
            context: run.context,
            today: run.today,
            createdAt: Date.now(),
          });
          currentRunId = repairedRunId;

          verdict = await verifyOnce(origin, currentRunId, emit);
          emit({ type: "kane", attempt: repairs + 1, verdict });
        }

        send("verifyDone", {
          type: "verifyDone",
          runId: currentRunId,
          verdict,
          repairs,
        });
      } catch (err) {
        send("error", {
          type: "error",
          message:
            err instanceof Error ? err.message : "Verification hit an unexpected failure.",
        });
      } finally {
        inFlight--;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
