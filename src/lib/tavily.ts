import type { SearchRound, WebHit } from "./types";

// Tavily — the 30-day research sweep. Server-side only.
// Bearer auth (api_key-in-body is rejected on current keys).

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export function tavilyEnabled(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

interface TavilyResponse {
  results?: {
    title?: string;
    url?: string;
    content?: string;
    published_date?: string;
  }[];
}

export async function tavilySearch(
  query: string,
  opts: { topic: "news" | "general"; days: number | null; max: number },
): Promise<WebHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");

  const body: Record<string, unknown> = {
    query,
    topic: opts.topic,
    max_results: opts.max,
    search_depth: "advanced",
  };
  if (opts.topic === "news" && opts.days) body.days = opts.days;

  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`tavily search ${res.status}`);
  const json = (await res.json()) as TavilyResponse;

  return (json.results ?? [])
    .filter((r) => r.title && r.url)
    .map((r) => ({
      title: r.title!,
      url: r.url!,
      snippet: (r.content ?? "").slice(0, 500),
      published: r.published_date,
      days: opts.days,
    }));
}

/** Run all scout queries, dedupe hits by URL, and return the rounds.
 *  Failures are per-round: one dead query must not kill the sweep. */
export async function runSearchRounds(
  queries: { query: string; topic: "news" | "general"; days: number | null }[],
  onRound: (round: SearchRound) => void,
): Promise<SearchRound[]> {
  const rounds: SearchRound[] = [];
  for (const q of queries) {
    let hits: WebHit[] = [];
    try {
      hits = await tavilySearch(q.query, {
        topic: q.topic,
        days: q.days,
        max: q.topic === "news" ? 6 : 4,
      });
    } catch {
      hits = [];
    }
    const round: SearchRound = { ...q, hits };
    rounds.push(round);
    onRound(round);
  }
  return rounds;
}

/** Flatten rounds into a deduped transcript — the gate's source of truth. */
export function transcriptUrls(rounds: SearchRound[]): Set<string> {
  return new Set(rounds.flatMap((r) => r.hits.map((h) => h.url)));
}

export function dedupedHits(rounds: SearchRound[]): WebHit[] {
  const seen = new Set<string>();
  const out: WebHit[] = [];
  for (const h of rounds.flatMap((r) => r.hits)) {
    if (!seen.has(h.url)) {
      seen.add(h.url);
      out.push(h);
    }
  }
  return out;
}
