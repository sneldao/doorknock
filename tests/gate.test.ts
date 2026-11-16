import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  auditBriefing,
  figures,
  names,
  rejectionReport,
  repairBriefing,
} from "@/lib/gate";
import type { Briefing, GateFinding, SearchRound } from "@/lib/types";

interface GateCase {
  name: string;
  briefing: Briefing;
  rounds: SearchRound[];
  context?: string;
  today?: string;
  expect: {
    pass: boolean;
    score: number;
    kinds: string[];
    repaired?: { kept: number; uncertain: number; discussionPoints?: number };
  };
}

// Shared contract with anna/bundle/gate.js — anna/test/gate.mjs runs the
// same cases under node:test.
const cases = JSON.parse(
  readFileSync(new URL("./gate-cases.json", import.meta.url), "utf8"),
) as GateCase[];

describe("the auditor gate (shared fixture)", () => {
  for (const c of cases) {
    test(c.name, () => {
      const v = auditBriefing(c.briefing, c.rounds, c.context, c.today);
      expect(v.pass).toBe(c.expect.pass);
      expect(v.score).toBeCloseTo(c.expect.score, 5);
      expect(v.findings.map((f: GateFinding) => f.kind).sort()).toEqual(
        [...c.expect.kinds].sort(),
      );
      if (c.expect.repaired) {
        const { briefing: repaired, uncertain } = repairBriefing(
          c.briefing,
          c.rounds,
          c.context,
          c.today,
        );
        expect(repaired.keyDevelopments).toHaveLength(c.expect.repaired.kept);
        expect(uncertain).toHaveLength(c.expect.repaired.uncertain);
        if (c.expect.repaired.discussionPoints !== undefined) {
          expect(repaired.discussionPoints).toHaveLength(
            c.expect.repaired.discussionPoints,
          );
        }
      }
    });
  }
});

describe("the auditor gate (detail assertions)", () => {
  const rounds: SearchRound[] = [
    {
      query: "Acme Corp news",
      topic: "news",
      days: 30,
      hits: [
        {
          title: "Acme raises Series C",
          url: "https://news.example.com/acme-series-c",
          snippet:
            "Acme Corp raised $40 million in a Series C led by North Peak Capital, the company announced Tuesday.",
          published: "2026-11-10",
          days: 30,
        },
      ],
    },
  ];

  function dev(headline: string, urls: string[]) {
    return {
      headline,
      summary: `Summary for ${headline}. Sufficiently long to pass the schema.`,
      whyItMatters: "It matters for the meeting.",
      sourceUrls: urls,
      happenedWithinWindow: true,
    };
  }

  function brief(devs: ReturnType<typeof dev>[]): Briefing {
    return {
      masthead: "General briefing — Acme Corp",
      headline: "Acme is moving fast",
      situation:
        "Acme has changed materially in the last month across several fronts.",
      keyDevelopments: devs,
      discussionPoints: ["Ask about the Series C.", "Ask about the CFO hire."],
      openQuestions: ["What does the raise imply?", "Who is the new CFO?"],
    };
  }

  test("rejections say REJECT and name the failing count", () => {
    const v = auditBriefing(
      brief([
        dev("Acme raises Series C", ["https://news.example.com/acme-series-c"]),
        dev("Acme opens a moon office", ["https://made-up.example.com/moon"]),
      ]),
      rounds,
    );
    expect(v.verdictLine).toContain("REJECT");
    expect(v.verdictLine).toContain("1 of 2");
  });

  test("rejection report names the offending developments and the figure rule", () => {
    const b = brief([
      dev("Acme opens a moon office", ["https://made-up.example.com/moon"]),
    ]);
    b.situation = "Adoption is up 55% internally across all teams.";
    const v = auditBriefing(b, rounds);
    const report = rejectionReport(v);
    expect(report).toContain("moon office");
    expect(report).toContain("55%");
    expect(report).toContain("AUDITOR REJECTION REPORT");
    expect(report).toContain("not present in the transcript excerpts");
  });

  test("repair drops the offending sentence but keeps the rest of the situation", () => {
    const b = brief([
      dev("Acme raises Series C", ["https://news.example.com/acme-series-c"]),
    ]);
    b.situation =
      "Acme has changed materially in the last month. Adoption is up 55% internally.";
    const { briefing: repaired } = repairBriefing(b, rounds);
    expect(repaired.situation).toContain("changed materially");
    expect(repaired.situation).not.toContain("55%");
  });

  test("repair falls back when every headline sentence carries a bad figure", () => {
    const b = brief([
      dev("Acme raises Series C", ["https://news.example.com/acme-series-c"]),
    ]);
    b.headline = "Acme stock jumped 88% overnight";
    b.situation = "Shares are up 77% on the week.";
    const { briefing: repaired } = repairBriefing(b, rounds);
    expect(repaired.headline).toBe("Acme raises Series C");
    expect(repaired.situation).toBe("See the developments below.");
  });
});

