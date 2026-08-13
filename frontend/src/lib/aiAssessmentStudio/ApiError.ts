export type AiErrorType =
  | "INVALID_API_KEY"
  | "FORBIDDEN"
  | "MODEL_NOT_FOUND"
  | "TIMEOUT"
  | "CONFLICT"
  | "INVALID_REQUEST"
  | "RATE_LIMIT"
  | "QUOTA_EXCEEDED"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "JSON_PARSE_ERROR"
  | "STREAMING_ERROR"
  | "ABORTED"
  | "UNKNOWN";

export interface AiErrorPayload {
  type: AiErrorType;
  title: string;
  message: string;
  solution?: string;
  retryable: boolean;
  offlineFallback?: boolean;
  requestId?: string;
  jobId?: string;
  requestedModel?: string;
  activeModel?: string;
  fallbackUsed?: boolean;
}

export function isStructuredAiError(value: unknown): value is AiErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "title" in value &&
    "message" in value
  );
}
