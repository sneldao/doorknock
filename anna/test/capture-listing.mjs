// Listing captures — REAL model output (Reflection Beam, recorded 16 Nov 2026)
// replayed through the fake host, pinned to the LIGHT scheme (the product's
// paper/ink identity). The page clock is frozen at each recording's
// recordedAt so dates and "today" match the original run.
// Rule: listing images must not show a named private individual.
// Usage: node test/capture-listing.mjs

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, readFile, rm, stat } from "node:fs/promises";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, "../listing");
const SESSION = "doorknock-anna-listing";
const PORT = "4621";
const BASE = `http://127.0.0.1:${PORT}`;
const cli = async (...a) => (await run("agent-browser", ["--session", SESSION, ...a])).stdout.trim();
const post = (p, b) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fev = async (js) => JSON.parse(await cli("eval", `((${js}))(document)`));
const screen = () => fev('d=>[...d.querySelectorAll(".screen")].find(s=>!s.hidden)?.id');
async function waitScreen(id, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    if (await screen() === id) return;
    await sleep(250);
  }
  throw new Error(`screen ${id} never appeared (at ${await screen()})`);
}

const freezeClock = (iso) => fev(`d=>{
  const T=${JSON.stringify(iso)};
  const R=window.__RealDate ?? (window.__RealDate=Date);
  const t=new R(T).getTime();
  function F(...a){ return a.length? new R(...a) : new R(t); }
  F.now=()=>t; F.parse=R.parse; F.UTC=R.UTC; F.prototype=R.prototype;
  window.Date=F; return true}`);

const pngHeight = async (path) => (await readFile(path)).readUInt32BE(20); // IHDR height

async function shot(name, expected, width, height) {
  await waitScreen(expected);
  // set the width FIRST, then measure the content bottom at that width
  await cli("set", "viewport", String(width), String(height));
  const contentH = JSON.parse(await cli("eval",
    "Math.ceil(document.querySelector('main').getBoundingClientRect().bottom + 12)"));
  await cli("set", "viewport", String(width), String(Math.max(height, contentH)));
  await fev('d=>document.activeElement?.blur()||true');
  const path = join(output, name);
  await cli("screenshot", path);
  // the image must actually end at the content — a tall blank band below
  // the sheet means the crop lied
  const h = await pngHeight(path);
  const slack = h - contentH;
  if (slack > 140) throw new Error(`${name}: ${slack}px of blank below the content (png ${h}px, content ${contentH}px)`);
}

async function runRecording(name, shots) {
  const rec = JSON.parse(await readFile(join(here, "recordings", `${name}.json`), "utf8"));
  await post("/__reset");
  await post("/__search-script", { responses: rec.searches.map((s) => ({ results: s.result.results })) });
  const replies = rec.replies.map((r) => ({ text: r.content.text, stopReason: r.stopReason ?? "endTurn" }));
  if ((shots.running ?? []).length && replies.length > 1) replies[1].delayMs = 1200; // hold the run screen for the capture
  await post("/__script", { responses: replies });
  await cli("open", BASE);
  await waitScreen("screen-form");
  await freezeClock(rec.recordedAt);
  const req = rec.request;
  await fev(`d=>{
    d.getElementById("in-subject").value=${JSON.stringify(req.subject)};
    d.getElementById("in-when").value=${JSON.stringify(req.meetingAt)};
    d.getElementById("in-kind").value=${JSON.stringify(req.kind)};
    d.getElementById("in-notes").value=${JSON.stringify(req.notes ?? "")};
    return true}`);
  for (const [n, w, h] of shots.before ?? []) await shot(n, "screen-form", w, h);
  await fev('d=>{d.getElementById("brief-form").requestSubmit();return true}');
  for (const [n, w, h] of shots.running ?? []) { await sleep(200); await shot(n, "screen-run", w, h).catch(() => {}); }
  await waitScreen("screen-brief", 120);
  for (const [n, w, h] of shots.result) await shot(n, "screen-brief", w, h);
  const kv = (await post("/__dump")).kv;
  const last = kv["briefs/last"];
  return kv[last?.key ?? ""] ?? last;
}

const server = spawn(process.execPath, [join(here, "fake-host-server.mjs")], { env: { ...process.env, PORT } });
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("capture host did not start")), 8000);
    server.once("error", (e) => { clearTimeout(t); reject(e); });
    server.stdout.on("data", (d) => { if (String(d).includes("fake host on")) { clearTimeout(t); resolve(); } });
  });
  await mkdir(output, { recursive: true });
  await rm(join(here, "../listing/candidate"), { recursive: true, force: true });
  await cli("open", "about:blank");
  await cli("set", "media", "light"); // the listing is the paper sheet, not dark mode

  // primary recording: shopify (pass after redraft under the recorded gate)
  const shopify = await runRecording("shopify", {
    before: [["home-1280.png", 1280, 800], ["home-390.png", 390, 844]],
    running: [["run-1280.png", 1280, 800], ["run-390.png", 390, 844]],
    result: [["result-shopify-1280.png", 1280, 800], ["result-shopify-390.png", 390, 844]],
  });
  console.log("shopify:", shopify ? `${shopify.verdict.pass ? "pass" : "repaired"} (${(shopify.verdict.score * 100).toFixed(0)}%)` : "NOT SAVED");

  // second recording: monzo — scrolled so the stamp is out of frame and
  // the Uncertain section is fully visible with traced developments above
  const monzo = await runRecording("monzo", {
    result: [],
  });
  const unc = (monzo?.uncertain ?? []).length;
  console.log("monzo:", monzo ? `${monzo.verdict.pass ? "pass" : "repaired"} (${(monzo.verdict.score * 100).toFixed(0)}%), uncertain=${unc}` : "NOT SAVED");
  if (monzo && unc > 0) {
    await cli("set", "viewport", "1280", "800");
    await fev(`d=>{
      const z=d.querySelector(".uncertain-zone");
      const y=z.getBoundingClientRect().top+scrollY;
      // scroll so the zone's bottom sits near the viewport bottom and the
      // stamp (top of the sheet) is out of frame
      scrollTo(0, Math.max(0, y+z.offsetHeight-800+60));
      return true}`);
    await sleep(300);
    await cli("screenshot", join(output, "result-monzo-1280.png"));
    await cli("set", "viewport", "390", "844");
    await fev(`d=>{
      const z=d.querySelector(".uncertain-zone");
      const y=z.getBoundingClientRect().top+scrollY;
      scrollTo(0, Math.max(0, y+z.offsetHeight-844+40));
      return true}`);
    await sleep(300);
    await cli("screenshot", join(output, "result-monzo-390.png"));
  } else {
    console.log("monzo replay has NO Uncertain section under the current gate — reporting instead of faking it");
  }
} finally {
  try { await cli("close"); } catch {}
  server.kill();
}
