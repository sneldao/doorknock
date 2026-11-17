#!/usr/bin/env node
// Idempotent Bifrost bootstrap: registers the nebius provider key and a
// virtual key for the app, then prints the virtual key value.
//
// Env:
//   BIFROST_URL           gateway base URL, no trailing /v1  (default http://localhost:8080)
//   BIFROST_SETUP_TOKEN   management-api setup token (required)
//   NEBIUS_API_KEY        the provider key to register (required)
//   BRIEF_MODEL           e.g. nebius/nvidia/nemotron-3-super-120b-a12b (default)
//   VK_NAME               virtual key name (default doorknock-web)
//   GROUNDING_MODE        grounding-gate plugin mode: annotate | enforce
//                         (default annotate — enforce 422s rejected drafts)
//
// Also registers the grounding-gate .so plugin shipped in the custom
// gateway image (bifrost/Dockerfile). Non-fatal if unavailable — the app
// skips the layer when no verdict headers come back.
//
// Prints the virtual key value on stdout (last line). Safe to re-run.

const BASE = (process.env.BIFROST_URL || "http://localhost:8080").replace(/\/+$/, "");
const TOKEN = process.env.BIFROST_SETUP_TOKEN;
const PROVIDER_KEY = process.env.NEBIUS_API_KEY;
const MODEL = (process.env.BRIEF_MODEL || "nebius/nvidia/nemotron-3-super-120b-a12b").replace(/^nebius\//, "");
const VK_NAME = process.env.VK_NAME || "doorknock-web";

if (!TOKEN || !PROVIDER_KEY) {
  console.error("bootstrap-bifrost: BIFROST_SETUP_TOKEN and NEBIUS_API_KEY are required");
  process.exit(1);
}

const H = {
  "Content-Type": "application/json",
  "x-bifrost-setup-token": TOKEN,
};

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: H });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function ensureProviderKey() {
  const listed = await api("/api/providers/nebius/keys", { method: "GET" });
  if (listed.status === 404) {
    const created = await api("/api/providers", {
      method: "POST",
      body: JSON.stringify({ provider: "nebius" }),
    });
    if (created.status >= 300) console.log("provider create:", JSON.stringify(created.json).slice(0, 160));
  }
  const keys = listed.json?.keys ?? [];
  if (keys.length > 0) {
    console.log("bootstrap-bifrost: nebius provider key already present");
    return;
  }
  const added = await api("/api/providers/nebius/keys", {
    method: "POST",
    body: JSON.stringify({
      name: "nebius-primary",
      value: PROVIDER_KEY,
      models: [MODEL, "nvidia/Nemotron-3-Ultra-550b-a55b"],
      weight: 1.0,
    }),
  });
  if (added.status >= 300) {
    console.error("bootstrap-bifrost: failed to add provider key:", JSON.stringify(added.json).slice(0, 300));
    process.exit(1);
  }
  console.log("bootstrap-bifrost: registered nebius provider key");
}

async function ensureGroundingPlugin() {
  const listed = await api("/api/plugins", { method: "GET" });
  const plugins = Array.isArray(listed.json) ? listed.json : listed.json?.plugins ?? [];
  const existing = plugins.find((p) => p.name === "grounding-gate" || p.actualName === "grounding-gate");
  if (existing?.enabled) {
    console.log("bootstrap-bifrost: grounding-gate plugin already registered");
    return;
  }
  if (existing) {
    const updated = await api("/api/plugins/grounding-gate", {
      method: "PUT",
      body: JSON.stringify({ enabled: true, config: { mode: process.env.GROUNDING_MODE || "annotate" } }),
    });
    console.log(`bootstrap-bifrost: grounding-gate re-enable -> ${updated.status}`);
    return;
  }
  const created = await api("/api/plugins", {
    method: "POST",
    body: JSON.stringify({
      name: "grounding-gate",
      enabled: true,
      path: "/app/plugins/grounding-gate.so",
      config: { mode: process.env.GROUNDING_MODE || "annotate" },
    }),
  });
  if (created.status >= 300) {
    // Non-fatal: the app treats a missing plugin as "skip the layer".
    console.error("bootstrap-bifrost: grounding-gate registration failed:", JSON.stringify(created.json).slice(0, 300));
    return;
  }
  console.log("bootstrap-bifrost: registered grounding-gate plugin");
}

async function ensureVirtualKey() {
  const listed = await api("/api/governance/virtual-keys", { method: "GET" });
  const vks = Array.isArray(listed.json) ? listed.json : listed.json?.virtual_keys ?? [];
  const existing = vks.find((k) => k.name === VK_NAME);
  if (existing) {
    console.log(existing.value);
    return;
  }
  const created = await api("/api/governance/virtual-keys", {
    method: "POST",
    body: JSON.stringify({
      name: VK_NAME,
      provider_configs: [{ provider: "nebius", allowed_models: [MODEL], key_ids: ["*"] }],
    }),
  });
  const vk = created.json?.virtual_key;
  if (!vk) {
    console.error("bootstrap-bifrost: failed to create virtual key:", JSON.stringify(created.json).slice(0, 300));
    process.exit(1);
  }
  console.log("bootstrap-bifrost: created virtual key " + VK_NAME);
  console.log(vk.value);
}

await ensureProviderKey();
await ensureGroundingPlugin();
await ensureVirtualKey();
