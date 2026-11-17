import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type JSONValue } from "ai";
import { z } from "zod";

// Every model call in Doorknock routes through the Bifrost gateway — the
// app never talks to a provider directly. Bifrost speaks OpenAI-compatible,
// so the switch is one base URL (BIFROST_BASE_URL). A direct OpenAI-
// compatible endpoint (LLM_BASE_URL) is supported for bare dev runs only.

export interface LlmConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export function llmConfig(): LlmConfig | null {
  const gateway = process.env.BIFROST_BASE_URL?.trim();
  if (gateway) {
    return {
      baseUrl: gateway.replace(/\/+$/, ""),
      apiKey: process.env.BIFROST_API_KEY?.trim() || "bifrost", // no-auth local gateway accepts anything
      model: process.env.BRIEF_MODEL?.trim() || "nebius/nvidia/nemotron-3-super-120b-a12b",
    };
  }
  const direct = process.env.LLM_BASE_URL?.trim();
  if (direct && process.env.LLM_API_KEY?.trim()) {
    return {
      baseUrl: direct.replace(/\/+$/, ""),
      apiKey: process.env.LLM_API_KEY!.trim(),
      model: process.env.BRIEF_MODEL?.trim() || "nvidia/nemotron-3-super-120b-a12b",
    };
  }
  return null;
}

export function llmEnabled(): boolean {
  return llmConfig() !== null;
}

let cached: { url: string; model: ReturnType<ReturnType<typeof createOpenAICompatible>> } | null = null;

function resolveModel() {
  const cfg = llmConfig();
  if (!cfg) throw new Error("No LLM configured — set BIFROST_BASE_URL (Bifrost gateway) or LLM_BASE_URL");
  if (!cached || cached.url !== cfg.baseUrl) {
    const compat = createOpenAICompatible({
      name: "bifrost",
      baseURL: cfg.baseUrl,
      apiKey: cfg.apiKey,
    });
    cached = { url: cfg.baseUrl, model: compat(cfg.model) };
  }
  return cached.model;
}

// JSON I/O over plain chat. We describe the exact shape in the instructions
// and validate with zod ourselves — the lowest common denominator across
// OpenAI-compatible providers and gateways, and immune to provider-specific
// structured-output quirks.

function schemaSpec(schema: z.ZodType): string {
  const json = z.toJSONSchema(schema, { io: "input", target: "draft-7" });
  const rest = { ...(json as Record<string, unknown>) };
  delete rest.$schema;
  return JSON.stringify(rest);
}

function extractJson(text: string): string {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    // fall through to brace matching
  }
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) return stripped.slice(start, end + 1);
  throw new Error("Model reply contained no JSON object");
}

export async function askObject<SCHEMA extends z.ZodType>(
  schema: SCHEMA,
  prompt: string,
  opts: {
    maxRetries?: number;
    // Extra request headers (e.g. the grounding-gate ref) and a peek at the
    // response headers — the gateway plugin's verdict rides them.
    headers?: Record<string, string>;
    // Merged into the request body's top level by the openai-compatible
    // provider — this is how the grounding-gate transcript reaches the
    // gateway plugin inside the chat call it audits.
    providerOptions?: Record<string, Record<string, JSONValue>>;
    onResponseHeaders?: (headers: Record<string, string>) => void;
  } = {},
): Promise<z.infer<SCHEMA>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= (opts.maxRetries ?? 2); attempt++) {
    try {
      const result = await generateText({
        model: resolveModel(),
        temperature: 0.4,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(180_000),
        headers: opts.headers,
        providerOptions: opts.providerOptions,
        instructions:
          "You are a precise research analyst. Reply with a single JSON object and nothing else — no markdown fences, no commentary, no fields beyond the required shape. Match this exact JSON shape (types, array lengths, required keys):\n" +
          schemaSpec(schema),
        prompt,
      });
      if (result.response.headers) opts.onResponseHeaders?.(result.response.headers);
      const parsed = schema.safeParse(JSON.parse(extractJson(result.text)));
      if (!parsed.success) {
        throw new Error(
          "Schema mismatch: " +
            parsed.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("; "),
        );
      }
      return parsed.data as z.infer<SCHEMA>;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("model call failed");
}
