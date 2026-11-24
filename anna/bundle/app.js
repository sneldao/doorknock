// Doorknock — Anna App bundle entry. DOM + host wiring only; the run lives
// in brief.js, the audit in gate.js, persistence in recovery.js.

import { runBriefing, MEETING_KINDS, PipelineError } from "./brief.js";
import {
  ACTIVE_TASK_KEY,
  readActiveTask,
  writeCheckpoint,
  clearCheckpoint,
  saveBrief,
  readLastBrief,
  listBriefs,
} from "./recovery.js";
import { withTimeout, storageSet, storageGet } from "./session.js";

const SDK_URL = "/static/anna-apps/_sdk/latest/index.js";
// Localhost test hook: the fake host sets __DOORKNOCK_BOOT_WATCHDOG_MS via
// ?watchdogms= so startup-failure cases do not need real 8s waits. Read at
// call time — the SDK sets the global when it loads.
const bootMs = () => globalThis.__DOORKNOCK_BOOT_WATCHDOG_MS ?? 8_000;

const $ = (id) => document.getElementById(id);
const els = {
  startupPanel: $("startup-panel"),
  startupMessage: $("startup-message"),
  startupRetry: $("btn-startup-retry"),
  startupHelp: $("startup-help"),
  root: $("root"),
  resumeBanner: $("resume-banner"),
  resumeText: $("resume-text"),
  btnResume: $("btn-resume"),
  btnStartOver: $("btn-start-over"),
  btnDiscard: $("btn-discard-checkpoint"),
  screens: {
    form: $("screen-form"),
    run: $("screen-run"),
    brief: $("screen-brief"),
    error: $("screen-error"),
  },
  form: $("brief-form"),
  subject: $("in-subject"),
  when: $("in-when"),
  kind: $("in-kind"),
  notes: $("in-notes"),
  lastBriefCard: $("last-brief-card"),
  lastBriefLine: $("last-brief-line"),
  btnLastBrief: $("btn-last-brief"),
  libraryCard: $("library-card"),
  libraryList: $("library-list"),
  btnExampleShopify: $("btn-example-shopify"),
  btnExampleMonzo: $("btn-example-monzo"),
  btnKnock: $("btn-knock"),
  feed: $("run-feed"),
  stamp: $("brief-stamp"),
  meta: $("brief-meta"),
  doc: $("brief-doc"),
  btnCopy: $("btn-copy"),
  btnAgain: $("btn-again"),
  saveWarn: $("save-warn"),
  btnSaveRetry: $("btn-save-retry"),
  errorMessage: $("error-message"),
  btnErrorRetry: $("btn-error-retry"),
  btnErrorHome: $("btn-error-home"),
  btnCancelRun: $("btn-cancel-run"),
};

let anna = null;
let activeRunId = null; // late replies from an abandoned run mutate nothing
let lastRequest = null; // for Retry
let lastRounds = null; // sealed sweep — Retry must not pay for it twice
let currentBrief = null; // record for copy-as-text
let lastBriefRecord = null; // for "Last brief" reopen
let pendingCheckpoint = null;

function showScreen(name) {
  for (const [key, el] of Object.entries(els.screens)) {
    el.hidden = key !== name;
  }
}

function showError(message, { retry = true } = {}) {
  els.errorMessage.textContent = message;
  els.btnErrorRetry.hidden = !retry;
  showScreen("error");
}

// ── startup ─────────────────────────────────────────────────────────────

function startupFail(message) {
  els.startupMessage.textContent = message;
  els.startupRetry.hidden = false;
  els.startupHelp.hidden = false;
}

async function connectHost() {
  const { AnnaAppRuntime } = await import(SDK_URL);
  return withTimeout(
    AnnaAppRuntime.connect(),
    bootMs(),
    "connecting to the host",
  );
}

