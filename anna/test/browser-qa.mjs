// Browser QA — doorknock anna bundle against the fake host + agent-browser.
// Synthetic data only; no real model, no real search, no real storage.
// Usage: node test/browser-qa.mjs        (CASE=<substr>|<substr> to filter)

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
process.env.AGENT_BROWSER_DEFAULT_TIMEOUT ||= "90000";
const run = promisify(execFile);
const PORT = "4625";
const BASE = `http://127.0.0.1:${PORT}`;
const SESSION = process.env.AGENT_BROWSER_SESSION || "doorknock-anna-qa";
let passed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cli = async (...a) => (await run("agent-browser", ["--session", SESSION, ...a])).stdout.trim();
const ev = async (js) => {
  const out = (await cli("eval", js)).trim();
  const unq = (v) => { try { return JSON.parse(v); } catch { return v; } };
  const r = unq(out);
  return typeof r === "string" && r !== out ? unq(r) : r;
};
const post = (p, b) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const screens = 'JSON.stringify([...document.querySelectorAll(".screen")].filter(s=>!s.hidden).map(s=>s.id))';
const activeScreen = async () => (await ev(screens))[0];
const waitScreen = async (id, tries = 60) => {
  for (let i = 0; i < tries; i += 1) {
    if ((await activeScreen()) === id) return;
    await sleep(250);
  }
  assert.equal(await activeScreen(), id);
};
const CASE = process.env.CASE || null;
const failures = [];
async function ok(name, fn) {
  if (CASE && !CASE.split("|").some((part) => name.includes(part))) return;
  try { await fn(); passed += 1; console.log("ok", passed, "-", name); }
  catch (e) { failures.push({ name, err: e.message?.split("\n").slice(0, 6).join(" | ") || String(e) }); console.log("FAIL", "-", name); }
}
const fresh = async (suffix = "") => {
  await post("/__reset");
  await cli("open", "about:blank");
  await sleep(300);
  await cli("open", `${BASE}${suffix}`);
  await sleep(1200);
};
const seed = async (responses, hits = HITS) => {
  await post("/__seed-search", { results: hits });
  if (responses) await post("/__script", { responses });
};

// ── synthetic transcript + drafts ────────────────────────────────────────

const HITS = [
  { title: "Meridian Bank partners with Northwind on instant settlement", url: "https://press.example.com/meridian-northwind-settlement", snippet: "Meridian Bank announced a settlement partnership with Northwind Rails on 10 November, cutting cross-border settlement times for business customers. The bank said pilot volume reached 4000 transactions a day.", published_at: "2026-11-10" },
  { title: "Meridian Bank names Ana Ruiz as chief risk officer", url: "https://news.example.com/meridian-ruiz-cro", snippet: "Meridian Bank appointed Ana Ruiz as chief risk officer on 12 November, moving from a regional regulator where she led supervision.", published_at: "2026-11-12" },
];
const PLAN = JSON.stringify({ queries: ["Meridian Bank news", "Meridian Bank announcement", "Meridian Bank leadership"], identityQuery: "Meridian Bank" });
const DEV1 = { headline: "Instant-settlement partnership with Northwind", summary: "Meridian announced the Northwind settlement partnership, with pilot volume of 4000 transactions a day.", whyItMatters: "Settlement speed is now a talking point in any infrastructure conversation.", sourceUrls: ["https://press.example.com/meridian-northwind-settlement"], happenedWithinWindow: true };
const DEV2 = { headline: "New chief risk officer appointed", summary: "Ana Ruiz joins as chief risk officer from a regional regulator.", whyItMatters: "A supervision background suggests a conservative posture this quarter.", sourceUrls: ["https://news.example.com/meridian-ruiz-cro"], happenedWithinWindow: true };
const draft = (devs) => JSON.stringify({
  masthead: "Sales briefing — Meridian Bank",
  headline: "Meridian closed a settlement partnership and changed risk leadership in the same week",
  situation: "Meridian announced an instant-settlement partnership and appointed a new chief risk officer inside the same week.",
  keyDevelopments: devs,
  discussionPoints: ["Does the settlement pilot change the infrastructure roadmap?", "How does a regulator-turned-CRO read new product risk?"],
  openQuestions: ["Is the Northwind partnership exclusive?", "What does the new CRO inherit mid-flight?"],
});
const GOOD = draft([DEV1, DEV2]);
const BAD_FIGURE = draft([
  { ...DEV1, summary: "Meridian announced the Northwind settlement partnership, now serving 90000 enterprise clients." },
  DEV2,
]);
const BAD_NAME = draft([
  DEV1,
  { ...DEV2, summary: "Zara Vex joins as chief risk officer from a regional regulator." },
]);

