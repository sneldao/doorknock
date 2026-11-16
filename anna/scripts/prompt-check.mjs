// Real-model check of the Doorknock bundle pipeline without spending Anna
// quota. Runs bundle/brief.js runBriefing() unchanged against a stand-in
// host: Tavily for anna.web.search (the provider Anna routes to first) and
// Gemini 3 Flash for anna.llm.complete (the model Anna serves by default;
// apps cannot pin the user's model, so this is one data point, not a
// guarantee).
//
//   node scripts/prompt-check.mjs [--provider=gemini|reflection] [--from=0] [--n=5] [--headroom=1]
//                                [--env=a.env,b.env] [--json=out.json] [--record=dir]
//
// Keys: TAVILY_API_KEY and GEMINI_API_KEY / REFLECTION_API_KEY from the environment, ../.env.local,
// ./.env.local, or any --env file. Costs ~4 basic searches and <=3 model calls
// per subject on your own keys.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runBriefing, PipelineError } from "../bundle/brief.js";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  }),
);

const env = { ...process.env };
for (const f of [join(here, "../../.env.local"), join(here, "../.env.local"), ...(args.env ?? "").split(",")].filter(Boolean)) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
// --provider=gemini (default; the model Anna serves by default) or
// --provider=reflection (Beam, a reasoning model whose hidden thinking
// counts against max_tokens — the stress case for small caps).
const PROVIDERS = {
  gemini: {
    key: env.GEMINI_API_KEY,
    base: env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
    model: env.GEMINI_MODEL || "gemini-3-flash-preview",
    extra: { reasoning_effort: env.LLM_REASONING_EFFORT || "minimal" },
  },
  reflection: {
    key: env.REFLECTION_API_KEY,
    base: env.REFLECTION_BASE_URL || "https://api.reflection.ai/openai/v1",
    model: env.LOOP_REFLECTION_MODEL || "Beam-1.0-501B-A23B",
    extra: {},
  },
};
const provider = PROVIDERS[args.provider ?? "gemini"];
if (!env.TAVILY_API_KEY || !provider?.key) {
  console.error("Need TAVILY_API_KEY and the chosen provider's key (env, .env.local, or --env=<file>).");
  process.exit(2);
}

const MODEL = provider.model;
const BASE = provider.base;
const TEMPERATURE = Number(env.LLM_TEMPERATURE ?? 0.7); // Anna's llm.complete default
// --headroom=N multiplies the app's maxTokens, to separate "the cap is too
// small for a thinking model" from "the prompt is wrong".
const HEADROOM = Number(args.headroom ?? 1);

// Fixed list, in order. Companies only: the listing leads with companies.
const SUBJECTS = [
  ["Stripe", "partnership"],
  ["Anthropic", "sales"],
  ["Nvidia", "investor"],
  ["Shopify", "bizdev"],
  ["Monzo", "general"],
  ["Mistral AI", "partnership"],
  ["Duolingo", "sales"],
  ["Wise", "bizdev"],
  ["Canva", "general"],
  ["Revolut", "investor"],
];
const FROM = Number(args.from ?? 0);
const N = Math.min(SUBJECTS.length - FROM, Number(args.n ?? 5));

function host(stats) {
  return {
    web: {
      search: async ({ query, topic, time_range, max_results }) => {
        const body = { query, max_results, search_depth: "basic", topic: topic === "news" ? "news" : "general" };
        if (topic === "news" && time_range === "month") body.days = 30;
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TAVILY_API_KEY}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`tavily ${res.status}`);
        const json = await res.json();
        stats.searches++;
        const out = {
          results: (json.results ?? []).map((r) => ({
            title: r.title, url: r.url, snippet: r.content ?? "", published_at: r.published_date,
          })),
        };
        stats.tape.searches.push({ args: { query, topic, time_range, max_results }, result: out });
        return out;
      },
    },
    llm: {
      complete: async ({ messages, maxTokens }) => {
        const res = await fetch(`${BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
          body: JSON.stringify({
            model: MODEL, max_tokens: Math.round(maxTokens * HEADROOM), temperature: TEMPERATURE, ...provider.extra,
            messages: messages.map((m) => ({ role: m.role, content: m.content.text })),
          }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) throw new Error(`llm ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const json = await res.json();
        const choice = json.choices?.[0] ?? {};
        stats.llmCalls++;
        stats.outTokens += json.usage?.completion_tokens ?? 0;
        if (choice.finish_reason === "length") stats.truncated++;
        const out = {
          content: { type: "text", text: choice.message?.content ?? "" },
          stopReason: choice.finish_reason === "length" ? "maxTokens" : "endTurn",
        };
        stats.tape.replies.push(out);
        return out;
      },
    },
  };
}