async function boot() {
  els.startupRetry.hidden = true;
  els.startupHelp.hidden = true;
  els.startupMessage.textContent = "Opening your desk…";
  try {
    anna = await connectHost();
  } catch (e) {
    startupFail("Could not reach the host.");
    return;
  }

  let task = { status: "none" };
  try {
    task = await withTimeout(
      readActiveTask(anna),
      bootMs(),
      "reading your saved work",
    );
  } catch {
    startupFail("Could not read your saved work.");
    return;
  }

  try {
    anna.window?.set_title?.({ title: "Doorknock" });
  } catch { /* cosmetic */ }

  els.startupPanel.hidden = true;
  els.root.hidden = false;
  wireForm();
  wireButtons();
  wireEntryPayload();

  if (task.status === "valid") {
    pendingCheckpoint = task.checkpoint;
    offerResume(task.checkpoint);
  } else if (task.status === "corrupt") {
    offerCorrupt();
  }

  showScreen("form");
  refreshLastBrief();
  refreshLibrary();
}

// ── entry payload — prefill only, never starts a run ────────────────────

function applyEntryPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  if (typeof payload.subject === "string") els.subject.value = payload.subject.slice(0, 120);
  if (typeof payload.kind === "string" && MEETING_KINDS.includes(payload.kind)) {
    els.kind.value = payload.kind;
  }
  if (typeof payload.notes === "string") els.notes.value = payload.notes.slice(0, 600);
  showScreen("form");
}

function wireEntryPayload() {
  try {
    if (anna.entryPayload) applyEntryPayload(anna.entryPayload);
    anna.on?.("entry_payload", (p) => applyEntryPayload(p));
  } catch { /* payload wiring is best-effort */ }
}

// ── resume banner ───────────────────────────────────────────────────────

function offerResume(cp) {
  const drafting = cp.stage === "drafting";
  els.resumeText.textContent = drafting
    ? `A brief for “${cp.request.subject}” was cut off after the research sweep — resume without searching again?`
    : `A brief for “${cp.request.subject}” was interrupted mid-sweep — start it again?`;
  els.btnResume.hidden = false;
  els.btnStartOver.hidden = false;
  els.btnDiscard.hidden = false;
  els.btnResume.textContent = drafting ? "Resume this brief" : "Restart the run";
  els.resumeBanner.hidden = false;

  els.btnResume.onclick = () => {
    els.resumeBanner.hidden = true;
    prefillRequest(cp.request);
    startRun(cp.request, drafting ? cp.rounds : null);
  };
  els.btnStartOver.onclick = async () => {
    els.resumeBanner.hidden = true;
    pendingCheckpoint = null;
    await clearCheckpoint(anna).catch(() => {});
    prefillRequest(cp.request);
  };
  els.btnDiscard.onclick = async () => {
    els.resumeBanner.hidden = true;
    pendingCheckpoint = null;
    await clearCheckpoint(anna).catch(() => {});
  };
}

function offerCorrupt() {
  els.resumeText.textContent =
    "A saved run could not be read — it may be from an older version. It has been left untouched; you can discard it or keep it.";
  els.btnResume.hidden = true;
  els.btnStartOver.hidden = true;
  els.btnDiscard.hidden = false;
  els.resumeBanner.hidden = false;
  els.btnDiscard.onclick = async () => {
    els.resumeBanner.hidden = true;
    await clearCheckpoint(anna).catch(() => {});
  };
}

function prefillRequest(req) {
  els.subject.value = req.subject ?? "";
  els.kind.value = MEETING_KINDS.includes(req.kind) ? req.kind : "general";
  els.notes.value = req.notes ?? "";
  if (typeof req.meetingAt === "string" && req.meetingAt) {
    // datetime-local accepts "YYYY-MM-DDTHH:mm"; other strings stay as notes
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(req.meetingAt)) {
      els.when.value = req.meetingAt.slice(0, 16);
    }
  }
}

// ── run ─────────────────────────────────────────────────────────────────

function wireForm() {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const req = {
      subject: els.subject.value.trim(),
      meetingAt: els.when.value || "unscheduled",
      kind: els.kind.value,
      notes: els.notes.value.trim(),
    };
    if (req.subject.length < 2) return;
    startRun(req, null);
  });
}