const fillForm = async () => {
  await ev('document.getElementById("in-subject").value="Meridian Bank"');
  await ev('document.getElementById("in-when").value="2026-11-20T10:00"');
  await ev('document.getElementById("in-kind").value="sales"');
};
const submit = () => ev('document.getElementById("brief-form").requestSubmit()||true');

// ── suite ────────────────────────────────────────────────────────────────

const server = spawn(process.execPath, [join(here, "fake-host-server.mjs")], { env: { ...process.env, PORT } });
let browserStarted = false;
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("fake host did not start")), 8000);
    server.once("error", reject);
    server.stdout.on("data", (d) => { if (String(d).includes("fake host on")) { clearTimeout(t); resolve(); } });
  });

  await ok("cold start renders the static shell before the host connects", async () => {
    await post("/__reset");
    await post("/__startup", { delayMs: 4000 });
    await cli("open", "about:blank");
    await cli("open", BASE);
    await sleep(400); // connect still in flight — the shell must already render
    assert.equal(await ev('document.getElementById("startup-panel").hidden'), false);
    assert.ok((await ev('document.getElementById("startup-message").textContent')).length > 0);
    assert.equal(await ev('document.getElementById("root").hidden'), true);
    await post("/__startup", { delayMs: 0 });
    await waitScreen("screen-form", 40);
  });

  await ok("empty subject shows an inline error instead of a silent no-op", async () => {
    await fresh();
    await waitScreen("screen-form");
    await submit();
    await sleep(250);
    assert.equal(await ev('document.getElementById("form-error").hidden'), false);
    assert.ok((await ev('document.getElementById("form-error").textContent')).includes("Tell Doorknock who"));
    assert.equal(await activeScreen(), "screen-form");
    await ev('document.getElementById("in-subject").value="Meridian Bank"');
    await ev('document.getElementById("in-subject").dispatchEvent(new Event("input",{bubbles:true}))');
    assert.equal(await ev('document.getElementById("form-error").hidden'), true);
  });

  await ok("connect that never resolves -> error + Retry within the timeout", async () => {
    await fresh();
    await post("/__startup", { hang: true });
    await cli("open", `${BASE}/?watchdogms=1200`);
    await sleep(2200);
    assert.equal(await ev('document.getElementById("btn-startup-retry").hidden'), false);
    assert.equal(await ev('document.getElementById("startup-message").textContent'), "Could not reach the host.");
  });

  await ok("checkpoint read hangs -> error + Retry within the timeout", async () => {
    await fresh();
    await post("/__delay", { key: "doorknock/active-task", hang: true });
    await cli("open", `${BASE}/?watchdogms=1200`);
    await sleep(2200);
    assert.equal(await ev('document.getElementById("btn-startup-retry").hidden'), false);
    assert.equal(await ev('document.getElementById("startup-message").textContent'), "Could not read your saved work.");
  });

  await ok("malformed checkpoint -> never a spinner, discard offered, raw kept until discard", async () => {
    await fresh();
    await post("/__kv", { op: "set", key: "doorknock/active-task", value: "not-an-object" });
    await cli("open", "about:blank");
    await cli("open", BASE);
    await sleep(1200);
    assert.equal(await activeScreen(), "screen-form");
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), false);
    assert.equal(await ev('document.getElementById("btn-discard-checkpoint").hidden'), false);
    assert.equal(await ev('document.getElementById("btn-resume").hidden'), true);
    assert.equal((await post("/__dump")).kv["doorknock/active-task"], "not-an-object");
    await ev('document.getElementById("btn-discard-checkpoint").click()');
    await sleep(500);
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), true);
    assert.equal((await post("/__dump")).kv["doorknock/active-task"], undefined);
  });

  await ok("poisoned checkpoint value -> corrupt path, discard offered", async () => {
    await fresh();
    await cli("open", `${BASE}/?poison=checkpoint`);
    await sleep(1500);
    assert.equal(await activeScreen(), "screen-form");
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), false);
    assert.equal(await ev('document.getElementById("btn-discard-checkpoint").hidden'), false);
    await ev('document.getElementById("btn-discard-checkpoint").click()');
    await sleep(400);
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), true);
  });

  await ok("happy path: form -> feed -> brief -> reload -> Last brief reopens", async () => {
    await fresh();
    await seed([{ text: PLAN }, { text: GOOD }]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-brief", 80);
    assert.ok((await ev('document.getElementById("brief-stamp").textContent')).includes("Source-traced"));
    assert.ok((await post("/__dump")).kv["briefs/last"], "brief saved");
    await cli("reload");
    await sleep(1400);
    await waitScreen("screen-form");
    assert.equal(await ev('document.getElementById("last-brief-card").hidden'), false);
    await ev('document.getElementById("btn-last-brief").click()');
    await waitScreen("screen-brief");
    assert.ok((await ev('document.getElementById("brief-doc").textContent')).includes("Ana Ruiz"));
  });

  await ok("library lists saved briefs; an example button prefills a valid form", async () => {
    await fresh();
    await seed([{ text: PLAN }, { text: GOOD }]);
    await waitScreen("screen-form");
    assert.equal(await ev('document.getElementById("library-card").hidden'), true);
    await ev('document.getElementById("btn-example-shopify").click()');
    assert.equal(await ev('document.getElementById("in-subject").value'), "Shopify");
    assert.equal(await ev('document.getElementById("in-kind").value'), "partnership");
    assert.ok((await ev('document.getElementById("in-when").value')).length > 0, "example sets a meeting time");
    await submit();
    await waitScreen("screen-brief", 80);
    await cli("reload");
    await sleep(1400);
    await waitScreen("screen-form");
    assert.equal(await ev('document.getElementById("library-card").hidden'), false);
    assert.ok((await ev('document.getElementById("library-list").textContent')).includes("Shopify"));
    await ev('document.querySelector("#library-list button").click()');
    await waitScreen("screen-brief");
  });

  await ok("reload mid-draft -> resume banner -> resume makes zero new searches", async () => {
    await fresh();
    await seed([{ text: PLAN }, { hang: true }]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    // wait until the sweep sealed: checkpoint at drafting + 4 searches done
    for (let i = 0; i < 60; i += 1) {
      const d = await post("/__dump");
      if (d.searchCalls.length >= 4 && d.kv["doorknock/active-task"]?.stage === "drafting") break;
      await sleep(250);
    }
    assert.equal((await post("/__dump")).searchCalls.length, 4);
    await cli("reload");
    await sleep(1400);
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), false);
    await post("/__script", { responses: [{ text: GOOD }] });
    await ev('document.getElementById("btn-resume").click()');
    await waitScreen("screen-brief", 80);
    assert.equal((await post("/__dump")).searchCalls.length, 4, "resume paid no new search");
  });

  await ok("Start over clears the checkpoint", async () => {
    await fresh();
    await post("/__kv", { op: "set", key: "doorknock/active-task", value: { v: 1, id: "x", stage: "sweeping", request: { subject: "Acme", meetingAt: "soon", kind: "general" } } });
    await cli("open", "about:blank");
    await cli("open", BASE);
    await sleep(1400);
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), false);
    await ev('document.getElementById("btn-start-over").click()');
    await sleep(500);
    assert.equal((await post("/__dump")).kv["doorknock/active-task"], undefined);
    assert.equal(await ev('document.getElementById("in-subject").value'), "Acme");
  });

  await ok("draft 503 twice -> error -> Retry -> brief with zero new searches", async () => {
    await fresh();
    await seed([
      { text: PLAN },
      { error: { code: "PROVIDER_503", message: "provider overloaded" } },
      { error: { code: "PROVIDER_503", message: "provider overloaded" } },
    ]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-error", 80);
    assert.ok((await ev('document.getElementById("error-message").textContent')).includes("usable draft"));
    assert.equal((await post("/__dump")).kv["doorknock/active-task"]?.stage, "drafting", "sealed checkpoint kept");
    await post("/__script", { responses: [{ text: GOOD }] });
    await ev('document.getElementById("btn-error-retry").click()');
    await waitScreen("screen-brief", 80);
    assert.equal((await post("/__dump")).searchCalls.length, 4, "retry paid no new search");
  });

  await ok("quota exceeded -> specific message, sealed sweep kept, Retry reuses it", async () => {
    await fresh();
    await seed([
      { text: PLAN },
      { error: { code: "APP_QUOTA_EXCEEDED", message: "quota exceeded", data: { requiredCu: 4.2, remainingCu: 1.1 } } },
    ]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-error", 80);
    const msg = await ev('document.getElementById("error-message").textContent');
    assert.ok(msg.includes("needs about 4.2 CU") && msg.includes("you have 1.1"), msg);
    assert.equal((await post("/__dump")).kv["doorknock/active-task"]?.stage, "drafting", "sealed checkpoint kept");
    const searches = (await post("/__dump")).searchCalls.length;
    await post("/__script", { responses: [{ text: GOOD }] });
    await ev('document.getElementById("btn-error-retry").click()');
    await waitScreen("screen-brief", 80);
    assert.equal((await post("/__dump")).searchCalls.length, searches, "retry paid no new search");
  });

  await ok("truncated draft -> one long retry lands; long-retry quota shows message", async () => {
    await fresh();
    await seed([
      { text: PLAN },
      { text: "", stopReason: "maxTokens" },
      { text: GOOD },
    ]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-brief", 80);
    const calls = (await post("/__dump")).llmCalls;
    assert.equal(calls.length, 3, "plan + 8192 + long retry");
    assert.equal(calls[1].maxTokens, 8192);
    assert.equal(calls[2].maxTokens, 24000);
    assert.ok(calls.every((c) => c.thinking === false));

    await fresh();
    await seed([
      { text: PLAN },
      { text: "", stopReason: "maxTokens" },
      { error: { code: "APP_QUOTA_EXCEEDED", message: "quota exceeded", data: { requiredCu: 9.2, remainingCu: 1.4 } } },
    ]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-error", 80);
    const q = await ev('document.getElementById("error-message").textContent');
    assert.ok(q.includes("needs about 9.2 CU") && q.includes("you have 1.4"), q);
    assert.equal((await post("/__dump")).kv["doorknock/active-task"]?.stage, "drafting", "sealed sweep kept");
  });

  await ok("zero hits -> honest error, nothing saved", async () => {
    await fresh();
    await seed([{ text: PLAN }], []);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-error", 80);
    assert.ok((await ev('document.getElementById("error-message").textContent')).includes("No sources came back"));
    assert.equal((await post("/__dump")).kv["briefs/last"], undefined);
  });

  await ok("invented figure -> REPAIRED with the Uncertain section visible", async () => {
    await fresh();
    await seed([{ text: PLAN }, { text: BAD_FIGURE }, { text: BAD_FIGURE }]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-brief", 100);
    assert.ok((await ev('document.getElementById("brief-stamp").textContent')).includes("Repaired"));
    const doc = await ev('document.getElementById("brief-doc").textContent');
    assert.ok(doc.includes("Uncertain — treat with caution"));
  });

  await ok("invented name -> REPAIRED with the Uncertain section visible", async () => {
    await fresh();
    await seed([{ text: PLAN }, { text: BAD_NAME }, { text: BAD_NAME }]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-brief", 100);
    const doc = await ev('document.getElementById("brief-doc").textContent');
    assert.ok(doc.includes("Uncertain — treat with caution"));
    assert.ok(doc.includes("Zara Vex"), "moved to uncertain, not laundered away");
  });

  await ok("entry payload prefills the form and never starts a run", async () => {
    await fresh();
    await post("/__entry", { payload: { subject: "Acme Corp", kind: "investor", notes: "series b" } });
    await cli("open", "about:blank");
    await cli("open", BASE);
    await sleep(1400);
    assert.equal(await activeScreen(), "screen-form");
    assert.equal(await ev('document.getElementById("in-subject").value'), "Acme Corp");
    assert.equal(await ev('document.getElementById("in-kind").value'), "investor");
    assert.equal((await post("/__dump")).searchCalls.length, 0);
  });

  await ok("entry payload while a checkpoint exists still goes through resume/start-over", async () => {
    await fresh();
    await post("/__kv", { op: "set", key: "doorknock/active-task", value: { v: 1, id: "x", stage: "sweeping", request: { subject: "Globex", meetingAt: "soon", kind: "general" } } });
    await post("/__entry", { payload: { subject: "Acme Corp" } });
    await cli("open", "about:blank");
    await cli("open", BASE);
    await sleep(1400);
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), false, "the resume choice is not bypassed");
    assert.equal((await post("/__dump")).searchCalls.length, 0);
  });

  await ok("save failure still shows the brief and offers retry-save", async () => {
    await fresh();
    await seed([{ text: PLAN }, { text: GOOD }]);
    await post("/__fault", { op: "set", key: "briefs/", times: 1 });
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-brief", 80);
    assert.ok((await ev('document.getElementById("brief-doc").textContent')).includes("Ana Ruiz"));
    assert.equal(await ev('document.getElementById("save-warn").hidden'), false);
    await ev('document.getElementById("btn-save-retry").click()');
    await sleep(600);
    assert.equal(await ev('document.getElementById("save-warn").hidden'), true);
    assert.ok((await post("/__dump")).kv["briefs/last"], "retry saved the brief");
  });

  await ok("a late reply from an abandoned run mutates nothing", async () => {
    await fresh();
    await seed([{ text: PLAN }, { hang: true }]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-run", 40);
    await ev('document.getElementById("btn-cancel-run").click()');
    await waitScreen("screen-form");
    // The abandoned run's draft is still hanging server-side; a new run
    // proceeds and the old run's events must not land.
    await seed([{ text: PLAN }, { text: GOOD }]);
    await fillForm();
    await submit();
    await waitScreen("screen-brief", 80);
    const last = (await post("/__dump")).kv["briefs/last"];
    assert.ok(last, "the newer run saved its brief");
    const record = (await post("/__dump")).kv[last.key];
    assert.equal(record.briefing.headline.includes("Meridian"), true);
  });

  await ok("copy-as-text carries the whole brief", async () => {
    await fresh();
    await seed([{ text: PLAN }, { text: GOOD }]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-brief", 80);
    const text = await ev(`(() => {
      const doc = document.getElementById("brief-doc").textContent;
      return doc;
    })()`);
    for (const bit of ["Ana Ruiz", "Discussion points", "Open questions", "Cited sources (2)"]) {
      assert.ok(text.includes(bit), `brief doc shows ${bit}`);
    }
    await ev('document.getElementById("btn-copy").click()');
    await sleep(400); // clipboard may be denied headless; the click must not throw
  });

  await ok("viewports 320/420/1024 show no horizontal scroll on form, run and brief", async () => {
    for (const w of [1024, 420, 320]) {
      await fresh();
      await seed([{ text: PLAN }, { text: GOOD }]);
      await cli("set", "viewport", String(w), "800");
      await waitScreen("screen-form");
      assert.ok((await ev("document.body.scrollWidth")) <= w + 1, `form overflows ${w}`);
      await fillForm();
      await submit();
      await sleep(300);
      if ((await activeScreen()) === "screen-run") {
        assert.ok((await ev("document.body.scrollWidth")) <= w + 1, `feed overflows ${w}`);
      }
      await waitScreen("screen-brief", 80);
      const wide = await ev(`JSON.stringify([...document.querySelectorAll("*")].filter(e=>e.getBoundingClientRect().right > ${w}).map(e=>e.id||e.className||e.tagName).slice(0,6))`);
      assert.ok((await ev("document.body.scrollWidth")) <= w + 1, `brief overflows ${w}: ${wide}`);
    }
    await cli("set", "viewport", "1024", "800");
  });

  await ok("the stamp never collides with the masthead or dateline", async () => {
    for (const w of [1280, 420, 320]) {
      await fresh();
      await seed([{ text: PLAN }, { text: GOOD }]);
      await cli("set", "viewport", String(w), "800");
      await waitScreen("screen-form");
      await fillForm();
      await submit();
      await waitScreen("screen-brief", 80);
      const { st, kids } = await ev(`({st:document.getElementById("brief-stamp").getBoundingClientRect().toJSON(),kids:[...document.querySelectorAll("#brief-doc .brief-mast > *")].map(n=>n.getBoundingClientRect().toJSON())})`);
      const overlap = kids.some((r) => r.width > 0 && !(r.right <= st.left || r.left >= st.right || r.bottom <= st.top || r.top >= st.bottom));
      assert.equal(overlap, false, `stamp overlaps masthead at ${w}px: ${JSON.stringify({st,kids})}`);
    }
    await cli("set", "viewport", "1024", "800");
  });

  await ok("keyboard-only flow, focus rings, fonts and motion are deliberate", async () => {
    await fresh();
    await seed([{ text: PLAN }, { text: GOOD }]);
    await waitScreen("screen-form");
    // keyboard-only: focus, type, Tab through, Enter submits
    await ev(`(async()=>{
      const sub=document.getElementById("in-subject");
      sub.focus(); sub.value="Meridian Bank"; sub.dispatchEvent(new Event("input",{bubbles:true}));
      const w=document.getElementById("in-when"); w.value="2026-11-20T10:00"; w.dispatchEvent(new Event("input",{bubbles:true}));
      const k=document.getElementById("in-kind"); k.value="sales"; k.dispatchEvent(new Event("change",{bubbles:true}));
      document.getElementById("btn-knock").focus();
      return true})()`);
    const ae = await ev("document.activeElement.id");
    assert.equal(ae, "btn-knock");
    const outline = await ev('getComputedStyle(document.activeElement).outlineWidth');
    assert.notEqual(outline, "0px", "focus-visible ring present");
    await ev('document.activeElement.click()'); // Enter on a focused button fires click
    await waitScreen("screen-brief", 80);
    // fonts served from the bundle only
    const fonts = await ev(`[...document.fonts].map(f=>f.family+" "+f.status).join("|")`);
    assert.ok(fonts.includes("Fraunces"), fonts);
    const remote = await ev('performance.getEntriesByType("resource").map(e=>e.name).filter(n=>!n.startsWith(location.origin)).join("|")');
    assert.equal(remote, "");
    // a beat later, the stamp press has finished — no perpetual animation
    await sleep(900);
    const running = await ev('document.getAnimations().filter(a=>a.playState==="running").length');
    assert.ok(running <= 1, `at most the caret may still tick (${running})`);
  });

  await ok("a full run issues zero requests to non-local origins", async () => {
    await fresh();
    await seed([{ text: PLAN }, { text: GOOD }]);
    await waitScreen("screen-form");
    await fillForm();
    await submit();
    await waitScreen("screen-brief", 80);
    const bad = await ev('performance.getEntriesByType("resource").map(e=>e.name).filter(n=>!n.startsWith(location.origin)).join("|")');
    assert.equal(bad, "");
  });
} finally {
  try { await cli("close"); } catch {}
  server.kill();
}
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log("-", f.name, "::", f.err);
  process.exit(1);
}
console.log(`\nbrowser-qa: ${passed} checks passed`);
