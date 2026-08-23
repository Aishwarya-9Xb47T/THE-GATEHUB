/**
 * Gemini REST client for AI Course Architect.
 * Uses the existing generativelanguage.googleapis.com generateContent API.
 * Never logs API keys.
 */
import { getGeminiApiKey } from "./openaiClient.js";

/** Current free-tier Gemini API models. gemini-2.0-flash was shut down 2026-06-01. */
export const GEMINI_FREE_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
] as const;

export const DEFAULT_GEMINI_MODEL = GEMINI_FREE_MODELS[0];

export class GeminiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly geminiStatus?: string;
  readonly model: string;
  readonly retryable: boolean;
  readonly finishReason?: string;

  constructor(opts: {
    message: string;
    status: number;
    code?: string;
    geminiStatus?: string;
    model: string;
    retryable?: boolean;
    finishReason?: string;
  }) {
    super(opts.message);
    this.name = "GeminiRequestError";
    this.status = opts.status;
    this.code = opts.code;
    this.geminiStatus = opts.geminiStatus;
    this.model = opts.model;
    this.retryable = opts.retryable ?? (opts.status === 429 || opts.status >= 500);
    this.finishReason = opts.finishReason;
  }
}

export function architectGeminiModels(preferred?: string): string[] {
  const envModel = process.env.AI_ARCHITECT_GEMINI_MODEL?.trim();
  const ordered = [preferred, envModel, ...GEMINI_FREE_MODELS].filter(
    (m): m is string => Boolean(m)
  );
  return [...new Set(ordered)];
}

type GeminiPart = { text?: string; thought?: boolean };
type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
};
type GeminiResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  error?: { code?: number; message?: string; status?: string };
};

export function extractGeminiText(data: GeminiResponse): {
  text: string;
  finishReason?: string;
  candidateCount: number;
  partCount: number;
  blocked?: string;
} {
  const blocked = data.promptFeedback?.blockReason || data.promptFeedback?.blockReasonMessage;
  const candidates = data.candidates || [];
  const candidate = candidates[0];
  const parts = candidate?.content?.parts || [];
  const text = parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text as string)
    .join("");
  return {
    text,
    finishReason: candidate?.finishReason,
    candidateCount: candidates.length,
    partCount: parts.length,
    blocked,
  };
}

