/**
 * LLM Gateway — provider-abstracted chat completion with forced JSON output.
 *
 * Works with any OpenAI-compatible provider. Tested: Groq, Cerebras.
 *   LLM_BASE_URL   https://api.groq.com/openai/v1 (default) | https://api.cerebras.ai/v1
 *   LLM_MODEL      e.g. openai/gpt-oss-120b (Groq) | gpt-oss-120b (Cerebras)
 *   Keys: LLM_API_KEY wins; else the key matching the base URL
 *         (GROQ_API_KEY / CEREBRAS_API_KEY).
 */

import { recordUsage } from "./usage";

export interface LlmUsage {
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface LlmJsonResult<T = unknown> {
  data: T;
  usage: LlmUsage;
}

const BASE_URL =
  process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
const MODEL = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";
// Groq free tier caps prompt+max_tokens per minute (8k TPM on gpt-oss-120b),
// so budget the completion against the estimated prompt size up front.
// Too small a completion budget makes JSON generation fail mid-document.
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 4500);
const TPM_LIMIT = Number(process.env.LLM_TPM_LIMIT ?? 8000);
// Observed A–G reports need ~2300-2600 completion tokens, plus gpt-oss
// reasoning overhead. Below this the model hits the cap mid-JSON and Groq
// returns 400 json_validate_failed. Callers trim their inputs so that
// prompt + this floor fits the TPM window.
const MIN_COMPLETION = 3000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

const IS_CEREBRAS = BASE_URL.includes("cerebras");

function apiKey(): string {
  // Explicit override first, then the key that matches the active base URL —
  // never send one provider's key to another.
  const key =
    process.env.LLM_API_KEY ||
    (IS_CEREBRAS ? process.env.CEREBRAS_API_KEY : process.env.GROQ_API_KEY);
  if (!key) {
    throw new Error(
      `Missing API key for ${BASE_URL} — set ${IS_CEREBRAS ? "CEREBRAS_API_KEY" : "GROQ_API_KEY"} (or LLM_API_KEY) in web/.env.local`
    );
  }
  return key;
}

interface ChatOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

async function chatCompletion(opts: ChatOptions): Promise<{
  content: string;
  usage: LlmUsage;
}> {
  const promptEstimate = estimateTokens(opts.system) + estimateTokens(opts.user);
  let maxTokens = Math.max(
    MIN_COMPLETION,
    Math.min(opts.maxTokens ?? MAX_TOKENS, TPM_LIMIT - promptEstimate - 250)
  );
  let rateLimitWaits = 0;
  let res: Response;

  for (;;) {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: opts.temperature ?? 0.3,
        // Cerebras only accepts the newer OpenAI parameter name.
        ...(IS_CEREBRAS
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
        response_format: { type: "json_object" },
        // Reasoning tokens count against the completion budget on gpt-oss
        // models; keep them minimal so the budget goes to the report itself.
        ...(MODEL.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      }),
    });

    // 413 = prompt + max_tokens exceeds the tier's TPM window; shrink once,
    // but never below the floor where JSON generation gets truncated.
    if (res.status === 413 && maxTokens > MIN_COMPLETION) {
      maxTokens = MIN_COMPLETION;
      continue;
    }
    // 429 = TPM/RPM rate limit; wait what the API asks for (capped) and retry.
    if (res.status === 429 && rateLimitWaits < 2) {
      rateLimitWaits++;
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitSec = Math.min(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter + 1 : 20,
        70
      );
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }
    break;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? "";
  return {
    content,
    usage: {
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
      model: json.model ?? MODEL,
    },
  };
}

/**
 * Run a chat completion that must return JSON parseable by `parse`.
 * Retries once, feeding the validation error back to the model.
 */
export async function chatJSON<T>(
  opts: ChatOptions,
  parse: (raw: unknown) => T
): Promise<LlmJsonResult<T>> {
  let lastError = "";
  const totalUsage: LlmUsage = { tokensIn: 0, tokensOut: 0, model: MODEL };

  for (let attempt = 0; attempt < 2; attempt++) {
    const userMsg =
      attempt === 0
        ? opts.user
        : `${opts.user}\n\nYour previous response failed validation with this error — fix it and return ONLY valid JSON:\n${lastError}`;

    let content: string;
    let usage: LlmUsage;
    try {
      ({ content, usage } = await chatCompletion({ ...opts, user: userMsg }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Model ran out of completion budget mid-JSON — retry once demanding
      // a much more compact response instead of failing outright.
      if (attempt === 0 && msg.includes("json_validate_failed")) {
        lastError =
          "Your previous response ran out of tokens before the JSON was complete. Produce a MUCH more compact response: every field shorter, terse tables, minimal prose, no filler. The JSON must close properly.";
        continue;
      }
      throw e;
    }
    totalUsage.tokensIn += usage.tokensIn;
    totalUsage.tokensOut += usage.tokensOut;
    totalUsage.model = usage.model;

    try {
      const raw = JSON.parse(content);
      const data = parse(raw);
      // Meter token spend against the active request scope (best-effort;
      // no-op outside an attributed scope). Records the cumulative usage
      // across retries as one logical call.
      await recordUsage(totalUsage);
      return { data, usage: totalUsage };
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 1500) : String(e);
    }
  }

  throw new Error(`LLM returned invalid JSON after retry: ${lastError}`);
}
