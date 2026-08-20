/**
 * Structured PPTX/Google classroom pipeline logs.
 * Never log credentials or signed URLs.
 */
export function classroomPptxPipelineLog(
  stage: string,
  fields: {
    presentationId?: string;
    slideId?: string;
    slideNumber?: number;
    sourceKey?: string;
    durationMs?: number;
    [key: string]: unknown;
  },
): void {
  const safe: Record<string, unknown> = { ...fields };
  delete safe.signedUrl;
  delete safe.url;
  delete safe.authorization;
  console.info('[CLASSROOM_PPTX_PIPELINE]', { stage, ...safe });
}
