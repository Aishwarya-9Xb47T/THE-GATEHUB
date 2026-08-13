/**
 * V6 — Unified LLM completion across OpenAI, Anthropic Claude, and Google Gemini.
 */
import OpenAI from "openai";
import { getOpenAi } from "./openaiClient.js";
import type { ArchitectPhase } from "./architectModels.js";
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
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(json ? { response_format: { type: "json_object" as const } } : {}),
    temperature,
    max_tokens: maxTokens,
  });
  return res.choices[0]?.message?.content ?? null;
}

async function callAnthropic(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
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
  maxTokens: number,
  temperature: number
): Promise<string | null> {
  const key = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

export async function architectCompletion(opts: ArchitectCompletionOptions): Promise<string | null> {
  const route = getArchitectModelRoute(opts.phase);
  const maxTokens = opts.maxTokens ?? 4000;
  const temperature = opts.temperature ?? 0.4;
  const json = opts.json ?? true;

  try {
    switch (route.family) {
      case "anthropic": {
        const raw = await callAnthropic(route.model, opts.system, opts.user, maxTokens, temperature);
        if (raw) return raw;
        break;
      }
      case "google": {
        const raw = await callGemini(route.model, opts.system, opts.user, maxTokens, temperature);
        if (raw) return raw;
        break;
      }
      default:
        break;
    }
    return await callOpenAI(route.model, opts.system, opts.user, json, maxTokens, temperature);
  } catch (err) {
    console.error(`[ArchitectLLM] ${opts.phase} failed (${route.family}/${route.model}):`, err);
    if (isQuotaOrAuthError(err)) {
      architectAiDegraded = true;
    }
    if (route.family !== "openai") {
      try {
        return await callOpenAI(
          process.env.AI_ARCHITECT_OPENAI_MODEL || "gpt-4o-mini",
          opts.system,
          opts.user,
          json,
          maxTokens,
          temperature
        );
      } catch (fallbackErr) {
        console.error(`[ArchitectLLM] ${opts.phase} OpenAI fallback failed:`, fallbackErr);
        if (isQuotaOrAuthError(fallbackErr)) {
          architectAiDegraded = true;
        }
        return null;
      }
    }
    return null;
  }
}

export async function architectCompletionJSON<T>(opts: ArchitectCompletionOptions): Promise<T | null> {
  const raw = await architectCompletion({ ...opts, json: true });
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
