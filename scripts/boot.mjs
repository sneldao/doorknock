#!/usr/bin/env node
// Render entrypoint: waits for the Bifrost gateway, provisions it
// idempotently (provider key + virtual key), then starts Next.
//
// Env:
//   BIFROST_URL            gateway base URL (no /v1) — from the pserv below
//   BIFROST_SETUP_TOKEN    management token for the gateway
//   NEBIUS_API_KEY         provider key to register inside the gateway
//   BRIEF_MODEL            e.g. nebius/nvidia/nemotron-3-super-120b-a12b

import { spawn, execSync } from "node:child_process";

const BIFROST_URL =
  process.env.BIFROST_URL ||
  `http://${process.env.BIFROST_HOST || "localhost"}:${process.env.BIFROST_PORT || "8080"}`;

async function waitForGateway(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BIFROST_URL}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error("Bifrost gateway did not become healthy in time");
    await new Promise((r) => setTimeout(r, 3000));
  }
}

await waitForGateway();

// Provision (idempotent) and capture the virtual key — last stdout line.
const vkValue = execSync(`node scripts/bootstrap-bifrost.mjs`, {
  env: { ...process.env, BIFROST_URL },
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .pop()
  .trim();

if (!vkValue.startsWith("sk-bf-")) {
  throw new Error("bootstrap-bifrost did not return a virtual key value");
}

process.env.BIFROST_BASE_URL = `${BIFROST_URL}/v1`;
process.env.BIFROST_API_KEY = vkValue;
console.log("boot: gateway ready, virtual key in hand — starting Next");

const child = spawn("npx", ["next", "start"], {
  stdio: "inherit",
  env: process.env,
});
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code) => process.exit(code ?? 0));
