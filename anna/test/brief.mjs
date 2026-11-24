// brief.js — parsers and the query-plan fallback.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseBriefing,
  parseQueryPlan,
  planQueries,
  fallbackPlan,
  runBriefing,
  PipelineError,
  DraftError,
} from "../bundle/brief.js";
import { fakeAnna } from "./fake-anna.js";

const REQ = { subject: "Acme Corp", meetingAt: "2026-11-20T10:00", kind: "investor", notes: "" };

const goodBrief = {
  masthead: "Investor briefing — Acme Corp",
  headline: "Acme heads into the meeting freshly funded",
  situation: "Acme has changed materially in the last month across several fronts.",
  keyDevelopments: [
    {
      headline: "Acme raises Series C",
      summary: "Acme raised a fresh round led by North Peak Capital, per the announcement.",
      whyItMatters: "Fresh capital changes what Acme can commit to.",
      sourceUrls: ["https://news.example.com/acme-series-c"],
      happenedWithinWindow: true,
    },
  ],
  discussionPoints: ["Ask about the Series C.", "Ask about the CFO hire."],
  openQuestions: ["What does the raise imply?", "Who is the new CFO?"],
};

const goodBriefJson = JSON.stringify(goodBrief);

test("parser accepts a ```json fenced draft", () => {
  const b = parseBriefing(`Sure — here it is:\n\`\`\`json\n${goodBriefJson}\n\`\`\``);
  assert.equal(b.headline, goodBrief.headline);
  assert.equal(b.keyDevelopments.length, 1);
});

test("parser accepts a bare JSON object", () => {
  const b = parseBriefing(goodBriefJson);
  assert.equal(b.masthead, goodBrief.masthead);
});

test("parser rejects prose with no object", () => {
  assert.throws(() => parseBriefing("Here is your briefing, no JSON."), DraftError);
});

test("parser rejects under-min fields but clamps over-cap arrays", () => {
  const bad = { ...goodBrief, headline: "short" };
  assert.throws(() => parseBriefing(JSON.stringify(bad)), /bad headline/);
  const tooMany = {
    ...goodBrief,
    keyDevelopments: Array.from({ length: 7 }, () => goodBrief.keyDevelopments[0]),
  };
  // over-run no longer hard-fails the run (web clamp 7ccf0ef): sliced to 6
  const clamped = parseBriefing(JSON.stringify(tooMany));
  assert.equal(clamped.keyDevelopments.length, 6);
  // over-long strings truncate to cap instead of failing
  const long = parseBriefing(JSON.stringify({ ...goodBrief, headline: "x".repeat(500) }));
  assert.equal(long.headline.length, 160);
});

test("parser rejects missing fields and bad types", () => {
  assert.throws(() => parseBriefing(JSON.stringify({ masthead: "x" })), DraftError);
  const noUrls = {
    ...goodBrief,
    keyDevelopments: [{ ...goodBrief.keyDevelopments[0], sourceUrls: [] }],
  };
  // sourceless developments are dropped, not shipped: sole dev dropped, nothing salvageable
  assert.throws(() => parseBriefing(JSON.stringify(noUrls)), /keyDevelopments/);
  // mixed: the sourced development survives, the sourceless one is dropped
  const mixed = {
    ...goodBrief,
    keyDevelopments: [goodBrief.keyDevelopments[0], { ...goodBrief.keyDevelopments[0], sourceUrls: [] }],
  };
  assert.equal(parseBriefing(JSON.stringify(mixed)).keyDevelopments.length, 1);
});

test("query plan parses fenced JSON", () => {
  const p = parseQueryPlan('```json\n{"queries":["Acme news","Acme launch","Acme funding"],"identityQuery":"Acme Corp"}\n```');
  assert.equal(p.queries.length, 3);
  assert.equal(p.identityQuery, "Acme Corp");
});

test("query plan falls back on any failure — never blocks the run", async () => {
  const anna = fakeAnna({ llm: () => Promise.reject(new Error("quota_exceeded")) });
  const plan = await planQueries(anna, REQ, () => {});
  assert.deepEqual(plan, fallbackPlan(REQ.subject));
  assert.equal(plan.queries.length, 3);
});

test("a malformed plan reply also falls back", async () => {
  const anna = fakeAnna({
    llm: () => ({ content: { type: "text", text: "I cannot help with that." }, stopReason: "endTurn" }),
  });
  const plan = await planQueries(anna, REQ, () => {});
  assert.deepEqual(plan, fallbackPlan(REQ.subject));
});

const HIT = {
  title: "Acme raises Series C",
  url: "https://news.example.com/acme-series-c",
  snippet: "Acme Corp raised $40 million in a Series C led by North Peak Capital.",
};

function searchOk() {
  return { results: [HIT] };
}

function llmReply(text, stopReason = "endTurn") {
  return { content: { type: "text", text }, stopReason };
}

test("stopReason maxTokens -> one long retry per attempt, then honest error", async () => {
  const anna = fakeAnna({
    search: searchOk,
    llm: (req) => {
      const prompt = req.messages[0].content.text;
      if (prompt.includes('"queries"')) {
        return llmReply('{"queries":["Acme news","Acme launch","Acme funding"],"identityQuery":"Acme Corp"}');
      }
      return llmReply(goodBriefJson.slice(0, 40), "maxTokens"); // truncated every time
    },
  });
  await assert.rejects(
    runBriefing(anna, REQ, () => {}),
    (e) => e instanceof PipelineError && e.kind === "draft_failed",
  );
  // plan + 8192 + long + long-redraft (worst case 4 calls) — no fifth
  assert.equal(anna.calls.llm.length, 4);
  assert.equal(anna.calls.llm[1].maxTokens, 8192);
  assert.ok(anna.calls.llm.slice(2).every((c) => c.maxTokens === 24000));
});

test("zero hits across the sweep is an honest error, nothing drafted", async () => {
  const anna = fakeAnna({
    search: () => ({ results: [] }),
    llm: () => llmReply("{}"),
  });
  await assert.rejects(
    runBriefing(anna, REQ, () => {}),
    (e) => e instanceof PipelineError && e.kind === "no_hits",
  );
  assert.equal(anna.calls.llm.length, 1); // only the query plan, no drafts
});