const rows = [];
console.log(`model ${MODEL} · temperature ${TEMPERATURE} · maxTokens ×${HEADROOM} · ${N} subjects from #${FROM}\n`);

for (const [subject, kind] of SUBJECTS.slice(FROM, FROM + N)) {
  const stats = { searches: 0, llmCalls: 0, outTokens: 0, truncated: 0, tape: { searches: [], replies: [] } };
  const row = {
    subject, kind, planFallback: false, hits: 0, unusableDrafts: 0, gate: [],
    outcome: "", developments: 0, uncertain: 0, figureFindings: 0, error: null, notes: [], firstFindings: [], ...stats,
  };
  const emit = (e) => {
    if (e.type === "stage" && /template queries/.test(e.note ?? "")) { row.planFallback = true; row.notes.push(e.note); }
    if (e.type === "stage" && /^(Draft unusable|Model call failed)/.test(e.note ?? "")) { row.unusableDrafts++; row.notes.push(e.note); }
    if (e.type === "search") row.hits += e.hits;
    if (e.type === "gate") {
      row.gate.push(e.verdict.pass ? "PASS" : "REJECT");
      if (row.gate.length === 1) { // the first draft that reached the gate
        row.firstFindings = e.verdict.findings.map((f) => `${f.kind}${f.field ? `/${f.field}` : ""}: ${f.detail}`);
        row.figureFindings = e.verdict.findings.filter((f) => f.kind === "unsupported_figure").length;
        row.nameFindings = e.verdict.findings.filter((f) => f.kind === "unsupported_name").length;
      }
    }
  };
  const t0 = Date.now();
  try {
    const meetingAt = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
    const out = await runBriefing(host(stats), { subject, kind, meetingAt, notes: "" }, emit);
    row.outcome = out.verdict.pass ? (row.gate.length > 1 ? "pass-after-redraft" : "pass-first") : "repaired";
    row.developments = out.briefing.keyDevelopments.length;
    row.uncertain = out.uncertain.length;
    row.briefing = out.briefing;
    row.request = { subject, kind, meetingAt, notes: "" };
    row.uncertainItems = out.uncertain;
  } catch (e) {
    row.outcome = e instanceof PipelineError ? e.kind : "crash";
    row.error = e.message;
  }
  const { tape, ...counts } = stats;
  Object.assign(row, counts, { seconds: Math.round((Date.now() - t0) / 1000) });
  // --record=<dir>: the real searches and raw model replies of this run, in
  // call order, so a local host can replay it (listing captures, QA).
  if (args.record && row.request) {
    mkdirSync(args.record, { recursive: true });
    writeFileSync(
      join(args.record, `${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`),
      JSON.stringify({ model: MODEL, recordedAt: new Date().toISOString(), outcome: row.outcome, request: row.request, ...tape }, null, 2),
    );
  }
  rows.push(row);
  console.log(
    `${subject.padEnd(11)} ${row.outcome.padEnd(18)} gate=[${row.gate.join(",")}] devs=${row.developments} uncertain=${row.uncertain} ` +
    `figureFindings@1=${row.figureFindings} nameFindings@1=${row.nameFindings ?? 0} hits=${row.hits} planFallback=${row.planFallback} unusableDrafts=${row.unusableDrafts} ` +
    `llm=${row.llmCalls} truncated=${row.truncated} out=${row.outTokens}tok ${row.seconds}s${row.error ? ` — ${row.error}` : ""}`,
  );
}

const count = (f) => rows.filter(f).length;
console.log(
  `\nsaved a brief: ${count((r) => ["pass-first", "pass-after-redraft", "repaired"].includes(r.outcome))}/${rows.length}` +
  ` · pass-first ${count((r) => r.outcome === "pass-first")}` +
  ` · pass-after-redraft ${count((r) => r.outcome === "pass-after-redraft")}` +
  ` · repaired ${count((r) => r.outcome === "repaired")}` +
  ` · no brief ${count((r) => !["pass-first", "pass-after-redraft", "repaired"].includes(r.outcome))}` +
  ` · plan fallbacks ${count((r) => r.planFallback)}` +
  ` · truncated calls ${rows.reduce((n, r) => n + r.truncated, 0)}`,
);
if (args.json) writeFileSync(args.json, JSON.stringify(rows, null, 2));
