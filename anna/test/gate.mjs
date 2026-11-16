// Gate fixture parity — the SAME cases the web app's tests/gate.test.ts
// runs, against the JS port in bundle/gate.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { auditBriefing, repairBriefing } from "../bundle/gate.js";

const cases = JSON.parse(
  readFileSync(new URL("../../tests/gate-cases.json", import.meta.url), "utf8"),
);

for (const c of cases) {
  test(c.name, () => {
    const v = auditBriefing(c.briefing, c.rounds, c.context, c.today);
    assert.equal(v.pass, c.expect.pass, `pass: ${v.verdictLine}`);
    assert.ok(Math.abs(v.score - c.expect.score) < 1e-5, `score ${v.score}`);
    assert.deepEqual(
      v.findings.map((f) => f.kind).sort(),
      [...c.expect.kinds].sort(),
      `kinds: ${JSON.stringify(v.findings.map((f) => f.kind))}`,
    );
    if (c.expect.repaired) {
      const { briefing: repaired, uncertain } = repairBriefing(
        c.briefing,
        c.rounds,
        c.context,
        c.today,
      );
      assert.equal(repaired.keyDevelopments.length, c.expect.repaired.kept);
      assert.equal(uncertain.length, c.expect.repaired.uncertain);
      if (c.expect.repaired.discussionPoints !== undefined) {
        assert.equal(repaired.discussionPoints.length, c.expect.repaired.discussionPoints);
      }
    }
  });
}

import { names } from "../bundle/gate.js";

test("names() — sentence-initial single word ignored, mid-sentence counts", () => {
  assert.deepEqual(names("Acme raised a round."), []);
  assert.deepEqual(names("Growth continues at Acme."), ["Acme"]);
  assert.deepEqual(names("Dana Reyes joins the board."), ["Reyes"]);
  assert.deepEqual(names("The Bank of England held rates."), ["Bank of England"]);
});

test("names() — sentence-initial ordinary words are never glued onto names", () => {
  assert.deepEqual(names("Discuss Claude Code."), ["Claude Code"]);
  assert.deepEqual(names("Probe Vera Rubin."), ["Vera Rubin"]);
  assert.deepEqual(names("Compare Morningstar's."), ["Morningstar"]);
});

test("names() — hyphenated compounds split on -", () => {
  assert.deepEqual(names("an IPO-filing was lodged."), []);
  assert.deepEqual(names("the CEO-related memo leaked."), []);
  assert.deepEqual(names("the China-related filing dropped."), ["China"]);
  assert.deepEqual(names("a Mercedes-AMG deal closed."), ["Mercedes AMG"]);
});

test("names() — runs never cross commas or the word and", () => {
  assert.deepEqual(
    names("firms Goodwin Procter, Foley & Lardner, Harvey and PricewaterhouseCoopers-designed showed up."),
    ["Goodwin Procter", "Foley & Lardner", "Harvey", "PricewaterhouseCoopers"],
  );
});

test("names() — month abbreviations, pluralised stopwords and role words", () => {
  assert.deepEqual(names("the round Acme closed in Oct."), ["Acme"]);
  assert.deepEqual(names("the APIs opened to partners."), []);
  assert.deepEqual(names("the new Shopify VP of Product spoke."), ["Shopify"]);
  assert.deepEqual(names("the CEOs met on Tues."), []);
});

test("names() — dotted initialisms and digit tokens are never names", () => {
  assert.deepEqual(names("The U.S. market reacted."), []);
  assert.deepEqual(names("Ana Ruiz covers the U.S desk."), ["Ruiz"]);
  assert.deepEqual(names("The U.K. and E.U. markets."), []);
  assert.deepEqual(names("The board set FY2027 targets for Acme."), ["Acme"]);
  assert.deepEqual(names("Q3 results and 3M volume."), []);
});

test("names() — runs stop at sentence boundaries; initials join", () => {
  assert.deepEqual(names("It was North Peak Capital. Fresh capital arrived."), [
    "North Peak Capital",
  ]); // "Fresh" alone at a sentence start is ignored
  assert.deepEqual(names("We met J. Smith yesterday."), ["J Smith"]);
  assert.deepEqual(names("the report says Stripe's revenue grew on Tuesday."), ["Stripe"]);
  assert.deepEqual(names("Acme raised US$40m last week."), []);
});
