// Smoke — form request → pipeline → gate → saved brief, against the fake
// host. Run with: node anna/test/smoke.mjs

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { runBriefing, PipelineError } from "../bundle/brief.js";
import { saveBrief, readLastBrief, writeCheckpoint, readActiveTask } from "../bundle/recovery.js";
import { fakeAnna } from "./fake-anna.js";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "..", "manifest.json"), "utf8"));

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const REQ = { subject: "Acme Corp", meetingAt: "2026-11-20T10:00", kind: "general", notes: "" };

const HIT_A = {
  title: "Acme raises Series C",
  url: "https://news.example.com/acme-series-c",
  snippet: "Acme Corp raised $40 million in a Series C led by North Peak Capital.",
};
const HIT_B = {
  title: "Acme hires new CFO",
  url: "https://news.example.com/acme-cfo",
  snippet: "Acme Corp appointed Dana Reyes as chief financial officer.",
};

const PLAN_JSON = JSON.stringify({
  queries: ["Acme news", "Acme launch partnership", "Acme funding hire"],
  identityQuery: "Acme Corp",
});

function dev(headline, summary, urls) {
  return {
    headline,
    summary,
    whyItMatters: "It changes what matters in this meeting.",
    sourceUrls: urls,
    happenedWithinWindow: true,
  };
}

function draftReply(brief) {
  return { content: { type: "text", text: JSON.stringify(brief) }, stopReason: "endTurn" };
}

const baseBrief = {
  masthead: "General briefing — Acme Corp",
  headline: "Acme lands a $40M Series C",
  situation: "Acme has changed materially in the last month across several fronts.",
  keyDevelopments: [
    dev("Acme raises $40M Series C", "Acme raised $40M in a Series C led by North Peak Capital.", [HIT_A.url]),
  ],
  discussionPoints: ["Ask about the Series C.", "Ask about the CFO hire."],
  openQuestions: ["What does the raise imply?", "Who is the new CFO?"],
};

function isPlan(prompt) {
  return prompt.includes('"queries"');
}

// ── manifest sanity ──────────────────────────────────────────────────────
ok("schema 4 bundle-only app", manifest.schema === 4 && manifest.required_executas.length === 0);
ok("user-scope storage declared", manifest.storage?.scopes?.user === "rw");
ok("static-spa bundle", manifest.ui?.bundle?.format === "static-spa" && manifest.ui?.bundle?.external_origins?.length === 0);
ok("both form factors", manifest.ui?.form_factors?.includes("desktop") && manifest.ui?.form_factors?.includes("mobile"));

// ── 1. happy path: run → gate pass → saved brief ─────────────────────────
{
  const anna = fakeAnna({
    search: (args) => ({ results: args.query.includes("CFO") || args.query.includes("hire") ? [HIT_B] : [HIT_A] }),
    llm: (req) => draftReply(isPlan(req.messages[0].content.text) ? JSON.parse(PLAN_JSON) : baseBrief),
  });

  const events = [];
  let sealed = null;
  const result = await runBriefing(anna, REQ, (ev) => events.push(ev), {
    sweepSealed: async (rounds) => { sealed = rounds; },
  });

  ok("1 identity + 3 news searches ran", anna.calls.search.length === 4);
  ok("identity search is topic general with no time_range",
    anna.calls.search[0].topic === undefined && anna.calls.search[0].time_range === undefined);
  ok("news searches use basic depth and month window",
    anna.calls.search.slice(1).every((a) => a.topic === "news" && a.time_range === "month" && a.search_depth === "basic"));
  ok("exactly two model calls on the happy path (plan + draft)", anna.calls.llm.length === 2);
  ok("the sweep sealed for checkpointing", Array.isArray(sealed) && sealed.length === 4);
  ok("gate passed", result.verdict.pass === true);
  ok("gate events emitted", events.some((e) => e.type === "gate"));

  const record = { ts: 1700000000000, request: REQ, briefing: result.briefing, uncertain: result.uncertain, verdict: result.verdict, sources: result.sources };
  await saveBrief(anna, record);
  const back = await readLastBrief(anna);
  ok("brief saved and reopens via briefs/last", back?.briefing?.headline === baseBrief.headline);
}

