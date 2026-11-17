import type { BriefRequest, Briefing, Development, GateVerdict, SearchRound } from "./types";

// Finished runs, kept in memory so a brief can be re-opened at a stable URL
// (?run=<id>) — which is what Kane CLI audits in a real browser. Single
// process, TTL'd, capped: plenty for a desk tool, not a database.

export interface StoredRun {
  id: string;
  request: BriefRequest;
  briefing: Briefing;
  uncertain: Development[];
  gate: GateVerdict;
  sources: string[];
  rounds: SearchRound[];
  context: string;
  today: string;
  createdAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const MAX_RUNS = 24;

const runs = new Map<string, StoredRun>();

export function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveRun(run: StoredRun): void {
  runs.set(run.id, run);
  if (runs.size > MAX_RUNS) {
    const oldest = [...runs.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) runs.delete(oldest[0]);
  }
}

export function getRun(id: string): StoredRun | null {
  const run = runs.get(id);
  if (!run) return null;
  if (Date.now() - run.createdAt > TTL_MS) {
    runs.delete(id);
    return null;
  }
  return run;
}
