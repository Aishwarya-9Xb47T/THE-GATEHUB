import OpenAI from "openai";
import { randomUUID } from "crypto";
import type { AiErrorPayload, AiErrorType } from "./ApiError.js";
import { AiServiceError } from "./ApiError.js";

const ERROR_CATALOG: Record<
  AiErrorType,
  Omit<AiErrorPayload, "type" | "requestId" | "jobId">
> = {
  INVALID_API_KEY: {
    title: "Invalid API Key",
    message: "The configured API key is invalid or missing.",
    solution: "Set a valid OPENAI_API_KEY in your server environment.",
    retryable: false,
    offlineFallback: true,
  },
  FORBIDDEN: {
    title: "Access denied",
    message: "The AI service rejected this request.",
    solution: "Check your OpenAI project permissions.",
    retryable: false,
    offlineFallback: false,
  },
  MODEL_NOT_FOUND: {
    title: "Model unavailable",
    message: "The configured AI model is unavailable.",
    solution: "Set OPENAI_MODEL to a supported model such as gpt-4o-mini, or configure OPENAI_FALLBACK_MODEL.",
    retryable: false,
    offlineFallback: true,
  },
  TIMEOUT: {
    title: "Request timed out",
    message: "AI generation is taking longer than expected.",
    solution: "Try again with fewer questions or a shorter source document.",
    retryable: true,
    offlineFallback: true,
  },
  CONFLICT: {
    title: "Request conflict",
    message: "The AI service could not process this request due to a conflict.",
    solution: "Wait a moment and try again.",
    retryable: true,
    offlineFallback: false,
  },
  INVALID_REQUEST: {
    title: "Invalid request",
    message: "The AI request could not be processed.",
    solution: "Review your quiz configuration and source material.",
    retryable: false,
    offlineFallback: false,
  },
  RATE_LIMIT: {
    title: "Rate limit reached",
    message: "Too many requests were sent to the AI service.",
    solution: "Wait a few seconds and try again.",
    retryable: true,
    offlineFallback: false,
  },
  QUOTA_EXCEEDED: {
    title: "AI Generation Unavailable",
    message:
      "Your OpenAI API project has reached its current usage limit. The AI Assessment Studio is working correctly, but your OpenAI account has no remaining quota.",
    solution: "Add billing or change your API key, then retry.",
    retryable: false,
    offlineFallback: true,
  },
  SERVER_ERROR: {
    title: "AI service error",
    message: "The AI service encountered an unexpected problem.",
    solution: "Please try again later.",
    retryable: true,
    offlineFallback: true,
  },
  NETWORK_ERROR: {
    title: "Connection failed",
    message: "Unable to connect to the AI service.",
    solution: "Check your internet connection and server network access.",
    retryable: true,
    offlineFallback: true,
  },
  JSON_PARSE_ERROR: {
    title: "Response error",
    message: "The AI returned an unreadable response.",
    solution: "Try generating again.",
    retryable: true,
    offlineFallback: false,
  },
  STREAMING_ERROR: {
    title: "Streaming interrupted",
    message: "The AI response stream was interrupted.",
    solution: "Try again.",
    retryable: true,
    offlineFallback: false,
  },
  ABORTED: {
    title: "Request cancelled",
    message: "The AI request was cancelled.",
    solution: "Start a new generation when ready.",
    retryable: true,
    offlineFallback: false,
  },
  UNKNOWN: {
    title: "Something went wrong",
    message: "An unexpected error occurred during AI generation.",
    solution: "Try again or use offline demo mode.",
    retryable: true,
    offlineFallback: true,
  },
};

export function buildAiError(type: AiErrorType, extras?: Partial<AiErrorPayload>): AiErrorPayload {
  const base = ERROR_CATALOG[type];
  return { type, ...base, ...extras };
}

function isQuotaMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("quota") ||
    m.includes("billing") ||
    m.includes("insufficient_quota") ||
    m.includes("exceeded your current")
  );
}

function isRateLimitMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("rate limit") || m.includes("rate_limit") || m.includes("too many requests");
}

export function mapOpenAiError(err: unknown, context?: { requestId?: string; jobId?: string }): AiServiceError {
  const requestId = context?.requestId || randomUUID();

  if (err instanceof AiServiceError) return err;

  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 500;
    const rawMsg = err.message || "";
    let type: AiErrorType = "UNKNOWN";

    if (status === 401) type = "INVALID_API_KEY";
    else if (status === 403) type = "FORBIDDEN";
    else if (status === 404) type = "MODEL_NOT_FOUND";
    else if (status === 408) type = "TIMEOUT";
    else if (status === 409) type = "CONFLICT";
    else if (status === 422) type = "INVALID_REQUEST";
    else if (status === 429) type = isQuotaMessage(rawMsg) ? "QUOTA_EXCEEDED" : "RATE_LIMIT";
    else if (status >= 500) type = "SERVER_ERROR";

    const payload = buildAiError(type, { requestId, jobId: context?.jobId });
    if (type === "MODEL_NOT_FOUND") {
      return new AiServiceError(
        { ...payload, message: "The configured AI model is unavailable. A compatible fallback will be attempted automatically." },
        status
      );
    }
    return new AiServiceError(payload, status);
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (err.name === "AbortError" || msg.includes("aborted")) {
      return new AiServiceError(buildAiError("ABORTED", { requestId, jobId: context?.jobId }));
    }
    if (
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("network") ||
      msg.includes("fetch failed") ||
      msg.includes("socket")
    ) {
      return new AiServiceError(buildAiError("NETWORK_ERROR", { requestId, jobId: context?.jobId }));
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return new AiServiceError(buildAiError("TIMEOUT", { requestId, jobId: context?.jobId }));
    }
    if (msg.includes("json") || msg.includes("parse")) {
      return new AiServiceError(buildAiError("JSON_PARSE_ERROR", { requestId, jobId: context?.jobId }));
    }
    if (isQuotaMessage(msg)) {
      return new AiServiceError(buildAiError("QUOTA_EXCEEDED", { requestId, jobId: context?.jobId }));
    }
  }

  return new AiServiceError(buildAiError("UNKNOWN", { requestId, jobId: context?.jobId }));
}

export function isRetryableError(type: AiErrorType): boolean {
  return ["TIMEOUT", "RATE_LIMIT", "SERVER_ERROR", "NETWORK_ERROR", "JSON_PARSE_ERROR", "STREAMING_ERROR", "ABORTED", "CONFLICT"].includes(
    type
  );
}

export function logAiError(details: {
  requestId: string;
  jobId?: string;
  statusCode?: number;
  errorType: AiErrorType;
  durationMs: number;
  retryCount: number;
  model?: string;
  tokens?: number;
  rawMessage?: string;
}) {
  console.error("[ai-studio]", JSON.stringify({
    requestId: details.requestId,
    jobId: details.jobId,
    openAiStatus: details.statusCode,
    errorType: details.errorType,
    durationMs: details.durationMs,
    retryCount: details.retryCount,
    model: details.model,
    tokens: details.tokens,
    // Server-only detail — never sent to client
    detail: details.rawMessage?.slice(0, 500),
  }));
}
