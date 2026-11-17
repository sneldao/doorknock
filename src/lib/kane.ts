import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KaneVerdict } from "./types";

// Kane CLI — the verification layer. The crew drafts; Kane watches a real
// browser and returns pass/fail as structured NDJSON (run_end is the only
// stable event). Server-side only: needs kane-cli + Chrome on the host.
// KANE_VERIFY=off disables; KANE_CLI_BIN overrides the binary path;
// KANE_CHROME_PROFILE overrides the dedicated Chrome user-data-dir (a
// separate profile is required — Chrome refuses CDP on the default one).

const KANE_BIN = process.env.KANE_CLI_BIN?.trim() || "kane-cli";
const DEFAULT_TIMEOUT_SEC = 300;
const MAX_RUN_SEC = 420;

export function kaneEnabled(): boolean {
  return process.env.KANE_VERIFY !== "off";
}

// kaneEnabled() only checks config — Render has no kane-cli, so probe the
// binary once and cache it. Auto-verify and /api/verify key off this so a
// deploy without Kane degrades quietly instead of erroring on every brief.
let availability: Promise<boolean> | null = null;
export function kaneAvailable(): Promise<boolean> {
  availability ??= new Promise((resolve) => {
    const child = spawn(KANE_BIN, ["--version"], { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 10_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
  return availability;
}

function chromeProfileDir(): string {
  return (
    process.env.KANE_CHROME_PROFILE?.trim() ||
    path.join(os.homedir(), ".doorknock", "kane-chrome-profile")
  );
}

function policyFile(): string {
  // KANE_POLICY set (even empty) overrides; unset uses the repo policy.
  const v = process.env.KANE_POLICY;
  if (v !== undefined) return v.trim();
  return path.join(process.cwd(), "kane", "policy.yaml");
}

interface VerdictPolicyEntry {
  id?: string;
  result?: string;
  failed_gate_ids?: string[];
  errored_gate_ids?: string[];
  counts?: { warned?: number };
}

interface VerdictDoc {
  policies?: VerdictPolicyEntry[];
  verdicts?: { warnings?: { id?: string; message?: string }[]; failed_gates?: { id?: string }[] }[];
}

/** Judge the run's sealed evidence pack against kane/policy.yaml.
 *  Returns undefined when there's no pack or the policy file is absent —
 *  policy judgement is additive, never a reason to fail the verify. */
async function judgePack(sessionDir: string | undefined): Promise<KaneVerdict["policy"]> {
  const policyPath = policyFile();
  if (!sessionDir || !fs.existsSync(policyPath)) return undefined;
  const evidenceDir = path.join(sessionDir, "evidence");
  let packs: string[] = [];
  try {
    packs = fs
      .readdirSync(evidenceDir, { withFileTypes: true })
      .filter((d) => d.name.endsWith(".evidence"))
      .map((d) => path.join(evidenceDir, d.name));
  } catch {
    return undefined;
  }
  if (packs.length === 0) return undefined;
  // A named run reuses one session dir across attempts — judge the newest pack.
  packs.sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
  );
  const pack = packs[0];

  const out = await new Promise<string | null>((resolve) => {
    const child = spawn(KANE_BIN, ["evidence", "verdict", pack, "--policy", policyPath, "--json"], {
      env: { ...process.env, KANE_CLI_USER_AGENT: "doorknock" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let buf = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, 60_000);
    child.stdout.on("data", (c: Buffer) => (buf += c.toString("utf8")));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(buf.trim() || null);
    });
  });
  if (!out) return undefined;
  try {
    const doc = JSON.parse(out) as VerdictDoc;
    const p = doc.policies?.[0];
    if (!p?.id || !p.result) return undefined;
    const verdictDoc = doc.verdicts?.[0];
    return {
      id: p.id,
      result: p.result === "pass" || p.result === "fail" ? p.result : "errored",
      failedGates: p.failed_gate_ids ?? verdictDoc?.failed_gates?.map((g) => g.id ?? "").filter(Boolean) ?? [],
      warnings: verdictDoc?.warnings?.map((w) => w.message ?? w.id ?? "").filter(Boolean) ?? [],
    };
  } catch {
    return undefined;
  }
}

interface RunEnd {
  status?: string;
  summary?: string;
  one_liner?: string;
  duration?: number;
  credits_consumed?: number;
  test_url?: string;
  session_dir?: string;
  reason?: string;
}

/** Run one Kane objective against a URL. Resolves with a KaneVerdict —
 *  never throws for run failures (status "failed"/"error" carries them). */
export async function kaneVerify(
  url: string,
  objective: string,
  opts: { timeoutSec?: number; name?: string; onProgress?: (remark: string) => void } = {},
): Promise<KaneVerdict> {
  const timeoutSec = Math.min(opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC, MAX_RUN_SEC);
  const args = [
    "run",
    objective,
    "--agent",
    "--headless",
    "--timeout",
    String(timeoutSec),
    "--chrome-profile",
    chromeProfileDir(),
  ];
  // A stable --name makes every verify land in Test Manager under the same
  // test case and writes a replayable _test.md + recordings locally.
  if (opts.name) args.push("--name", opts.name);

  return await new Promise<KaneVerdict>((resolve) => {
    // turbopackIgnore: this route legitimately shells out to kane-cli on the
    // host — the binary path is env-configurable, not a build-time asset.
    const child = spawn(/*turbopackIgnore: true*/ KANE_BIN, args, {
      env: { ...process.env, KANE_CLI_USER_AGENT: "doorknock" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let runEnd: RunEnd | null = null;
    let stderrTail = "";
    let settled = false;

    const finish = (v: KaneVerdict) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve(v);
    };

    const killTimer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        status: "error",
        summary: `Kane run exceeded ${timeoutSec}s and was killed.`,
        durationSec: timeoutSec,
        reason: "timeout",
      });
    }, (timeoutSec + 30) * 1000);

    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(t);
        } catch {
          continue;
        }
        if (ev.type === "run_end") {
          runEnd = ev as RunEnd;
        } else if (typeof ev.step === "number" && typeof ev.remark === "string") {
          if (ev.status === "failed") opts.onProgress?.(`step ${ev.step} failed: ${ev.remark}`);
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString("utf8")).slice(-2000);
    });

    child.on("error", (err) => {
      finish({
        status: "error",
        summary: `Could not launch kane-cli: ${err.message}`,
        durationSec: 0,
        reason: "spawn",
      });
    });

    child.on("close", () => {
      if (runEnd) {
        // The run ended — the kill timer must not fire while we judge the pack.
        clearTimeout(killTimer);
        const status =
          runEnd.status === "passed" ? "passed" : runEnd.status === "failed" ? "failed" : "error";
        const base: KaneVerdict = {
          status,
          summary: runEnd.summary ?? runEnd.one_liner ?? "No summary returned.",
          oneLiner: runEnd.one_liner,
          durationSec: Math.round(runEnd.duration ?? 0),
          credits: runEnd.credits_consumed,
          testUrl: runEnd.test_url,
          sessionDir: runEnd.session_dir,
          reason: runEnd.reason,
        };
        // Judge the sealed evidence pack against kane/policy.yaml — the
        // verdict certifies the evidence, not just the run's pass/fail.
        void judgePack(runEnd.session_dir).then((policy) => finish({ ...base, policy }));
        return;
      }
      const tail = stderrTail.trim().split("\n").slice(-3).join(" · ");
      finish({
        status: "error",
        summary: tail || "Kane run ended without a verdict.",
        durationSec: 0,
        reason: "no_run_end",
      });
    });
  });
}

/** The standing objective PROOF uses to audit a rendered brief. Kept
 *  concrete: Kane fails naming exactly what is missing or wrong. */
export function briefVerificationObjective(url: string): string {
  return [
    `Go to ${url} and verify this pre-meeting briefing document renders completely and correctly.`,
    `Check ALL of the following:`,
    `- a masthead line and a headline are visible at the top of the document`,
    `- a "Key developments" section lists at least one development, and EVERY development shown displays at least one source link`,
    `- "Discussion points" and "Open questions" sections are present and populated with items`,
    `- a "Sources" section at the bottom lists numbered source links`,
    `- if an "Uncertain" section appears, it is clearly labeled as something to treat with caution`,
    `Report pass only if every check holds. Otherwise fail, naming exactly what is missing, empty, or wrong.`,
  ].join("\n");
}