// ── 2. invented figure → reject → redraft still fails → repaired brief ───
{
  const invented = {
    ...baseBrief,
    keyDevelopments: [
      dev("Acme raises $40M Series C", "Acme raised $40M in a Series C led by North Peak Capital.", [HIT_A.url]),
      dev("Acme hires 500 staff", "Acme hired 500 new staff across engineering this month.", [HIT_B.url]),
    ],
  };
  const anna = fakeAnna({
    search: (args) => ({ results: args.query.includes("CFO") || args.query.includes("hire") ? [HIT_B] : [HIT_A] }),
    // the model invents "500 staff" on every draft — the auditor must not pass it
    llm: (req) => draftReply(isPlan(req.messages[0].content.text) ? JSON.parse(PLAN_JSON) : invented),
  });

  const result = await runBriefing(anna, REQ, () => {});
  ok("rejected draft triggered one redraft (3 model calls)", anna.calls.llm.length === 3);
  ok("verdict is REPAIRED", result.verdict.verdictLine.startsWith("REPAIRED"));
  ok("the traced development survived", result.briefing.keyDevelopments.length === 1);
  ok("the figure-inventing item sits under Uncertain",
    result.uncertain.length === 1 && result.uncertain[0].headline === "Acme hires 500 staff");
}

// ── 3. resume: a sealed drafting checkpoint drafts without re-searching ──
{
  const anna = fakeAnna({
    search: () => { throw new Error("search must not be called on resume"); },
    llm: (req) => draftReply(baseBrief),
  });
  const rounds = [{ query: "Acme news", topic: "news", days: 30, hits: [HIT_A] }];
  await writeCheckpoint(anna, { v: 1, id: "run-x", stage: "drafting", request: REQ, rounds });
  const { checkpoint } = await readActiveTask(anna);
  ok("drafting checkpoint reads back valid", checkpoint.stage === "drafting");
  const result = await runBriefing(anna, checkpoint.request, () => {}, { rounds: checkpoint.rounds });
  ok("resume skipped the sweep entirely", anna.calls.search.length === 0);
  ok("resume produced a passing brief", result.verdict.pass === true);
}

// ── 4. nothing traceable survives → honest error, nothing saved ──────────
{
  const allInvented = {
    ...baseBrief,
    keyDevelopments: [dev("Acme opens a moon office", "Acme reportedly opened a lunar office recently.", ["https://made-up.example.com/moon"])],
  };
  const anna = fakeAnna({
    search: () => ({ results: [HIT_A] }),
    llm: (req) => draftReply(isPlan(req.messages[0].content.text) ? JSON.parse(PLAN_JSON) : allInvented),
  });
  await assert.rejects(
    runBriefing(anna, REQ, () => {}),
    (e) => e instanceof PipelineError && e.kind === "empty_brief",
  );
  passed += 1;
  console.log(`ok ${passed} - zero surviving developments is an error, not a saved brief`);
}
// ── 5. draft failure → Retry resumes from the sealed sweep, no re-search ─
{
  let llmCalls = 0;
  const anna = fakeAnna({
    search: (args) => ({ results: args.query.includes("hire") ? [HIT_B] : [HIT_A] }),
    // provider 429/503 on the first run's draft call; clean on Retry
    llm: (req) => {
      llmCalls += 1;
      if (isPlan(req.messages[0].content.text)) return draftReply(JSON.parse(PLAN_JSON));
      if (llmCalls <= 3) { // first draft attempt + its nudge retry
        const e = new Error("provider 503"); e.code = "upstream";
        throw e;
      }
      return draftReply(baseBrief);
    },
  });

  let sealed = null;
  await assert.rejects(
    runBriefing(anna, REQ, () => {}, { sweepSealed: async (r) => { sealed = r; } }),
    (e) => e instanceof PipelineError && e.kind === "draft_failed",
  );
  passed += 1;
  console.log(`ok ${passed} - draft failure is draft_failed after the sweep sealed`);
  ok("sweep sealed before the failure (checkpoint kept)", Array.isArray(sealed) && sealed.length === 4);
  const searchesSoFar = anna.calls.search.length;

  // Retry, as btnErrorRetry does: same request, sealed rounds.
  const result = await runBriefing(anna, REQ, () => {}, { rounds: sealed });
  ok("Retry re-drafted without re-sweeping (zero additional searches)",
    anna.calls.search.length === searchesSoFar);
  ok("Retry produced and saved a brief", result.verdict.pass === true);
  await saveBrief(anna, { ts: 1700000001000, request: REQ, briefing: result.briefing, uncertain: result.uncertain, verdict: result.verdict, sources: result.sources });
  ok("brief readable via briefs/last after Retry",
    (await readLastBrief(anna))?.briefing?.headline === baseBrief.headline);
}

