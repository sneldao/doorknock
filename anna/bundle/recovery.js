// doorknock/active-task — the single checkpoint that survives a closed
// window. Pattern follows brume/anna/bundle/recovery.js (versioned
// envelope, strict validation, corrupt-is-never-auto-erased).

import { storageGet, storageSet, unwrap } from "./session.js";

export const ACTIVE_TASK_KEY = "doorknock/active-task";
export const LAST_BRIEF_KEY = "briefs/last";
export const BRIEF_PREFIX = "briefs/";

const CHECKPOINT_VERSION = 1;
const STAGES = ["sweeping", "drafting"];
const KINDS = ["sales", "partnership", "investor", "bizdev", "general"];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;

function validHit(h) {
  return isObj(h) && str(h.title, 500) && str(h.url, 1000)
    && typeof h.snippet === "string";
}

function validRound(r) {
  return isObj(r) && str(r.query, 300)
    && (r.topic === "news" || r.topic === "general")
    && Array.isArray(r.hits) && r.hits.length <= 60 && r.hits.every(validHit);
}

function validRequest(req) {
  return isObj(req)
    && str(req.subject, 120)
    && str(req.meetingAt, 120)
    && KINDS.includes(req.kind)
    && (req.notes === undefined || (typeof req.notes === "string" && req.notes.length <= 600));
}

/** Returns the checkpoint when valid, else {corrupt: reason}. */
export function validateCheckpoint(raw) {
  if (!isObj(raw)) return { corrupt: "not an object" };
  if (raw.v !== CHECKPOINT_VERSION) return { corrupt: `version ${raw.v}` };
  if (!str(raw.id, 128)) return { corrupt: "bad id" };
  if (!STAGES.includes(raw.stage)) return { corrupt: `bad stage ${raw.stage}` };
  if (!validRequest(raw.request)) return { corrupt: "bad request" };
  if (raw.stage === "drafting") {
    if (!Array.isArray(raw.rounds) || raw.rounds.length === 0 || !raw.rounds.every(validRound)) {
      return { corrupt: "bad rounds" };
    }
  } else if (raw.rounds !== undefined) {
    return { corrupt: "rounds before the sweep seals" };
  }
  return { checkpoint: raw };
}

/** {status: "none"|"valid"|"corrupt", checkpoint?} — a corrupt checkpoint is
 *  reported, never silently erased; only the user discards it. */
export async function readActiveTask(anna) {
  const raw = await storageGet(anna, ACTIVE_TASK_KEY);
  if (raw == null) return { status: "none" };
  // A poisoned value — one that throws while being inspected — is corrupt,
  // not absent: the discard affordance must still be offered.
  let v;
  try {
    v = validateCheckpoint(raw);
  } catch {
    return { status: "corrupt" };
  }
  return v.checkpoint
    ? { status: "valid", checkpoint: v.checkpoint }
    : { status: "corrupt" };
}

export async function writeCheckpoint(anna, checkpoint) {
  return storageSet(anna, ACTIVE_TASK_KEY, checkpoint);
}

export async function clearCheckpoint(anna) {
  // Overwrite with a tombstone-free empty value? A set with null value is
  // still a record; delete is not in the SDK surface, so write null and
  // treat null as "none" in readActiveTask.
  return storageSet(anna, ACTIVE_TASK_KEY, null);
}

/** Persist a finished brief under briefs/<ts> and point briefs/last at it. */
export async function saveBrief(anna, record) {
  const key = `${BRIEF_PREFIX}${record.ts}`;
  await storageSet(anna, key, record);
  await storageSet(anna, LAST_BRIEF_KEY, { key });
  return key;
}

export async function readLastBrief(anna) {
  const pointer = await storageGet(anna, LAST_BRIEF_KEY);
  const key = isObj(pointer) && str(pointer.key, 200) ? pointer.key : null;
  if (!key) return null;
  const record = await storageGet(anna, key);
  return isObj(record) ? record : null;
}
