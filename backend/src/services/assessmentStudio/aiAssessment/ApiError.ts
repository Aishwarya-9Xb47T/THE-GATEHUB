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

export class AiServiceError extends Error {
  readonly payload: AiErrorPayload;
  readonly statusCode?: number;
  readonly retryCount?: number;

  constructor(payload: AiErrorPayload, statusCode?: number, retryCount?: number) {
    super(payload.message);
    this.name = "AiServiceError";
    this.payload = payload;
    this.statusCode = statusCode;
    this.retryCount = retryCount;
  }

  toJSON() {
    return { success: false, error: this.payload };
  }
}

export function isOfflineFallbackError(type: AiErrorType): boolean {
  return ["QUOTA_EXCEEDED", "INVALID_API_KEY", "SERVER_ERROR", "NETWORK_ERROR", "TIMEOUT", "MODEL_NOT_FOUND"].includes(type);
}