export function parseGeminiErrorBody(
  status: number,
  body: unknown,
  model: string
): GeminiRequestError {
  const rec = body && typeof body === "object" ? (body as GeminiResponse) : {};
  const apiError = rec.error;
  const message =
    apiError?.message ||
    (typeof body === "string" && body.trim() ? body.slice(0, 300) : `Gemini HTTP ${status}`);
  const code = apiError?.status || (apiError?.code != null ? String(apiError.code) : undefined);
  return new GeminiRequestError({
    message: `Gemini blueprint generation failed: status=${status} code=${code || "none"} message=${message}`,
    status,
    code,
    geminiStatus: apiError?.status,
    model,
    retryable: status === 429 || status >= 500,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isModelNotFound(err: GeminiRequestError): boolean {
  const blob = `${err.code || ""} ${err.geminiStatus || ""} ${err.message}`.toLowerCase();
  return err.status === 404 || blob.includes("not found") || blob.includes("is not found");
}

async function generateOnce(opts: {
  model: string;
  system: string;
  user: string;
  json: boolean;
  maxTokens: number;
  temperature: number;
  disableThinking: boolean;
}): Promise<string> {
  const key = getGeminiApiKey();
  if (!key) {
    throw new GeminiRequestError({
      message: "Gemini blueprint generation failed: status=503 code=NOT_CONFIGURED message=GOOGLE_GEMINI_API_KEY missing",
      status: 503,
      code: "NOT_CONFIGURED",
      model: opts.model,
      retryable: false,
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature,
    maxOutputTokens: Math.max(opts.maxTokens, 8192),
  };
  if (opts.json) generationConfig.responseMimeType = "application/json";
  if (opts.disableThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  console.info("[ArchitectLLM][Gemini] request started", {
    sdk: "REST generativelanguage.googleapis.com/v1beta generateContent",
    model: opts.model,
    json: opts.json,
    maxOutputTokens: generationConfig.maxOutputTokens,
    disableThinking: opts.disableThinking,
    systemChars: opts.system.length,
    userChars: opts.user.length,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig,
    }),
    signal: AbortSignal.timeout(55_000),
  });

  const rawText = await res.text();
  let data: GeminiResponse = {};
  try {
    data = rawText ? (JSON.parse(rawText) as GeminiResponse) : {};
  } catch {
    if (!res.ok) {
      throw parseGeminiErrorBody(res.status, rawText.slice(0, 300), opts.model);
    }
    throw new GeminiRequestError({
      message: `Gemini blueprint generation failed: status=${res.status} code=INVALID_JSON message=Response was not JSON`,
      status: res.status,
      code: "INVALID_JSON",
      model: opts.model,
    });
  }

  if (!res.ok) {
    console.warn("[ArchitectLLM][Gemini] HTTP error", {
      model: opts.model,
      status: res.status,
      code: data.error?.status || data.error?.code,
      message: data.error?.message?.slice(0, 240),
    });
    throw parseGeminiErrorBody(res.status, data, opts.model);
  }

  const extracted = extractGeminiText(data);
  console.info("[ArchitectLLM][Gemini] response", {
    model: opts.model,
    status: res.status,
    candidateCount: extracted.candidateCount,
    partCount: extracted.partCount,
    finishReason: extracted.finishReason || null,
    blocked: extracted.blocked || null,
    hasText: Boolean(extracted.text),
    responseLength: extracted.text.length,
  });

  if (extracted.blocked) {
    throw new GeminiRequestError({
      message: `Gemini blueprint generation failed: status=200 code=BLOCKED message=${extracted.blocked}`,
      status: 400,
      code: "BLOCKED",
      model: opts.model,
      retryable: false,
      finishReason: extracted.finishReason,
    });
  }

  if (!extracted.text.trim()) {
    throw new GeminiRequestError({
      message: `Gemini blueprint generation failed: status=200 code=EMPTY_CANDIDATE finishReason=${extracted.finishReason || "none"} message=No text in Gemini candidates`,
      status: 502,
      code: "EMPTY_CANDIDATE",
      model: opts.model,
      retryable: extracted.finishReason === "MAX_TOKENS" || extracted.finishReason === "OTHER",
      finishReason: extracted.finishReason,
    });
  }

  return extracted.text;
}

export async function callGeminiGenerateContent(opts: {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  preferredModel?: string;
}): Promise<string> {
  const models = architectGeminiModels(opts.preferredModel);
  const json = opts.json ?? true;
  const maxTokens = opts.maxTokens ?? 4000;
  const temperature = opts.temperature ?? 0.4;
  let lastError: GeminiRequestError | undefined;

  for (const model of models) {
    let disableThinking = true;
    let jsonMode = json;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await generateOnce({
          model,
          system: opts.system,
          user: opts.user,
          json: jsonMode,
          maxTokens: attempt === 0 ? maxTokens : Math.max(maxTokens, 16384),
          temperature,
          disableThinking,
        });
      } catch (err) {
        const geminiErr =
          err instanceof GeminiRequestError
            ? err
            : new GeminiRequestError({
                message: `Gemini blueprint generation failed: status=500 code=EXCEPTION message=${err instanceof Error ? err.message : String(err)}`,
                status: 500,
                code: "EXCEPTION",
                model,
              });
        lastError = geminiErr;
        console.error("[ArchitectLLM][Gemini] call failed", {
          model,
          attempt: attempt + 1,
          status: geminiErr.status,
          code: geminiErr.code,
          finishReason: geminiErr.finishReason || null,
          message: geminiErr.message.slice(0, 240),
        });

        const blob = geminiErr.message.toLowerCase();
        if (geminiErr.status === 401 || geminiErr.status === 403) {
          throw geminiErr;
        }
        if (geminiErr.status === 400 && disableThinking) {
          disableThinking = false;
          console.info("[ArchitectLLM][Gemini] retrying without thinkingConfig", { model });
          continue;
        }
        if (
          geminiErr.status === 400 &&
          jsonMode &&
          (blob.includes("mime") || blob.includes("schema") || blob.includes("json"))
        ) {
          jsonMode = false;
          console.info("[ArchitectLLM][Gemini] retrying without responseMimeType", { model });
          continue;
        }

        if (isModelNotFound(geminiErr) || geminiErr.status === 400) {
          break;
        }
        if (geminiErr.retryable && attempt < 2) {
          const delay = 400 * 2 ** attempt;
          console.info("[ArchitectLLM][Gemini] retrying", { model, delayMs: delay, status: geminiErr.status });
          await sleep(delay);
          continue;
        }
        break;
      }
    }
  }

  throw (
    lastError ||
    new GeminiRequestError({
      message: "Gemini blueprint generation failed: status=502 code=NO_OUTPUT message=No Gemini model produced output",
      status: 502,
      code: "NO_OUTPUT",
      model: models[0] || DEFAULT_GEMINI_MODEL,
    })
  );
}

export async function probeGeminiConnectivity(): Promise<{
  configured: boolean;
  ok: boolean;
  model?: string;
  responsePreview?: string;
  error?: string;
}> {
  if (!getGeminiApiKey()) {
    return { configured: false, ok: false, error: "GOOGLE_GEMINI_API_KEY is not configured" };
  }
  try {
    const text = await callGeminiGenerateContent({
      system: "You are a connectivity probe. Reply with exactly OK.",
      user: "Return the word OK.",
      json: false,
      maxTokens: 16,
      temperature: 0,
    });
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 40);
    return {
      configured: true,
      ok: /ok/i.test(preview),
      model: architectGeminiModels()[0],
      responsePreview: preview,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      ok: false,
      model: architectGeminiModels()[0],
      error: message.slice(0, 400),
    };
  }
}