// ── 6. quota precheck failure → specific message, sealed sweep kept ──────
{
  const anna = fakeAnna({
    search: (args) => ({ results: args.query.includes("hire") ? [HIT_B] : [HIT_A] }),
    llm: (req) => {
      if (isPlan(req.messages[0].content.text)) return draftReply(JSON.parse(PLAN_JSON));
      const e = new Error("quota exceeded");
      e.code = "APP_QUOTA_EXCEEDED";
      e.data = { requiredCu: 4.2, remainingCu: 1.1 };
      throw e;
    },
  });
  let sealed = null;
  await assert.rejects(
    runBriefing(anna, REQ, () => {}, { sweepSealed: async (r) => { sealed = r; } }),
    (e) => e instanceof PipelineError && e.kind === "draft_failed"
      && e.message.includes("needs about 4.2 CU") && e.message.includes("you have 1.1"),
  );
  passed += 1;
  console.log(`ok ${passed} - APP_QUOTA_EXCEEDED surfaces the required/remaining numbers`);
  ok("sweep sealed before the quota failure (checkpoint kept)", Array.isArray(sealed) && sealed.length === 4);
}

// ── 7. first draft truncated → retry note says the model ran out of room ──
{
  let n = 0;
  const notes = [];
  const anna = fakeAnna({
    search: (args) => ({ results: args.query.includes("hire") ? [HIT_B] : [HIT_A] }),
    llm: (req) => {
      if (isPlan(req.messages[0].content.text)) return draftReply(JSON.parse(PLAN_JSON));
      n += 1;
      return n === 1
        ? { content: { type: "text", text: "" }, stopReason: "maxTokens" }
        : draftReply(baseBrief);
    },
  });
  const result = await runBriefing(anna, REQ, (e) => { if (e.note) notes.push(e.note); });
  ok("truncated first draft retries once and lands", result.verdict.pass === true);
  ok("the retry note names the truncation",
    notes.some((t) => t === "The model ran out of room — trying once more with a larger budget."));
  ok("first cap 8192, long retry 24000",
    anna.calls.llm[1].maxTokens === 8192 && anna.calls.llm[2].maxTokens === 24000);
  ok("thinking off on every call",
    anna.calls.llm.every((c) => c.thinking === false));
}

// ── 8. quota on the LONG retry → specific message, sealed sweep kept ─────
{
  let n = 0;
  let sealed = null;
  const anna = fakeAnna({
    search: (args) => ({ results: args.query.includes("hire") ? [HIT_B] : [HIT_A] }),
    llm: (req) => {
      if (isPlan(req.messages[0].content.text)) return draftReply(JSON.parse(PLAN_JSON));
      n += 1;
      if (n === 1) return { content: { type: "text", text: "" }, stopReason: "maxTokens" };
      const e = new Error("quota exceeded");
      e.code = "APP_QUOTA_EXCEEDED";
      e.data = { requiredCu: 9.2, remainingCu: 1.4 };
      throw e;
    },
  });
  await assert.rejects(
    runBriefing(anna, REQ, () => {}, { sweepSealed: async (r) => { sealed = r; } }),
    (e) => e instanceof PipelineError && e.kind === "draft_failed"
      && e.message === "Your Anna quota is too low for this run — it needs about 9.2 CU, you have 1.4.",
  );
  passed += 1;
  console.log(`ok ${passed} - quota on the long retry surfaces the required/remaining numbers`);
  ok("sweep sealed before the long-retry quota failure", Array.isArray(sealed) && sealed.length === 4);
}

console.log(`\nsmoke: ${passed} checks passed`);
