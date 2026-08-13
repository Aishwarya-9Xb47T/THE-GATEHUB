/**
 * Standardized renderer response — Attempt Engine agnostic of question type.
 */

export interface RendererAttachment {
  assetId: string;
  role: string;
  mimeType?: string;
}

export interface StandardRendererResponse {
  questionVersionId: string;
  rendererId: string;
  answer: unknown;
  confidence?: number;
  responseTimeMs: number;
  attachments?: RendererAttachment[];
  metadata?: Record<string, unknown>;
  collectedAt: string;
}

export function createRendererResponse(
  questionVersionId: string,
  rendererId: string,
  answer: unknown,
  responseTimeMs: number,
  extras?: Partial<Omit<StandardRendererResponse, "questionVersionId" | "rendererId" | "answer" | "responseTimeMs" | "collectedAt">>
): StandardRendererResponse {
  return {
    questionVersionId,
    rendererId,
    answer,
    responseTimeMs,
    collectedAt: new Date().toISOString(),
    ...extras,
  };
}

export function toAttemptPayload(response: StandardRendererResponse) {
  return {
    questionVersionId: response.questionVersionId,
    answer: response.answer,
    clientTimestamp: response.collectedAt,
    responseTimeMs: response.responseTimeMs,
    metadata: {
      rendererId: response.rendererId,
      confidence: response.confidence,
      attachments: response.attachments,
      ...response.metadata,
    },
  };
}