describe("figures()", () => {
  test("canonicalises currency spellings", () => {
    expect(figures("$40M")).toEqual(["40m"]);
    expect(figures("40 million")).toEqual(["40m"]);
    expect(figures("US$40m")).toEqual(["40m"]);
    expect(figures("€1.5 billion")).toEqual(["1.5b"]);
    expect(figures("£200k")).toEqual(["200k"]);
    expect(figures("2 thousand")).toEqual(["2k"]);
    expect(figures("3 trillion")).toEqual(["3t"]);
    expect(figures("50mn")).toEqual(["50m"]);
    expect(figures("7bn")).toEqual(["7b"]);
  });

  test("canonicalises percents and bare numbers", () => {
    expect(figures("12%")).toEqual(["12%"]);
    expect(figures("12 percent")).toEqual(["12%"]);
    expect(figures("3,000")).toEqual(["3000"]);
    expect(figures("1,234,567")).toEqual(["1234567"]);
  });

  test("dedupes and keeps unrelated digits distinct", () => {
    expect(figures("$40M and 40 million")).toEqual(["40m"]);
    expect(figures("2026-11-20")).toEqual(["2026", "11", "20"]);
    expect(figures("no digits")).toEqual([]);
    expect(figures("in 2025 T-Mobile signed 5 B2B deals")).toEqual(["2025", "5", "2b"]);
    expect(figures("a 12 percentage-point swing")).toEqual(["12"]);
  });
});

describe("names()", () => {
  test("ignores a single capitalised word at the start of a sentence", () => {
    expect(names("Acme raised a round.")).toEqual([]);
    expect(names("Growth continues at Acme.")).toEqual(["Acme"]);
  });

  test("multi-word runs count even at sentence start", () => {
    expect(names("Dana Reyes joins the board.")).toEqual(["Reyes"]);
    expect(names("The Bank of England held rates.")).toEqual([
      "Bank of England",
    ]);
  });

  test("runs do not cross sentence boundaries", () => {
    expect(names("It was North Peak Capital. Fresh capital arrived.")).toEqual([
      "North Peak Capital",
    ]); // "Fresh" alone at a sentence start is ignored
  });

  test("sentence-initial ordinary words are never glued onto names", () => {
    expect(names("Discuss Claude Code.")).toEqual(["Claude Code"]);
    expect(names("Probe Vera Rubin.")).toEqual(["Vera Rubin"]);
    expect(names("Compare Morningstar's.")).toEqual(["Morningstar"]);
  });

  test("hyphenated compounds split; only capitalised parts are name words", () => {
    expect(names("an IPO-filing was lodged.")).toEqual([]);
    expect(names("the CEO-related memo leaked.")).toEqual([]);
    expect(names("the China-related filing dropped.")).toEqual(["China"]);
    expect(names("a Mercedes-AMG deal closed.")).toEqual(["Mercedes AMG"]);
  });

  test("runs never cross commas or the word and", () => {
    expect(names("firms Goodwin Procter, Foley & Lardner, Harvey and PricewaterhouseCoopers-designed showed up."))
      .toEqual(["Goodwin Procter", "Foley & Lardner", "Harvey", "PricewaterhouseCoopers"]);
  });

  test("month abbreviations, pluralised stopwords and role words are not names", () => {
    expect(names("the round Acme closed in Oct.")).toEqual(["Acme"]);
    expect(names("the APIs opened to partners.")).toEqual([]);
    expect(names("the new Shopify VP of Product spoke.")).toEqual(["Shopify"]);
    expect(names("the CEOs met on Tues.")).toEqual([]);
  });

  test("possessives and stopwords", () => {
    expect(names("the report says Stripe's revenue grew on Tuesday.")).toEqual(["Stripe"]);
    expect(names("In Q1, Acme hired.")).toEqual(["Acme"]);
  });

  test("a lone initial joins the next name", () => {
    expect(names("We met J. Smith yesterday.")).toEqual(["J Smith"]);
  });

  test("currency tokens are not names", () => {
    expect(names("Acme raised US$40m last week.")).toEqual([]);
  });
});

test("names() — dotted initialisms and digit tokens are never names", () => {
  expect(names("The U.S. market reacted.")).toEqual([]);
  expect(names("Ana Ruiz covers the U.S desk.")).toEqual(["Ruiz"]);
  expect(names("The U.K. and E.U. markets.")).toEqual([]);
  expect(names("The board set FY2027 targets for Acme.")).toEqual(["Acme"]);
  expect(names("Q3 results and 3M volume.")).toEqual([]);
});