function wireButtons() {
  els.startupRetry.onclick = () => boot();
  els.btnAgain.onclick = () => showScreen("form");
  els.btnCancelRun.onclick = () => {
    activeRunId = null; // in-flight work keeps running but can mutate nothing
    clearCheckpoint(anna).catch(() => {});
    showScreen("form");
  };
  els.btnErrorHome.onclick = () => showScreen("form");
  els.btnErrorRetry.onclick = () => {
    if (lastRequest) startRun(lastRequest, lastRounds);
    else showScreen("form");
  };
  els.btnCopy.onclick = () => {
    if (!currentBrief) return;
    const text = briefAsText(currentBrief);
    navigator.clipboard?.writeText(text).then(
      () => { els.btnCopy.textContent = "Copied"; setTimeout(() => (els.btnCopy.textContent = "Copy as text"), 1500); },
      () => { /* clipboard may be denied; no-op */ },
    );
  };
  els.btnLastBrief.onclick = () => {
    if (lastBriefRecord) renderBrief(lastBriefRecord);
  };
  els.btnExampleShopify.onclick = () => prefillExample("Shopify", "partnership");
  els.btnExampleMonzo.onclick = () => prefillExample("Monzo", "general");
  els.btnSaveRetry.onclick = async () => {
    if (!currentBrief) return;
    els.btnSaveRetry.disabled = true;
    try {
      await saveBrief(anna, currentBrief);
      await clearCheckpoint(anna);
      els.saveWarn.hidden = true;
    } catch { /* still failing — the warning stays */ }
    els.btnSaveRetry.disabled = false;
  };
}

async function startRun(req, sealedRounds) {
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  activeRunId = runId;
  lastRequest = req;
  lastRounds = sealedRounds ?? null;
  els.feed.replaceChildren();
  showScreen("run");

  const emit = (ev) => {
    if (activeRunId !== runId) return; // stale run: ignore its late events
    renderFeed(ev);
  };

  try {
    if (!sealedRounds) {
      await writeCheckpoint(anna, { v: 1, id: runId, stage: "sweeping", request: req }).catch(() => {});
    }
    const result = await runBriefing(anna, req, emit, {
      rounds: sealedRounds ?? undefined,
      sweepSealed: async (rounds) => {
        if (activeRunId !== runId) return; // an abandoned run writes nothing
        lastRounds = rounds;
        await writeCheckpoint(anna, {
          v: 1, id: runId, stage: "drafting", request: req, rounds,
        }).catch(() => {});
      },
    });
    if (activeRunId !== runId) return;

    const record = {
      ts: Date.now(),
      request: req,
      briefing: result.briefing,
      uncertain: result.uncertain,
      verdict: result.verdict,
      sources: result.sources,
    };
    try {
      await saveBrief(anna, record);
      await clearCheckpoint(anna);
      els.saveWarn.hidden = true;
    } catch {
      // The brief still shows; the person can retry the save.
      els.saveWarn.hidden = false;
    }

    renderBrief(record);
    refreshLastBrief();
    refreshLibrary();
  } catch (e) {
    if (activeRunId !== runId) return;
    const msg =
      e instanceof PipelineError
        ? e.message
        : `The run failed — ${e?.message ?? "something went wrong"}.`;
    showError(msg);
  }
}

// ── feed rendering ──────────────────────────────────────────────────────

function feedRow(tag, cls, text) {
  const row = document.createElement("div");
  row.className = "feed-row";
  const t = document.createElement("span");
  t.className = "agent-tag";
  t.textContent = tag;
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  row.append(t, s);
  return row;
}

function renderFeed(ev) {
  if (ev.type === "stage") {
    els.feed.append(
      feedRow(ev.agent ?? "DESK", "feed-note soft", `${ev.stage}${ev.note ? ` — ${ev.note}` : ""}`),
    );
  } else if (ev.type === "search") {
    els.feed.append(
      feedRow(
        "SCOUT",
        "search-chip",
        `${ev.query.toUpperCase()} … ${ev.hits} HIT${ev.hits === 1 ? "" : "S"} (${ev.topic === "news" ? "news·month" : "background"})`,
      ),
    );
  } else if (ev.type === "sources") {
    els.feed.append(
      feedRow("AUDITOR", "feed-note soft", `source transcript sealed — ${ev.urls.length} URLs recorded`),
    );
  } else if (ev.type === "gate") {
    els.feed.append(
      feedRow("AUDITOR", `feed-note ${ev.verdict.pass ? "pass" : "fail"}`, ev.verdict.verdictLine),
    );
    for (const f of ev.verdict.findings ?? []) {
      els.feed.append(feedRow("AUDITOR", "feed-note soft", `· ${f.detail}`));
    }
  }
}

