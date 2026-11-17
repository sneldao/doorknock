import { EXCERPT_CHARS } from "./tavily";
import type { GroundingVerdict, WebHit } from "./types";
import type { JSONValue } from "ai";

// Bifrost grounding-gate wiring (PS-04 — see bifrost/plugins/grounding/).
// The Scout's transcript rides inside the Scribe's chat request as a
// top-level `grounding` field — the plugin seals it, strips it, and audits
// the reply against it. Transport hooks only run on inference routes, so
// there is no separate ingest endpoint: the evidence is bound to the very
// call it gates. A gateway without the plugin drops the field silently;
// the LLM_BASE_URL dev path never sends it.

/** True when model calls route through the Bifrost gateway. */
export function onGateway(): boolean {
  return Boolean(process.env.BIFROST_BASE_URL?.trim());
}

export function newGroundingRef(): string {
  return `doorknock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The sealed transcript, shaped for the plugin's embedded `grounding`
 *  field. Sent via providerOptions so it lands at the request body's top
 *  level, where the plugin's transport pre-hook collects it. */
export function buildGroundingPayload(
  ref: string,
  hits: WebHit[],
  context: string,
): JSONValue {
  return {
    ref,
    context,
    // The "30" of the 30-day window itself is always allowed — same rule
    // as the app gate (src/lib/gate.ts allowedFigures).
    allowed_figures: ["30"],
    ttl_seconds: 600,
    urls: hits.map((h) => ({
      url: h.url,
      title: h.title,
      excerpt: h.snippet.slice(0, EXCERPT_CHARS),
      published: h.published ?? "",
    })),
  };
}

export function groundingHeaders(ref: string | null): Record<string, string> | undefined {
  return ref ? { "x-grounding-ref": ref } : undefined;
}

/** Pull the plugin verdict out of response headers, whichever casing the
 *  transport used. */
export function readGroundingVerdict(
  headers: Record<string, string> | undefined,
): GroundingVerdict | null {
  if (!headers) return null;
  const find = (name: string) =>
    Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1];
  const label = find("x-bifrost-grounding");
  const report = find("x-bifrost-grounding-report");
  if (!label && !report) return null;
  if (report) {
    try {
      const v = JSON.parse(report) as GroundingVerdict & { cited_urls?: string[] };
      return {
        pass: Boolean(v.pass),
        verdict: v.verdict ?? label ?? "UNKNOWN",
        reason: v.reason,
        citedUrls: v.cited_urls?.length,
      };
    } catch {
      // fall through to the bare label
    }
  }
  return { pass: label === "PASS", verdict: label ?? "UNKNOWN" };
}
