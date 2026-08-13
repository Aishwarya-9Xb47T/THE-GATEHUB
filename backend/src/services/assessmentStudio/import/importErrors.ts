/**
 * ContentAnalysisError class — thrown by assessment studio content analysis pipeline.
 * The errorHandler middleware catches this for structured error responses.
 */

export class ContentAnalysisError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly suggestion: string;
  public readonly supportId: string;
  public readonly retryable: boolean;

  constructor(options: {
    message: string;
    code?: string;
    statusCode?: number;
    suggestion?: string;
    supportId?: string;
    retryable?: boolean;
  }) {
    super(options.message);
    this.name = "ContentAnalysisError";
    this.code = options.code ?? "CONTENT_ANALYSIS_FAILED";
    this.statusCode = options.statusCode ?? 422;
    this.suggestion = options.suggestion ?? "Please check your file and try again.";
    this.supportId = options.supportId ?? "";
    this.retryable = options.retryable ?? false;
    Object.setPrototypeOf(this, ContentAnalysisError.prototype);
  }

  toPayload() {
    return {
      code: this.code,
      message: this.message,
      suggestion: this.suggestion,
      supportId: this.supportId,
      retryable: this.retryable,
    };
  }
}
