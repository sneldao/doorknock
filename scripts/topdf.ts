// Print an HTML file to PDF via CDP with preferCSSPageSize (bun WebSocket).
// Usage: bun scripts/topdf.ts <input-html> <output-pdf>

import { resolve } from "node:path";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error("usage: bun scripts/topdf.ts <input.html> <output.pdf>");
  process.exit(1);
}
const input = `file://${resolve(inputArg)}`;
const output = resolve(outputArg);

const BIN =
  "/Users/udingethe/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell";

const proc = Bun.spawn([BIN, "--remote-debugging-port=0", "--headless", "about:blank"], {
  stdout: "pipe",
  stderr: "pipe",
});

let browserWs = "";
for await (const chunk of proc.stderr) {
  const m = new TextDecoder().decode(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
  if (m) {
    browserWs = m[1];
    break;
  }
}
if (!browserWs) {
  console.error("no DevTools endpoint");
  proc.kill();
  process.exit(1);
}
const port = new URL(browserWs).port;

// list targets → page-level ws endpoint
let pageWs = "";
for (let i = 0; i < 50 && !pageWs; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = (await res.json()) as { webSocketDebuggerUrl?: string; type?: string }[];
    pageWs = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
  } catch {
    // retry
  }
  if (!pageWs) await new Promise((r) => setTimeout(r, 200));
}
if (!pageWs) {
  console.error("no page target");
  proc.kill();
  process.exit(1);
}

const ws = new WebSocket(pageWs);
await new Promise((r, s) => {
  ws.onopen = r;
  ws.onerror = s;
});

let id = 0;
const pending = new Map<number, (v: Record<string, unknown>) => void>();
ws.onmessage = (ev) => {
  const data = JSON.parse(String(ev.data));
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)!(data);
    pending.delete(data.id);
  }
};
function send(method: string, params: Record<string, unknown> = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise<Record<string, unknown>>((resolve) => pending.set(msgId, resolve));
}

const nav = await send("Page.navigate", { url: input });
if ((nav as { errorText?: string }).errorText) {
  console.error("navigate failed:", nav);
  proc.kill();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 1500));

const res = (await send("Page.printToPDF", {
  paperWidth: 1280 / 96,
  paperHeight: 720 / 96,
  printBackground: true,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
  scale: 1,
})) as { result?: { data?: string }; error?: { message: string } };
const data = res.result?.data;
if (!data) {
  console.error("printToPDF failed:", res.error ?? res);
  proc.kill();
  process.exit(1);
}
await Bun.write(output, Buffer.from(data, "base64"));
console.log("wrote", output);
ws.close();
proc.kill();