// ── brief rendering ─────────────────────────────────────────────────────

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function devCard(d, uncertain, num, srcIndex) {
  const card = el("div", `dev-card${uncertain ? " uncertain" : ""}`);
  card.append(el("span", "dev-num", String(num).padStart(2, "0")));
  const head = el("p", "dev-head", d.headline);
  if (!uncertain && d.sourceUrls?.length) {
    // margin citation markers [n] link into the numbered source list
    for (const u of d.sourceUrls) {
      const n = srcIndex.get(u);
      if (!n) continue;
      const cite = el("a", "cite", `[${n}]`);
      cite.href = `#src-${n}`;
      cite.title = u;
      head.append(cite);
    }
  }
  card.append(head, el("p", "dev-soft", d.summary));
  if (!uncertain) {
    const why = el("p", "dev-soft");
    why.append(el("b", "", "Why it matters: "), document.createTextNode(d.whyItMatters));
    card.append(why);
  }
  return card;
}

function citedUrls(record) {
  const { briefing: b, sources = [] } = record;
  const used = new Set((b.keyDevelopments ?? []).flatMap((d) => d.sourceUrls ?? []));
  return {
    cited: sources.filter((u) => used.has(u)),
    fetched: sources.filter((u) => !used.has(u)),
  };
}

function renderBrief(record) {
  const { briefing: b, uncertain = [], verdict, sources = [], request } = record;
  const { cited, fetched } = citedUrls(record);
  els.stamp.textContent = `${verdict?.pass ? "Source-traced" : "Repaired"} · grounding ${((verdict?.score ?? 0) * 100).toFixed(0)}%`;
  els.stamp.classList.toggle("pass", Boolean(verdict?.pass));
  els.meta.textContent = `${cited.length} cited · ${sources.length} fetched · 30-day window`;
  els.doc.replaceChildren();
  els.doc.append(els.stamp); // the stamp presses onto the sheet's top-right corner

  const mast = el("div", "brief-mast");
  mast.append(el("span", "mono-label", b.masthead));
  mast.append(el("span", "mono-label", new Date(record.ts).toLocaleDateString()));
  els.doc.append(mast, el("hr", "doc-rule-double"));
  els.doc.append(el("h2", "", b.headline));
  els.doc.append(el("p", "", b.situation));

  els.doc.append(el("hr", "doc-rule"));
  els.doc.append(el("span", "mono-label", "Key developments — last 30 days"));
  // [n] markers number the CITED list only — same order, same anchors
  const srcIndex = new Map(cited.map((u, i) => [u, i + 1]));
  b.keyDevelopments.forEach((d, i) => els.doc.append(devCard(d, false, i + 1, srcIndex)));

  if (uncertain.length) {
    const zone = el("div", "uncertain-zone");
    zone.append(el("span", "mono-label uncertain-label", "Uncertain — treat with caution (could not be source-traced)"));
    uncertain.forEach((d, i) => zone.append(devCard(d, true, b.keyDevelopments.length + i + 1, srcIndex)));
    els.doc.append(zone);
  }

  els.doc.append(el("hr", "doc-rule"));
  const cols = el("div", "brief-cols");
  const c1 = el("div");
  c1.append(el("span", "mono-label", "Discussion points"));
  const ul1 = el("ul");
  for (const p of b.discussionPoints) ul1.append(el("li", "", p));
  c1.append(ul1);
  const c2 = el("div");
  c2.append(el("span", "mono-label", "Open questions"));
  const ul2 = el("ul");
  for (const q of b.openQuestions) ul2.append(el("li", "", q));
  c2.append(ul2);
  cols.append(c1, c2);
  els.doc.append(cols);

  els.doc.append(el("hr", "doc-rule-double"));
  els.doc.append(el("span", "mono-label", `Cited sources (${cited.length})`));
  const ol = el("ol", "src-list");
  cited.forEach((u, i) => {
    const li = el("li");
    li.id = `src-${i + 1}`;
    const a = el("a", "", `${hostOf(u)} — ${u}`);
    a.href = u;
    a.target = "_blank";
    a.rel = "noreferrer";
    li.append(a);
    ol.append(li);
  });
  els.doc.append(ol);
  if (fetched.length) {
    const det = el("details", "src-extra");
    det.append(el("summary", "mono-label", `Also fetched, not used (${fetched.length})`));
    const ul = el("ul", "src-list");
    for (const u of fetched) {
      const li = el("li");
      const a = el("a", "", `${hostOf(u)} — ${u}`);
      a.href = u;
      a.target = "_blank";
      a.rel = "noreferrer";
      li.append(a);
      ul.append(li);
    }
    det.append(ul);
    els.doc.append(det);
  }
  if (verdict?.verdictLine) els.doc.append(el("p", "colophon", verdict.verdictLine));

  currentBrief = record;
  showScreen("brief");
}

