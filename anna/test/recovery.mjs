// recovery.js — checkpoint envelope semantics.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_TASK_KEY,
  validateCheckpoint,
  readActiveTask,
  writeCheckpoint,
  clearCheckpoint,
  saveBrief,
  readLastBrief,
  listBriefs,
} from "../bundle/recovery.js";
import { fakeAnna } from "./fake-anna.js";

const REQ = { subject: "Acme Corp", meetingAt: "2026-11-20T10:00", kind: "general", notes: "" };
const ROUND = {
  query: "Acme news",
  topic: "news",
  days: 30,
  hits: [{ title: "Acme raises C", url: "https://n.example.com/a", snippet: "…" }],
};

function cp(stage, extra = {}) {
  return { v: 1, id: "run-1", stage, request: REQ, ...(stage === "drafting" ? { rounds: [ROUND] } : {}), ...extra };
}

test("a well-formed checkpoint validates", () => {
  assert.ok(validateCheckpoint(cp("sweeping")).checkpoint);
  assert.ok(validateCheckpoint(cp("drafting")).checkpoint);
});

test("bad envelopes are corrupt, never silently accepted", () => {
  assert.ok(validateCheckpoint({}).corrupt);
  assert.ok(validateCheckpoint(cp("sweeping", { v: 2 })).corrupt);
  assert.ok(validateCheckpoint(cp("drafting", { rounds: [] })).corrupt);
  assert.ok(validateCheckpoint(cp("sweeping", { stage: "lunch" })).corrupt);
  assert.ok(validateCheckpoint("garbage").corrupt);
  assert.ok(validateCheckpoint(cp("sweeping", { request: { ...REQ, kind: "hostile" } })).corrupt);
});

test("a corrupt checkpoint is reported and kept — never auto-erased", async () => {
  const anna = fakeAnna();
  anna.store.set(ACTIVE_TASK_KEY, { v: 99, nope: true });
  const res = await readActiveTask(anna);
  assert.equal(res.status, "corrupt");
  assert.deepEqual(anna.store.get(ACTIVE_TASK_KEY), { v: 99, nope: true });
});

test("write → read round-trips; clear leaves nothing", async () => {
  const anna = fakeAnna();
  await writeCheckpoint(anna, cp("drafting"));
  const res = await readActiveTask(anna);
  assert.equal(res.status, "valid");
  assert.equal(res.checkpoint.stage, "drafting");
  assert.equal(res.checkpoint.rounds.length, 1);
  await clearCheckpoint(anna);
  assert.equal((await readActiveTask(anna)).status, "none");
});

test("a drafting checkpoint carries the sealed rounds for resume", async () => {
  const anna = fakeAnna();
  await writeCheckpoint(anna, cp("drafting"));
  const { checkpoint } = await readActiveTask(anna);
  assert.equal(checkpoint.rounds[0].hits[0].url, "https://n.example.com/a");
});

test("saveBrief writes briefs/<ts> and the briefs/last pointer", async () => {
  const anna = fakeAnna();
  const record = { ts: 1700000000000, request: REQ, briefing: { headline: "h" }, uncertain: [], verdict: {}, sources: [] };
  const key = await saveBrief(anna, record);
  assert.equal(key, "briefs/1700000000000");
  const back = await readLastBrief(anna);
  assert.equal(back.briefing.headline, "h");
});

test("the library lists saved briefs newest first, excluding the pointer", async () => {
  const anna = fakeAnna();
  for (const ts of [1700000000000, 1700000500000, 1700000100000]) {
    await saveBrief(anna, { ts, request: REQ, briefing: { headline: `h-${ts}` }, uncertain: [], verdict: {}, sources: [] });
  }
  const lib = await listBriefs(anna);
  assert.deepEqual(lib.map((it) => it.ts), [1700000500000, 1700000100000, 1700000000000]);
  assert.equal(lib[0].headline, "h-1700000500000");
  assert.equal(lib[0].subject, "Acme Corp");
  assert.ok(!lib.some((it) => it.key.endsWith("last")));
});

test("an unreadable brief is skipped, the rest of the library still lists", async () => {
  const anna = fakeAnna();
  await saveBrief(anna, { ts: 1700000000000, request: REQ, briefing: { headline: "good" }, uncertain: [], verdict: {}, sources: [] });
  anna.store.set("briefs/1800000000000", "not a record");
  const lib = await listBriefs(anna);
  assert.deepEqual(lib.map((it) => it.headline), ["good"]);
});

test("listBriefs follows next_cursor across pages", async () => {
  const anna = fakeAnna();
  await saveBrief(anna, { ts: 1700000000000, request: REQ, briefing: { headline: "old" }, uncertain: [], verdict: {}, sources: [] });
  await saveBrief(anna, { ts: 1700000500000, request: REQ, briefing: { headline: "new" }, uncertain: [], verdict: {}, sources: [] });
  const realList = anna.storage.list;
  let call = 0;
  anna.storage.list = async (args) => {
    call += 1;
    if (call === 1) return { items: [{ key: "briefs/1700000000000" }], next_cursor: "p2" };
    return { items: [{ key: "briefs/1700000500000" }], next_cursor: null };
  };
  const lib = await listBriefs(anna);
  assert.deepEqual(lib.map((it) => it.headline), ["new", "old"]);
  assert.equal(call, 2);
  anna.storage.list = realList;
});

test("a failing storage.list yields an empty library, never a throw", async () => {
  const anna = fakeAnna();
  anna.storage.list = async () => { throw new Error("list unavailable"); };
  assert.deepEqual(await listBriefs(anna), []);
});

// The stale-run guard: an abandoned run id must not write checkpoints or
// emit into the live UI. This mirrors app.js's activeRunId checks.
test("late replies from an abandoned task id mutate nothing", async () => {
  const { runBriefing } = await import("../bundle/brief.js");
  const anna = fakeAnna({
    search: () => ({ results: [{ title: "t", url: "https://n.example.com/a", snippet: "s" }] }),
    llm: () => ({ content: { type: "text", text: "unparseable forever" }, stopReason: "endTurn" }),
  });
  let active = "run-B"; // run A was abandoned when B started
  let sealed = false;
  const events = [];
  const emitA = (ev) => { if (active === "run-A") events.push(ev); };
  await runBriefing(anna, REQ, emitA, {
    sweepSealed: async () => { if (active === "run-A") sealed = true; },
  }).catch(() => {});
  assert.equal(sealed, false);
  assert.equal(events.length, 0);
});
