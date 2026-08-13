import type { AiErrorPayload, AiErrorType } from "./ApiError";

const DOCS_URL = "https://platform.openai.com/docs/guides/error-codes/api-errors";

export function parseApiError(raw: unknown): AiErrorPayload {
  if (typeof raw === "object" && raw !== null && "type" in raw && "message" in raw) {
    return raw as AiErrorPayload;
  }

  if (typeof raw === "string") {
    const lower = raw.toLowerCase();
    if (lower.includes("quota") || lower.includes("billing") || lower.includes("exceeded your current")) {
      return {
        type: "QUOTA_EXCEEDED",
        title: "AI Generation Unavailable",
        message:
          "Your OpenAI API project has reached its current usage limit. The AI Assessment Studio is working correctly, but your OpenAI account has no remaining quota.",
        solution: "Add billing or change your API key.",
        retryable: false,
        offlineFallback: true,
      };
    }
    if (lower.includes("unauthorized") || lower.includes("api key") || lower.includes("invalid_api_key")) {
      return {
        type: "INVALID_API_KEY",
        title: "Invalid API Key",
        message: "The configured API key is invalid or missing.",
        solution: "Set OPENAI_API_KEY on the server.",
        retryable: false,
        offlineFallback: true,
      };
    }
    if (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist"))) {
      return {
        type: "MODEL_NOT_FOUND",
        title: "Model unavailable",
        message: "The configured AI model is unavailable.",
        retryable: false,
      };
    }
    if (lower.includes("network") || lower.includes("unreachable") || lower.includes("fetch failed")) {
      return {
        type: "NETWORK_ERROR",
        title: "Connection failed",
        message: "Unable to connect to the AI service. Check your internet connection.",
        retryable: true,
        offlineFallback: true,
      };
    }
    if (lower.includes("aborted")) {
      return {
        type: "ABORTED",
        title: "Request cancelled",
        message: "The AI request was cancelled.",
        retryable: true,
      };
    }
    if (lower.includes("timeout") || lower.includes("timed out")) {
      return {
        type: "TIMEOUT",
        title: "Request timed out",
        message: "AI generation is taking longer than expected.",
        solution: "Try again with fewer questions.",
        retryable: true,
        offlineFallback: true,
      };
    }
    if (lower.includes("500") || lower.includes("server error")) {
      return {
        type: "SERVER_ERROR",
        title: "AI service error",
        message: "The AI service encountered an unexpected problem.",
        solution: "Please try again later.",
        retryable: true,
        offlineFallback: true,
      };
    }
    return {
      type: "UNKNOWN",
      title: "Generation failed",
      message: "An unexpected error occurred. Please try again.",
      retryable: true,
    };
  }

  return {
    type: "UNKNOWN",
    title: "Generation failed",
    message: "An unexpected error occurred.",
    retryable: true,
  };
}

export function getDocumentationUrl(type: AiErrorType): string | undefined {
  if (["QUOTA_EXCEEDED", "RATE_LIMIT", "INVALID_API_KEY", "SERVER_ERROR"].includes(type)) {
    return DOCS_URL;
  }
  return undefined;
}