function briefAsText(record) {
  const { briefing: b, uncertain = [], verdict, sources = [] } = record;
  const lines = [
    b.masthead,
    "=".repeat(40),
    b.headline,
    "",
    b.situation,
    "",
    "KEY DEVELOPMENTS — last 30 days",
  ];
  for (const d of b.keyDevelopments) {
    lines.push(`\n* ${d.headline}`, `  ${d.summary}`, `  Why it matters: ${d.whyItMatters}`, `  Sources: ${d.sourceUrls.join(", ")}`);
  }
  if (uncertain.length) {
    lines.push("", "UNCERTAIN — treat with caution (could not be source-traced)");
    for (const d of uncertain) lines.push(`\n* ${d.headline}`, `  ${d.summary}`);
  }
  lines.push("", "DISCUSSION POINTS");
  for (const p of b.discussionPoints) lines.push(`- ${p}`);
  lines.push("", "OPEN QUESTIONS");
  for (const q of b.openQuestions) lines.push(`- ${q}`);
  const { cited, fetched } = citedUrls(record);
  lines.push("", `CITED SOURCES (${cited.length})`, ...cited.map((u) => `- ${u}`));
  if (fetched.length) {
    lines.push("", `ALSO FETCHED, NOT USED (${fetched.length})`, ...fetched.map((u) => `- ${u}`));
  }
  if (verdict?.verdictLine) lines.push("", verdict.verdictLine);
  return lines.join("\n");
}

/** Prefill the form from an example — meeting time defaults to the next
 *  full hour so Knock is immediately valid. */
function prefillExample(subject, kind) {
  els.subject.value = subject;
  els.kind.value = kind;
  els.notes.value = "";
  if (!els.when.value) {
    const d = new Date(Date.now() + 3600_000);
    d.setMinutes(0, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    els.when.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
  }
  els.btnKnock.focus();
}

async function refreshLibrary() {
  try {
    const items = await listBriefs(anna);
    if (!items.length) {
      els.libraryCard.hidden = true;
      return;
    }
    els.libraryList.replaceChildren();
    for (const it of items) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "textlink";
      const date = it.ts ? new Date(it.ts).toLocaleDateString() : "";
      b.textContent = `${it.subject || "Brief"} — ${it.headline.slice(0, 80)}${date ? ` (${date})` : ""}`;
      b.onclick = async () => {
        try {
          const record = await storageGet(anna, it.key);
          if (record?.briefing?.headline) renderBrief(record);
        } catch { /* library entry unreadable — stay on the form */ }
      };
      li.append(b);
      els.libraryList.append(li);
    }
    els.libraryCard.hidden = false;
  } catch {
    els.libraryCard.hidden = true; // library never blocks the form
  }
}

async function refreshLastBrief() {
  try {
    const record = await readLastBrief(anna);
    if (record?.briefing?.headline) {
      lastBriefRecord = record;
      els.lastBriefLine.textContent = `“${record.briefing.headline}” — ${record.request?.subject ?? ""}`;
      els.lastBriefCard.hidden = false;
      return;
    }
  } catch { /* no last brief — fine */ }
  els.lastBriefCard.hidden = true;
}

boot();
