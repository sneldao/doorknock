import { runBriefing } from "@/lib/crew";
import { llmEnabled } from "@/lib/llm";
import { tavilyEnabled } from "@/lib/tavily";

// POST /api/brief — start a briefing run, stream the crew's events as SSE,
// finish with `done` (or `error`).

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CONCURRENT = 3;
let inFlight = 0;

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!llmEnabled()) {
    return Response.json(
      { error: "No model endpoint configured — set BIFROST_BASE_URL (or LLM_BASE_URL for a bare run)." },
      { status: 503 },
    );
  }
  if (!tavilyEnabled()) {
    return Response.json({ error: "TAVILY_API_KEY is not set." }, { status: 503 });
  }
  if (inFlight >= MAX_CONCURRENT) {
    return Response.json({ error: "Too many runs in flight — try again in a moment." }, { status: 429 });
  }

  const encoder = new TextEncoder();
  inFlight++;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      const emit = (e: unknown) => {
        const typed = e as { type: string };
        send(typed.type, typed);
      };
      try {
        await runBriefing(body, emit);
      } catch (err) {
        send("error", {
          type: "error",
          message: err instanceof Error ? err.message : "The crew hit an unexpected failure.",
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
