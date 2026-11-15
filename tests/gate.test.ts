import { describe, expect, test } from "bun:test";
import { auditBriefing, rejectionReport, repairBriefing, GATE_THRESHOLD } from "@/lib/gate";
import type { Briefing, Development, SearchRound } from "@/lib/types";

const rounds: SearchRound[] = [
  {
    query: "Acme Corp news",
    topic: "news",
    days: 30,
    hits: [
      { title: "Acme raises Series C", url: "https://news.example.com/acme-series-c", snippet: "…", days: 30 },
      { title: "Acme hires new CFO", url: "https://news.example.com/acme-cfo", snippet: "…", days: 30 },
    ],
  },
];

function dev(headline: string, urls: string[], withinWindow = true): Development {
  return {
    headline,
    summary: `Summary for ${headline}. Sufficiently long to pass the schema.`,
    whyItMatters: `It matters for the meeting.`,
    sourceUrls: urls,
    happenedWithinWindow: withinWindow,
  };
}

function brief(devs: Development[]): Briefing {
  return {
    masthead: "General briefing — Acme Corp",
    headline: "Acme is moving fast",
    situation: "Acme has changed materially in the last month across several fronts.",
    keyDevelopments: devs,
    discussionPoints: ["Ask about the Series C.", "Ask about the CFO hire."],
    openQuestions: ["What does the raise imply?", "Who is the new CFO?"],
  };
}

describe("the auditor gate", () => {
  test("passes a fully transcript-traced brief", () => {
    const v = auditBriefing(
      brief([dev("Acme raises Series C", ["https://news.example.com/acme-series-c"])]),
      rounds,
    );
    expect(v.pass).toBe(true);
    expect(v.score).toBe(1);
  });

  test("rejects a claim citing a fabricated URL", () => {
    const v = auditBriefing(
      brief([dev("Acme raises Series C", ["https://news.example.com/acme-series-c"]),
             dev("Acme opens a moon office", ["https://made-up.example.com/moon"])]),
      rounds,
    );
    expect(v.pass).toBe(false);
    expect(v.findings.some((f) => f.kind === "unknown_source")).toBe(true);
    expect(v.verdictLine).toContain("REJECT");
  });

  test("rejects an unsourced claim", () => {
    const v = auditBriefing(brief([dev("Acme raises Series C", [] as string[])]), rounds);
    expect(v.pass).toBe(false);
    expect(v.findings[0].kind).toBe("unsourced");
  });

  test("flags pre-window developments but does not fail them", () => {
    const v = auditBriefing(
      brief([dev("Acme raises Series C", ["https://news.example.com/acme-series-c"], false)]),
      rounds,
    );
    expect(v.pass).toBe(true);
    expect(v.findings[0].kind).toBe("outside_window");
  });

  test("normalizes URLs — trailing slash and hash don't break tracing", () => {
    const v = auditBriefing(
      brief([dev("Acme raises Series C", ["https://news.example.com/acme-series-c/#section"])]),
      rounds,
    );
    expect(v.pass).toBe(true);
  });

  test("fails on score below threshold", () => {
    const devs = [
      dev("Acme raises Series C", ["https://news.example.com/acme-series-c"]),
      ...Array.from({ length: 4 }, (_, i) => dev(`Fake ${i}`, [`https://fake.example.com/${i}`])),
    ];
    const v = auditBriefing(brief(devs), rounds);
    expect(v.score).toBeLessThan(GATE_THRESHOLD);
    expect(v.pass).toBe(false);
  });

  test("rejection report names the offending developments", () => {
    const v = auditBriefing(brief([dev("Acme opens a moon office", ["https://made-up.example.com/moon"])]), rounds);
    const report = rejectionReport(v);
    expect(report).toContain("moon office");
    expect(report).toContain("AUDITOR REJECTION REPORT");
  });

  test("repair keeps traced developments and moves untraceable ones to uncertain", () => {
    const b = brief([
      dev("Acme raises Series C", ["https://news.example.com/acme-series-c"]),
      dev("Acme opens a moon office", ["https://made-up.example.com/moon"]),
    ]);
    const { briefing: repaired, uncertain } = repairBriefing(b, rounds);
    expect(repaired.keyDevelopments).toHaveLength(1);
    expect(uncertain).toHaveLength(1);
    expect(uncertain[0].headline).toContain("moon office");
  });
});
