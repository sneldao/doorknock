import { getRun } from "@/lib/runs";

// GET /api/runs/<id> — the stored brief behind /?run=<id>. This is the page
// Kane CLI opens in a real browser to audit the rendered document.

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const run = getRun(id);
  if (!run) {
    return Response.json({ error: "run not found or expired" }, { status: 404 });
  }
  return Response.json({
    id: run.id,
    briefing: run.briefing,
    uncertain: run.uncertain,
    gate: run.gate,
    sources: run.sources,
  });
}
