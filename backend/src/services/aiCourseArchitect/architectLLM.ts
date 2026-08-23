/**
 * V6 — Unified LLM completion across OpenAI, Anthropic Claude, and Google Gemini.
 */
import OpenAI from "openai";
import { getAnthropicApiKey, getOpenAi, architectAiProviderStatus } from "./openaiClient.js";
import { callGeminiGenerateContent, GeminiRequestError } from "./geminiClient.js";
import type { ArchitectPhase, ModelFamily } from "./architectModels.js";
import { getArchitectModelRoute } from "./architectModels.js";


let architectAiDegraded = false;

export function resetArchitectAiDegraded(): void {
  architectAiDegraded = false;
}

export function isArchitectAiDegraded(): boolean {
  return architectAiDegraded;
}

export function isArchitectAiQuotaError(err: unknown): boolean {
  return isQuotaOrAuthError(err);
}

function isQuotaOrAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { status?: number; code?: string; type?: string };
  if (rec.status === 401 || rec.status === 403) return true;
  if (rec.status === 429) return true;
  const code = String(rec.code || rec.type || "").toLowerCase();
  return code.includes("quota") || code.includes("insufficient") || code.includes("billing");
}

export interface ArchitectCompletionOptions {
  phase: ArchitectPhase;
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/** Keep each LLM hop well under Render's ~100s HTTP timeout so planning can fall back. */
const OPENAI_PLANNING_TIMEOUT_MS = 20_000;

async function callOpenAI(
  model: string,
  system: string,
  user: string,
  json: boolean,
  maxTokens: number,
  temperature: number
): Promise<string | null> {
  const client = getOpenAi();
  if (!client) return null;
  const res = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" as const } } : {}),
      temperature,
      max_tokens: maxTokens,
    },
    { timeout: OPENAI_PLANNING_TIMEOUT_MS, signal: AbortSignal.timeout(OPENAI_PLANNING_TIMEOUT_MS) }
  );
  return res.choices[0]?.message?.content ?? null;
}

async function callAnthropic(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number
): Promise<string | null> {
  const key = getAnthropicApiKey();
  if (!key) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const block = data.content?.find((c) => c.type === "text");
  return block?.text ?? null;
}

async function callGemini(
  model: string,
  system: string,
  user: string,
  json: boolean,
  maxTokens: number,
  temperature: number
): Promise<string> {
  return callGeminiGenerateContent({
    preferredModel: model,
    system,
    user,
    json,
    maxTokens,
    temperature,
  });
}

async function completeWithFamily(
  family: ModelFamily,
  model: string,
  system: string,
  user: string,
  json: boolean,
  maxTokens: number,
  temperature: number
): Promise<string | null> {
  if (family === "anthropic") return callAnthropic(model, system, user, maxTokens, temperature);
  if (family === "google") return callGemini(model, system, user, json, maxTokens, temperature);
  return callOpenAI(model, system, user, json, maxTokens, temperature);
}

export async function architectCompletion(opts: ArchitectCompletionOptions): Promise<string | null> {
  const route = getArchitectModelRoute(opts.phase);
  const maxTokens = opts.maxTokens ?? 4000;
  const temperature = opts.temperature ?? 0.4;
  const json = opts.json ?? true;
  const status = architectAiProviderStatus();

  const candidates: Array<{ family: ModelFamily; model: string }> = [{ family: route.family, model: route.model }];
  const add = (family: ModelFamily, model: string) => {
    if (!candidates.some((c) => c.family === family)) candidates.push({ family, model });
  };
  if (status.openai) add("openai", process.env.AI_ARCHITECT_OPENAI_MODEL || "gpt-4o-mini");
  if (status.anthropic) add("anthropic", process.env.AI_ARCHITECT_ANTHROPIC_MODEL || "claude-sonnet-4-20250514");
  if (status.gemini) add("google", process.env.AI_ARCHITECT_GEMINI_MODEL || "gemini-3.5-flash-lite");

  let lastError: unknown;
  for (const candidate of candidates) {
    const configured =
      candidate.family === "openai" ? status.openai : candidate.family === "anthropic" ? status.anthropic : status.gemini;
    if (!configured) continue;
    try {
      const raw = await completeWithFamily(
        candidate.family,
        candidate.model,
        opts.system,
        opts.user,
        json,
        maxTokens,
        temperature
      );
      if (raw) {
        console.info("[ArchitectLLM] completion", {
          phase: opts.phase,
          family: candidate.family,
          model: candidate.model,
        });
        return raw;
      }
    } catch (err) {
      lastError = err;
      console.error(`[ArchitectLLM] ${opts.phase} failed (${candidate.family}/${candidate.model}):`, {
        message: err instanceof Error ? err.message : String(err),
        status: err instanceof GeminiRequestError ? err.status : undefined,
        code: err instanceof GeminiRequestError ? err.code : undefined,
      });
      if (isQuotaOrAuthError(err) || (err instanceof GeminiRequestError && err.status === 429)) {
        architectAiDegraded = true;
      }
    }
  }

  if (lastError instanceof GeminiRequestError) throw lastError;
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(
    `No AI provider produced output for phase ${opts.phase} (openai=${status.openai} anthropic=${status.anthropic} gemini=${status.gemini})`
  );
}

export async function architectCompletionJSON<T>(opts: ArchitectCompletionOptions): Promise<T | null> {
  const raw = await architectCompletion({ ...opts, json: true });
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error("[ArchitectLLM] JSON parse failed", {
      phase: opts.phase,
      responseLength: raw.length,
      preview: raw.slice(0, 180),
    });
    throw new Error(
      `Architect LLM JSON parsing failed for phase ${opts.phase}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
